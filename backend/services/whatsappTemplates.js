const STATUS_TEMPLATES = {
  recibido: { templateName: 'repair_received', text: 'Tu equipo {{marca}} {{modelo}} fue recibido correctamente en CARLOSTECH.' },
  diagnostico: { templateName: 'repair_diagnosis_complete', text: 'El diagnóstico de tu equipo {{marca}} {{modelo}} ha sido completado. Comunícate con nosotros para revisar las opciones de reparación.' },
  esperando_autorizacion: { templateName: 'repair_waiting_authorization', text: 'Tenemos lista la cotización de tu {{marca}} {{modelo}}. Orden: {{orden}}. Total estimado: ${{total}}. Estamos esperando tu autorización.' },
  esperando_refaccion: { templateName: 'repair_waiting_part', text: 'Tu equipo {{marca}} {{modelo}} está esperando una refacción. Te avisaremos cuando podamos continuar.' },
  en_reparacion: { templateName: 'repair_started', text: 'La reparación de tu {{marca}} {{modelo}} ya comenzó. Orden: {{orden}}.' },
  en_pruebas: { templateName: 'repair_testing', text: 'Tu equipo {{marca}} {{modelo}} está en pruebas finales. Te avisaremos cuando esté listo.' },
  listo_para_entregar: { templateName: 'repair_ready', text: 'Buenas noticias: tu {{marca}} {{modelo}} ya está listo para entregar. Orden: {{orden}}. Total: ${{total}}.' },
  entregado: { templateName: 'repair_delivered', text: 'Gracias por confiar en CARLOSTECH. La orden {{orden}} fue entregada correctamente.' },
  pago_pendiente: { templateName: 'payment_pending', text: 'La reparación {{orden}} tiene un saldo pendiente de ${{saldo}}.' },
}

function customerName(customer) {
  return [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'cliente'
}

export function getStatusTemplate(status, configuredName) {
  const template = STATUS_TEMPLATES[status]
  if (!template) return null
  return { ...template, templateName: configuredName || template.templateName }
}

export function buildTemplateContext({ repair, customer, total = repair?.estimated_cost, paid = repair?.deposit, warranty = '' }) {
  const amount = Number(total ?? 0)
  const deposit = Number(paid ?? 0)
  return {
    cliente: customerName(customer),
    orden: repair?.order_number || '',
    marca: repair?.brand || repair?.device?.brand || '',
    modelo: repair?.model || repair?.device?.model || '',
    estado: repair?.status || '',
    problema: repair?.reported_problem || '',
    diagnostico: repair?.initial_diagnosis || '',
    total: amount.toFixed(2),
    pagado: deposit.toFixed(2),
    saldo: Math.max(0, amount - deposit).toFixed(2),
    fecha: new Date().toLocaleDateString('es-MX'),
    garantia: warranty,
  }
}

export function renderTemplate(text, context) {
  return text.replace(/{{\s*([a-zA-Z_]+)\s*}}/g, (_match, key) => String(context[key] ?? ''))
}

export function statusTemplateParameters(status, context) {
  const template = getStatusTemplate(status)
  if (!template) return []
  const keys = template.text.match(/{{\s*([a-zA-Z_]+)\s*}}/g) || []
  return keys.map((key) => context[key.replace(/[{}\s]/g, '')] ?? '')
}
