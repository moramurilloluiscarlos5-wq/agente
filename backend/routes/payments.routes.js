import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { databaseError, fail, pageParams, searchTerm, uuid, validatePaymentPayload } from '../utils/operations.js'
import { requirePermission } from '../middleware/rbac.js'
import { assertSameWorkshop, scopeToWorkshop, stampWorkshop, workshopScope } from '../utils/workshop.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
const writers = requireRole('ADMINISTRADOR', 'RECEPCION')
const admin = requireRole('ADMINISTRADOR')

export function createPaymentsRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate)

  async function activePayment(id, req) {
    const { data, error } = await scopeToWorkshop(db.from('payments').select('*').eq('id', id).is('deleted_at', null), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Pago no encontrado', 404)
    return data
  }

  async function validateLinks(values, req) {
    for (const [table, field] of [['customers', 'customer_id'], ['repair_orders', 'repair_order_id'], ['quotes', 'quote_id']]) {
      if (!values[field]) continue
      const { data, error } = await scopeToWorkshop(db.from(table).select('id,workshop_id').eq('id', values[field]).is('deleted_at', null), req).maybeSingle()
      databaseError(error)
      assertSameWorkshop(data, req, 'Registro relacionado no encontrado')
    }
  }

  router.get('/', requirePermission('payments.view'), asyncRoute(async (req, res) => {
    const { page, limit, from, to } = pageParams(req.query)
    const q = searchTerm(req.query.q)
    let query = scopeToWorkshop(db.from('payments').select('*,customer:customers(id,first_name,last_name)', { count: 'exact' }).is('deleted_at', null), req)
    if (q) query = query.or(`reference.ilike.%${q}%`)
    if (req.query.customer_id) query = query.eq('customer_id', uuid(req.query.customer_id))
    if (req.query.status) query = query.eq('status', req.query.status)
    const { data, count, error } = await query.order('payment_date', { ascending: false }).range(from, to)
    databaseError(error)
    res.json({ data, count, page, limit })
  }))

  router.get('/:id', requirePermission('payments.view'), asyncRoute(async (req, res) => {
    const data = await activePayment(uuid(req.params.id), req)
    res.json({ data })
  }))

  router.post('/', writers, requirePermission('payments.create'), asyncRoute(async (req, res) => {
    const values = validatePaymentPayload(req.body)
    await validateLinks(values, req)
    const { data, error } = await db.from('payments').insert({
      ...stampWorkshop(values, req),
      created_by: req.profile.id,
      payment_date: values.payment_date ?? new Date().toISOString(),
    }).select('*').single()
    databaseError(error)
    res.status(201).json({ data })
  }))

  router.patch('/:id', writers, requirePermission('payments.update'), asyncRoute(async (req, res) => {
    const existing = await activePayment(uuid(req.params.id), req)
    const values = validatePaymentPayload(req.body, { partial: true })
    await validateLinks(values, req)
    let update = db.from('payments').update(values).eq('id', existing.id).is('deleted_at', null)
    if (req.profile.role !== 'SUPER_ADMIN') update = update.eq('workshop_id', workshopScope(req))
    const { data, error } = await update.select('*').maybeSingle()
    databaseError(error)
    if (!data) fail('Pago no encontrado', 404)
    res.json({ data })
  }))

  router.delete('/:id', admin, requirePermission('payments.delete'), asyncRoute(async (req, res) => {
    const id = uuid(req.params.id)
    const { data, error } = await scopeToWorkshop(db.from('payments').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('*'), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Pago no encontrado', 404)
    res.json({ data, message: 'Pago eliminado' })
  }))

  return router
}

export default createPaymentsRouter()
