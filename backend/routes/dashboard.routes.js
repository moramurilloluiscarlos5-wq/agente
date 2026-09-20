import { Router } from 'express'
import { requireSupabase, supabaseAdmin } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { scopeToWorkshop } from '../utils/workshop.js'

const router = Router()
router.use(requireSupabase, requireAuth, loadProfile)

// Contadores sobre todos los registros, sin truncar a la primera página.
router.get('/', requirePermission('dashboard.view'), async (req, res, next) => {
  try {
    const repairs = (selection, options) => {
      let query = scopeToWorkshop(supabaseAdmin.from('repair_orders').select(selection, options).is('deleted_at', null), req)
      if (req.profile.role === 'TECNICO') query = query.eq('technician_id', req.authUserId)
      return query
    }
    const countStatus = (status) => repairs('id', { count: 'exact', head: true }).eq('status', status)
    const selection = 'id,order_number,status,brand,model,received_at,estimated_delivery_at,customer:customers(first_name,last_name),device:devices(brand,model)'
    const results = await Promise.all([
      repairs('id', { count: 'exact', head: true }).not('status', 'in', '(entregado,cancelado)'),
      countStatus('diagnostico'), countStatus('en_reparacion'), countStatus('esperando_refaccion'),
      countStatus('listo_para_entregar'), countStatus('entregado'),
      repairs(selection).order('received_at', { ascending: false }).limit(8),
      repairs(selection).not('status', 'in', '(entregado,cancelado)').not('estimated_delivery_at', 'is', null)
        .order('estimated_delivery_at', { ascending: true }).limit(6),
      scopeToWorkshop(supabaseAdmin.from('customers').select('id,first_name,last_name,phone,created_at')
        .is('deleted_at', null), req).order('created_at', { ascending: false }).limit(5),
    ])
    const failed = results.find((result) => result.error)
    if (failed) throw failed.error
    const rowToCard = (row) => ({
      orderNumber: row.order_number,
      customer: [row.customer?.first_name, row.customer?.last_name].filter(Boolean).join(' '),
      device: [row.brand || row.device?.brand, row.model || row.device?.model].filter(Boolean).join(' '),
      status: row.status, receivedAt: row.received_at, estDelivery: row.estimated_delivery_at,
    })
    res.json({ data: {
      stats: { pending: results[0].count, diagnostics: results[1].count, inRepair: results[2].count,
        waitingParts: results[3].count, ready: results[4].count, delivered: results[5].count },
      recentRepairs: results[6].data.map(rowToCard),
      upcomingDeliveries: results[7].data.map(rowToCard),
      recentCustomers: results[8].data.map((row) => ({
        id: row.id, name: `${row.first_name} ${row.last_name}`, phone: row.phone, createdAt: row.created_at,
      })),
    } })
  } catch (error) { next(error) }
})

export default router
