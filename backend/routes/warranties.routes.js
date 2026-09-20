import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { databaseError, fail, pageParams, searchTerm, uuid, validateWarrantyPayload } from '../utils/operations.js'
import { requirePermission } from '../middleware/rbac.js'
import { assertSameWorkshop, scopeToWorkshop, stampWorkshop, workshopScope } from '../utils/workshop.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
const writers = requireRole('ADMINISTRADOR', 'RECEPCION')
const admin = requireRole('ADMINISTRADOR')

export function createWarrantiesRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate)

  async function activeWarranty(id, req) {
    const { data, error } = await scopeToWorkshop(db.from('warranties').select('*').eq('id', id).is('deleted_at', null), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Garantía no encontrada', 404)
    return data
  }

  async function validateLinks(values, req) {
    for (const [table, field] of [['customers', 'customer_id'], ['repair_orders', 'repair_order_id'], ['devices', 'device_id']]) {
      if (!values[field]) continue
      const { data, error } = await scopeToWorkshop(db.from(table).select('id,workshop_id').eq('id', values[field]).is('deleted_at', null), req).maybeSingle()
      databaseError(error)
      assertSameWorkshop(data, req, 'Registro relacionado no encontrado')
    }
  }

  router.get('/', requirePermission('warranties.view'), asyncRoute(async (req, res) => {
    const { page, limit, from, to } = pageParams(req.query)
    const q = searchTerm(req.query.q)
    let query = scopeToWorkshop(db.from('warranties').select('*,customer:customers(id,first_name,last_name)', { count: 'exact' }).is('deleted_at', null), req)
    if (q) query = query.or(`service_description.ilike.%${q}%,conditions.ilike.%${q}%`)
    if (req.query.status) query = query.eq('status', req.query.status)
    if (req.query.customer_id) query = query.eq('customer_id', uuid(req.query.customer_id))
    const { data, count, error } = await query.order('expires_at', { ascending: true }).range(from, to)
    databaseError(error)
    res.json({ data, count, page, limit })
  }))

  router.get('/:id', requirePermission('warranties.view'), asyncRoute(async (req, res) => {
    const data = await activeWarranty(uuid(req.params.id), req)
    res.json({ data })
  }))

  router.post('/', writers, requirePermission('warranties.create'), asyncRoute(async (req, res) => {
    const values = validateWarrantyPayload(req.body)
    await validateLinks(values, req)
    const repairDate = values.repair_date ?? new Date().toISOString()
    const payload = {
      ...stampWorkshop(values, req),
      repair_date: repairDate,
      // La vigencia se calcula desde la fecha de reparación y no desde "ahora": al
      // registrar un servicio de días atrás la garantía quedaba más larga de lo pactado.
      expires_at: values.expires_at ?? new Date(new Date(repairDate).getTime() + Number(values.duration_days) * 86400000).toISOString(),
      created_by: req.profile.id,
    }
    const { data, error } = await db.from('warranties').insert(payload).select('*').single()
    databaseError(error)
    res.status(201).json({ data })
  }))

  router.patch('/:id', writers, requirePermission('warranties.update'), asyncRoute(async (req, res) => {
    const existing = await activeWarranty(uuid(req.params.id), req)
    const values = validateWarrantyPayload(req.body, { partial: true })
    await validateLinks(values, req)
    // Solo se envían las columnas editables, sin reescribir la fila completa.
    const payload = { repair_date: values.repair_date ?? existing.repair_date }
    for (const key of ['repair_order_id', 'customer_id', 'device_id', 'service_description', 'duration_days', 'conditions', 'status', 'notes']) {
      if (key in values) payload[key] = values[key]
    }
    // Si cambia la duración o la fecha de reparación sin enviar un vencimiento explícito,
    // la vigencia se recalcula para no quedar incoherente con la nueva duración.
    if (values.expires_at) payload.expires_at = values.expires_at
    else if ('duration_days' in values || 'repair_date' in values) {
      const durationDays = Number(payload.duration_days ?? existing.duration_days)
      payload.expires_at = new Date(new Date(payload.repair_date).getTime() + durationDays * 86400000).toISOString()
    }
    let update = db.from('warranties').update(payload).eq('id', existing.id).is('deleted_at', null)
    if (req.profile.role !== 'SUPER_ADMIN') update = update.eq('workshop_id', workshopScope(req))
    const { data, error } = await update.select('*').maybeSingle()
    databaseError(error)
    if (!data) fail('Garantía no encontrada', 404)
    res.json({ data })
  }))

  router.delete('/:id', admin, requirePermission('warranties.update'), asyncRoute(async (req, res) => {
    const id = uuid(req.params.id)
    const { data, error } = await scopeToWorkshop(db.from('warranties').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('*'), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Garantía no encontrada', 404)
    res.json({ data, message: 'Garantía eliminada' })
  }))

  return router
}

export default createWarrantiesRouter()
