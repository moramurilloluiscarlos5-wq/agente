import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { databaseError } from '../utils/operations.js'
import { scopeToWorkshop } from '../utils/workshop.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

export function createReportsRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate)
  router.get('/', requirePermission('reports.view'), asyncRoute(async (req, res) => {
    const [repairsResult, paymentsResult, inventoryResult] = await Promise.all([
      scopeToWorkshop(db.from('repair_orders').select('status,brand,model,estimated_cost,received_at').is('deleted_at', null), req),
      scopeToWorkshop(db.from('payments').select('amount,payment_date,status').is('deleted_at', null), req),
      scopeToWorkshop(db.from('inventory').select('id,name,quantity,min_stock').is('deleted_at', null).eq('is_low_stock', true), req),
    ])
    for (const result of [repairsResult, paymentsResult, inventoryResult]) databaseError(result.error)
    const repairs = repairsResult.data ?? []
    const payments = paymentsResult.data ?? []
    const byStatus = {}
    const byBrand = {}
    for (const repair of repairs) {
      byStatus[repair.status] = (byStatus[repair.status] || 0) + 1
      const brand = repair.brand || 'Sin marca'
      byBrand[brand] = (byBrand[brand] || 0) + 1
    }
    const revenueByMonth = {}
    for (const payment of payments) {
      if (payment.status === 'pendiente') continue
      const month = String(payment.payment_date || '').slice(0, 7) || 'Sin fecha'
      revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(payment.amount || 0)
    }
    res.json({ data: {
      totals: { repairs: repairs.length, payments: payments.reduce((sum, row) => sum + Number(row.amount || 0), 0) },
      byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      byBrand: Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([brand, count]) => ({ brand, count })),
      revenueByMonth: Object.entries(revenueByMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, amount]) => ({ month, amount })),
      lowStock: inventoryResult.data ?? [],
    } })
  }))
  return router
}

export default createReportsRouter()
