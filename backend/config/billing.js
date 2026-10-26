// Configuración de facturación con Mercado Pago. Todo sale de variables de
// entorno; nada se hardcodea y los mensajes de error nombran variables, nunca sus valores.

const REQUIRED = [
  ['MP_ACCESS_TOKEN', 'accessToken'],
  ['MP_WEBHOOK_SECRET', 'webhookSecret'],
  ['APP_PUBLIC_URL', 'appPublicUrl'],
]

// Mercado Pago reintenta un cobro rechazado durante 10 días: la gracia por defecto coincide.
const DEFAULT_GRACE_DAYS = 10

function intInRange(value, fallback, min, max) {
  if (value == null || String(value).trim() === '') return { value: fallback }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return { error: true }
  return { value: parsed }
}

// Interruptor explícito para operar sin licencias (p. ej. antes de configurar Mercado Pago).
// Por defecto las licencias están activas; solo LICENSING_ENABLED=false las apaga.
export function licensingEnabled(env = process.env) {
  return String(env.LICENSING_ENABLED ?? '').trim().toLowerCase() !== 'false'
}

// Días de gracia tras un cobro rechazado. Se usa también cuando billing no está completo.
export function graceDaysFromEnv(env = process.env) {
  const parsed = intInRange(env.BILLING_GRACE_DAYS, DEFAULT_GRACE_DAYS, 0, 60)
  return parsed.error ? DEFAULT_GRACE_DAYS : parsed.value
}

export function trialDaysFromEnv(env = process.env) {
  const parsed = intInRange(env.TRIAL_DAYS, 14, 0, 365)
  return parsed.error ? 14 : parsed.value
}

export function loadBillingConfig(env = process.env) {
  const raw = Object.fromEntries(REQUIRED.map(([name, key]) => [key, String(env[name] ?? '').trim()]))
  const problems = []
  for (const [name, key] of REQUIRED) if (!raw[key]) problems.push(`${name} no está definida`)

  if (raw.accessToken && !/^(APP_USR|TEST)-/.test(raw.accessToken)) problems.push('MP_ACCESS_TOKEN no tiene el formato de un Access Token de Mercado Pago (APP_USR-… / TEST-…)')
  if (raw.webhookSecret && raw.webhookSecret.length < 16) problems.push('MP_WEBHOOK_SECRET es demasiado corta: copia la clave secreta completa de Webhooks en Tus integraciones')

  let appPublicUrl = raw.appPublicUrl
  if (appPublicUrl) {
    try {
      const url = new URL(appPublicUrl)
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('protocol')
      if (env.NODE_ENV === 'production' && url.protocol !== 'https:') problems.push('APP_PUBLIC_URL debe usar https en producción')
      appPublicUrl = url.origin
    } catch {
      problems.push('APP_PUBLIC_URL no es una URL válida (ej. https://tu-dominio.com)')
    }
  }

  const trial = intInRange(env.TRIAL_DAYS, 14, 0, 365)
  if (trial.error) problems.push('TRIAL_DAYS debe ser un entero entre 0 y 365')
  const grace = intInRange(env.BILLING_GRACE_DAYS, DEFAULT_GRACE_DAYS, 0, 60)
  if (grace.error) problems.push('BILLING_GRACE_DAYS debe ser un entero entre 0 y 60')

  if (problems.length) return { ok: false, problems }
  return {
    ok: true,
    config: {
      accessToken: raw.accessToken,
      webhookSecret: raw.webhookSecret,
      appPublicUrl,
      trialDays: trial.value,
      graceDays: grace.value,
      // Solo describe el tipo de credencial: los usuarios de prueba de Mercado Pago también usan APP_USR-.
      testCredentials: raw.accessToken.startsWith('TEST-'),
    },
  }
}

// En producción un billing incompleto detiene el arranque con un mensaje claro.
export function assertBillingConfig(env = process.env) {
  const result = loadBillingConfig(env)
  if (!result.ok) {
    throw new Error(`Configuración de facturación incompleta o inválida:\n - ${result.problems.join('\n - ')}\nDefine estas variables en Railway (ver README, sección Licencias).`)
  }
  return result.config
}
