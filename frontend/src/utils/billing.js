import { api } from '../services/api.js'

export const formatPrice = (cents, currency = 'mxn') =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100)

// Abre el pago de Mercado Pago con la URL que devuelve el backend.
export async function goToCheckout(path, body) {
  const response = await api.post(path, body)
  if (!response?.data?.url) throw new Error('No se recibió la dirección de pago.')
  window.location.assign(response.data.url)
  return response
}

// Lo que incluyen todos los planes; cada nivel agrega usuarios y funciones.
export const BASE_FEATURES = ['Reparaciones, clientes y equipos sin límite', 'Cotizaciones, pagos, inventario y garantías', 'Seguimiento con enlace y QR para tus clientes']

export const FEATURE_LABELS = {
  whatsapp: 'Avisos y mensajes por WhatsApp',
  reports: 'Reportes del negocio',
  audit: 'Auditoría de acciones',
  ai: 'Diagnóstico IA',
  device_tools: 'Herramientas ADB y Fastboot',
}

export const TIER_NAMES = { plus: 'Plus', pro: 'Pro', max: 'Max' }
export const FEATURE_MIN_TIER = { whatsapp: 'pro', reports: 'pro', audit: 'pro', ai: 'max', device_tools: 'max' }

// Sección del menú que necesita cada función del plan.
export const FEATURE_BY_PATH = {
  '/comunicaciones': 'whatsapp',
  '/reportes': 'reports',
  '/auditoria': 'audit',
  '/diagnostico-ia': 'ai',
  '/herramientas-dispositivo': 'device_tools',
}

// Sin datos del plan (licencias apagadas o error al leerlos) la interfaz no oculta nada: el servidor valida.
export const planIncludes = (profile, feature) => !feature || !profile?.entitlements || profile.entitlements.features.includes(feature)

export const usersLabel = (maxUsers) => (maxUsers == null ? 'Usuarios ilimitados' : `Hasta ${maxUsers} usuarios`)

// Solo el dueño y el administrador contratan o cambian el plan del taller.
export const canManageBilling = (profile) => ['OWNER', 'ADMINISTRADOR'].includes(profile?.role)

export const daysText = (days) => (days === 1 ? '1 día' : `${days ?? 0} días`)
const dayMonth = (value) => (value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) : 'el final del periodo')

// Licencia vencida según /auth/me: el dueño o administrador va a Facturación a pagar y el resto ve
// el aviso. Sin datos de licencia (apagadas o error al leerlas) no se bloquea nada: el servidor valida.
export function licenseBlock(profile) {
  const license = profile?.license
  if (!license || license.allowed !== false) return null
  return { destination: canManageBilling(profile) ? '/facturacion' : '/licencia-vencida', message: license.message ?? 'Tu licencia no está activa.' }
}

// Estado del taller en pocas palabras para el menú lateral.
export function licenseStatus(profile) {
  const license = profile?.license
  if (profile?.role === 'SUPER_ADMIN') return { label: 'Administración', tone: 'success' }
  if (!license?.enabled || license.reason === 'unlimited') return { label: 'Taller activo', tone: 'success' }
  if (!license.allowed) return { label: 'Licencia vencida', tone: 'danger' }
  if (license.status === 'trialing') return { label: `Prueba gratuita · ${daysText(license.days_left)}`, tone: license.days_left <= 3 ? 'warning' : 'success' }
  if (license.reason === 'past_due_grace') return { label: 'Pago pendiente', tone: 'warning' }
  const plan = profile.entitlements?.name ? `Plan ${profile.entitlements.name}` : 'Plan activo'
  return license.cancel_at_period_end ? { label: `${plan} · hasta el ${dayMonth(license.current_period_end)}`, tone: 'warning' } : { label: plan, tone: 'success' }
}

// Aviso para quien puede pagar: días de prueba, cobro rechazado o plan cancelado.
export function licenseNotice(profile) {
  const license = profile?.license
  if (!license?.enabled || !license.allowed || !canManageBilling(profile)) return null
  if (license.status === 'trialing') {
    return { tone: license.days_left <= 3 ? 'warning' : 'info', action: 'Elegir plan', text: `Prueba gratuita: te ${license.days_left === 1 ? 'queda' : 'quedan'} ${daysText(license.days_left)} con todo incluido.`, detail: `Termina el ${dayMonth(license.trial_end)}.` }
  }
  if (license.reason === 'past_due_grace') {
    return { tone: 'warning', action: 'Ver facturación', text: `Mercado Pago no pudo cobrar tu plan y lo seguirá intentando. Revisa tu tarjeta en Mercado Pago antes del ${dayMonth(license.grace_until)} para no perder el acceso.` }
  }
  if (license.cancel_at_period_end) return { tone: 'warning', action: 'Contratar de nuevo', text: `Cancelaste tu plan: conservas el acceso hasta el ${dayMonth(license.current_period_end)}.` }
  return null
}
