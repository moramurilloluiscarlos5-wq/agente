import { supabaseAdmin } from '../config/supabase.js'
import { graceDaysFromEnv, licensingEnabled } from '../config/billing.js'
import { FEATURES, TIERS, hasFeature, minimumTierFor } from '../config/plans.js'
import { entitlementsForSubscription, evaluateLicense, licenseMessage } from '../services/billingService.js'

const cache = new Map()

export function invalidateLicenseCache(workshopId) {
  if (workshopId) cache.delete(workshopId)
  else cache.clear()
}

// Corta con 402 LICENSE_REQUIRED si el taller no tiene licencia vigente y deja en
// req.entitlements lo que incluye su plan. Va después de loadProfile (necesita
// req.profile). Falla cerrado ante errores de BD.
export function createLicenseMiddleware({ db = supabaseAdmin, graceDays = () => graceDaysFromEnv(), ttlMs = 15_000, now = () => Date.now() } = {}) {
  return async function requireLicense(req, res, next) {
    if (!licensingEnabled()) return next()
    try {
      const profile = req.profile
      if (!profile) return res.status(401).json({ message: 'No autorizado' })
      if (profile.role === 'SUPER_ADMIN') return next()

      const workshopId = profile.workshop_id
      let entry = cache.get(workshopId)
      if (!entry || entry.expires < now()) {
        const { data, error } = await db.from('subscriptions')
          .select('status,trial_end,current_period_end,past_due_since,cancel_at_period_end,updated_at,plan:plans(tier)')
          .eq('workshop_id', workshopId)
          .maybeSingle()
        if (error) throw error
        entry = { subscription: data ?? null, expires: now() + ttlMs }
        cache.set(workshopId, entry)
      }

      const license = evaluateLicense(entry.subscription, { now: now(), graceDays: graceDays() })
      if (!license.allowed) {
        return res.status(402).json({ code: 'LICENSE_REQUIRED', reason: license.reason, message: licenseMessage(license.reason) })
      }
      req.license = license
      req.entitlements = entitlementsForSubscription(entry.subscription)
      next()
    } catch (error) {
      console.error('No se pudo verificar la licencia', { code: error?.code ?? null })
      res.status(503).json({ message: 'No se pudo verificar la licencia. Inténtalo de nuevo.' })
    }
  }
}

export const requireLicense = createLicenseMiddleware()

export function planUpgradeMessage(feature) {
  const tier = TIERS[minimumTierFor(feature)]
  return `${FEATURES[feature] ?? 'Esta función'}: disponible desde el plan ${tier?.name ?? 'superior'}. Cambia de plan en Facturación para usarla.`
}

// Corta con 402 PLAN_UPGRADE_REQUIRED si el plan del taller no incluye la función.
// Va después de requireLicense: sin req.entitlements (licencias apagadas o SUPER_ADMIN) no hay límite.
export function requireFeature(feature) {
  return function featureGate(req, res, next) {
    if (hasFeature(req.entitlements, feature)) return next()
    res.status(402).json({ code: 'PLAN_UPGRADE_REQUIRED', feature, required_tier: minimumTierFor(feature), message: planUpgradeMessage(feature) })
  }
}
