import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile, loadProfileForSession } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { requirePermission } from '../middleware/rbac.js'
import { rateLimit } from '../middleware/security.js'
import { auditSafe, writeAudit } from '../services/auditService.js'
import { shouldRecordLogin } from '../utils/loginAudit.js'
import { randomSlugSuffix, slugifyWorkshop } from '../utils/workshop.js'
import { databaseError } from '../utils/operations.js'

export function createAuthRouter({ db = supabaseAdmin, authenticate = requireAuth, profileLoader = loadProfile, sessionLoader = loadProfileForSession, configured = requireSupabase } = {}) {
const router = Router()
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

router.use(configured)

const WORKSHOP_EMPLOYEE_ROLES = ['ADMINISTRADOR', 'TECNICO', 'RECEPCION', 'CAJERO']

// `last_login_at` pertenece a la migraciÃ³n 006. Se carga aparte para que una
// base que aÃºn no la tenga siga pudiendo abrir Personal sin convertirlo en 500.
async function withOptionalLastLogin(rows) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : []
  if (!list.length) return rows
  const { data, error } = await db.from('profiles').select('id,last_login_at').in('id', list.map((row) => row.id))
  if (error || !data) return rows
  const byId = new Map(data.map((row) => [row.id, row.last_login_at]))
  const merged = list.map((row) => ({ ...row, last_login_at: byId.get(row.id) ?? null }))
  return Array.isArray(rows) ? merged : merged[0]
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

async function ensureAdministratorSurvivesChange(userId, nextRole, nextActive, workshopId = null) {
  const { data: target, error: targetError } = await db.from('profiles').select('role,is_active,workshop_id').eq('id', userId).maybeSingle()
  if (targetError) throw targetError
  // OWNER y ADMINISTRADOR cuentan como administración del taller.
  const isAdmin = (role) => role === 'ADMINISTRADOR' || role === 'OWNER'
  const removesAdministratorAccess = (nextRole != null && !isAdmin(nextRole)) || nextActive === false
  if (!target || !isAdmin(target.role) || !removesAdministratorAccess) return
  // El conteo se limita al MISMO taller: el último admin de otro taller no bloquea aquí.
  let query = db.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['ADMINISTRADOR', 'OWNER']).eq('is_active', true)
  const scope = workshopId ?? target.workshop_id
  if (scope) query = query.eq('workshop_id', scope)
  const { count, error } = await query
  if (error) throw error
  if ((count ?? 0) <= 1) {
    const error = new Error('No puedes quitar el rol o suspender al último administrador activo')
    error.status = 409
    error.publicMessage = error.message
    throw error
  }
}

// GET /api/auth/me → perfil del usuario autenticado
router.get('/me', authenticate, sessionLoader, asyncHandler(async (req, res) => {
  // /auth/me valida la sesión en cada carga de la aplicación: solo se marca el inicio
  // de sesión cuando expira la ventana de auditoría, para no inundar audit_logs ni
  // falsear la columna "Último acceso" del personal.
  if (shouldRecordLogin(req.profile)) {
    await db.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', req.profile.id)
    if (req.profile.workshop_id) void auditSafe(writeAudit({ db: db, req, action: 'LOGIN_SUCCESS', entity: 'profiles', entityId: req.profile.id, description: 'Inicio de sesión validado' }))
  }
  res.json({ id: req.profile.id, role: req.profile.role, profile: req.profile, workshop: req.profile.workshop ?? null, workspace_access: req.profile.workspace_access })
}))

async function provisionWorkshop({ userId, ownerName, businessName, workshopPhone = null, workshopCity = null }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = slugifyWorkshop(businessName, attempt === 0 ? '' : randomSlugSuffix())
    const { data, error } = await db.rpc('provision_workshop', {
      p_owner_user_id: userId,
      p_owner_name: ownerName,
      p_name: businessName,
      p_slug: slug,
      p_phone: workshopPhone,
      p_address: workshopCity,
    })
    if (!error) return data
    if (error.code === '23505' && /workshops_slug_key/.test(error.message) && attempt < 2) continue
    if (error.code === '23505') throw Object.assign(new Error('Tu cuenta ya pertenece a un taller.'), { status: 409 })
    databaseError(error)
  }
  throw Object.assign(new Error('No se pudo crear el taller. Intenta de nuevo.'), { status: 500 })
}

