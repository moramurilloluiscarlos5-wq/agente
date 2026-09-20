export const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/

export const TRACKING_STATUSES = [
  'recibido',
  'diagnostico',
  'esperando_autorizacion',
  'esperando_refaccion',
  'en_reparacion',
  'en_pruebas',
  'listo_para_entregar',
  'entregado',
  'cancelado',
]

export const TRACKING_STATUS_META = {
  recibido: {
    label: 'Recibido',
    headline: 'Equipo recibido',
    message: 'Hemos recibido tu equipo correctamente.',
    done: true,
  },
  diagnostico: {
    label: 'Diagnóstico',
    headline: 'En diagnóstico',
    message: 'Estamos realizando el diagnóstico del equipo.',
    done: true,
  },
  esperando_autorizacion: {
    label: 'Esperando autorización',
    headline: 'Esperando autorización',
    message: 'El diagnóstico está listo y estamos esperando tu autorización.',
    done: true,
  },
  esperando_refaccion: {
    label: 'Esperando refacción',
    headline: 'Esperando refacción',
    message: 'Estamos esperando la refacción necesaria.',
    done: true,
  },
  en_reparacion: {
    label: 'En reparación',
    headline: 'En reparación',
    message: 'Nuestro equipo técnico está trabajando en tu dispositivo.',
    done: false,
  },
  en_pruebas: {
    label: 'En pruebas',
    headline: 'En pruebas finales',
    message: 'La reparación terminó y estamos realizando pruebas.',
    done: false,
  },
  listo_para_entregar: {
    label: 'Listo para entregar',
    headline: 'Listo para entregar',
    message: 'Tu equipo está listo para ser entregado.',
    done: false,
  },
  entregado: {
    label: 'Entregado',
    headline: 'Equipo entregado',
    message: 'Tu equipo fue entregado. Gracias por confiar en CARLOSTECH.',
    done: false,
  },
  cancelado: {
    label: 'Cancelado',
    headline: 'Reparación cancelada',
    message: 'La reparación fue cancelada.',
    done: false,
  },
}

export const TRACKING_HISTORY_PUBLIC_ROLES = new Set(['ADMINISTRADOR', 'OWNER', 'SUPER_ADMIN', 'TECNICO', 'RECEPCION'])
export const TRACKING_REGENERATE_ROLES = new Set(['ADMINISTRADOR', 'OWNER', 'SUPER_ADMIN'])
export const TRACKING_TOGGLE_ROLES = new Set(['ADMINISTRADOR', 'OWNER', 'SUPER_ADMIN'])

export function isTrackingStatus(value) {
  return TRACKING_STATUSES.includes(value)
}

export function validateTrackingToken(token, label = 'Token de seguimiento') {
  if (typeof token !== 'string' || !TRACKING_TOKEN_PATTERN.test(token)) {
    const error = new Error(`${label} no válido`)
    error.status = 404
    error.publicMessage = 'Seguimiento no encontrado.'
    throw error
  }
  return token
}

export function trackingLogUrl(appUrl, token) {
  return `${String(appUrl || '').replace(/\/+$/, '')}/seguimiento/${token}`
}

export function maskImei(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return `***********${digits.slice(-4)}`
}

export function trackingStatusMeta(status) {
  return TRACKING_STATUS_META[status] ?? { label: status, headline: status, message: '', done: false }
}

export function buildTrackingTimeline(history) {
  const entries = [...(history ?? [])]
    .filter((entry) => isTrackingStatus(entry?.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const lastIndexByStatus = new Map()
  entries.forEach((entry, index) => {
    lastIndexByStatus.set(entry.status, index)
  })
  const reached = new Set(lastIndexByStatus.keys())

  return TRACKING_STATUSES.map((status) => {
    const index = lastIndexByStatus.get(status)
    const entry = index == null ? null : entries[index]
    return {
      status,
      ...trackingStatusMeta(status),
      reached: reached.has(status),
      current: false,
      at: entry?.created_at ?? null,
      publicMessage: typeof entry?.public_message === 'string' ? entry.public_message : '',
    }
  }).map((step, index, steps) => {
    const nextReachedIndex = steps.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.reached)
    const isLastReached = step.reached && (nextReachedIndex === -1 || steps.slice(index + 1, nextReachedIndex).every((candidate) => !candidate.reached))
    return { ...step, current: step.reached && steps.slice(0, index).every((previous) => !previous.current) && isLastReached }
  })
}

export function serializeTrackingPayload({ order, history, warranty }) {
  const meta = trackingStatusMeta(order.status)
  const steps = buildTrackingTimeline(history)
  const current = [...steps].reverse().find((step) => step.current) ?? steps.find((step) => step.status === order.status) ?? null

  return {
    orderNumber: order.order_number,
    status: order.status,
    statusLabel: meta.label,
    statusHeadline: meta.headline,
    statusMessage: meta.message,
    receivedAt: order.received_at,
    updatedAt: order.updated_at,
    estimatedDeliveryAt: order.estimated_delivery_at ?? null,
    device: {
      brand: order.brand ?? order.device?.brand ?? '',
      model: order.model ?? order.device?.model ?? '',
      color: order.device?.color ?? '',
      serialNumber: order.device?.serial_number ?? '',
      maskedImei: maskImei(order.device?.imei),
    },
    customer: {
      name: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' '),
    },
    timeline: steps,
    current,
    deliveredAt: order.status === 'entregado' ? order.updated_at : null,
    warranty: warranty
      ? {
          status: warranty.status,
          expiresAt: warranty.expires_at,
          serviceDescription: warranty.service_description ?? '',
        }
      : null,
  }
}

export function buildTrackingWhatsAppMessage({ trackingUrl, orderNumber, customerName, brand, model }) {
  const lines = [
    `Hola ${customerName || 'cliente'} 👋`,
    '',
    `Puedes consultar el estado de tu ${[brand, model].filter(Boolean).join(' ') || 'equipo'} en cualquier momento desde este enlace:`,
    '',
    trackingUrl,
    '',
    `Orden: ${orderNumber}`,
    '',
    'CARLOSTECH',
    'Servicio Técnico',
  ]
  return lines.join('\n')
}
