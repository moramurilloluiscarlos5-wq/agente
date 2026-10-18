// Configuración de facturación. Todo sale de variables de entorno; nada se
// hardcodea y los mensajes de error nombran variables, nunca sus valores.

const REQUIRED = [
  ['STRIPE_SECRET_KEY', 'secretKey'],
  ['STRIPE_WEBHOOK_SECRET', 'webhookSecret'],
  ['STRIPE_PRICE_MONTHLY', 'priceMonthly'],
  ['STRIPE_PRICE_YEARLY', 'priceYearly'],
  ['APP_PUBLIC_URL', 'appPublicUrl'],
]

function intInRange(value, fallback, min, max) {
  if (value == null || String(value).trim() === '') return { value: fallback }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return { error: true }
  return { value: parsed }
}

// Interruptor explícito para operar sin licencias (p. ej. antes de configurar Stripe).
// Por defecto las licencias están activas; solo LICENSING_ENABLED=false las apaga.
export function licensingEnabled(env = process.env) {
  return String(env.LICENSING_ENABLED ?? '').trim().toLowerCase() !== 'false'
}

// Días de gracia de past_due. Se usa también cuando billing no está completo.
export function graceDaysFromEnv(env = process.env) {
  const parsed = intInRange(env.BILLING_GRACE_DAYS, 7, 0, 60)
  return parsed.error ? 7 : parsed.value
}

export function trialDaysFromEnv(env = process.env) {
  const parsed = intInRange(env.TRIAL_DAYS, 14, 0, 365)
  return parsed.error ? 14 : parsed.value
}

export function loadBillingConfig(env = process.env) {
  const raw = Object.fromEntries(REQUIRED.map(([name, key]) => [key, String(env[name] ?? '').trim()]))
  const problems = []
  for (const [name, key] of REQUIRED) if (!raw[key]) problems.push(`${name} no está definida`)

  if (raw.secretKey && !/^(sk|rk)_(test|live)_/.test(raw.secretKey)) problems.push('STRIPE_SECRET_KEY no tiene el formato de una clave secreta de Stripe (sk_test_… / sk_live_…)')
  if (raw.webhookSecret && !raw.webhookSecret.startsWith('whsec_')) problems.push('STRIPE_WEBHOOK_SECRET debe empezar con whsec_')
  for (const [name, key] of [['STRIPE_PRICE_MONTHLY', 'priceMonthly'], ['STRIPE_PRICE_YEARLY', 'priceYearly']]) {
    if (raw[key] && !raw[key].startsWith('price_')) problems.push(`${name} debe ser un id de precio de Stripe (price_…)`)
  }

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
  const grace = intInRange(env.BILLING_GRACE_DAYS, 7, 0, 60)
  if (grace.error) problems.push('BILLING_GRACE_DAYS debe ser un entero entre 0 y 60')

  if (problems.length) return { ok: false, problems }
  return {
    ok: true,
    config: {
      secretKey: raw.secretKey,
      webhookSecret: raw.webhookSecret,
      priceMonthly: raw.priceMonthly,
      priceYearly: raw.priceYearly,
      appPublicUrl,
      trialDays: trial.value,
      graceDays: grace.value,
      testMode: raw.secretKey.startsWith('sk_test_') || raw.secretKey.startsWith('rk_test_'),
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
