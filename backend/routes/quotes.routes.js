import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { databaseError, fail, pageParams, searchTerm, uuid, validateQuotePayload } from '../utils/operations.js'
import { assertSameWorkshop, scopeToWorkshop, stampWorkshop, workshopScope } from '../utils/workshop.js'
import { requirePermission } from '../middleware/rbac.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
const writers = requireRole('ADMINISTRADOR', 'RECEPCION')
const admin = requireRole('ADMINISTRADOR')

export function createQuotesRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate)

  async function activeQuote(id, req) {
    const { data, error } = await scopeToWorkshop(db.from('quotes').select('*').eq('id', id).is('deleted_at', null), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Cotización no encontrada', 404)
    return data
  }

  async function validateLinks(values, req) {
    for (const [table, field] of [['customers', 'customer_id'], ['repair_orders', 'repair_order_id'], ['devices', 'device_id']]) {
      if (!values[field]) continue
      const { data, error } = await scopeToWorkshop(db.from(table).select('id,customer_id,workshop_id').eq('id', values[field]).is('deleted_at', null), req).maybeSingle()
      databaseError(error)
      assertSameWorkshop(data, req, 'Registro relacionado no encontrado')
    }
  }

  function summarizeQuote(values) {
    const laborCost = Number(values.labor_cost ?? 0)
    const discount = Number(values.discount ?? 0)
    const taxRate = Number(values.tax_rate ?? 0)
    const subtotal = Math.max(0, laborCost - discount)
    const taxAmount = subtotal * (taxRate / 100)
    const total = subtotal + taxAmount
    return {
      ...values,
      subtotal,
      tax_amount: taxAmount,
      total,
      balance: Math.max(0, total - Number(values.deposit ?? 0)),
    }
  }

  router.get('/', requirePermission('quotes.view'), asyncRoute(async (req, res) => {
    const { page, limit, from, to } = pageParams(req.query)
    const q = searchTerm(req.query.q)
    let query = scopeToWorkshop(db.from('quotes').select('*,customer:customers(id,first_name,last_name)', { count: 'exact' }).is('deleted_at', null), req)
    if (q) query = query.or(`quote_number.ilike.%${q}%,notes.ilike.%${q}%`)
    if (req.query.status) query = query.eq('status', req.query.status)
    if (req.query.customer_id) query = query.eq('customer_id', uuid(req.query.customer_id))
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to)
    databaseError(error)
    res.json({ data, count, page, limit })
  }))

  router.get('/:id', requirePermission('quotes.view'), asyncRoute(async (req, res) => {
    const { data, error } = await scopeToWorkshop(db.from('quotes').select('*').eq('id', uuid(req.params.id)).is('deleted_at', null), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Cotización no encontrada', 404)
    res.json({ data })
  }))

  router.post('/', writers, requirePermission('quotes.create'), asyncRoute(async (req, res) => {
    const values = validateQuotePayload(req.body)
    await validateLinks(values, req)
    const payload = summarizeQuote(values)
    const { data, error } = await db.from('quotes').insert({
      ...stampWorkshop(payload, req),
      created_by: req.profile.id,
    }).select('*').single()
    databaseError(error)
    res.status(201).json({ data })
  }))

  router.patch('/:id', writers, requirePermission('quotes.update'), asyncRoute(async (req, res) => {
    const existing = await activeQuote(uuid(req.params.id), req)
    const values = validateQuotePayload(req.body, { partial: true })
    const summary = summarizeQuote({ ...existing, ...values })
    await validateLinks(values, req)
    // Se envían solo las columnas comerciales y los campos realmente editados: así no se
    // reescribe la fila completa (quote_number, created_by, created_at) ni se pisan
    // cambios concurrentes de otros usuarios.
    const payload = {
      labor_cost: summary.labor_cost,
      discount: summary.discount,
      tax_rate: summary.tax_rate,
      subtotal: summary.subtotal,
      tax_amount: summary.tax_amount,
      total: summary.total,
      deposit: summary.deposit,
      balance: summary.balance,
    }
    for (const key of ['customer_id', 'repair_order_id', 'device_id', 'valid_until', 'notes', 'status']) {
      if (key in values) payload[key] = values[key]
    }
    let update = db.from('quotes').update(payload).eq('id', existing.id).is('deleted_at', null)
    if (req.profile.role !== 'SUPER_ADMIN') update = update.eq('workshop_id', workshopScope(req))
    const { data, error } = await update.select('*').maybeSingle()
    databaseError(error)
    if (!data) fail('Cotización no encontrada', 404)
    res.json({ data })
  }))

  router.delete('/:id', admin, requirePermission('quotes.delete'), asyncRoute(async (req, res) => {
    const id = uuid(req.params.id)
    const { data, error } = await scopeToWorkshop(db.from('quotes').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('*'), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Cotización no encontrada', 404)
    res.json({ data, message: 'Cotización eliminada' })
  }))

  return router
}

export default createQuotesRouter()
