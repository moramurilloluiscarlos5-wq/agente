import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requirePermission } from '../middleware/rbac.js'
import { databaseError, fail, pageParams, searchTerm, uuid } from '../utils/operations.js'
import { auditSafe, writeAudit } from '../services/auditService.js'
import { scopeToWorkshop } from '../utils/workshop.js'
import { requireRole } from '../middleware/roles.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)

export function createSecurityRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate)

  router.get('/roles', requireRole('SUPER_ADMIN'), requirePermission('roles.view'), asyncRoute(async (_req, res) => {
    const [{ data: roles, error: roleError }, { data: permissions, error: permissionError }, { data: links, error: linkError }] = await Promise.all([
      db.from('roles').select('*').order('name'),
      db.from('permissions').select('*').order('module').order('name'),
      db.from('role_permissions').select('role_code,permission_code'),
    ])
    databaseError(roleError); databaseError(permissionError); databaseError(linkError)
    res.json({ data: { roles: roles ?? [], permissions: permissions ?? [], rolePermissions: links ?? [] } })
  }))

  // role_permissions is a platform-wide definition. Only SUPER_ADMIN may edit it;
  // a workshop administrator can manage users and local overrides, never global RBAC.
  router.patch('/roles/:roleCode/permissions', requireRole('SUPER_ADMIN'), requirePermission('roles.update'), asyncRoute(async (req, res) => {
    const roleCode = searchTerm(req.params.roleCode)
    const permissionCodes = req.body?.permission_codes
    if (!Array.isArray(permissionCodes) || permissionCodes.some((code) => typeof code !== 'string' || code.length > 100)) fail('permission_codes no válido')
    if (roleCode === 'ADMINISTRADOR' && permissionCodes.length === 0) fail('El administrador debe conservar permisos')

    const { data: role, error: roleError } = await db.from('roles').select('code').eq('code', roleCode).maybeSingle()
    databaseError(roleError)
    if (!role) fail('Rol no encontrado', 404)
    const { data: validPermissions, error: permissionError } = await db.from('permissions').select('code').in('code', permissionCodes)
    databaseError(permissionError)
    if ((validPermissions ?? []).length !== new Set(permissionCodes).size) fail('La lista contiene permisos no válidos')

    const { error: deleteError } = await db.from('role_permissions').delete().eq('role_code', roleCode)
    databaseError(deleteError)
    if (permissionCodes.length) {
      const { error: insertError } = await db.from('role_permissions').insert(permissionCodes.map((permission_code) => ({ role_code: roleCode, permission_code })))
      databaseError(insertError)
    }
    await auditSafe(writeAudit({ db, req, action: 'ROLE_PERMISSIONS_UPDATED', entity: 'roles', entityId: roleCode, description: `Permisos del rol ${roleCode} actualizados`, newValues: { permission_codes: permissionCodes } }))
    res.json({ data: { role_code: roleCode, permission_codes: permissionCodes } })
  }))

  router.get('/audit', requirePermission('audit.view'), asyncRoute(async (req, res) => {
    const { page, limit, from, to } = pageParams(req.query)
    let query = scopeToWorkshop(db.from('audit_logs').select('*,user:profiles(id,full_name,role)', { count: 'exact' }), req)
    if (req.query.action) query = query.eq('action', searchTerm(req.query.action))
    if (req.query.entity) query = query.eq('entity', searchTerm(req.query.entity))
    if (req.query.user_id) query = query.eq('user_id', uuid(req.query.user_id, 'user_id'))
    if (req.query.q) query = query.ilike('description', `%${searchTerm(req.query.q)}%`)
    let result = await query.order('created_at', { ascending: false }).range(from, to)
    // Bases que ya tienen RBAC pero aún no aplican la migración multi-taller no
    // tienen audit_logs.workshop_id. Se mantiene el aislamiento filtrando por
    // los perfiles del taller; nunca se elimina el filtro para ocultar el error.
    if (result.error?.code === '42703' && /workshop_id/i.test(result.error.message ?? '') && req.profile.role !== 'SUPER_ADMIN') {
      const { data: workshopUsers, error: usersError } = await db.from('profiles').select('id').eq('workshop_id', req.profile.workshop_id)
      databaseError(usersError)
      const ids = (workshopUsers ?? []).map((row) => row.id)
      query = db.from('audit_logs').select('*,user:profiles(id,full_name,role)', { count: 'exact' })
      if (ids.length) query = query.in('user_id', ids)
      else query = query.eq('user_id', '00000000-0000-0000-0000-000000000000')
      if (req.query.action) query = query.eq('action', searchTerm(req.query.action))
      if (req.query.entity) query = query.eq('entity', searchTerm(req.query.entity))
      if (req.query.user_id) query = query.eq('user_id', uuid(req.query.user_id, 'user_id'))
      if (req.query.q) query = query.ilike('description', `%${searchTerm(req.query.q)}%`)
      result = await query.order('created_at', { ascending: false }).range(from, to)
    }
    const { data, count, error } = result
    databaseError(error)
    res.json({ data: data ?? [], count: count ?? 0, page, limit })
  }))

  router.get('/audit/:id', requirePermission('audit.view'), asyncRoute(async (req, res) => {
    let query = scopeToWorkshop(db.from('audit_logs').select('*,user:profiles(id,full_name,role)').eq('id', req.params.id), req)
    let result = await query.maybeSingle()
    if (result.error?.code === '42703' && /workshop_id/i.test(result.error.message ?? '') && req.profile.role !== 'SUPER_ADMIN') {
      const { data: workshopUsers, error: usersError } = await db.from('profiles').select('id').eq('workshop_id', req.profile.workshop_id)
      databaseError(usersError)
      query = db.from('audit_logs').select('*,user:profiles(id,full_name,role)').eq('id', req.params.id).in('user_id', (workshopUsers ?? []).map((row) => row.id))
      result = await query.maybeSingle()
    }
    const { data, error } = result
    databaseError(error)
    if (!data) fail('Evento de auditoría no encontrado', 404)
    res.json({ data })
  }))

  return router
}

export default createSecurityRouter()
