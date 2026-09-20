import crypto from 'node:crypto'
import { databaseError } from '../utils/operations.js'
import { normalizeWhatsAppPhone } from './whatsappPhone.js'
import { buildTemplateContext, getStatusTemplate, renderTemplate, statusTemplateParameters } from './whatsappTemplates.js'
import { WhatsAppProvider } from './whatsappProvider.js'

export const whatsappProvider = new WhatsAppProvider()

function providerMessageError(error) {
  return { code: error.code || 'WHATSAPP_ERROR', message: error.message || 'No se pudo enviar el mensaje' }
}

async function findExisting(db, idempotencyKey) {
  const { data, error } = await db.from('whatsapp_messages').select('*').eq('idempotency_key', idempotencyKey).maybeSingle()
  databaseError(error)
  return data
}

export async function sendWhatsAppMessage({
  db,
  customer,
  repair = null,
  text,
  templateName = null,
  templateParameters = [],
  sentBy = null,
  idempotencyKey = crypto.randomUUID(),
  messageType = templateName ? 'template' : 'text',
}) {
  const existing = await findExisting(db, idempotencyKey)
  if (existing) return { data: existing, duplicate: true }

  let phone
  try {
    phone = normalizeWhatsAppPhone(customer.whatsapp_e164 || customer.whatsapp || customer.phone, process.env.WHATSAPP_DEFAULT_COUNTRY || '52')
  } catch (error) {
    return createFailedMessage({ db, customer, repair, text, templateName, templateParameters, sentBy, idempotencyKey, phone: customer.whatsapp_e164 || customer.whatsapp || customer.phone || '', errorCode: 'INVALID_PHONE', errorMessage: error.message })
  }

  if (!customer.whatsapp_opt_in) {
    return createFailedMessage({ db, customer, repair, text, templateName, templateParameters, sentBy, idempotencyKey, phone, errorCode: 'NO_CONSENT', errorMessage: 'El cliente no autorizó recibir actualizaciones por WhatsApp' })
  }

  const { data: pending, error: insertError } = await db.from('whatsapp_messages').insert({
    workshop_id: customer.workshop_id || repair?.workshop_id,
    customer_id: customer.id,
    repair_order_id: repair?.id ?? null,
    sent_by: sentBy,
    phone,
    message_type: messageType,
    template_name: templateName,
    template_parameters: templateParameters,
    message: text,
    idempotency_key: idempotencyKey,
    status: 'pending',
  }).select('*').single()
  if (insertError) {
    if (insertError.code === '23505') {
      const duplicate = await findExisting(db, idempotencyKey)
      return { data: duplicate, duplicate: true }
    }
    databaseError(insertError)
  }

  try {
    if (whatsappProvider.simulate) {
      return { data: await updateMessage(db, pending.id, { status: 'sent', provider: 'simulation', provider_message_id: `sim_${pending.id}`, sent_at: new Date().toISOString() }), simulated: true }
    }
    const response = templateName
      ? await whatsappProvider.sendTemplate({ to: phone, templateName, parameters: templateParameters })
      : await whatsappProvider.sendMessage({ to: phone, text })
    const data = await updateMessage(db, pending.id, { status: 'sent', provider_message_id: response.providerMessageId, sent_at: new Date().toISOString() })
    return { data }
  } catch (error) {
    const details = providerMessageError(error)
    const data = await updateMessage(db, pending.id, { status: 'failed', error_code: details.code, error_message: details.message, failed_at: new Date().toISOString() })
    return { data, error: details }
  }
}

export async function enqueueRepairStatusNotification({ db, repair, actorId = null }) {
  const { data: automation, error: automationError } = await db.from('whatsapp_automations').select('*').eq('event_type', repair.status).eq('workshop_id', repair.workshop_id).eq('enabled', true).maybeSingle()
  databaseError(automationError)
  if (!automation) return { skipped: true, reason: 'AUTOMATION_DISABLED' }

  const { data: customer, error: customerError } = await db.from('customers').select('*').eq('id', repair.customer_id).eq('workshop_id', repair.workshop_id).is('deleted_at', null).maybeSingle()
  databaseError(customerError)
  if (!customer) return { skipped: true, reason: 'CUSTOMER_NOT_FOUND' }

  const template = getStatusTemplate(repair.status, automation.template_name)
  if (!template) return { skipped: true, reason: 'STATUS_NOT_MAPPED' }
  const context = buildTemplateContext({ repair, customer })
  const message = renderTemplate(template.text, context)
  return sendWhatsAppMessage({
    db,
    customer,
    repair,
    text: message,
    templateName: template.templateName,
    templateParameters: statusTemplateParameters(repair.status, context),
    sentBy: actorId,
    idempotencyKey: `repair:${repair.id}:status:${repair.status}:${repair.updated_at}`,
  })
}

export function startWhatsAppWorker(db) {
  if (!db || (!whatsappProvider.enabled && !whatsappProvider.simulate)) return null
  const run = () => processPendingWhatsAppMessages({ db }).catch(() => {})
  const timer = setInterval(run, 30000)
  timer.unref?.()
  return timer
}

export async function processPendingWhatsAppMessages({ db }) {
  if (!whatsappProvider.enabled && !whatsappProvider.simulate) return
  const { data: pending, error } = await db.from('whatsapp_messages').select('*,customer:customers(*),repair:repair_orders(*)').eq('status', 'pending').order('created_at').limit(20)
  databaseError(error)
  for (const message of pending ?? []) {
    try {
      const response = whatsappProvider.simulate
        ? { providerMessageId: `sim_${message.id}` }
        : message.template_name
          ? await whatsappProvider.sendTemplate({ to: message.phone, templateName: message.template_name, parameters: message.template_parameters })
          : await whatsappProvider.sendMessage({ to: message.phone, text: message.message })
      await updateMessage(db, message.id, { status: 'sent', provider: whatsappProvider.simulate ? 'simulation' : 'meta', provider_message_id: response.providerMessageId, sent_at: new Date().toISOString() })
    } catch (error) {
      const details = providerMessageError(error)
      const nextRetry = message.retry_count + 1
      await updateMessage(db, message.id, nextRetry >= 3 ? { status: 'failed', error_code: details.code, error_message: details.message, retry_count: nextRetry, failed_at: new Date().toISOString() } : { retry_count: nextRetry, error_code: details.code, error_message: details.message })
    }
  }
}

async function createFailedMessage({ db, customer, repair, text, templateName, templateParameters, sentBy, idempotencyKey, phone, errorCode, errorMessage }) {
  const { data, error } = await db.from('whatsapp_messages').insert({
    workshop_id: customer.workshop_id || repair?.workshop_id,
    customer_id: customer.id,
    repair_order_id: repair?.id ?? null,
    sent_by: sentBy,
    phone,
    message_type: templateName ? 'template' : 'text',
    template_name: templateName,
    template_parameters: templateParameters,
    message: text,
    idempotency_key: idempotencyKey,
    status: 'failed',
    error_code: errorCode,
    error_message: errorMessage,
    failed_at: new Date().toISOString(),
  }).select('*').single()
  if (error?.code === '23505') return { data: await findExisting(db, idempotencyKey), duplicate: true }
  databaseError(error)
  return { data, error: { code: errorCode, message: errorMessage } }
}

async function updateMessage(db, id, values) {
  const { data, error } = await db.from('whatsapp_messages').update(values).eq('id', id).select('*').single()
  databaseError(error)
  return data
}
