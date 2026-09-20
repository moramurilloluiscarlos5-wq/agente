import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import { normalizeWhatsAppPhone } from '../services/whatsappPhone.js'
import { WhatsAppProvider } from '../services/whatsappProvider.js'

test('normaliza teléfonos mexicanos al formato que requiere WhatsApp', () => {
  assert.equal(normalizeWhatsAppPhone('612 123 4567'), '526121234567')
  assert.equal(normalizeWhatsAppPhone('+52 (612) 123-4567'), '526121234567')
  assert.throws(() => normalizeWhatsAppPhone('1234'), /teléfono.*válido/i)
})

test('valida la firma HMAC y el token del webhook', () => {
  const provider = new WhatsAppProvider({ env: { WHATSAPP_APP_SECRET: 'secret', WHATSAPP_VERIFY_TOKEN: 'verify' } })
  const body = JSON.stringify({ entry: [] })
  const signature = `sha256=${crypto.createHmac('sha256', 'secret').update(body).digest('hex')}`
  assert.equal(provider.validateWebhookSignature(body, signature), true)
  assert.equal(provider.validateWebhookSignature(body, 'sha256=invalid'), false)
  assert.equal(provider.verifyWebhookToken('verify'), true)
  assert.equal(provider.verifyWebhookToken('wrong'), false)
})
