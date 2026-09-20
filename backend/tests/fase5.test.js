import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAIDiagnosticPayload } from '../utils/operations.js'

test('AI diagnostic payload validation trims fields and rejects empty symptoms', () => {
  const payload = validateAIDiagnosticPayload({
    device_brand: ' Samsung ',
    device_model: ' A54 ',
    issue: '  No enciende  ',
    observations: ' Carga normal ',
  })

  assert.deepEqual(payload, {
    device_brand: 'Samsung',
    device_model: 'A54',
    issue: 'No enciende',
    observations: 'Carga normal',
  })

  assert.throws(() => validateAIDiagnosticPayload({ issue: '   ' }), { status: 400 })
  assert.throws(() => validateAIDiagnosticPayload({ device_brand: 'X', issue: 'Y', observations: 'Z'.repeat(6000) }), { status: 400 })
})
