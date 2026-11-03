import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createQuotesRouter } from '../routes/quotes.routes.js'

const WORKSHOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CUSTOMER = 'c1111111-1111-4111-8111-111111111111'
const OTHER_CUSTOMER = 'c2222222-2222-4222-8222-222222222222'
const REPAIR = 'b1111111-1111-4111-8111-111111111111'
const COLUMNS = { customers: ['id', 'workshop_id'], repair_orders: ['id', 'customer_id', 'workshop_id'], devices: ['id', 'customer_id', 'workshop_id'] }

// Base mínima: como PostgREST, responde 42703 si se pide una columna que la tabla no tiene.
function fakeDb(rows) {
  return {
    from(table) {
      const state = { table, filters: {}, columns: null, insert: null }
      const query = {
        select(columns) { state.columns = columns; return query },
        eq(field, value) { state.filters[field] = value; return query },
        is() { return query },
        insert(values) { state.insert = values; return query },
        single() { return Promise.resolve({ data: { id: 'q1', ...state.insert }, error: null }) },
        maybeSingle() {
          const unknown = state.columns.split(',').find((column) => !COLUMNS[table]?.includes(column))
          if (COLUMNS[table] && unknown) return Promise.resolve({ data: null, error: { code: '42703', message: `column ${table}.${unknown} does not exist` } })
          return Promise.resolve({ data: rows[table]?.find((row) => row.id === state.filters.id) ?? null, error: null })
        },
      }
      return query
    },
  }
}

async function post(t, body) {
  const db = fakeDb({ customers: [{ id: CUSTOMER, workshop_id: WORKSHOP }, { id: OTHER_CUSTOMER, workshop_id: WORKSHOP }], repair_orders: [{ id: REPAIR, customer_id: CUSTOMER, workshop_id: WORKSHOP }] })
  const app = express()
  app.use(express.json())
  app.use(createQuotesRouter({ db, authenticate: [(req, _res, next) => { req.profile = { id: '11111111-1111-4111-8111-111111111111', role: 'OWNER', workshop_id: WORKSHOP, permissions: ['*'], permissionsSource: 'rbac' }; next() }] }))
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ message: error.publicMessage ?? error.message }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, json: await response.json() }
}

test('crear una cotización con cliente y orden ya no falla con 500', async (t) => {
  const { status, json } = await post(t, { customer_id: CUSTOMER, repair_order_id: REPAIR, labor_cost: 1850 })
  assert.equal(status, 201, JSON.stringify(json))
  assert.equal(json.data.total, 1850)
})

test('la orden ligada debe ser del mismo cliente', async (t) => {
  const { status, json } = await post(t, { customer_id: OTHER_CUSTOMER, repair_order_id: REPAIR, labor_cost: 100 })
  assert.equal(status, 400, JSON.stringify(json))
  assert.equal(json.message, 'La orden elegida es de otro cliente.')
})
