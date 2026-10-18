import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { createTrackingRouter } from '../routes/tracking.routes.js'
import { createAuthRouter } from '../routes/auth.routes.js'
import { createDeviceAgentReleaseResolver } from '../services/deviceAgentRelease.js'
import { fetchAllRows } from '../routes/reports.routes.js'
import { rateLimit } from '../middleware/security.js'

const WORKSHOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ADMIN = '11111111-1111-4111-8111-111111111111'
const OWNER = '22222222-2222-4222-8222-222222222222'
const TECH = '33333333-3333-4333-8333-333333333333'

async function serve(t, app) {
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ message: error.publicMessage ?? error.message }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json().catch(() => null) }
  }
}

test('el router de seguimiento no bloquea a CAJERO ni autentica las rutas de otros routers', async (t) => {
  let authCalls = 0
  const fakeAuth = (req, _res, next) => {
    authCalls += 1
    req.authUserId = ADMIN
    req.profile = { id: ADMIN, role: 'CAJERO', workshop_id: WORKSHOP, permissions: ['payments.view'], permissionsSource: 'rbac' }
    next()
  }
  const app = express()
  app.use('/api', createTrackingRouter({ db: {}, authenticate: [fakeAuth] }))
  app.get('/api/payments', (_req, res) => res.json({ ok: true }))
  const request = await serve(t, app)
  const response = await request('/api/payments')
  assert.equal(response.status, 200)
  assert.equal(authCalls, 0, 'las rutas ajenas al seguimiento no deben pasar por su autenticación')
})

test('las rutas protegidas de seguimiento siguen exigiendo sesión', async (t) => {
  const deny = (_req, res) => res.status(401).json({ message: 'No autorizado' })
  const app = express()
  app.use('/api', createTrackingRouter({ db: {}, authenticate: [deny] }))
  const request = await serve(t, app)
  assert.equal((await request('/api/repairs/CAR-2026-0001/tracking')).status, 401)
  assert.equal((await request('/api/repairs/CAR-2026-0001/receipt.pdf')).status, 401)
})

function authApp(targetRole, actorRole = 'ADMINISTRADOR') {
  const writes = []
  const db = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const table = new URL(url).pathname.split('/').at(-1)
    if (method !== 'GET' && method !== 'HEAD') writes.push({ method, table })
    if (table === 'profiles' && method === 'GET') {
      return new Response(JSON.stringify({ role: targetRole, workshop_id: WORKSHOP, is_active: true }), { headers: { 'content-type': 'application/json' } })
    }
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/5' } })
    return new Response(JSON.stringify({ id: OWNER, role: 'TECNICO', is_active: false }), { headers: { 'content-type': 'application/json' } })
  } } })
  const actor = { id: ADMIN, role: actorRole, workshop_id: WORKSHOP, permissions: ['*'], permissionsSource: 'rbac' }
  const router = createAuthRouter({
    db,
    configured: (_req, _res, next) => next(),
    authenticate: (req, _res, next) => { req.authUserId = ADMIN; next() },
    profileLoader: (req, _res, next) => { req.profile = actor; next() },
    sessionLoader: (req, _res, next) => { req.profile = actor; next() },
  })
  const app = express()
  app.use(express.json())
  app.use('/api/auth', router)
  return { app, writes }
}

test('un ADMINISTRADOR no puede degradar al dueño del taller', async (t) => {
  const { app, writes } = authApp('OWNER')
  const request = await serve(t, app)
  const response = await request(`/api/auth/users/${OWNER}/role`, { method: 'PATCH', body: { role: 'TECNICO' } })
  assert.equal(response.status, 403)
  assert.deepEqual(writes, [])
})

test('un ADMINISTRADOR no puede suspender al dueño del taller', async (t) => {
  const { app, writes } = authApp('OWNER')
  const request = await serve(t, app)
  const response = await request(`/api/auth/users/${OWNER}/status`, { method: 'PATCH', body: { is_active: false } })
  assert.equal(response.status, 403)
  assert.deepEqual(writes, [])
})

test('un ADMINISTRADOR sí puede cambiar el rol de un técnico', async (t) => {
  const { app, writes } = authApp('TECNICO')
  const request = await serve(t, app)
  const response = await request(`/api/auth/users/${TECH}/role`, { method: 'PATCH', body: { role: 'RECEPCION' } })
  assert.equal(response.status, 200)
  assert.ok(writes.some((write) => write.table === 'profiles' && write.method === 'PATCH'))
})

test('producción ya no ofrece por defecto un instalador externo sin firma', async () => {
  const getRelease = createDeviceAgentReleaseResolver({ env: { NODE_ENV: 'production' }, fetchImpl: async () => { throw new Error('no network') } })
  await assert.rejects(getRelease(), (error) => error.status === 503 && /DEVICE_AGENT_GITHUB_REPOSITORY/.test(error.publicMessage))
})

test('la descarga externa solo se usa si se configura explícitamente con su versión', async () => {
  const url = 'https://www.mediafire.com/file/abc/CarlosTechDeviceAgentSetup.exe/file'
  const withoutVersion = createDeviceAgentReleaseResolver({ env: { NODE_ENV: 'production', DEVICE_AGENT_EXTERNAL_RELEASE_URL: url } })
  await assert.rejects(withoutVersion(), (error) => error.status === 503)
  const configured = createDeviceAgentReleaseResolver({ env: { NODE_ENV: 'production', DEVICE_AGENT_EXTERNAL_RELEASE_URL: url, DEVICE_AGENT_EXTERNAL_VERSION: '1.0.2' } })
  const release = await configured()
  assert.equal(release.version, '1.0.2')
  assert.equal(release.signed, false)
})

test('los reportes leen todas las páginas en lugar de cortar en 1000 filas', async () => {
  const total = 2_345
  const ranges = []
  const build = () => {
    const query = {
      order: () => query,
      range: (from, to) => {
        ranges.push([from, to])
        const size = Math.max(0, Math.min(to, total - 1) - from + 1)
        return Promise.resolve({ data: Array.from({ length: size }, (_, index) => ({ id: from + index })), error: null })
      },
    }
    return query
  }
  const { data, error } = await fetchAllRows(build)
  assert.equal(error, null)
  assert.equal(data.length, total)
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('con trust proxy cada cliente tiene su propio límite de peticiones', async (t) => {
  const app = express()
  app.set('trust proxy', 1)
  app.get('/limited', rateLimit({ windowMs: 60_000, max: 1, keyFn: (req) => `review-test:${req.ip}` }), (_req, res) => res.json({ ok: true }))
  const request = await serve(t, app)
  assert.equal((await request('/limited', { headers: { 'x-forwarded-for': '203.0.113.1' } })).status, 200)
  assert.equal((await request('/limited', { headers: { 'x-forwarded-for': '203.0.113.1' } })).status, 429)
  assert.equal((await request('/limited', { headers: { 'x-forwarded-for': '203.0.113.2' } })).status, 200)
})

test('sin release en GitHub y sin respaldo externo la descarga falla con un mensaje claro', async () => {
  const getRelease = createDeviceAgentReleaseResolver({
    env: { DEVICE_AGENT_GITHUB_REPOSITORY: 'owner/repo' },
    fetchImpl: async () => new Response('[]', { headers: { 'content-type': 'application/json' } }),
  })
  await assert.rejects(getRelease(), (error) => error.status === 503 && /publicación oficial estable/.test(error.publicMessage))
})
