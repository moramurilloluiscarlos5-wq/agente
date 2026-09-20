import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { databaseError, fail, uuid, validateAIDiagnosticPayload } from '../utils/operations.js'
import { requirePermission } from '../middleware/rbac.js'
import { rateLimit } from '../middleware/security.js'
import { scopeRepairs } from '../utils/operations.js'
import { scopeToWorkshop, stampWorkshop } from '../utils/workshop.js'
import { AIService } from '../services/aiService.js'
import { createAIProvider } from '../services/aiProvider.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
const allowedRoles = requireRole('ADMINISTRADOR', 'TECNICO')
let providerError = null
let provider = null
try { provider = createAIProvider() } catch (error) { providerError = error }
const aiService = new AIService({ provider })

export function createAIRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate, allowedRoles)

  router.get('/status', (_req, res) => {
    res.json({ data: providerError ? { configured: false, provider: null } : aiService.getStatus() })
  })

  router.post('/diagnose', rateLimit({ max: 20, message: 'Demasiados diagnósticos. Espera un momento.', keyFn: (req) => `${req.profile?.workshop_id || 'platform'}:${req.profile?.id || req.ip}:ai` }), requirePermission('diagnostics.ai'), asyncRoute(async (req, res) => {
    if (providerError) throw providerError
    if (!req.profile.workshop_id) fail('El diagnóstico debe pertenecer a un taller activo.', 403)
    const payload = validateAIDiagnosticPayload(req.body)
    const repairOrderId = payload.repair_order_id ?? null
    let repairOrder = null

    if (repairOrderId) {
      const { data, error } = await scopeRepairs(db.from('repair_orders').select('id,device_id,technician_id,workshop_id').eq('id', repairOrderId).is('deleted_at', null), req.profile).maybeSingle()
      databaseError(error)
      if (!data) fail('Orden de reparación no encontrada', 404)
      if (req.profile.role === 'TECNICO' && data.technician_id !== req.profile.id) fail('Orden de reparación no encontrada', 404)
      if (payload.device_id && payload.device_id !== data.device_id) fail('El dispositivo no coincide con la orden de reparación')
      repairOrder = data
    }

    if (!repairOrderId && payload.device_id) {
      const { data: device, error } = await scopeToWorkshop(db.from('devices').select('id,workshop_id').eq('id', payload.device_id).is('deleted_at', null), req).maybeSingle()
      databaseError(error)
      if (!device) fail('Dispositivo no encontrado', 404)
    }

    const input = { device_brand: payload.device_brand, device_model: payload.device_model, issue: payload.issue, observations: payload.observations || null, symptoms: payload.symptoms || null }
    const generated = await aiService.generateDiagnostic(input)
    const response = generated.result

    const { data: diagnosis, error } = await db.from('diagnostics').insert(stampWorkshop({
      repair_order_id: repairOrderId,
      device_id: repairOrder?.device_id ?? payload.device_id ?? null,
      input_data: input,
      ai_response: response,
      provider: generated.provider,
      model: generated.model,
      tokens_used: generated.usage?.total_tokens ?? null,
      created_by: req.profile.id,
    }, req)).select('*').single()

    databaseError(error)

    res.status(201).json({ data: diagnosis, result: response })
  }))

  router.get('/history', requirePermission('diagnostics.view'), asyncRoute(async (req, res) => {
    let query = scopeToWorkshop(db.from('diagnostics').select('*').order('created_at', { ascending: false }).limit(100), req)
    if (req.query.repair_order_id) query = query.eq('repair_order_id', uuid(req.query.repair_order_id, 'repair_order_id'))
    if (req.profile.role === 'TECNICO') {
      let repairsQuery = db.from('repair_orders').select('id').eq('technician_id', req.profile.id).is('deleted_at', null)
      if (req.profile.workshop_id) repairsQuery = repairsQuery.eq('workshop_id', req.profile.workshop_id)
      const { data: repairs, error: repairError } = await repairsQuery
      databaseError(repairError)
      query = repairs?.length ? query.in('repair_order_id', repairs.map((row) => row.id)) : query.eq('created_by', req.profile.id).eq('repair_order_id', '00000000-0000-0000-0000-000000000000')
    }
    const { data, error } = await query
    databaseError(error)
    res.json({ data })
  }))

  return router
}

export default createAIRouter()
