import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { databaseError } from '../utils/operations.js'
import { scopeToWorkshop } from '../utils/workshop.js'

const router = Router()
router.use(requireSupabase, requireAuth, loadProfile)
router.get('/', requirePermission('dashboard.view'), async (req, res, next) => {
  try {
    let query = scopeToWorkshop(supabaseAdmin.from('notifications').select('*').order('created_at', { ascending: false }).limit(20), req)
    if (req.profile.role !== 'SUPER_ADMIN') query = query.or(`user_id.is.null,user_id.eq.${req.profile.id}`)
    const { data, error } = await query
    databaseError(error)
    res.json({ data: data ?? [] })
  } catch (error) { next(error) }
})

export default router
