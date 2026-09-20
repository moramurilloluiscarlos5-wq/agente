import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createOperationsRouter } from '../routes/operations.routes.js'
import { assertRepairAccess, databaseError, pageParams, searchTerm, validateHistory, validatePayload } from '../utils/operations.js'

const ID = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const WORKSHOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

test('customer validation normalizes contact data and rejects mass assignment', () => {
  assert.deepEqual(validatePayload('customer', { first_name: ' Ana ', last_name: ' López ', phone: ' 6141234567 ', email: ' ANA@EXAMPLE.COM ' }), { first_name: 'Ana', last_name: 'López', phone: '6141234567', email: 'ana@example.com' })
  for (const body of [{ first_name: 'Ana' }, { created_by: OTHER }, { deleted_at: new Date().toISOString() }, { phone: 123 }, { email: 'correo' }]) {
    assert.throws(() => validatePayload('customer', body), { status: 400 })
  }
})

test('repair intake requires matching identifiers and safe money representation', () => {
  const base = { customer_id: ID, device_id: OTHER, reported_problem: 'No enciende' }
  assert.equal(validatePayload('repair', { ...base, estimated_cost: 99.99 }).estimated_cost, 99.99)
  for (const deposit of [-1, '10', Infinity, 0.001, null]) assert.throws(() => validatePayload('repair', { ...base, deposit }), { status: 400 })
  assert.throws(() => validatePayload('repair', { ...base, customer_id: 'bad' }), { status: 400 })
  assert.throws(() => validatePayload('repair', { ...base, status: 'entregado' }), { status: 400 })
})

test('technicians cannot change money, assignees, owners or lifecycle fields', () => {
  const options = { partial: true, role: 'TECNICO' }
  assert.deepEqual(validatePayload('repair', { initial_diagnosis: 'Conector dañado', charges: false }, options), { initial_diagnosis: 'Conector dañado', charges: false })
  for (const body of [{ deposit: 1 }, { technician_id: OTHER }, { estimated_delivery_at: null }]) assert.throws(() => validatePayload('repair', body, options), { status: 403 })
  assert.throws(() => validatePayload('repair', { customer_id: OTHER }, { partial: true, role: 'ADMINISTRADOR' }), { status: 400 })
  assert.throws(() => validatePayload('repair', { status: 'entregado' }, options), { status: 400 })
})

test('history rejects invalid states, excessive notes and forged actor', () => {
  assert.deepEqual(validateHistory({ status: 'diagnostico', note: ' Revisando ' }), { status: 'diagnostico', note: 'Revisando' })
  for (const body of [{ status: 'unknown' }, { status: 'recibido', user_id: OTHER }, { status: 'recibido', note: 'x'.repeat(5001) }]) assert.throws(() => validateHistory(body), { status: 400 })
})

test('bounded pagination and search cannot inject PostgREST filters', () => {
  assert.deepEqual(pageParams({ page: '2', limit: '10' }), { page: 2, limit: 10, from: 10, to: 19 })
  for (const query of [{ page: '-1' }, { limit: '101' }, { page: ['1'] }, { limit: '1.5' }]) assert.throws(() => pageParams(query), { status: 400 })
  assert.doesNotMatch(searchTerm('x),technician_id.eq.fake,%_*"'), /[,()%_*"\\]/)
})

test('access checks hide other technicians orders and missing migration is actionable', () => {
  assert.throws(() => assertRepairAccess({ technician_id: OTHER }, { id: ID, role: 'TECNICO' }), { status: 404 })
  assert.throws(() => databaseError({ code: 'PGRST202' }), (error) => error.status === 503 && error.publicMessage.includes('003_phase3.sql'))
})

async function request(t, { method = 'GET', path, role = 'TECNICO', body, response = { data: [], count: 0, error: null } }) {
  const calls = []
  const query = new Proxy({}, { get(_target, key) {
    if (key === 'then') return (resolve, reject) => Promise.resolve(response).then(resolve, reject)
    return (...args) => { calls.push([key, ...args]); return query }
  } })
  const db = { from: (table) => { calls.push(['from', table]); return query }, rpc: (...args) => { calls.push(['rpc', ...args]); return Promise.resolve(response) } }
  const app = express()
  app.use(express.json())
  app.use(createOperationsRouter({ db, authenticate: [(req, _res, next) => { req.profile = { id: ID, role, workshop_id: WORKSHOP }; next() }] }))
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ message: error.publicMessage ?? 'error' }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const result = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: result.status, body: await result.json(), calls }
}

test('API blocks technicians from creating customers, devices and repairs before touching the database', async (t) => {
  for (const path of ['/customers', '/devices', '/repairs']) {
    const result = await request(t, { method: 'POST', path, body: {} })
    assert.equal(result.status, 403)
    assert.equal(result.calls.length, 0)
  }
})

test('API scopes technician repair lists in the database', async (t) => {
  const result = await request(t, { path: '/repairs?page=2&limit=10' })
  assert.equal(result.status, 200)
  assert.ok(result.calls.some(([method, field, value]) => method === 'eq' && field === 'technician_id' && value === ID))
  assert.deepEqual(result.body, { data: [], count: 0, page: 2, limit: 10 })
})

test('API does not return another technician order or its history', async (t) => {
  const result = await request(t, { path: '/repairs/CAR-2026-0001', response: { data: { id: OTHER, technician_id: OTHER }, error: null } })
  assert.equal(result.status, 404)
  assert.equal(result.calls.filter(([method]) => method === 'from').length, 1)
})

test('only administrators may archive customers or devices', async (t) => {
  for (const path of [`/customers/${ID}`, `/devices/${ID}`]) {
    const result = await request(t, { method: 'DELETE', path, role: 'RECEPCION' })
    assert.equal(result.status, 403)
    assert.equal(result.calls.length, 0)
  }
})

test('RPC failure is surfaced and never reported as a successful history save', async (t) => {
  const result = await request(t, { method: 'DELETE', path: `/devices/${ID}`, role: 'ADMINISTRADOR', response: { data: null, error: { code: '23514', message: 'El dispositivo tiene reparaciones activas' } } })
  assert.equal(result.status, 400)
  assert.match(result.body.message, /reparaciones activas/)
})
