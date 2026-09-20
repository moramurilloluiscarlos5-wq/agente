import { databaseError } from '../utils/operations.js'

const SENSITIVE_KEYS = new Set(['password', 'password_hash', 'access_token', 'refresh_token', 'api_key', 'token', 'secret'])

function sanitize(value) {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(sanitize)
  if (typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase())).map(([key, entry]) => [key, sanitize(entry)]))
}

export async function writeAudit({ db, req, userId, workshopId, action, entity = null, entityId = null, description, oldValues = null, newValues = null }) {
  if (!db) return
  const values = {
    user_id: userId ?? req?.profile?.id ?? null,
    // El taller sale de la sesión (o del parámetro explícito en registro público);
    // nunca de datos enviados por el navegador.
    workshop_id: workshopId ?? req?.profile?.workshop_id ?? null,
    action,
    entity,
    entity_id: entityId == null ? null : String(entityId),
    description,
    old_values: sanitize(oldValues),
    new_values: sanitize(newValues),
    ip_address: req?.ip || req?.socket?.remoteAddress || null,
    user_agent: req?.get?.('user-agent') || null,
  }
  let { error } = await db.from('audit_logs').insert(values)
  // Compatibility with a database that has 006_security_rbac.sql but not yet
  // 013_workshops.sql. Filtering remains safe through the user profile route.
  if (error?.code === '42703' && /workshop_id/i.test(error.message ?? '')) {
    const { workshop_id: _workshopId, ...legacyValues } = values
    ;({ error } = await db.from('audit_logs').insert(legacyValues))
  }
  if (error) databaseError(error)
}

export function auditSafe(task) {
  // Nunca debe tumbar la operación de negocio, pero el fallo no puede quedar invisible:
  // si falta aplicar la migración de auditoría, el motivo aparece en los logs del servidor.
  return Promise.resolve(task).catch((error) => {
    console.error('No se pudo escribir la auditoría', { code: error?.code ?? null, message: error?.message ?? String(error) })
    return null
  })
}
