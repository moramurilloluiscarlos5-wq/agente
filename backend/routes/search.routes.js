import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { databaseError, fail, REPAIR_SELECT, searchTerm, scopeRepairs } from '../utils/operations.js'
import { requirePermission } from '../middleware/rbac.js'
import { scopeToWorkshop } from '../utils/workshop.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)

export function createSearchRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate)

  router.get('/', requirePermission('clients.view'), asyncRoute(async (req, res) => {
    const term = searchTerm(req.query.q)
    if (!term) fail('Escribe un término para buscar')

    let repairs = scopeRepairs(
      db.from('repair_orders').select(REPAIR_SELECT).is('deleted_at', null),
      req.profile,
    )
    repairs = repairs.or(['order_number', 'brand', 'model', 'reported_problem'].map((field) => `${field}.ilike.%${term}%`).join(',')).order('received_at', { ascending: false }).limit(8)

    const customers = scopeToWorkshop(db.from('customers')
      .select('id,first_name,last_name,phone,email')
      .is('deleted_at', null)
      .or(['first_name', 'last_name', 'phone', 'email', 'whatsapp'].map((field) => `${field}.ilike.%${term}%`).join(','))
      .order('created_at', { ascending: false }).limit(8), req)

    const devices = scopeToWorkshop(db.from('devices')
      .select('id,customer_id,brand,model,imei,serial_number,customer:customers(id,first_name,last_name)')
      .is('deleted_at', null)
      .or(['brand', 'model', 'imei', 'serial_number'].map((field) => `${field}.ilike.%${term}%`).join(','))
      .order('created_at', { ascending: false }).limit(8), req)

    const quotes = scopeToWorkshop(db.from('quotes')
      .select('id,quote_number,customer_id,total,status,created_at')
      .is('deleted_at', null)
      .or(`quote_number.ilike.%${term}%,notes.ilike.%${term}%`)
      .order('created_at', { ascending: false }).limit(8), req)

    const results = await Promise.all([repairs, customers, devices, quotes])
    results.forEach(({ error }) => databaseError(error))

    res.json({
      query: term,
      data: {
        repairs: results[0].data ?? [],
        customers: results[1].data ?? [],
        devices: results[2].data ?? [],
        quotes: results[3].data ?? [],
      },
    })
  }))

  return router
}

export default createSearchRouter()
