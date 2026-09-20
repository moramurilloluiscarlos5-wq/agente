import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createQuotesRouter } from '../routes/quotes.routes.js'
import { createPaymentsRouter } from '../routes/payments.routes.js'
import { createWarrantiesRouter } from '../routes/warranties.routes.js'
import { createInventoryRouter } from '../routes/inventory.routes.js'

const WORKSHOP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

async function listCalls(t, createRouter) {
  const calls = []
  const query = new Proxy({}, { get(_target, key) {
    if (key === 'then') return (resolve) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve)
    return (...args) => { calls.push([key, ...args]); return query }
  } })
  const db = { from: (table) => { calls.push(['from', table]); return query } }
  const app = express()
  app.use(createRouter({ db, authenticate: [(req, _res, next) => { req.profile = { id: '11111111-1111-4111-8111-111111111111', role: 'ADMINISTRADOR', workshop_id: WORKSHOP_A }; next() }] }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`)
  return { response, calls }
}

for (const [name, factory] of [['quotes', createQuotesRouter], ['payments', createPaymentsRouter], ['warranties', createWarrantiesRouter], ['inventory', createInventoryRouter]]) {
  test(`${name} list is scoped to the authenticated workshop`, async (t) => {
    const { response, calls } = await listCalls(t, factory)
    assert.equal(response.status, 200)
    assert.ok(calls.some(([method, field, value]) => method === 'eq' && field === 'workshop_id' && value === WORKSHOP_A))
  })
}
