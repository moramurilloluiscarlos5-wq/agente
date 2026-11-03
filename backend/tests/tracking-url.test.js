import test from 'node:test'
import assert from 'node:assert/strict'
import { trackingUrlFor } from '../routes/tracking.routes.js'
import { serializeTrackingPayload } from '../utils/tracking.js'

const KEYS = ['APP_PUBLIC_URL', 'APP_URL', 'FRONTEND_URL']

function withEnv(t, values) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))
  for (const key of KEYS) delete process.env[key]
  Object.assign(process.env, values)
  t.after(() => { for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] } })
}

test('el enlace de seguimiento usa APP_PUBLIC_URL, la variable de producción', (t) => {
  withEnv(t, { APP_PUBLIC_URL: 'https://app.example.com/' })
  assert.equal(trackingUrlFor('abc'), 'https://app.example.com/seguimiento/abc')
})

test('el enlace de seguimiento acepta APP_URL y FRONTEND_URL como respaldo', (t) => {
  withEnv(t, { FRONTEND_URL: 'http://localhost:5173' })
  assert.equal(trackingUrlFor('abc'), 'http://localhost:5173/seguimiento/abc')
})

test('el cliente ve el camino normal sin "Cancelado" por venir y con el contacto del taller', () => {
  const order = { order_number: 'ST-1', status: 'recibido', customer: {}, device: {} }
  const payload = serializeTrackingPayload({ order, history: [{ status: 'recibido', created_at: '2026-11-01T10:00:00Z' }], workshop: { name: 'Taller Centro', phone: '614 555 0000', email: 'no@publico.mx' } })
  assert.deepEqual(payload.timeline.map((step) => step.status), ['recibido', 'diagnostico', 'en_reparacion', 'listo_para_entregar', 'entregado'])
  assert.deepEqual(payload.workshop, { name: 'Taller Centro', phone: '614 555 0000' })
})

test('una espera o una cancelación solo aparecen si ocurrieron', () => {
  const order = { order_number: 'ST-2', status: 'cancelado', customer: {}, device: {} }
  const history = [{ status: 'recibido', created_at: '2026-11-01T10:00:00Z' }, { status: 'esperando_autorizacion', created_at: '2026-11-01T11:00:00Z' }, { status: 'cancelado', created_at: '2026-11-01T12:00:00Z' }]
  assert.deepEqual(serializeTrackingPayload({ order, history }).timeline.map((step) => step.status), ['recibido', 'esperando_autorizacion', 'cancelado'])
})

test('los folios viejos CAR- y los nuevos ST- se aceptan; otros no', async () => {
  const { orderNumber } = await import('../utils/operations.js')
  assert.equal(orderNumber('CAR-2026-0002'), 'CAR-2026-0002')
  assert.equal(orderNumber('ST-2026-0003'), 'ST-2026-0003')
  assert.throws(() => orderNumber('XX-2026-0001'))
})

test('una etapa que el taller saltó se ve cumplida, no pendiente', () => {
  const order = { order_number: 'ST-3', status: 'listo_para_entregar', customer: {}, device: {} }
  const history = [{ status: 'recibido', created_at: '2026-11-01T10:00:00Z' }, { status: 'diagnostico', created_at: '2026-11-01T11:00:00Z' }, { status: 'listo_para_entregar', created_at: '2026-11-01T12:00:00Z' }]
  const timeline = serializeTrackingPayload({ order, history }).timeline
  assert.deepEqual(timeline.map((step) => [step.status, step.reached]), [['recibido', true], ['diagnostico', true], ['en_reparacion', true], ['listo_para_entregar', true], ['entregado', false]])
  assert.equal(timeline.find((step) => step.status === 'en_reparacion').at, null)
})
