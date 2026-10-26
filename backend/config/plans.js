// Niveles de licencia: qué incluye cada plan. Los precios viven en la tabla
// `plans` (migración 020); aquí solo se define el alcance de cada nivel.

export const FEATURES = {
  whatsapp: 'Avisos y mensajes por WhatsApp',
  reports: 'Reportes del negocio',
  audit: 'Auditoría de acciones',
  ai: 'Diagnóstico IA',
  device_tools: 'Herramientas ADB y Fastboot',
}

export const TIERS = {
  plus: { name: 'Plus', rank: 1, maxUsers: 3, features: [] },
  pro: { name: 'Pro', rank: 2, maxUsers: 10, features: ['whatsapp', 'reports', 'audit'] },
  max: { name: 'Max', rank: 3, maxUsers: null, features: ['whatsapp', 'reports', 'audit', 'ai', 'device_tools'] },
}

// Nivel más bajo que incluye cada función (para decir "incluido en el plan Pro").
export function minimumTierFor(feature) {
  return Object.entries(TIERS).sort(([, a], [, b]) => a.rank - b.rank).find(([, tier]) => tier.features.includes(feature))?.[0] ?? null
}

const ALL_FEATURES = Object.keys(FEATURES)

// Lo que puede usar un taller. `max_users: null` significa sin límite.
// - Licencias apagadas o SUPER_ADMIN: todo, sin límite (tier null).
// - Prueba gratuita: todo lo de Max, para conocer el sistema completo.
// - Plan pagado: el alcance de su nivel. Un plan sin nivel conocido se trata como Max
//   para no quitarle funciones a nadie por un dato incompleto.
export function entitlementsFor({ unlimited = false, trial = false, tier = null } = {}) {
  if (unlimited) return { tier: null, name: null, trial: false, max_users: null, features: ALL_FEATURES }
  const key = trial ? 'max' : TIERS[tier] ? tier : 'max'
  const definition = TIERS[key]
  return { tier: key, name: definition.name, trial: Boolean(trial), max_users: definition.maxUsers, features: definition.features }
}

export const hasFeature = (entitlements, feature) => !entitlements || entitlements.features.includes(feature)
