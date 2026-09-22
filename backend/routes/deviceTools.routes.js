import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { requireRole } from '../middleware/roles.js'
import { rateLimit } from '../middleware/security.js'
import { databaseError, fail, uuid } from '../utils/operations.js'
import { scopeToWorkshop } from '../utils/workshop.js'
import { auditSafe, writeAudit } from '../services/auditService.js'
import { createDeviceAgentToken, deriveDeviceAgentSecret } from '../services/deviceAgentToken.js'
import { getDeviceAgentRelease } from '../services/deviceAgentRelease.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const DEVICE_ROLES = requireRole('ADMINISTRADOR', 'TECNICO')
const MAX_OUTPUT = 120_000
const pairingAttemptLimit = rateLimit({ windowMs: 60_000, max: 8, keyFn: (req) => `device-agent-pair:${req.profile?.id || req.ip}` })
const sessionIssueLimit = rateLimit({ windowMs: 60_000, max: 20, keyFn: (req) => `device-agent-session:${req.profile?.id || req.ip}` })

function text(value, max, label) {
  if (value == null) return null
  if (typeof value !== 'string' || value.length > max) fail(`${label} no válido`)
  return value
}

function commandName(value) {
  const result = text(value, 120, 'Comando')
  if (!result || !/^[a-z0-9._:/ -]+$/i.test(result)) fail('Comando no válido')
  return result
}

export function createDeviceToolsRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile], getRelease = getDeviceAgentRelease } = {}) {
  const router = Router()
  router.use(...authenticate, DEVICE_ROLES, requirePermission('devices.view'))
  router.use((req, _res, next) => {
    if (!req.profile?.workshop_id || req.profile.workspace_access !== 'ACTIVE') return next(Object.assign(new Error('El taller debe estar activo para usar Device Tools.'), { status: 403, publicMessage: 'El taller debe estar activo para usar Device Tools.' }))
    next()
  })

  // Pairing returns only a per-agent key derived from the backend master secret.
  // The master secret is never returned to the browser or local agent.
  router.post('/pairing/exchange', pairingAttemptLimit, asyncRoute(async (req, res) => {
    const agentId = text(req.body?.agent_id, 160, 'Agente')
    const pairingCode = text(req.body?.pairing_code, 32, 'Código de pairing')
    if (!agentId || !pairingCode) fail('Faltan datos de pairing')
    if (!/^\d{6}$/.test(pairingCode)) fail('El código de pairing debe tener seis dígitos')
    const secret = deriveDeviceAgentSecret({ workshopId: req.profile.workshop_id, agentId, pairingCode })
    await auditSafe(writeAudit({ db, req, action: 'DEVICE_AGENT_PAIRED', entity: 'device_agent', entityId: agentId, description: `Agente local vinculado al taller (${agentId})` }))
    res.json({ data: { secret, workshop_id: req.profile.workshop_id, agent_id: agentId } })
  }))

  router.get('/release', asyncRoute(async (_req, res) => {
    const release = await getRelease()
    res.setHeader('Cache-Control', 'no-store')
    res.json({ data: { ...release, download_url: release.downloadUrl, release_page: release.releaseUrl } })
  }))

  router.post('/session', sessionIssueLimit, asyncRoute(async (req, res) => {
    const agentId = text(req.body?.agent_id, 160, 'Agente')
    const pairingCode = text(req.body?.pairing_code, 32, 'CÃ³digo de pairing')
    if (!agentId || !pairingCode) fail('Falta la identidad vinculada del agente')
    res.setHeader('Cache-Control', 'no-store')
    res.json({ data: createDeviceAgentToken({ workshopId: req.profile.workshop_id, userId: req.profile.id, agentId, pairingCode }) })
  }))

  // The browser reports the result after the local agent executes a command.
  // It is stored in the workshop and additionally appears in the existing audit UI.
  router.post('/audit', asyncRoute(async (req, res) => {
    const body = req.body ?? {}
    const serial = text(body.serial, 160, 'Serial')
    const mode = body.mode === 'fastboot' ? 'fastboot' : 'adb'
    const command = commandName(body.command)
    const status = ['ok', 'error', 'timeout'].includes(body.status) ? body.status : fail('Estado de comando no válido')
    const stdout = text(body.stdout, MAX_OUTPUT, 'Salida')
    const stderr = text(body.stderr, MAX_OUTPUT, 'Error')
    const durationMs = body.duration_ms == null ? null : Number(body.duration_ms)
    if (durationMs != null && (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 600_000)) fail('Duración no válida')
    const values = { workshop_id: req.profile.workshop_id, user_id: req.profile.id, agent_id: text(body.agent_id, 160, 'Agente'), serial, mode, command, status, stdout, stderr, duration_ms: durationMs }
    const { data, error } = await db.from('device_tool_events').insert(values).select('id,created_at').single()
    databaseError(error)
    await auditSafe(writeAudit({ db, req, action: 'DEVICE_TOOL_COMMAND', entity: 'device', entityId: serial, description: `${mode.toUpperCase()} ${command} (${status})`, newValues: { mode, serial, status, duration_ms: durationMs } }))
    res.status(201).json({ data })
  }))

  router.post('/snapshots', asyncRoute(async (req, res) => {
    const body = req.body ?? {}
    const snapshot = body.snapshot
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) fail('Snapshot no válido')
    if (JSON.stringify(snapshot).length > 250_000) fail('El snapshot supera el tamaño permitido')
    const repairOrderId = body.repair_order_id ? uuid(body.repair_order_id, 'repair_order_id') : null
    const customerId = body.customer_id ? uuid(body.customer_id, 'customer_id') : null
    if (customerId) {
      const { data: customer, error } = await scopeToWorkshop(db.from('customers').select('id').eq('id', customerId).is('deleted_at', null), req).maybeSingle()
      databaseError(error)
      if (!customer) fail('Cliente no encontrado', 404)
    }
    if (repairOrderId) {
      const { data: order, error } = await scopeToWorkshop(db.from('repair_orders').select('id,technician_id').eq('id', repairOrderId).is('deleted_at', null), req).maybeSingle()
      databaseError(error)
      if (!order) fail('Orden de reparación no encontrada', 404)
      if (req.profile.role === 'TECNICO' && order.technician_id !== req.profile.id) fail('La orden no está asignada a este técnico', 403)
    }
    const values = {
      workshop_id: req.profile.workshop_id, user_id: req.profile.id, repair_order_id: repairOrderId,
      customer_id: customerId,
      serial: text(body.serial, 160, 'Serial'), model: text(body.model, 200, 'Modelo'),
      stage: text(body.stage || 'diagnostico', 60, 'Etapa'), notes: text(body.notes, 5000, 'Notas'), snapshot,
    }
    const { data, error } = await db.from('device_diagnostic_snapshots').insert(values).select('*').single()
    databaseError(error)
    await auditSafe(writeAudit({ db, req, action: 'DEVICE_DIAGNOSTIC_SAVED', entity: 'device_diagnostic_snapshots', entityId: data.id, description: `Snapshot Device Tools guardado${values.serial ? ` (${values.serial})` : ''}` }))
    res.status(201).json({ data })
  }))

  router.get('/snapshots', asyncRoute(async (req, res) => {
    let query = scopeToWorkshop(db.from('device_diagnostic_snapshots').select('*').order('created_at', { ascending: false }).limit(100), req)
    if (req.query.repair_order_id) query = query.eq('repair_order_id', uuid(req.query.repair_order_id, 'repair_order_id'))
    const { data, error } = await query
    databaseError(error)
    res.json({ data: data ?? [] })
  }))

  return router
}

export default createDeviceToolsRouter()