// POST /api/auth/register-workshop - registro público de una cuenta y su taller.
router.post('/register-workshop', rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Demasiados registros. Intenta de nuevo en unos minutos.' }), asyncHandler(async (req, res) => {
  const { full_name, email, password, workshop_name, workshop_phone = null, workshop_city = null } = req.body ?? {}

  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150) return res.status(400).json({ message: 'Ingresa tu nombre completo' })
  if (!isValidEmail(email)) return res.status(400).json({ message: 'Correo electrónico no válido' })
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ message: 'La contraseña debe tener entre 8 y 128 caracteres' })
  if (typeof workshop_name !== 'string' || !workshop_name.trim() || workshop_name.trim().length > 120) return res.status(400).json({ message: 'Ingresa el nombre de tu taller' })

  const normalizedEmail = email.trim().toLowerCase()
  if ((workshop_phone != null && (typeof workshop_phone !== 'string' || workshop_phone.length > 40)) || (workshop_city != null && (typeof workshop_city !== 'string' || workshop_city.length > 200))) return res.status(400).json({ message: 'Teléfono o ciudad no válidos' })
  if (req.body.confirm_password !== undefined && req.body.confirm_password !== password) return res.status(400).json({ message: 'Las contraseñas no coinciden.' })
  const ownerName = full_name.trim()
  const businessName = workshop_name.trim()
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: ownerName },
    // El trigger existente crea Auth + perfil + taller + configuración juntos.
    // El navegador no puede escribir estos app_metadata.
    app_metadata: { workshop_registration: {
      name: businessName, slug: slugifyWorkshop(businessName, randomUUID()),
      phone: workshop_phone, address: workshop_city,
    } },
  })
  if (authError) {
    const duplicate = /already been registered|already exists|duplicate/i.test(authError.message ?? '')
    return res.status(duplicate ? 409 : 400).json({ message: duplicate ? 'Ya existe una cuenta con este correo. Inicia sesión para continuar.' : 'No se pudo registrar el taller. Revisa los datos e intenta de nuevo.' })
  }

  try {
    const { data: profile, error } = await db.from('profiles')
      .select('id,role,full_name,workshop_id,workshop:workshops!profiles_workshop_id_fkey(id,name,status)')
      .eq('id', authData.user.id).single()
    if (error || !profile?.workshop) return res.status(503).json({ code: 'REGISTRATION_COMMITTED', message: 'Tu cuenta se creó. Inicia sesión para continuar.' })
    const result = { profile, workshop: profile.workshop }
    await auditSafe(writeAudit({ db: db, req, userId: result.profile.id, workshopId: result.workshop.id, action: 'WORKSHOP_REGISTERED', entity: 'workshops', entityId: result.workshop.id, description: 'Taller ' + businessName + ' registrado', newValues: { workshop_id: result.workshop.id } }))
    res.status(201).json({ data: result })
  } catch (error) {
    res.status(error.status ?? 500).json({ message: error.publicMessage ?? error.message ?? 'No se pudo crear el taller.' })
  }
}))

// POST /api/auth/create-workshop - asigna un taller a un usuario autenticado sin taller.
router.post('/create-workshop', authenticate, sessionLoader, asyncHandler(async (req, res) => {
  const { workshop_name, workshop_phone = null, workshop_city = null } = req.body ?? {}
  if (req.profile.role === 'SUPER_ADMIN') return res.status(400).json({ message: 'SUPER_ADMIN pertenece a la plataforma y no necesita crear un taller.' })
  if (req.profile.workshop_id || req.profile.workshop) return res.status(409).json({ message: 'Tu cuenta ya pertenece a un taller.' })
  if ((workshop_phone != null && (typeof workshop_phone !== 'string' || workshop_phone.length > 40)) || (workshop_city != null && (typeof workshop_city !== 'string' || workshop_city.length > 200))) return res.status(400).json({ message: 'Teléfono o ciudad no válidos' })
  if (typeof workshop_name !== 'string' || !workshop_name.trim() || workshop_name.trim().length > 120) return res.status(400).json({ message: 'Ingresa el nombre de tu taller' })

  try {
    const result = await provisionWorkshop({
      userId: req.profile.id,
      ownerName: req.profile.full_name,
      businessName: workshop_name.trim(),
      workshopPhone: workshop_phone,
      workshopCity: workshop_city,
    })
    await auditSafe(writeAudit({ db: db, req, userId: result.profile.id, workshopId: result.workshop.id, action: 'WORKSHOP_REGISTERED', entity: 'workshops', entityId: result.workshop.id, description: 'Taller ' + result.workshop.name + ' registrado', newValues: { workshop_id: result.workshop.id } }))
    res.status(201).json({ data: result })
  } catch (error) {
    res.status(error.status ?? 500).json({ message: error.publicMessage ?? error.message ?? 'No se pudo crear el taller.' })
  }
}))

