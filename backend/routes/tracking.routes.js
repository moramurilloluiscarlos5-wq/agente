import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { requirePermission } from '../middleware/rbac.js'
import { rateLimit } from '../middleware/security.js'
import { auditSafe, writeAudit } from '../services/auditService.js'
import { assertRepairAccess, databaseError, fail, orderNumber, scopeRepairs } from '../utils/operations.js'
import {
  buildTrackingTimeline,
  buildTrackingWhatsAppMessage,
  isTrackingStatus,
  serializeTrackingPayload,
  TRACKING_REGENERATE_ROLES,
  TRACKING_TOGGLE_ROLES,
  trackingLogUrl,
  validateTrackingToken,
} from '../utils/tracking.js'
import { generateRepairReceiptPdf } from '../services/repairReceiptPdf.js'
import { generateRepairQrPng } from '../services/repairQr.js'

const STAFF = ['ADMINISTRADOR', 'RECEPCION', 'TECNICO', 'OWNER', 'SUPER_ADMIN']
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

export function appBaseUrl() {
  return (process.env.APP_URL || process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '')
}

export function trackingUrlFor(token) {
  const base = appBaseUrl()
  if (base) return trackingLogUrl(base, token)
  return `/seguimiento/${token}`
}

export function randomTrackingToken() {
  return randomBytes(32).toString('base64url')
}

export async function trackedRepairByOrderNumber(db, number, profile = null) {
  let query = db
    .from('repair_orders')
    .select('*,customer:customers(id,first_name,last_name,phone,whatsapp,whatsapp_e164,whatsapp_opt_in),device:devices(id,brand,model,color,imei,serial_number),technician:profiles!repair_orders_technician_id_fkey(id,full_name)')
    .eq('order_number', orderNumber(number))
    .is('deleted_at', null)
  if (profile) query = scopeRepairs(query, profile)
  const { data, error } = await query.maybeSingle()
  databaseError(error)
  if (profile) return assertRepairAccess(data, profile)
  if (!data) fail('Orden no encontrada', 404)
  return data
}

export async function trackedRepairHistory(db, repairId) {
  const { data, error } = await db
    .from('repair_status_history')
    .select('id,status,public_message,created_at')
    .eq('repair_order_id', repairId)
    .order('created_at', { ascending: true })
  databaseError(error)
  return data ?? []
}

export async function trackedActiveWarranty(db, repairId) {
  const { data, error } = await db
    .from('warranties')
    .select('status,expires_at,service_description')
    .eq('repair_order_id', repairId)
    .eq('status', 'activa')
    .is('deleted_at', null)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error?.code === 'PGRST205') return null
  databaseError(error)
  return data
}

export async function trackedRepairIdByToken(db, token) {
  const { data, error } = await db.from('repair_orders').select('id').eq('tracking_token', token).is('deleted_at', null).maybeSingle()
  databaseError(error)
  if (!data) fail('Seguimiento no encontrado.', 404)
  return data
}

