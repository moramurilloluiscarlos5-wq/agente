import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { assertRepairAccess, databaseError, DEVICE_SELECT, fail, orderNumber, pageParams, REPAIR_SELECT, REPAIR_STATUSES, scopeRepairs, searchTerm, STAFF_ROLES, uuid, validateHistory, validatePayload } from '../utils/operations.js'
import { enqueueRepairStatusNotification } from '../services/whatsappService.js'
import { requirePermission } from '../middleware/rbac.js'
import { assertSameWorkshop, requireActiveWorkshop, scopeToWorkshop, stampWorkshop, workshopScope } from '../utils/workshop.js'
import { auditSafe, writeAudit } from '../services/auditService.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
const writers = requireRole('ADMINISTRADOR', 'RECEPCION')
const admin = requireRole('ADMINISTRADOR')

export function createOperationsRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate, requireActiveWorkshop, requireRole(...STAFF_ROLES))

  async function activeRecord(table, id, req) {
    let query = db.from(table).select('*').eq('id', id).is('deleted_at', null)
    if (req.profile.role !== 'SUPER_ADMIN') query = query.eq('workshop_id', workshopScope(req))
    const { data, error } = await query.maybeSingle()
    databaseError(error)
    assertSameWorkshop(data, req, table === 'customers' ? 'Cliente no encontrado' : 'Dispositivo no encontrado')
    return data
  }

  async function repairRecord(number, profile) {
    const query = db.from('repair_orders').select(REPAIR_SELECT).eq('order_number', orderNumber(number)).is('deleted_at', null)
    const { data, error } = await scopeRepairs(query, profile).maybeSingle()
    databaseError(error)
    return assertRepairAccess(data, profile)
  }

  async function relatedRepairs(field, id, profile) {
    const { data, error } = await scopeRepairs(db.from('repair_orders').select(REPAIR_SELECT).eq(field, id).is('deleted_at', null), profile).order('received_at', { ascending: false })
    databaseError(error)
    return data
  }

  async function validateLinks(data, existing = {}, req) {
    const customerId = data.customer_id ?? existing.customer_id
    const deviceId = data.device_id ?? existing.device_id
    if (customerId) await activeRecord('customers', customerId, req)
    if (deviceId) {
      const device = await activeRecord('devices', deviceId, req)
      if (device.customer_id !== customerId) fail('El dispositivo no pertenece al cliente seleccionado')
    }
    if (data.technician_id) {
      const { data: assignee, error } = await db.from('profiles').select('id,role,is_active').eq('id', data.technician_id).eq('workshop_id', workshopScope(req)).maybeSingle()
      databaseError(error)
      if (!assignee?.is_active || !['OWNER', 'ADMINISTRADOR', 'TECNICO'].includes(assignee.role)) fail('Selecciona un técnico activo')
    }
  }

  router.get('/customers', requirePermission('clients.view'), asyncRoute(async (req, res) => {
    const { page, limit, from, to } = pageParams(req.query)
    const q = searchTerm(req.query.q)
    let query = scopeToWorkshop(db.from('customers').select('*', { count: 'exact' }).is('deleted_at', null), req)
    if (q) query = query.or(['first_name', 'last_name', 'phone', 'email', 'whatsapp'].map((field) => `${field}.ilike.%${q}%`).join(','))
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to)
    databaseError(error)
    res.json({ data, count, page, limit })
  }))

  router.get('/customers/:id', requirePermission('clients.view'), asyncRoute(async (req, res) => {
    const id = uuid(req.params.id)
    const data = await activeRecord('customers', id, req)
    const [devicesResult, repairs] = await Promise.all([
      scopeToWorkshop(db.from('devices').select(DEVICE_SELECT).eq('customer_id', id).is('deleted_at', null), req).order('created_at', { ascending: false }),
      relatedRepairs('customer_id', id, req.profile),
    ])
    databaseError(devicesResult.error)
    res.json({ data, devices: devicesResult.data, repairs })
  }))

  router.post('/customers', writers, requirePermission('clients.create'), asyncRoute(async (req, res) => {
    const values = validatePayload('customer', req.body)
    const { data, error } = await db.from('customers').insert(stampWorkshop({ ...values, created_by: req.profile.id }, req)).select('*').single()
    databaseError(error)
    void auditSafe(writeAudit({ db, req, action: 'CLIENT_CREATED', entity: 'customers', entityId: data.id, description: 'Cliente creado', newValues: data }))
    res.status(201).json({ data })
  }))

  router.patch('/customers/:id', writers, requirePermission('clients.update'), asyncRoute(async (req, res) => {
    const values = validatePayload('customer', req.body, { partial: true })
    let update = db.from('customers').update(values).eq('id', uuid(req.params.id)).is('deleted_at', null)
    if (req.profile.role !== 'SUPER_ADMIN') update = update.eq('workshop_id', workshopScope(req))
    const { data, error } = await update.select('*').maybeSingle()
    databaseError(error)
    assertSameWorkshop(data, req, 'Cliente no encontrado')
    void auditSafe(writeAudit({ db, req, action: 'CLIENT_UPDATED', entity: 'customers', entityId: data.id, description: 'Cliente actualizado', newValues: values }))
    res.json({ data })
  }))

  router.get('/devices', requirePermission('devices.view'), asyncRoute(async (req, res) => {
    const { page, limit, from, to } = pageParams(req.query)
    const q = searchTerm(req.query.q)
    let query = scopeToWorkshop(db.from('devices').select(DEVICE_SELECT, { count: 'exact' }).is('deleted_at', null), req)
    if (req.query.customer_id) query = query.eq('customer_id', uuid(req.query.customer_id))
    if (q) query = query.or(['brand', 'model', 'imei', 'serial_number'].map((field) => `${field}.ilike.%${q}%`).join(','))
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to)
    databaseError(error)
    res.json({ data, count, page, limit })
  }))

  router.get('/devices/:id', requirePermission('devices.view'), asyncRoute(async (req, res) => {
    const id = uuid(req.params.id)
    const { data, error } = await scopeToWorkshop(db.from('devices').select(DEVICE_SELECT).eq('id', id).is('deleted_at', null), req).maybeSingle()
    databaseError(error)
    assertSameWorkshop(data, req, 'Dispositivo no encontrado')
    const repairs = await relatedRepairs('device_id', id, req.profile)
    res.json({ data, repairs })
  }))

  router.post('/devices', writers, requirePermission('devices.create'), asyncRoute(async (req, res) => {
    const values = validatePayload('device', req.body)
    await activeRecord('customers', values.customer_id, req)
    const { data, error } = await db.from('devices').insert(stampWorkshop(values, req)).select(DEVICE_SELECT).single()
    databaseError(error)
    void auditSafe(writeAudit({ db, req, action: 'DEVICE_CREATED', entity: 'devices', entityId: data.id, description: 'Dispositivo creado', newValues: data }))
    res.status(201).json({ data })
  }))

  router.patch('/devices/:id', writers, requirePermission('devices.update'), asyncRoute(async (req, res) => {
    const id = uuid(req.params.id)
    const values = validatePayload('device', req.body, { partial: true })
    const existing = await activeRecord('devices', id, req)
    if (values.customer_id) {
      await activeRecord('customers', values.customer_id, req)
      if (values.customer_id !== existing.customer_id) {
        const { count, error } = await db.from('repair_orders').select('id', { count: 'exact', head: true }).eq('device_id', id).eq('workshop_id', workshopScope(req))
        databaseError(error)
        if (count) fail('No se puede cambiar el cliente de un dispositivo con órdenes de reparación', 409)
      }
    }
    let update = db.from('devices').update(values).eq('id', id).is('deleted_at', null)
    if (req.profile.role !== 'SUPER_ADMIN') update = update.eq('workshop_id', workshopScope(req))
    const { data, error } = await update.select(DEVICE_SELECT).maybeSingle()
    databaseError(error)
    assertSameWorkshop(data, req, 'Dispositivo no encontrado')
    res.json({ data })
  }))

  for (const [path, entity] of [['customers', 'customer'], ['devices', 'device']]) {
    router.delete(`/${path}/:id`, admin, requirePermission(`${entity === 'customer' ? 'clients' : 'devices'}.delete`), asyncRoute(async (req, res) => {
      const { data, error } = await db.rpc('archive_workshop_record', { p_entity: entity, p_id: uuid(req.params.id), p_actor: req.profile.id })
      databaseError(error)
      res.json({ data, message: entity === 'customer' ? 'Cliente archivado' : 'Dispositivo archivado' })
    }))
  }

  router.get('/technicians', asyncRoute(async (req, res) => {
    const { data, error } = await scopeToWorkshop(db.from('profiles').select('id,full_name').eq('is_active', true).in('role', ['OWNER', 'ADMINISTRADOR', 'TECNICO']), req).order('full_name')
    databaseError(error)
    res.json({ data })
  }))

  router.get('/repairs', requirePermission('repairs.view'), asyncRoute(async (req, res) => {
    const { page, limit, from, to } = pageParams(req.query)
    const q = searchTerm(req.query.q)
    let query = scopeRepairs(db.from('repair_orders').select(REPAIR_SELECT, { count: 'exact' }).is('deleted_at', null), req.profile)
    for (const field of ['customer_id', 'device_id']) if (req.query[field]) query = query.eq(field, uuid(req.query[field]))
    if (req.query.status) {
      if (!REPAIR_STATUSES.includes(req.query.status)) fail('Estado de reparación no válido')
      query = query.eq('status', req.query.status)
    }
    if (q) query = query.or(['order_number', 'brand', 'model', 'reported_problem'].map((field) => `${field}.ilike.%${q}%`).join(','))
    const { data, count, error } = await query.order('received_at', { ascending: false }).range(from, to)
    databaseError(error)
    res.json({ data, count, page, limit })
  }))

  router.get('/repairs/:orderNumber', requirePermission('repairs.view'), asyncRoute(async (req, res) => {
    const data = await repairRecord(req.params.orderNumber, req.profile)
    const { data: history, error } = await db.from('repair_status_history').select('id,status,note,created_at,user:profiles!repair_status_history_user_id_fkey(full_name)').eq('repair_order_id', data.id).order('created_at', { ascending: true })
    databaseError(error)
    res.json({ data, history })
  }))

  router.post('/repairs', writers, requirePermission('repairs.create'), asyncRoute(async (req, res) => {
    const values = validatePayload('repair', req.body)
    await validateLinks(values, {}, req)
    const { data: created, error } = await db.rpc('create_repair_order', { p_data: values, p_actor: req.profile.id })
    databaseError(error)
    const data = await repairRecord(created.order_number, req.profile)
    void auditSafe(writeAudit({ db, req, action: 'REPAIR_CREATED', entity: 'repair_orders', entityId: data.id, description: `Orden ${data.order_number} creada`, newValues: data }))
    res.status(201).json({ data })
  }))

  router.patch('/repairs/:orderNumber', requirePermission('repairs.update'), asyncRoute(async (req, res) => {
    const values = validatePayload('repair', req.body, { partial: true, role: req.profile.role })
    const existing = await repairRecord(req.params.orderNumber, req.profile)
    await validateLinks(values, existing, req)
    const { error } = await db.rpc('update_repair_order', { p_order_number: existing.order_number, p_data: values, p_actor: req.profile.id })
    databaseError(error)
    const data = await repairRecord(existing.order_number, req.profile)
    res.json({ data })
  }))

  router.post('/repairs/:orderNumber/history', requirePermission('repairs.change_status'), asyncRoute(async (req, res) => {
    const values = validateHistory(req.body)
    const existing = await repairRecord(req.params.orderNumber, req.profile)
    const { error } = await db.rpc('append_repair_history', { p_order_number: existing.order_number, p_status: values.status, p_note: values.note, p_actor: req.profile.id })
    databaseError(error)
    const data = await repairRecord(existing.order_number, req.profile)
    void auditSafe(writeAudit({ db, req, action: 'REPAIR_STATUS_CHANGED', entity: 'repair_orders', entityId: data.id, description: `Estado de ${data.order_number} cambiado`, oldValues: { status: existing.status }, newValues: { status: data.status, note: values.note } }))
    void enqueueRepairStatusNotification({ db, repair: data, actorId: req.profile.id }).catch(() => {})
    res.status(201).json({ data })
  }))

  return router
}

export default createOperationsRouter()
