import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requireLicense } from '../middleware/license.js'
import { requirePermission } from '../middleware/rbac.js'
import { databaseError } from '../utils/operations.js'
import { scopeToWorkshop } from '../utils/workshop.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const PAGE_SIZE = 1000
const MAX_ROWS = 200_000

// Supabase/PostgREST devuelve como máximo 1000 filas por consulta. Los reportes
// leen todas las páginas para que los totales no se trunquen sin aviso.
export async function fetchAllRows(buildQuery) {
  const rows = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
  const error = Object.assign(new Error('El reporte supera el máximo de filas permitido.'), { status: 413, publicMessage: 'El reporte supera el máximo de filas permitido. Filtra por fechas.' })
  throw error
}

export function createReportsRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile, requireLicense] } = {}) {
  const router = Router()
  router.use(...authenticate)
  router.get('/', requirePermission('reports.view'), asyncRoute(async (req, res) => {
    const [repairsResult, paymentsResult, inventoryResult] = await Promise.all([
      fetchAllRows(() => scopeToWorkshop(db.from('repair_orders').select('id,status,brand,model,estimated_cost,received_at').is('deleted_at', null), req)),
      fetchAllRows(() => scopeToWorkshop(db.from('payments').select('id,amount,payment_date,status').is('deleted_at', null), req)),
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
      // payments = cobrado (sin pendientes), igual que la gráfica de ingresos.
      totals: {
        repairs: repairs.length,
        payments: payments.filter((row) => row.status !== 'pendiente').reduce((sum, row) => sum + Number(row.amount || 0), 0),
        pending: payments.filter((row) => row.status === 'pendiente').reduce((sum, row) => sum + Number(row.amount || 0), 0),
      },
      byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      byBrand: Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([brand, count]) => ({ brand, count })),
      revenueByMonth: Object.entries(revenueByMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, amount]) => ({ month, amount })),
      lowStock: inventoryResult.data ?? [],
    } })
  }))
  return router
}

export default createReportsRouter()