export function createTrackingRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()

  // Portal público: solo lectura, sin sesión, con rate limit.
  const publicLimiter = rateLimit({ windowMs: 60_000, max: 60, message: 'Demasiadas consultas. Intenta de nuevo en un momento.' })
  router.get('/public/tracking/:token', publicLimiter, asyncRoute(async (req, res) => {
    if (!db) return res.status(503).json({ message: 'Seguimiento no disponible por el momento.' })
    const token = validateTrackingToken((req.params.token || '').trim())

    const { data: order, error } = await db
      .from('repair_orders')
      .select('id,order_number,status,received_at,updated_at,estimated_delivery_at,brand,model,tracking_enabled,customer:customers(first_name,last_name),device:devices(brand,model,color,imei,serial_number)')
      .eq('tracking_token', token)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) databaseError(error)
    if (!order || order.tracking_enabled === false) {
      return res.status(404).json({ message: 'Seguimiento no encontrado.' })
    }

    const history = await trackedRepairHistory(db, order.id).catch(() => [])
    const warranty = await trackedActiveWarranty(db, order.id).catch(() => null)
    return res.json({ data: serializeTrackingPayload({ order, history, warranty }) })
  }))

  router.use(...authenticate, requireRole(...STAFF))

  router.get('/repairs/:orderNumber/tracking', requirePermission('repairs.view'), asyncRoute(async (req, res) => {
    const order = await trackedRepairByOrderNumber(db, req.params.orderNumber, req.profile)
    const history = await trackedRepairHistory(db, order.id)
    res.json({
      data: {
        orderNumber: order.order_number,
        trackingToken: order.tracking_token ?? null,
        trackingEnabled: order.tracking_enabled !== false,
        trackingUrl: order.tracking_token ? trackingUrlFor(order.tracking_token) : null,
        timeline: buildTrackingTimeline(history),
      },
    })
  }))

  router.get('/repairs/:orderNumber/tracking.png', requirePermission('repairs.view'), asyncRoute(async (req, res) => {
    const order = await trackedRepairByOrderNumber(db, req.params.orderNumber, req.profile)
    if (!order.tracking_token || order.tracking_enabled === false) {
      fail('Esta orden todavía no tiene un enlace de seguimiento activo', 404)
    }
    const png = await generateRepairQrPng(trackingUrlFor(order.tracking_token))
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Disposition', `inline; filename="qr-${order.order_number}.png"`)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.send(png)
  }))

  router.get('/repairs/:orderNumber/receipt.pdf', requirePermission('repairs.view'), asyncRoute(async (req, res) => {
    const order = await trackedRepairByOrderNumber(db, req.params.orderNumber, req.profile)
    const history = await trackedRepairHistory(db, order.id)
    const qrPng = order.tracking_token ? await generateRepairQrPng(trackingUrlFor(order.tracking_token)) : null
    const pdf = await generateRepairReceiptPdf({
      order,
      history,
      qrPng,
      trackingUrl: order.tracking_token ? trackingUrlFor(order.tracking_token) : '',
    })
    void auditSafe(writeAudit({ db, req, action: 'PDF_GENERATED', entity: 'repair_orders', entityId: order.id, description: `Comprobante PDF de ${order.order_number} generado` }))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="comprobante-${order.order_number}.pdf"`)
    res.send(pdf)
  }))

  router.post('/repairs/:orderNumber/tracking/regenerate', requirePermission('repairs.update'), asyncRoute(async (req, res) => {
    if (!TRACKING_REGENERATE_ROLES.has(req.profile.role)) fail('Solo un administrador puede regenerar el enlace', 403)
    const order = await trackedRepairByOrderNumber(db, req.params.orderNumber, req.profile)
    const token = randomTrackingToken()
    const { error } = await db.from('repair_orders').update({ tracking_token: token, tracking_enabled: true }).eq('id', order.id)
    databaseError(error)
    void auditSafe(writeAudit({ db, req, action: 'TRACKING_REGENERATED', entity: 'repair_orders', entityId: order.id, description: `Enlace de seguimiento de ${order.order_number} regenerado`, oldValues: { tracking_token: 'anterior' }, newValues: { tracking_token: 'nuevo' } }))
    res.json({ data: { orderNumber: order.order_number, trackingToken: token, trackingUrl: trackingUrlFor(token), trackingEnabled: true } })
  }))

  router.patch('/repairs/:orderNumber/tracking', requirePermission('repairs.update'), asyncRoute(async (req, res) => {
    if (!TRACKING_TOGGLE_ROLES.has(req.profile.role)) fail('Solo un administrador puede cambiar la visibilidad del seguimiento', 403)
    if (typeof req.body?.tracking_enabled !== 'boolean') fail('tracking_enabled debe ser booleano')
    const order = await trackedRepairByOrderNumber(db, req.params.orderNumber, req.profile)
    const { error } = await db.from('repair_orders').update({ tracking_enabled: req.body.tracking_enabled }).eq('id', order.id)
    databaseError(error)
    void auditSafe(writeAudit({ db, req, action: req.body.tracking_enabled ? 'TRACKING_ENABLED' : 'TRACKING_DISABLED', entity: 'repair_orders', entityId: order.id, description: `Seguimiento de ${order.order_number} ${req.body.tracking_enabled ? 'activado' : 'desactivado'}` }))
    res.json({ data: { orderNumber: order.order_number, trackingEnabled: req.body.tracking_enabled, trackingUrl: order.tracking_token ? trackingUrlFor(order.tracking_token) : null } })
  }))

  router.post('/repairs/:orderNumber/tracking/whatsapp', requirePermission('whatsapp.send'), asyncRoute(async (req, res) => {
    const order = await trackedRepairByOrderNumber(db, req.params.orderNumber, req.profile)
    if (!order.tracking_token || order.tracking_enabled === false) {
      fail('Esta orden todavía no tiene un enlace de seguimiento activo', 404)
    }
    const message = buildTrackingWhatsAppMessage({
      trackingUrl: trackingUrlFor(order.tracking_token),
      orderNumber: order.order_number,
      customerName: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' '),
      brand: order.brand ?? order.device?.brand,
      model: order.model ?? order.device?.model,
    })
    res.json({
      data: {
        message,
        trackingUrl: trackingUrlFor(order.tracking_token),
        to: order.customer?.whatsapp_e164 || order.customer?.whatsapp || order.customer?.phone || '',
      },
    })
  }))

  return router
}

export { TRACKING_REGENERATE_ROLES, TRACKING_TOGGLE_ROLES, buildTrackingTimeline, buildTrackingWhatsAppMessage, isTrackingStatus }
export default createTrackingRouter()