// GET /api/auth/users → listar personal del MISMO taller (solo ADMINISTRADOR)
router.get('/users', authenticate, profileLoader, requireRole('ADMINISTRADOR'), requirePermission('users.view'), asyncHandler(async (req, res) => {
  let query = db
    .from('profiles')
    .select('id, role, full_name, phone, avatar_url, is_active, created_at')
    .order('created_at', { ascending: false })

  // SUPER_ADMIN puede listar todos o filtrar por taller; el taller solo ve el suyo.
  if (req.profile.role === 'SUPER_ADMIN') {
    if (typeof req.query?.workshop_id === 'string' && req.query.workshop_id.trim()) {
      query = query.eq('workshop_id', req.query.workshop_id.trim())
    }
  } else {
    query = query.eq('workshop_id', req.profile.workshop_id)
  }

  const { data, error } = await query
  if (error) return res.status(400).json({ message: error.message })
  res.json({ data: await withOptionalLastLogin(data) })
}))

// POST /api/auth/users → crear empleado en el MISMO taller (solo ADMINISTRADOR)
router.post('/users', authenticate, profileLoader, requireRole('ADMINISTRADOR'), requirePermission('users.create'), asyncHandler(async (req, res) => {
  const { email, password, full_name, role = 'RECEPCION', phone, is_active = true } = req.body ?? {}

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Correo electrónico no válido' })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' })
  }
  if (typeof full_name !== 'string' || !full_name.trim()) {
    return res.status(400).json({ message: 'El nombre completo es obligatorio' })
  }
  // Los empleados nunca son OWNER ni SUPER_ADMIN: esos roles no se crean desde aquí.
  if (!WORKSHOP_EMPLOYEE_ROLES.includes(role)) {
    return res.status(400).json({ message: `Rol no válido. Usa: ${WORKSHOP_EMPLOYEE_ROLES.join(', ')}` })
  }
  if (typeof is_active !== 'boolean' || (phone != null && (typeof phone !== 'string' || phone.length > 40))) {
    return res.status(400).json({ message: 'Estado o teléfono no válido' })
  }
  if (full_name.trim().length > 150 || password.length > 128) {
    return res.status(400).json({ message: 'El nombre o la contraseña supera la longitud permitida' })
  }

  // Crea el usuario en Supabase Auth; el trigger on_auth_user_created crea el perfil.
  if (!req.profile.workshop_id) return res.status(403).json({ message: 'Selecciona una cuenta de administración con taller para agregar personal.' })
  const { data: authData, error: createError } = await db.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim() },
    app_metadata: { workshop_employee: { actor_id: req.profile.id, workshop_id: req.profile.workshop_id, role, phone, is_active } },
  })

  if (createError) return res.status(400).json({ message: createError.message })

  // Completa el perfil con los datos adicionales. El empleado hereda el taller
  // del creador: nunca se acepta workshop_id del navegador.
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, role, full_name, phone, avatar_url, is_active, created_at, workshop_id')
    .eq('id', authData.user.id)
    .single()

  if (profileError) {
    return res.status(503).json({ message: 'El empleado se creó. Actualiza la lista de Personal para consultar su perfil.' })
  }

  await auditSafe(writeAudit({ db: db, req, action: 'USER_CREATED', entity: 'profiles', entityId: profile.id, description: `Usuario ${profile.full_name} creado`, newValues: { role: profile.role, full_name: profile.full_name, is_active: profile.is_active } }))
  res.status(201).json({ data: profile })
}))

