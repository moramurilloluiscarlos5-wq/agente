import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { createInventoryRouter } from '../routes/inventory.routes.js'
import { createAIRouter } from '../routes/ai.routes.js'
import { effectivePermissions, hasPermission } from '../middleware/rbac.js'
import { WhatsAppProvider } from '../services/whatsappProvider.js'

const ID = '11111111-1111-4111-8111-111111111111'
const ORDER = '44444444-4444-4444-8444-444444444444'
const WORKSHOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

// Levanta un router real con una sesión simulada y devuelve la respuesta HTTP.
async function withRouter(t, router, path) {
  const app = express()
  app.use(express.json())
  app.use(router)
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ message: error.publicMessage ?? error.message }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`)
  return { status: response.status, body: await response.json().catch(() => null) }
}

// Cliente real de Supabase con la red interceptada: reproduce lo que ocurre en producción.
function realClientWithStub(urls) {
  const stub = async (url) => {
    urls.push(String(url))
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/0' } })
  }
  return createClient('https://example.supabase.co', 'test-key', { auth: { persistSession: false }, global: { fetch: stub } })
}

test('low_stock del inventario responde sin romper con el cliente real de Supabase', async (t) => {
  const urls = []
  const router = createInventoryRouter({ db: realClientWithStub(urls), authenticate: [(req, _res, next) => { req.profile = { id: ID, role: 'ADMINISTRADOR', workshop_id: WORKSHOP }; next() }] })

  const result = await withRouter(t, router, '/?low_stock=true')
  assert.equal(result.status, 200)
  // El filtro viaja como comparación contra la columna generada, nunca contra db.raw.
  assert.ok(urls.some((url) => url.includes('is_low_stock=eq.true')), `filtro ausente en ${urls.join(' | ')}`)
})

test('el historial de diagnóstico aplica el filtro de orden y acota resultados', async (t) => {
  const calls = []
  const query = new Proxy({}, {
    get(_target, key) {
      if (key === 'then') return (resolve) => Promise.resolve({ data: [], error: null }).then(resolve)
      return (...args) => { calls.push([key, ...args]); return query }
    },
  })
  const router = createAIRouter({
    db: { from: (table) => { calls.push(['from', table]); return query } },
    authenticate: [(req, _res, next) => { req.profile = { id: ID, role: 'ADMINISTRADOR', workshop_id: WORKSHOP }; next() }],
  })

  const result = await withRouter(t, router, `/history?repair_order_id=${ORDER}`)
  assert.equal(result.status, 200)
  assert.ok(calls.some(([method, field, value]) => method === 'eq' && field === 'repair_order_id' && value === ORDER))
  assert.ok(calls.some(([method, value]) => method === 'limit' && value === 100))
})

test('el historial de diagnóstico rechaza un identificador no válido', async (t) => {
  const query = new Proxy({}, { get(_target, key) { if (key === 'then') return (resolve) => Promise.resolve({ data: [], error: null }).then(resolve); return () => query } })
  const router = createAIRouter({ db: { from: () => query }, authenticate: [(req, _res, next) => { req.profile = { id: ID, role: 'ADMINISTRADOR', workshop_id: WORKSHOP }; next() }] })
  const result = await withRouter(t, router, '/history?repair_order_id=no-es-uuid')
  assert.equal(result.status, 400)
})

test('un rol con permisos revocados pierde el acceso en lugar de heredar los permisos antiguos', () => {
  const revoked = { role: 'CAJERO', permissions: [], permissionsSource: 'rbac' }
  assert.deepEqual(effectivePermissions(revoked), [])
  assert.equal(hasPermission(revoked, 'payments.create'), false)

  const granted = { role: 'CAJERO', permissions: ['payments.view'], permissionsSource: 'rbac' }
  assert.equal(hasPermission(granted, 'payments.view'), true)
  assert.equal(hasPermission(granted, 'payments.create'), false)

  // Sin tablas RBAC instaladas se conservan los permisos heredados por rol.
  assert.equal(hasPermission({ role: 'CAJERO' }, 'payments.create'), true)
  assert.equal(hasPermission({ role: 'TECNICO', permissionsSource: 'legacy' }, 'repairs.view'), true)
})

test('el webhook de WhatsApp se rechaza cuando no hay secreto que verificar', () => {
  const withoutSecret = new WhatsAppProvider({ env: {} })
  assert.equal(withoutSecret.validateWebhookSignature(JSON.stringify({ entry: [] }), 'sha256=forged'), false)

  const simulated = new WhatsAppProvider({ env: { WHATSAPP_SIMULATE: 'true' } })
  assert.equal(simulated.validateWebhookSignature(JSON.stringify({ entry: [] }), undefined), true)
})
