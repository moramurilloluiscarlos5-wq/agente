import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createDeviceToolsRouter } from '../routes/deviceTools.routes.js'

const ID = '11111111-1111-4111-8111-111111111111'
const WORKSHOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const profile = { id: ID, role: 'TECNICO', permissions: ['*'], permissionsSource: 'legacy', workshop_id: WORKSHOP, workspace_access: 'ACTIVE' }
const pass = (req, _res, next) => { req.profile = profile; next() }

async function serve(t, router) {
  const app = express()
  app.use(express.json(), router)
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ message: error.publicMessage ?? error.message }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options)
}

test('Device Tools emite sesión firmada por taller y usuario', async (t) => {
  process.env.DEVICE_AGENT_SECRET = '12345678901234567890123456789012'
  const request = await serve(t, createDeviceToolsRouter({ db: {}, authenticate: [pass] }))
  const response = await request('/session')
  assert.equal(response.status, 200)
  const body = await response.json()
  const [encoded] = body.data.token.split('.')
  const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  assert.equal(claims.workshop_id, WORKSHOP)
  assert.equal(claims.user_id, ID)
  assert.ok(claims.exp > claims.iat)
})

test('Device Tools entrega secreto solo al pairing autenticado', async (t) => {
  process.env.DEVICE_AGENT_SECRET = '12345678901234567890123456789012'
  const request = await serve(t, createDeviceToolsRouter({ db: {}, authenticate: [pass] }))
  const response = await request('/pairing/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agent_id: 'agent-test', pairing_code: '123456' }),
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data.secret, process.env.DEVICE_AGENT_SECRET)
  assert.equal(body.data.workshop_id, WORKSHOP)
})

test('Device Tools no acepta auditoría sin comando válido', async (t) => {
  process.env.DEVICE_AGENT_SECRET = '12345678901234567890123456789012'
  const request = await serve(t, createDeviceToolsRouter({ db: {}, authenticate: [pass] }))
  const response = await request('/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serial: 'ABC', mode: 'adb', command: 'adb; rm -rf', status: 'ok' }) })
  assert.equal(response.status, 400)
})
