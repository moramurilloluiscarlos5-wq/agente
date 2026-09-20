import { fail } from './operations.js'

// ─── Roles multi-taller ─────────────────────────────────────────────────
// OWNER administra su taller; SUPER_ADMIN administra la plataforma y es el
// único rol que puede no tener taller (workshop_id = null).
export const WORKSHOP_ROLES = ['OWNER', 'ADMINISTRADOR', 'TECNICO', 'RECEPCION', 'CAJERO']
export const ADMIN_ROLES = ['OWNER', 'ADMINISTRADOR']
export const PLATFORM_ROLES = ['SUPER_ADMIN']
export const ALL_STAFF_ROLES = [...WORKSHOP_ROLES, ...PLATFORM_ROLES]

// Taller del usuario autenticado. El frontend NUNCA lo envía: siempre sale de
// la sesión (profiles.workshop_id cargado en loadProfile).
export function workshopScope(req) {
  if (req.profile?.role === 'SUPER_ADMIN') return req.profile.workshop_id ?? null
  const workshopId = req.profile?.workshop_id ?? null
  if (!workshopId) fail('Tu cuenta no tiene un taller asignado. Contacta con el administrador.', 403)
  return workshopId
}

// En lecturas/listas: SUPER_ADMIN ve todo salvo que filtre por taller.
export function scopeToWorkshop(query, req, column = 'workshop_id') {
  if (req.profile?.role === 'SUPER_ADMIN') {
    const only = typeof req.query?.workshop_id === 'string' ? req.query.workshop_id.trim() : ''
    return only ? query.eq(column, only) : query
  }
  return query.eq(column, workshopScope(req))
}

// En detalle/edición/borrado: un recurso de otro taller no existe (404, no 403,
// para no revelar que el id es válido en otro taller).
export function assertSameWorkshop(record, req, label = 'Registro no encontrado') {
  if (!record) fail(label, 404)
  if (req.profile?.role === 'SUPER_ADMIN') return record
  if (!record.workshop_id || record.workshop_id !== req.profile?.workshop_id) fail(label, 404)
  return record
}

// Sella el taller de la sesión en una creación. Ignora cualquier workshop_id
// que venga en el cuerpo: el navegador no es fuente de verdad.
export function stampWorkshop(values, req) {
  const { workshop_id: _ignored, ...rest } = values ?? {}
  return { ...rest, workshop_id: workshopScope(req) }
}

// Bloquea el uso del sistema cuando el taller está suspendido.
// SUPER_ADMIN sigue entrando para administrar la plataforma.
export function requireActiveWorkshop(req, _res, next) {
  if (req.profile?.role === 'SUPER_ADMIN') return next()
  if (req.profile?.workshop?.status && req.profile.workshop.status !== 'ACTIVE') {
    return next(Object.assign(new Error('suspended'), {
      status: 403,
      publicMessage: 'Este taller se encuentra temporalmente suspendido. Contacta con soporte de CARLOSTECH AI.',
    }))
  }
  next()
}

export function slugifyWorkshop(name, suffix = '') {
  const base = String(name ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'taller'
  return suffix ? `${base}-${suffix}` : base
}

export function randomSlugSuffix() {
  return Math.random().toString(36).slice(2, 8)
}
