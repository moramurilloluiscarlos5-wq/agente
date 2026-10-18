import { Router } from 'express'
import Stripe from 'stripe'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfileForSession } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { rateLimit } from '../middleware/security.js'
import { invalidateLicenseCache } from '../middleware/license.js'
import { loadBillingConfig, trialDaysFromEnv, graceDaysFromEnv, licensingEnabled } from '../config/billing.js'
import { createBillingProcessor, getWorkshopSubscription, serializeSubscription } from '../services/billingService.js'
import { auditSafe, writeAudit } from '../services/auditService.js'

const LIVE_STATUSES = ['trialing', 'active', 'past_due']

let cachedStripe = null
function defaultStripeFactory(config) {
  if (!cachedStripe || cachedStripe.key !== config.secretKey) cachedStripe = { key: config.secretKey, client: new Stripe(config.secretKey) }
  return cachedStripe.client
}

const publicPlan = (plan) => ({ code: plan.code, name: plan.name, price_cents: plan.price_cents, currency: plan.currency, interval: plan.interval })

// Resuelve configuración y cliente de Stripe por petición para que las claves
// solo vivan en el entorno. Sin configuración completa responde 503.
function createContext({ env, stripeFactory, stripe }) {
  return () => {
    const loaded = loadBillingConfig(env())
    if (!loaded.ok) return { error: loaded.problems }
    return { config: loaded.config, stripe: stripe ?? stripeFactory(loaded.config) }
  }
}

export function createBillingRouter({
  db = supabaseAdmin,
  authenticate = [requireSupabase, requireAuth, loadProfileForSession],
  env = () => process.env,
  stripe,
  stripeFactory = defaultStripeFactory,
  checkoutLimiter = rateLimit({ windowMs: 60_000, max: 10, message: 'Demasiados intentos de pago. Espera un minuto.', keyFn: (req) => `billing:${req.authUserId ?? req.ip}` }),
} = {}) {
  const router = Router()
  const context = createContext({ env, stripeFactory, stripe })
  const needsConfig = (res) => {
    const ctx = context()
    if (ctx.error) {
      res.status(503).json({ code: 'BILLING_NOT_CONFIGURED', message: 'La facturación no está configurada en este entorno.' })
      return null
    }
    return ctx
  }

  router.get('/plans', async (_req, res, next) => {
    try {
      if (!licensingEnabled(env())) return res.json({ data: [], trial_days: 0, disabled: true })
      const { data, error } = await db.from('plans').select('code,name,price_cents,currency,interval').eq('active', true).order('price_cents')
      if (error) throw error
      res.json({ data: (data ?? []).map(publicPlan), trial_days: trialDaysFromEnv(env()) })
    } catch (error) { next(error) }
  })

  router.get('/subscription', ...authenticate, requireRole('ADMINISTRADOR'), async (req, res, next) => {
    try {
      const workshopId = req.profile.workshop_id
      if (!licensingEnabled(env())) return res.json({ data: { disabled: true, status: null, license: { allowed: true, reason: 'disabled', grace: false, grace_until: null } } })
      if (!workshopId) return res.status(403).json({ code: 'NO_WORKSHOP', message: 'Tu cuenta no tiene un taller asignado.' })
      const row = await getWorkshopSubscription(db, workshopId)
      res.json({ data: serializeSubscription(row, { graceDays: graceDaysFromEnv(env()) }) })
    } catch (error) { next(error) }
  })

  router.post('/checkout', ...authenticate, requireRole('ADMINISTRADOR'), checkoutLimiter, async (req, res, next) => {
    try {
      if (!licensingEnabled(env())) return res.status(503).json({ code: 'BILLING_NOT_CONFIGURED', message: 'Las licencias están desactivadas en este entorno.' })
      const profile = req.profile
      // El taller sale de la sesión; nada del body decide a quién se cobra.
      const workshopId = profile.workshop_id
      if (!workshopId) return res.status(403).json({ code: 'NO_WORKSHOP', message: 'Tu cuenta no tiene un taller asignado.' })
      if (['SUSPENDED', 'INACTIVE'].includes(profile.workspace_access)) return res.status(403).json({ code: profile.workspace_access, message: 'Este taller no está disponible para contratar.' })
      const ctx = needsConfig(res)
      if (!ctx) return

      const interval = req.body?.interval === 'year' ? 'year' : req.body?.interval === 'month' ? 'month' : null
      const planCode = typeof req.body?.plan === 'string' ? req.body.plan : null
      if (!interval && !planCode) return res.status(400).json({ message: 'Indica el plan (plan) o la frecuencia de cobro (interval: month | year).' })

      let query = db.from('plans').select('id,code,interval,stripe_price_id').eq('active', true)
      query = planCode ? query.eq('code', planCode) : query.eq('interval', interval)
      const { data: plans, error: planError } = await query
      if (planError) throw planError
      const plan = plans?.[0]
      if (!plan) return res.status(404).json({ message: 'El plan solicitado no existe.' })
      const priceId = plan.stripe_price_id || (plan.interval === 'year' ? ctx.config.priceYearly : ctx.config.priceMonthly)

      const existing = await getWorkshopSubscription(db, workshopId)
      if (existing?.stripe_subscription_id && LIVE_STATUSES.includes(existing.status) && existing.status !== 'trialing') {
        return res.status(409).json({ code: 'ALREADY_SUBSCRIBED', message: 'Tu taller ya tiene una suscripción. Usa "Gestionar pago" para cambiarla.' })
      }

      const session = await ctx.stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: workshopId,
        metadata: { workshop_id: workshopId },
        subscription_data: { metadata: { workshop_id: workshopId } },
        ...(existing?.stripe_customer_id ? { customer: existing.stripe_customer_id } : { customer_email: req.profile.email ?? undefined }),
        allow_promotion_codes: true,
        success_url: `${ctx.config.appPublicUrl}/facturacion?checkout=success`,
        cancel_url: `${ctx.config.appPublicUrl}/precios?checkout=cancelled`,
      })
      await auditSafe(writeAudit({ db, req, userId: req.authUserId, workshopId, action: 'CHECKOUT_STARTED', entity: 'subscriptions', entityId: workshopId, description: `Checkout iniciado (${plan.code})`, newValues: { plan: plan.code } }))
      res.json({ data: { url: session.url } })
    } catch (error) { next(error) }
  })

  router.post('/portal', ...authenticate, requireRole('OWNER'), async (req, res, next) => {
    try {
      const workshopId = req.profile.workshop_id
      if (!workshopId) return res.status(403).json({ code: 'NO_WORKSHOP', message: 'Tu cuenta no tiene un taller asignado.' })
      const ctx = needsConfig(res)
      if (!ctx) return
      const existing = await getWorkshopSubscription(db, workshopId)
      if (!existing?.stripe_customer_id) return res.status(409).json({ code: 'NO_BILLING_ACCOUNT', message: 'Aún no tienes un método de pago registrado. Elige un plan primero.' })
      const session = await ctx.stripe.billingPortal.sessions.create({ customer: existing.stripe_customer_id, return_url: `${ctx.config.appPublicUrl}/facturacion` })
      res.json({ data: { url: session.url } })
    } catch (error) { next(error) }
  })

  return router
}

