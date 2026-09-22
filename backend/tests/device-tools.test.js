import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import express from 'express'
import { createDeviceToolsRouter } from '../routes/deviceTools.routes.js'
import { deriveDeviceAgentSecret } from '../services/deviceAgentToken.js'

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
  const response = await request('/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent_id: 'agent-test', pairing_code: '123456' }) })
  assert.equal(response.status, 200)
  const body = await response.json()
  const [encoded] = body.data.token.split('.')
  const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  assert.equal(claims.workshop_id, WORKSHOP)
  assert.equal(claims.user_id, ID)
  assert.equal(claims.agent_id, 'agent-test')
  assert.ok(claims.exp > claims.iat)
  const expectedSecret = deriveDeviceAgentSecret({ workshopId: WORKSHOP, agentId: 'agent-test', pairingCode: '123456' })
  const expectedSignature = crypto.createHmac('sha256', expectedSecret).update(encoded).digest('base64url')
  assert.equal(body.data.token.split('.')[1], expectedSignature)
  assert.notEqual(expectedSecret, process.env.DEVICE_AGENT_SECRET)
})

test('Device Tools devuelve una clave derivada en el pairing autenticado', async (t) => {
  process.env.DEVICE_AGENT_SECRET = '12345678901234567890123456789012'
  const request = await serve(t, createDeviceToolsRouter({ db: {}, authenticate: [pass] }))
  const response = await request('/pairing/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agent_id: 'agent-test', pairing_code: '123456' }),
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data.secret, deriveDeviceAgentSecret({ workshopId: WORKSHOP, agentId: 'agent-test', pairingCode: '123456' }))
  assert.notEqual(body.data.secret, process.env.DEVICE_AGENT_SECRET)
  assert.equal(body.data.workshop_id, WORKSHOP)
  assert.equal(body.data.agent_id, 'agent-test')
})

test('Device Tools no acepta auditoría sin comando válido', async (t) => {
  process.env.DEVICE_AGENT_SECRET = '12345678901234567890123456789012'
  const request = await serve(t, createDeviceToolsRouter({ db: {}, authenticate: [pass] }))
  const response = await request('/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serial: 'ABC', mode: 'adb', command: 'adb; rm -rf', status: 'ok' }) })
  assert.equal(response.status, 400)
})
