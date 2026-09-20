import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { databaseError, fail, REPAIR_SELECT, scopeRepairs, searchTerm, uuid } from '../utils/operations.js'
import { normalizeWhatsAppPhone } from '../services/whatsappPhone.js'
import { sendWhatsAppMessage, whatsappProvider } from '../services/whatsappService.js'
import { buildTemplateContext, renderTemplate } from '../services/whatsappTemplates.js'
import { requirePermission } from '../middleware/rbac.js'
import { rateLimit } from '../middleware/security.js'
import { scopeToWorkshop, stampWorkshop, workshopScope } from '../utils/workshop.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
const staff = requireRole('ADMINISTRADOR', 'RECEPCION', 'TECNICO')
const managers = requireRole('ADMINISTRADOR', 'RECEPCION')

export function createWhatsAppRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate, staff)

  router.get('/status', requirePermission('whatsapp.view'), (_req, res) => res.json({ data: whatsappProvider.getStatus() }))

  router.get('/automations', requirePermission('whatsapp.view'), asyncRoute(async (req, res) => {
    const { data, error } = await scopeToWorkshop(db.from('whatsapp_automations').select('*').order('event_type'), req)
    databaseError(error)
    res.json({ data: data ?? [] })
  }))

  router.patch('/automations/:eventType', managers, requirePermission('whatsapp.configure'), asyncRoute(async (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') fail('enabled debe ser booleano')
    const { data, error } = await scopeToWorkshop(db.from('whatsapp_automations').update({ enabled: req.body.enabled }).eq('event_type', searchTerm(req.params.eventType)).select('*'), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Automatización no encontrada', 404)
    res.json({ data })
  }))

  router.get('/messages', requirePermission('whatsapp.view'), asyncRoute(async (req, res) => {
    let query = scopeToWorkshop(db.from('whatsapp_messages').select('*,customer:customers(id,first_name,last_name),repair:repair_orders(id,order_number)').order('created_at', { ascending: false }).limit(100), req)
    if (req.query.customer_id) query = query.eq('customer_id', uuid(req.query.customer_id, 'customer_id'))
    if (req.query.repair_order_id) query = query.eq('repair_order_id', uuid(req.query.repair_order_id, 'repair_order_id'))
    if (req.query.status && ['pending', 'sent', 'delivered', 'read', 'failed'].includes(req.query.status)) query = query.eq('status', req.query.status)
    if (req.profile.role === 'TECNICO') {
      let repairQuery = db.from('repair_orders').select('id').eq('technician_id', req.profile.id).is('deleted_at', null)
      if (req.profile.workshop_id) repairQuery = repairQuery.eq('workshop_id', req.profile.workshop_id)
      const { data: repairs, error: repairError } = await repairQuery
      databaseError(repairError)
      const ids = (repairs ?? []).map((repair) => repair.id)
      query = ids.length ? query.in('repair_order_id', ids) : query.eq('sent_by', req.profile.id)
    }
    const { data, error } = await query
    databaseError(error)
    res.json({ data: data ?? [] })
  }))

  router.post('/messages/:id/retry', requirePermission('whatsapp.send'), asyncRoute(async (req, res) => {
    const messageId = uuid(req.params.id, 'message_id')
    const { data: message, error } = await scopeToWorkshop(db.from('whatsapp_messages').select('*,customer:customers(*),repair:repair_orders(*)').eq('id', messageId), req).maybeSingle()
    databaseError(error)
    if (!message) fail('Mensaje no encontrado', 404)
    if (message.status !== 'failed') fail('Solo se pueden reintentar mensajes fallidos')
    if (message.retry_count >= 3) fail('Se alcanzó el máximo de reintentos')
    const result = await sendWhatsAppMessage({ db, customer: message.customer, repair: message.repair, text: message.message, templateName: message.template_name, templateParameters: message.template_parameters, sentBy: req.profile.id, idempotencyKey: `${message.id}:retry:${message.retry_count + 1}`, messageType: message.message_type })
    let retryUpdate = db.from('whatsapp_messages').update({ retry_count: message.retry_count + 1 }).eq('id', message.id)
    if (req.profile.workshop_id) retryUpdate = retryUpdate.eq('workshop_id', req.profile.workshop_id)
    const { error: updateError } = await retryUpdate
    databaseError(updateError)
    if (result.data?.status === 'failed') return res.status(422).json({ message: result.data.error_message, data: result.data })
    res.status(201).json({ data: result.data, simulated: Boolean(result.simulated) })
  }))

  router.patch('/customers/:id/consent', managers, requirePermission('whatsapp.configure'), asyncRoute(async (req, res) => {
    const customerId = uuid(req.params.id, 'customer_id')
    const enabled = req.body?.whatsapp_opt_in
    if (typeof enabled !== 'boolean') fail('whatsapp_opt_in debe ser booleano')
    let whatsappE164 = null
    if (enabled) {
      try {
        whatsappE164 = normalizeWhatsAppPhone(req.body.whatsapp || req.body.phone, process.env.WHATSAPP_DEFAULT_COUNTRY || '52')
      } catch (error) {
        fail(error.message)
      }
    }
    const { data, error } = await scopeToWorkshop(db.from('customers').update({
      whatsapp_opt_in: enabled,
      whatsapp_opt_in_at: enabled ? new Date().toISOString() : null,
      whatsapp_opt_in_source: enabled ? String(req.body.source || 'staff').slice(0, 50) : null,
      ...(enabled ? { whatsapp_e164: whatsappE164 } : { whatsapp_e164: null }),
    }).eq('id', customerId).is('deleted_at', null).select('id,phone,whatsapp,whatsapp_e164,whatsapp_opt_in,whatsapp_opt_in_at,whatsapp_opt_in_source'), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Cliente no encontrado', 404)
    res.json({ data })
  }))

  router.post('/quotes/:id', requirePermission('whatsapp.send'), asyncRoute(async (req, res) => {
    const quoteId = uuid(req.params.id, 'quote_id')
    const { data: quote, error: quoteError } = await scopeToWorkshop(db.from('quotes').select('*,customer:customers(*),repair:repair_orders(*,device:devices(brand,model))').eq('id', quoteId).is('deleted_at', null), req).maybeSingle()
    databaseError(quoteError)
    if (!quote?.customer) fail('Cotización o cliente no encontrado', 404)
    const repair = quote.repair || { order_number: '', brand: quote.device?.brand, model: quote.device?.model, estimated_cost: quote.total, deposit: quote.deposit }
    const context = buildTemplateContext({ repair, customer: quote.customer, total: quote.total, paid: quote.deposit })
    const message = renderTemplate('Hola {{cliente}}. Tenemos lista la cotización de tu {{marca}} {{modelo}}. Orden: {{orden}}. Total: ${{total}}. Por favor indícanos si deseas autorizar la reparación. CARLOSTECH', context)
    const result = await sendWhatsAppMessage({ db, customer: quote.customer, repair: quote.repair, text: message, templateName: 'quote_ready', templateParameters: [context.cliente, context.marca, context.modelo, context.orden, context.total], sentBy: req.profile.id, idempotencyKey: `quote:${quote.id}:whatsapp:${quote.updated_at}` })
    if (result.data?.status === 'failed') return res.status(422).json({ message: result.data.error_message, data: result.data })
    res.status(201).json({ data: result.data, simulated: Boolean(result.simulated), duplicate: Boolean(result.duplicate) })
  }))

  router.post('/messages', rateLimit({ max: 30, message: 'Demasiados mensajes. Espera un momento.' }), requirePermission('whatsapp.send'), asyncRoute(async (req, res) => {
    const result = await prepareAndSend({ db, body: req.body, actor: req.profile })
    if (result.data?.status === 'failed') return res.status(422).json({ message: result.data.error_message, data: result.data })
    res.status(201).json({ data: result.data, simulated: Boolean(result.simulated), duplicate: Boolean(result.duplicate) })
  }))

  return router
}

async function prepareAndSend({ db, body, actor }) {
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > 4096) fail('El mensaje debe tener entre 1 y 4096 caracteres')
  let repair = null
  if (body.repair_order_id) {
    const repairId = uuid(body.repair_order_id, 'repair_order_id')
    const { data, error } = await scopeRepairs(db.from('repair_orders').select(REPAIR_SELECT).eq('id', repairId).is('deleted_at', null), actor).maybeSingle()
    databaseError(error)
    if (!data) fail('Orden de reparación no encontrada', 404)
    repair = data
  }
  const customerId = repair?.customer_id || uuid(body.customer_id, 'customer_id')
  const { data: customer, error } = await scopeToWorkshop(db.from('customers').select('*').eq('id', customerId).is('deleted_at', null), { profile: actor, query: {} }).maybeSingle()
  databaseError(error)
  if (!customer) fail('Cliente no encontrado', 404)
  return sendWhatsAppMessage({
    db,
    customer,
    repair,
    text: message,
    templateName: body.template_name || null,
    templateParameters: Array.isArray(body.template_parameters) ? body.template_parameters.slice(0, 20) : [],
    sentBy: actor.id,
  })
}

export default createWhatsAppRouter()