// POST /api/billing/webhook. Debe montarse con express.raw: la firma se calcula
// sobre los bytes exactos. Stripe es la única fuente del estado de la licencia.
export function createBillingWebhookHandler({
  db = supabaseAdmin,
  env = () => process.env,
  stripe,
  stripeFactory = defaultStripeFactory,
  onChange = invalidateLicenseCache,
} = {}) {
  const context = createContext({ env, stripeFactory, stripe })
  return async function webhook(req, res) {
    const ctx = context()
    if (ctx.error) return res.status(503).json({ code: 'BILLING_NOT_CONFIGURED', message: 'La facturación no está configurada.' })
    const signature = req.headers['stripe-signature']
    if (!signature || !Buffer.isBuffer(req.body)) return res.status(400).json({ message: 'Firma o cuerpo no válidos' })

    let event
    try {
      event = ctx.stripe.webhooks.constructEvent(req.body, signature, ctx.config.webhookSecret)
    } catch {
      return res.status(400).json({ message: 'Firma de webhook no válida' })
    }

    try {
      const { error: insertError } = await db.from('billing_events').insert({ provider_event_id: event.id, type: event.type, payload: event })
      if (insertError) {
        if (insertError.code !== '23505') throw insertError
        const { data: seen, error: seenError } = await db.from('billing_events').select('processed_at').eq('provider_event_id', event.id).maybeSingle()
        if (seenError) throw seenError
        if (seen?.processed_at) return res.json({ received: true, duplicate: true })
      }

      const processEvent = createBillingProcessor({ db, stripe: ctx.stripe, config: ctx.config, onChange })
      const result = await processEvent(event)

      const { error: doneError } = await db.from('billing_events').update({ processed_at: new Date().toISOString() }).eq('provider_event_id', event.id)
      if (doneError) throw doneError
      res.json({ received: true, handled: Boolean(result?.handled) })
    } catch (error) {
      // 500 para que Stripe reintente; el procesamiento es idempotente.
      console.error('Error procesando webhook de Stripe', { type: event.type, id: event.id, code: error?.code ?? null })
      res.status(500).json({ message: 'No se pudo procesar el evento' })
    }
  }
}

export default createBillingRouter()
