import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { createProfileLoader } from '../middleware/auth.js'
import { createAuthRouter } from '../routes/auth.routes.js'

const ID = '11111111-1111-4111-8111-111111111111'
const WORKSHOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const active = { id: ID, role: 'OWNER', full_name: 'Owner', is_active: true, workshop_id: WORKSHOP, workshop: { id: WORKSHOP, status: 'ACTIVE', name: 'A' }, last_login_at: new Date().toISOString() }
async function serve(t, router) {
  const app = express()
  app.use(express.json(), router)
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ message: error.publicMessage ?? error.message }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
    return { status: response.status, body: await response.json() }
  }
}
const pass = (_req, _res, next) => next()

for (const [name, profile, access, protectedStatus] of [
  ['owner activo', active, 'ACTIVE', 200],
  ['técnico activo', { ...active, role: 'TECNICO' }, 'ACTIVE', 200],
  ['sin taller', { ...active, workshop_id: null, workshop: null }, 'NO_WORKSHOP', 403],
  ['suspendido', { ...active, workshop: { ...active.workshop, status: 'SUSPENDED' } }, 'SUSPENDED', 403],
  ['inactivo', { ...active, workshop: { ...active.workshop, status: 'INACTIVE' } }, 'INACTIVE', 403],
  ['relación ausente', { ...active, workshop: null }, 'INACTIVE', 403],
  ['SUPER_ADMIN', { ...active, role: 'SUPER_ADMIN', workshop_id: null, workshop: null }, 'PLATFORM', 200],
]) {
  test(`sesión y API: ${name}`, async (t) => {
    const urls = []
    const db = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async (url) => {
      urls.push(decodeURIComponent(String(url)))
      const table = new URL(url).pathname.split('/').at(-1)
      const data = table === 'profiles' ? structuredClone(profile) : table === 'roles' ? { code: profile.role } : []
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
    } } })
    const router = express.Router()
    router.use((req, _res, next) => { req.authUserId = ID; next() })
    router.get('/me', createProfileLoader({ db, allowUnavailable: true }), (req, res) => res.json({ profile: req.profile }))
    router.get('/business', createProfileLoader({ db }), (_req, res) => res.json({ ok: true }))
    const request = await serve(t, router)
    const session = await request('/me')
    assert.equal(session.status, 200)
    assert.equal(session.body.profile.workspace_access, access)
    assert.equal((await request('/business')).status, protectedStatus)
    assert.ok(urls.some((url) => url.includes('workshops!profiles_workshop_id_fkey')))
  })
}

test('error de esquema no autoriza el dashboard ni lo convierte en onboarding', async (t) => {
  const db = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async () => new Response(JSON.stringify({ code: 'PGRST201', message: 'ambiguous join' }), { status: 300 }) } })
  const router = express.Router()
  router.get('/me', createProfileLoader({ db, allowUnavailable: true }))
  assert.equal((await (await serve(t, router))('/me')).status, 503)
})

function fakeDb(profile = active, authError = null) {
  const calls = []
  const db = {
    auth: { admin: { createUser: async (body) => { calls.push(['createUser', body]); return { data: { user: { id: ID } }, error: authError } } } },
    rpc: async (name, body) => { calls.push(['rpc', name, body]); return { data: { profile: { ...active, role: 'OWNER' }, workshop: active.workshop }, error: null } },
    from(table) {
      const q = new Proxy({}, { get(_target, key) {
        if (key === 'then') return (resolve, reject) => Promise.resolve({ data: profile, error: null }).then(resolve, reject)
        return (...args) => { calls.push([table, key, ...args]); return q }
      } })
      return q
    },
  }
  return { db, calls }
}
function routerOptions(db, profile) {
  const sessionLoader = (req, _res, next) => { req.profile = structuredClone(profile); req.authUserId = profile.id; next() }
  return { db, authenticate: pass, configured: pass, sessionLoader, profileLoader: sessionLoader }
}

test('registro usa el trigger atómico y no confía en taller o rol enviados por navegador', async (t) => {
  const { db, calls } = fakeDb()
  const request = await serve(t, createAuthRouter(routerOptions(db, active)))
  const result = await request('/register-workshop', { full_name: 'Owner', email: 'new@example.invalid', password: 'Example123!', workshop_name: 'Nuevo', workshop_id: 'forged', role: 'SUPER_ADMIN', app_metadata: { workshop_employee: { role: 'SUPER_ADMIN' } } })
  assert.equal(result.status, 201)
  const metadata = calls.find(([method]) => method === 'createUser')[1].app_metadata
  assert.deepEqual(Object.keys(metadata), ['workshop_registration'])
  assert.equal(metadata.workshop_registration.name, 'Nuevo')
  assert.equal(metadata.workshop_registration.workshop_id, undefined)
  assert.equal(calls.filter(([method]) => method === 'rpc').length, 0)
})

test('correo duplicado aborta antes de crear perfiles o talleres', async (t) => {
  const { db, calls } = fakeDb(active, { message: 'User already been registered' })
  const request = await serve(t, createAuthRouter(routerOptions(db, active)))
  assert.equal((await request('/register-workshop', { full_name: 'Owner', email: 'dup@example.invalid', password: 'Example123!', workshop_name: 'Nuevo' })).status, 409)
  assert.deepEqual(calls.map(([method]) => method), ['createUser'])
})

test('onboarding deriva el propietario de la sesión y rechaza empleados con taller', async (t) => {
  const { db, calls } = fakeDb()
  const request = await serve(t, createAuthRouter(routerOptions(db, { ...active, workshop_id: null, workshop: null })))
  assert.equal((await request('/create-workshop', { workshop_name: 'Nuevo', userId: 'forged', workshop_id: 'forged', role: 'SUPER_ADMIN' })).status, 201)
  assert.equal(calls.find(([method]) => method === 'rpc')[2].p_owner_user_id, ID)
  const existing = await serve(t, createAuthRouter(routerOptions(db, { ...active, role: 'TECNICO' })))
  assert.equal((await existing('/create-workshop', { workshop_name: 'Duplicado' })).status, 409)
  assert.equal(calls.filter(([method]) => method === 'rpc').length, 1)
})

test('empleados heredan el taller del Owner con enlace atómico', async (t) => {
  const { db, calls } = fakeDb()
  const request = await serve(t, createAuthRouter(routerOptions(db, active)))
  assert.equal((await request('/users', { full_name: 'Tech', email: 'tech@example.invalid', password: 'Example123!', role: 'TECNICO', workshop_id: 'forged' })).status, 201)
  const metadata = calls.find(([method]) => method === 'createUser')[1].app_metadata
  assert.equal(metadata.workshop_employee.workshop_id, WORKSHOP)
  assert.equal(metadata.workshop_employee.actor_id, ID)
  assert.equal(metadata.workshop_registration, undefined)
})