// PATCH /api/auth/users/:id/role → cambiar rol (solo ADMINISTRADOR)
// El objetivo debe pertenecer al mismo taller: anti-IDOR entre talleres.
router.patch('/users/:id/role', authenticate, profileLoader, requireRole('ADMINISTRADOR'), requirePermission('roles.update'), asyncHandler(async (req, res) => {
  const { role } = req.body ?? {}
  if (!WORKSHOP_EMPLOYEE_ROLES.includes(role)) {
    return res.status(400).json({ message: `Rol no válido. Usa: ${WORKSHOP_EMPLOYEE_ROLES.join(', ')}` })
  }
  if (req.params.id === req.authUserId && !['ADMINISTRADOR', 'OWNER'].includes(role)) {
    return res.status(400).json({ message: 'Otro administrador debe cambiar tu rol para evitar que pierdas el acceso.' })
  }
  // Anti-IDOR: el objetivo debe pertenecer al mismo taller.
  let targetRoleBeforeChange = null
  if (req.profile.role !== 'SUPER_ADMIN') {
    const { data: target, error: targetError } = await db.from('profiles').select('role,workshop_id').eq('id', req.params.id).maybeSingle()
    if (targetError) throw targetError
    if (!target || target.workshop_id !== req.profile.workshop_id) return res.status(404).json({ message: 'Usuario no encontrado' })
    targetRoleBeforeChange = target.role
  } else {
    const { data: target, error: targetError } = await db.from('profiles').select('role').eq('id', req.params.id).maybeSingle()
    if (targetError) throw targetError
    targetRoleBeforeChange = target?.role ?? null
  }
  await ensureAdministratorSurvivesChange(req.params.id, role, true)
  const { data, error } = await db
    .from('profiles')
    .update({ role })
    .eq('id', req.params.id)
    .select('id, role, full_name, phone, avatar_url, is_active, created_at')
    .maybeSingle()

  if (error) return res.status(400).json({ message: error.message })
  if (!data) return res.status(404).json({ message: 'Usuario no encontrado' })
  await auditSafe(writeAudit({ db: db, req, action: 'ROLE_CHANGED', entity: 'profiles', entityId: data.id, description: `Rol cambiado a ${data.role}`, oldValues: { role: targetRoleBeforeChange }, newValues: { role: data.role } }))
  res.json({ data })
}))

// PATCH /api/auth/users/:id/status → activar/desactivar (solo ADMINISTRADOR)
router.patch('/users/:id/status', authenticate, profileLoader, requireRole('ADMINISTRADOR'), requirePermission('users.disable'), asyncHandler(async (req, res) => {
  const { is_active } = req.body ?? {}
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ message: 'El campo is_active debe ser booleano' })
  }
  if (req.params.id === req.authUserId && !is_active) {
    return res.status(400).json({ message: 'No puedes desactivar tu propia cuenta.' })
  }
  // Anti-IDOR: el objetivo debe pertenecer al mismo taller.
  if (req.profile.role !== 'SUPER_ADMIN') {
    const { data: target, error: targetError } = await db.from('profiles').select('workshop_id').eq('id', req.params.id).maybeSingle()
    if (targetError) throw targetError
    if (!target || target.workshop_id !== req.profile.workshop_id) return res.status(404).json({ message: 'Usuario no encontrado' })
  }
  await ensureAdministratorSurvivesChange(req.params.id, null, is_active)
  const { data, error } = await db
    .from('profiles')
    .update({ is_active })
    .eq('id', req.params.id)
    .select('id, role, full_name, phone, avatar_url, is_active, created_at')
    .maybeSingle()

  if (error) return res.status(400).json({ message: error.message })
  if (!data) return res.status(404).json({ message: 'Usuario no encontrado' })
  await auditSafe(writeAudit({ db: db, req, action: data.is_active ? 'USER_REACTIVATED' : 'USER_SUSPENDED', entity: 'profiles', entityId: data.id, description: data.is_active ? 'Usuario reactivado' : 'Usuario suspendido', oldValues: { is_active: !data.is_active }, newValues: { is_active: data.is_active } }))
  res.json({ data })
}))

return router
}

export default createAuthRouter()

