import { supabaseAdmin } from '../config/supabase.js'
import { effectivePermissions } from './rbac.js'

// Verifica el JWT del usuario (Authorization: Bearer <token>) y deja el id en req.authUserId.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'No autorizado: falta el token de sesión' })
  }

  supabaseAdmin.auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error || !data?.user) {
        return res.status(401).json({ message: 'Sesión no válida o expirada' })
      }
      req.authUserId = data.user.id
      next()
    })
    .catch(() => res.status(401).json({ message: 'Sesión no válida o expirada' }))
}

// Carga el perfil (con rol) del usuario autenticado y lo deja en req.profile.
export function createProfileLoader({ db = supabaseAdmin, allowUnavailable = false } = {}) {
 return async function loadProfileInternal(req, res, next) {
  try {
    const { data: profile, error } = await db
      .from('profiles')
      .select('*,workshop:workshops!profiles_workshop_id_fkey(id,name,slug,status,plan,logo_url)')
      .eq('id', req.authUserId)
      .maybeSingle()

    if (error && ['PGRST200', 'PGRST201', 'PGRST204', 'PGRST205', '42703'].includes(error.code)) {
      return res.status(503).json({ message: 'No se pudo cargar el taller. Revisa las migraciones de talleres en Supabase.' })
    }
    if (error) throw error
    if (!profile) {
      return res.status(403).json({ message: 'Perfil no encontrado. Contacta con el administrador.' })
    }
    if (profile.is_active === false) {
      return res.status(403).json({ message: 'Usuario desactivado. Contacta con el administrador.' })
    }

    // SUPER_ADMIN pertenece a la plataforma; los demás usuarios necesitan un
    // taller. La sesión puede devolver el estado para mostrar onboarding o suspensión.
    const workshopStatus = profile.workshop?.status ?? null
    profile.workspace_access = profile.role === 'SUPER_ADMIN'
      ? 'PLATFORM'
      : !profile.workshop_id
        ? 'NO_WORKSHOP'
        : workshopStatus === 'ACTIVE'
          ? 'ACTIVE'
          : workshopStatus === 'SUSPENDED' ? 'SUSPENDED' : 'INACTIVE'

    if (!allowUnavailable && profile.workspace_access === 'NO_WORKSHOP') {
      return res.status(403).json({ code: 'NO_WORKSHOP', message: 'Tu cuenta no tiene un taller asignado. Crea o registra tu taller para continuar.' })
    }
    if (!allowUnavailable && ['SUSPENDED', 'INACTIVE'].includes(profile.workspace_access)) {
      return res.status(403).json({ code: profile.workspace_access, message: profile.workspace_access === 'SUSPENDED' ? 'Este taller se encuentra temporalmente suspendido.' : 'Este taller se encuentra inactivo.' })
    }

    try {
      const [{ data: rolePermissions, error: rolePermissionError }, { data: overrides }, { data: roleDefinition }] = await Promise.all([
        db.from('role_permissions').select('permission_code').eq('role_code', profile.role),
        db.from('user_permission_overrides').select('permission_code,allowed').eq('user_id', profile.id),
        db.from('roles').select('code').eq('code', profile.role).maybeSingle(),
      ])
      if (rolePermissionError) throw rolePermissionError
      const permissions = new Set((rolePermissions ?? []).map((row) => row.permission_code))
      for (const override of overrides ?? []) {
        if (override.allowed) permissions.add(override.permission_code)
        else permissions.delete(override.permission_code)
      }
      // Si el rol está registrado en la tabla roles, su conjunto de permisos es
      // autoritativo aunque quede vacío. Si el RBAC no está instalado en la base de
      // datos se conservan los permisos heredados por rol.
      profile.permissionsSource = roleDefinition ? 'rbac' : 'legacy'
      profile.permissions = roleDefinition ? [...permissions] : effectivePermissions(profile)
    } catch {
      profile.permissionsSource = 'legacy'
      profile.permissions = effectivePermissions(profile)
    }

    req.profile = profile
    next()
  } catch (err) {
    next(err)
  }
 }
}

export const loadProfile = createProfileLoader()
export const loadProfileForSession = createProfileLoader({ allowUnavailable: true })
