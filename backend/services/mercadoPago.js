import { createHmac, timingSafeEqual } from 'node:crypto'

// Cliente mínimo de la API de suscripciones de Mercado Pago (preapproval).
// Se usa fetch directo para no depender del SDK y poder sustituirlo en pruebas.

const API_URL = 'https://api.mercadopago.com'

export class MercadoPagoError extends Error {
  constructor(message, { providerStatus = null, providerMessage = null, providerCauses = [] } = {}) {
    super(message)
    this.name = 'MercadoPagoError'
    // 502: el fallo es del proveedor, no del taller. El mensaje público no expone detalles de Mercado Pago.
    this.status = 502
    this.code = 'PAYMENT_PROVIDER_ERROR'
    this.publicMessage = 'Mercado Pago no pudo completar la operación. Inténtalo de nuevo en unos minutos.'
    this.providerStatus = providerStatus
    this.providerMessage = providerMessage
    this.providerCauses = providerCauses
  }
}

// Rechazos de Mercado Pago al crear una suscripción que dependen de quien paga, no de un fallo
// del servicio: se explican al taller con algo que pueda corregir. El resto sigue como 502.
const CHECKOUT_PROBLEMS = [
  [/same user|payer.*collector|collector.*payer/i, 'No puedes pagar con la misma cuenta de Mercado Pago que recibe los cobros de TallerFlow. Usa el correo de otra cuenta de Mercado Pago.'],
  [/different countries|country/i, 'Ese correo es de una cuenta de Mercado Pago de otro país. Usa una cuenta de Mercado Pago de México.'],
  [/real or test users|test user/i, 'Ese correo no se puede usar para pagar en este entorno. Usa el correo de una cuenta real de Mercado Pago.'],
  [/payer_email|email/i, 'Mercado Pago no aceptó ese correo. Escribe el correo con el que entras a tu cuenta de Mercado Pago.'],
]

export function checkoutProblem(error) {
  if (!(error instanceof MercadoPagoError) || error.providerStatus !== 400) return null
  const text = [error.providerMessage, ...(error.providerCauses ?? [])].filter(Boolean).join(' ')
  return CHECKOUT_PROBLEMS.find(([pattern]) => pattern.test(text))?.[1] ?? null
}

export function createMercadoPagoClient({ accessToken, fetchImpl = globalThis.fetch, timeoutMs = 15_000 }) {
  async function request(method, path, body) {
    let response
    try {
      response = await fetchImpl(`${API_URL}${path}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new MercadoPagoError(`Sin respuesta de Mercado Pago (${method} ${path.split('/')[1]})`, { providerMessage: error?.name ?? null })
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      // Mercado Pago explica el rechazo en `message` y en `cause[]`; ninguno incluye credenciales.
      const causes = (Array.isArray(data?.cause) ? data.cause : []).map((cause) => [cause?.code, cause?.description].filter(Boolean).join(' ')).filter(Boolean)
      throw new MercadoPagoError(`Mercado Pago respondió ${response.status} (${method} ${path.split('/')[1]})`, { providerStatus: response.status, providerMessage: data?.message ?? null, providerCauses: causes })
    }
    return data
  }
  const id = (value) => encodeURIComponent(String(value))
  return {
    createPreapproval: (body) => request('POST', '/preapproval', body),
    getPreapproval: (preapprovalId) => request('GET', `/preapproval/${id(preapprovalId)}`),
    updatePreapproval: (preapprovalId, body) => request('PUT', `/preapproval/${id(preapprovalId)}`, body),
    getAuthorizedPayment: (paymentId) => request('GET', `/authorized_payments/${id(paymentId)}`),
  }
}

// ─── Firma de las notificaciones (webhooks) ─────────────────────────────
// Mercado Pago firma con HMAC-SHA256 el texto `id:{data.id};request-id:{x-request-id};ts:{ts};`
// (las partes ausentes se omiten), igual que WebhookSignatureValidator del SDK oficial.
// `data.id` viene en la URL de la notificación, no en el cuerpo.
function parseSignature(header) {
  const parts = {}
  for (const piece of String(header ?? '').split(',')) {
    const index = piece.indexOf('=')
    if (index > 0) parts[piece.slice(0, index).trim().toLowerCase()] = piece.slice(index + 1).trim()
  }
  return parts
}

const safeEqual = (a, b) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export function signNotification({ dataId, requestId, ts, secret }) {
  const manifest = [dataId ? `id:${dataId}` : null, requestId ? `request-id:${requestId}` : null, `ts:${ts}`].filter(Boolean).join(';') + ';'
  return createHmac('sha256', secret).update(manifest).digest('hex')
}

export function verifyNotificationSignature({ signature, requestId, dataId, secret }) {
  const { ts, v1 } = parseSignature(signature)
  if (!ts || !/^\d+$/.test(ts) || !v1) return false
  const clean = (value) => (value == null || String(value).trim() === '' ? null : String(value).trim())
  const id = clean(dataId)
  const request = clean(requestId)
  // La documentación pide el id en minúsculas cuando es alfanumérico; el SDK lo usa tal cual. Se aceptan ambas formas.
  const candidates = [...new Set([id, id?.toLowerCase() ?? null])]
  return candidates.some((candidate) => safeEqual(signNotification({ dataId: candidate, requestId: request, ts, secret }), v1.toLowerCase()))
}
