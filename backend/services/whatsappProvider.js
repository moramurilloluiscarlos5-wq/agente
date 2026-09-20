import crypto from 'node:crypto'

export class WhatsAppProviderError extends Error {
  constructor(message, { code = 'WHATSAPP_ERROR', status = 502, retryable = false } = {}) {
    super(message)
    this.name = 'WhatsAppProviderError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

export class WhatsAppProvider {
  constructor({ fetchImpl = fetch, env = process.env } = {}) {
    this.fetch = fetchImpl
    this.enabled = env.WHATSAPP_ENABLED === 'true'
    this.simulate = env.WHATSAPP_SIMULATE === 'true'
    this.token = env.WHATSAPP_ACCESS_TOKEN ?? ''
    this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID ?? ''
    this.apiVersion = env.WHATSAPP_API_VERSION || env.WHATSAPP_GRAPH_API_VERSION || 'v22.0'
    this.appSecret = env.WHATSAPP_APP_SECRET ?? ''
    this.verifyToken = env.WHATSAPP_VERIFY_TOKEN ?? ''
    this.configured = this.enabled && Boolean(this.token && this.phoneNumberId)
  }

  getStatus() {
    return { enabled: this.enabled, simulate: this.simulate, configured: this.configured }
  }

  async sendMessage({ to, text }) {
    return this.#send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    })
  }

  async sendTemplate({ to, templateName, language = 'es_MX', parameters = [] }) {
    return this.#send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components: parameters.length ? [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text: String(text) })) }] : undefined,
      },
    })
  }

  validateWebhookSignature(rawBody, signature) {
    // Sin secreto de aplicación no hay forma de verificar el origen del webhook: se
    // rechaza por defecto (fail-closed) y solo se acepta en simulación explícita.
    if (!this.appSecret) return this.simulate
    if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) return false
    if (typeof signature !== 'string' || !signature.startsWith('sha256=')) return false
    const expected = crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex')
    const received = signature.slice('sha256='.length)
    return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  }

  verifyWebhookToken(token) {
    const expected = Buffer.from(this.verifyToken)
    const received = Buffer.from(String(token ?? ''))
    return Boolean(expected.length && expected.length === received.length && crypto.timingSafeEqual(expected, received))
  }

  async #send(body) {
    if (!this.enabled) throw new WhatsAppProviderError('Integración de WhatsApp no configurada', { code: 'NOT_CONFIGURED', status: 503 })
    if (!this.configured) throw new WhatsAppProviderError('WhatsApp está habilitado pero faltan sus credenciales', { code: 'INVALID_CONFIGURATION', status: 503 })

    let response
    try {
      response = await this.fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new WhatsAppProviderError('No se pudo conectar con WhatsApp', { code: 'PROVIDER_UNAVAILABLE', retryable: true })
    }

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const providerCode = payload?.error?.code ? String(payload.error.code) : 'PROVIDER_REJECTED'
      const retryable = response.status === 429 || response.status >= 500
      throw new WhatsAppProviderError('WhatsApp rechazó el mensaje', { code: providerCode, status: response.status, retryable })
    }

    return { providerMessageId: payload?.messages?.[0]?.id ?? null, payload }
  }
}
