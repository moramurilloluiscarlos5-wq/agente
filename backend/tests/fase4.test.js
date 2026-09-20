import test from 'node:test'
import assert from 'node:assert/strict'
import { validateQuotePayload, validatePaymentPayload, validateWarrantyPayload } from '../utils/operations.js'

test('quote payload validation accepts valid commercial values and rejects invalid status', () => {
  assert.deepEqual(validateQuotePayload({
    customer_id: '11111111-1111-4111-8111-111111111111',
    labor_cost: 1200,
    discount: 100,
    tax_rate: 16,
    notes: '  Ajuste final  ',
    status: 'pendiente'
  }), {
    customer_id: '11111111-1111-4111-8111-111111111111',
    labor_cost: 1200,
    discount: 100,
    tax_rate: 16,
    notes: 'Ajuste final',
    status: 'pendiente'
  })

  assert.throws(() => validateQuotePayload({ status: 'unknown' }), { status: 400 })
  assert.throws(() => validateQuotePayload({ customer_id: 'bad' }), { status: 400 })
})

test('payment validation requires customer, positive amount and valid method', () => {
  const payload = validatePaymentPayload({
    customer_id: '22222222-2222-4222-8222-222222222222',
    amount: 500,
    method: 'transferencia',
    reference: '  ABC-123  '
  })

  assert.equal(payload.amount, 500)
  assert.equal(payload.reference, 'ABC-123')
  assert.throws(() => validatePaymentPayload({ amount: -1 }), { status: 400 })
  assert.throws(() => validatePaymentPayload({ customer_id: 'bad', amount: 5 }), { status: 400 })
})

test('warranty validation enforces positive duration and valid owner linkage', () => {
  const payload = validateWarrantyPayload({
    repair_order_id: '33333333-3333-4333-8333-333333333333',
    customer_id: '44444444-4444-4444-8444-444444444444',
    service_description: ' Cambio de pantalla ',
    duration_days: 90,
    conditions: 'Sin golpes ni agua',
    status: 'activa'
  })

  assert.equal(payload.service_description, 'Cambio de pantalla')
  assert.equal(payload.duration_days, 90)
  assert.throws(() => validateWarrantyPayload({ duration_days: 0 }), { status: 400 })
  assert.throws(() => validateWarrantyPayload({ repair_order_id: 'x', customer_id: 'y' }), { status: 400 })
})
