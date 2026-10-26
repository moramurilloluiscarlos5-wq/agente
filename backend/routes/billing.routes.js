import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfileForSession } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { rateLimit } from '../middleware/security.js'
import { invalidateLicenseCache } from '../middleware/license.js'
import { loadBillingConfig, trialDaysFromEnv, graceDaysFromEnv, licensingEnabled } from '../config/billing.js'
import { FEATURES, TIERS } from '../config/plans.js'
import { countActiveUsers, createBillingProcessor, getWorkshopSubscription, preapprovalRequest, serializeSubscription } from '../services/billingService.js'
import { checkoutProblem, createMercadoPagoClient, verifyNotificationSignature } from '../services/mercadoPago.js'
import { auditSafe, writeAudit } from '../services/auditService.js'

const PAID_STATUSES = ['active', 'past_due']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

let cachedClient = null
function defaultMpFactory(config) {
  // Timeout corto: Mercado Pago espera la respuesta del webhook como máximo 22 segundos.
  if (!cachedClient || cachedClient.token !== config.accessToken) cachedClient = { token: config.accessToken, client: createMercadoPagoClient({ accessToken: config.accessToken, timeoutMs: 8_000 }) }
  return cachedClient.client
}

const tierRank = (plan) => TIERS[plan.tier]?.rank ?? 99
const publicPlan = (plan) => ({
  code: plan.code, name: plan.name, tier: plan.tier, price_cents: plan.price_cents, currency: plan.currency, interval: plan.interval,
  max_users: TIERS[plan.tier]?.maxUsers ?? null, features: TIERS[plan.tier]?.features ?? [],
})

// Resuelve configuración y cliente de Mercado Pago por petición para que las claves
// solo vivan en el entorno. Sin configuración completa responde 503.
function createContext({ env, mpFactory, mp }) {
  return () => {
    const loaded = loadBillingConfig(env())
    if (!loaded.ok) return { error: loaded.problems }
    return { config: loaded.config, mp: mp ?? mpFactory(loaded.config) }
  }
}

export function createBillingRouter({
  db = supabaseAdmin,
  authenticate = [requireSupabase, requireAuth, loadProfileForSession],
  env = () => process.env,
  mp,
  mpFactory = defaultMpFactory,
  onChange = invalidateLicenseCache,
  checkoutLimiter = rateLimit({ windowMs: 60_000, max: 10, message: 'Demasiados intentos de pago. Espera un minuto.', keyFn: (req) => `billing:${req.authUserId ?? req.ip}` }),
} = {}) {
  const router = Router()
  const context = createContext({ env, mpFactory, mp })
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

  // Comprobaciones comunes de las acciones de pago. Devuelve null si ya respondió.
  function paymentContext(req, res) {
    if (!licensingEnabled(env())) { res.status(503).json({ code: 'BILLING_NOT_CONFIGURED', message: 'Las licencias están desactivadas en este entorno.' }); return null }
    // El taller sale de la sesión; nada del body decide a quién se cobra.
    const workshopId = req.profile.workshop_id
    if (!workshopId) { res.status(403).json({ code: 'NO_WORKSHOP', message: 'Tu cuenta no tiene un taller asignado.' }); return null }
    if (['SUSPENDED', 'INACTIVE'].includes(req.profile.workspace_access)) { res.status(403).json({ code: req.profile.workspace_access, message: 'Este taller no está disponible para contratar.' }); return null }
    const ctx = context()
    if (ctx.error) { res.status(503).json({ code: 'BILLING_NOT_CONFIGURED', message: 'La facturación no está configurada en este entorno.' }); return null }
    return { ...ctx, workshopId }
  }

  async function findPlan(code) {
    if (typeof code !== 'string' || !code) return null
    const { data, error } = await db.from('plans').select('id,code,name,tier,interval,price_cents,currency').eq('active', true).eq('code', code)
    if (error) throw error
    return data?.[0] ?? null
  }

  // Mercado Pago identifica al pagador por correo: el dueño puede indicar el de su cuenta de Mercado Pago.
  async function payerEmail(req) {
    const given = typeof req.body?.payer_email === 'string' ? req.body.payer_email.trim().toLowerCase() : ''
    if (given) return EMAIL.test(given) && given.length <= 254 ? given : false
    try {
      const { data } = await db.auth.admin.getUserById(req.authUserId)
      return data?.user?.email ?? null
    } catch { return null }
  }

  async function startCheckout(req, res, ctx, plan, action) {
    const email = await payerEmail(req)
    if (email === false) return res.status(400).json({ message: 'Escribe un correo válido, por ejemplo nombre@correo.com.' })
    if (!email) return res.status(400).json({ message: 'Escribe el correo de tu cuenta de Mercado Pago para continuar.' })
    let preapproval
    try {
      preapproval = await ctx.mp.createPreapproval(preapprovalRequest({ plan, workshopId: ctx.workshopId, payerEmail: email, appPublicUrl: ctx.config.appPublicUrl }))
    } catch (error) {
      // El motivo de Mercado Pago queda en el log (sin correo ni claves) para poder diagnosticar.
      console.error('Mercado Pago rechazó la suscripción', { status: error?.providerStatus ?? null, message: error?.providerMessage ?? null, causes: error?.providerCauses ?? [] })
      const problem = checkoutProblem(error)
      if (problem) return res.status(400).json({ code: 'PAYMENT_REJECTED', message: problem })
      throw error
    }
    if (!preapproval?.init_point) return res.status(502).json({ code: 'PAYMENT_PROVIDER_ERROR', message: 'Mercado Pago no devolvió el enlace de pago. Inténtalo de nuevo.' })
    await auditSafe(writeAudit({ db, req, userId: req.authUserId, workshopId: ctx.workshopId, action: 'CHECKOUT_STARTED', entity: 'subscriptions', entityId: ctx.workshopId, description: `${action} (${plan.code})`, newValues: { plan: plan.code } }))
    return res.json({ data: { url: preapproval.init_point } })
  }

  async function subscriptionResponse(workshopId) {
    const [row, activeUsers] = await Promise.all([getWorkshopSubscription(db, workshopId), countActiveUsers(db, workshopId)])
    return serializeSubscription(row, { graceDays: graceDaysFromEnv(env()), activeUsers })
  }

  router.get('/plans', asyncRoute(async (_req, res) => {
    if (!licensingEnabled(env())) return res.json({ data: [], trial_days: 0, disabled: true, features: FEATURES })
    const { data, error } = await db.from('plans').select('code,name,tier,price_cents,currency,interval').eq('active', true).order('price_cents')
    if (error) throw error
    const plans = (data ?? []).filter((plan) => TIERS[plan.tier]).sort((a, b) => tierRank(a) - tierRank(b) || a.price_cents - b.price_cents)
    // payments_ready solo dice si se puede contratar ya (Mercado Pago configurado), nunca con qué claves.
    res.json({ data: plans.map(publicPlan), trial_days: trialDaysFromEnv(env()), features: FEATURES, payments_ready: loadBillingConfig(env()).ok })
  }))

  router.get('/subscription', ...authenticate, requireRole('ADMINISTRADOR'), asyncRoute(async (req, res) => {
    const workshopId = req.profile.workshop_id
    if (!licensingEnabled(env())) return res.json({ data: { disabled: true, status: null, license: { allowed: true, reason: 'disabled', grace: false, grace_until: null } } })
    if (!workshopId) return res.status(403).json({ code: 'NO_WORKSHOP', message: 'Tu cuenta no tiene un taller asignado.' })
    res.json({ data: await subscriptionResponse(workshopId) })
  }))

  router.post('/checkout', ...authenticate, requireRole('ADMINISTRADOR'), checkoutLimiter, asyncRoute(async (req, res) => {
    const ctx = paymentContext(req, res)
    if (!ctx) return
    if (typeof req.body?.plan !== 'string' || !req.body.plan) return res.status(400).json({ message: 'Elige un plan para continuar.' })
    const plan = await findPlan(req.body.plan)
    if (!plan) return res.status(404).json({ message: 'El plan solicitado no existe.' })
    const existing = await getWorkshopSubscription(db, ctx.workshopId)
    if (existing?.provider_subscription_id && PAID_STATUSES.includes(existing.status) && !existing.cancel_at_period_end) {
      return res.status(409).json({ code: 'ALREADY_SUBSCRIBED', message: 'Tu taller ya tiene una suscripción activa. Usa "Cambiar a este plan" para cambiarla.' })
    }
    return startCheckout(req, res, ctx, plan, 'Pago iniciado en Mercado Pago')
  }))

  // Bajar de plan con el mismo cobro (mensual o anual): se ajusta el monto de la suscripción
  // y el plan cambia ya; el nuevo monto se cobra en el siguiente pago. Subir de plan u otro
  // cobro: se paga el plan nuevo y, solo al autorizarse ese pago, el plan cambia y la
  // suscripción anterior se cancela sola (ver syncPreapproval). Así nadie usa un plan mayor sin pagarlo.
  router.post('/change-plan', ...authenticate, requireRole('OWNER'), checkoutLimiter, asyncRoute(async (req, res) => {
    const ctx = paymentContext(req, res)
    if (!ctx) return
    const plan = await findPlan(req.body?.plan)
    if (!plan) return res.status(404).json({ message: 'El plan solicitado no existe.' })
    const existing = await getWorkshopSubscription(db, ctx.workshopId)
    if (!existing?.provider_subscription_id || !PAID_STATUSES.includes(existing.status) || existing.cancel_at_period_end) {
      return res.status(409).json({ code: 'NO_ACTIVE_SUBSCRIPTION', message: 'No tienes una suscripción activa para cambiar. Contrata un plan.' })
    }
    if (existing.plan?.code === plan.code) return res.status(409).json({ code: 'SAME_PLAN', message: 'Tu taller ya tiene este plan.' })
    const upgrade = !existing.plan || tierRank(plan) > tierRank(existing.plan)
    if (existing.plan?.interval !== plan.interval || upgrade) return startCheckout(req, res, ctx, plan, 'Cambio de plan iniciado en Mercado Pago')

    const request = preapprovalRequest({ plan, workshopId: ctx.workshopId, payerEmail: null, appPublicUrl: ctx.config.appPublicUrl })
    await ctx.mp.updatePreapproval(existing.provider_subscription_id, { reason: request.reason, auto_recurring: { transaction_amount: request.auto_recurring.transaction_amount, currency_id: request.auto_recurring.currency_id } })
    const processor = createBillingProcessor({ db, mp: ctx.mp, onChange })
    await processor.syncPreapproval(await ctx.mp.getPreapproval(existing.provider_subscription_id), { source: 'change_plan' })
    await auditSafe(writeAudit({ db, req, userId: req.authUserId, workshopId: ctx.workshopId, action: 'PLAN_CHANGE_REQUESTED', entity: 'subscriptions', entityId: ctx.workshopId, description: `Cambio a ${plan.name}`, oldValues: { plan: existing.plan?.code ?? null }, newValues: { plan: plan.code } }))
    res.json({ data: { changed: true, subscription: await subscriptionResponse(ctx.workshopId) } })
  }))

  // Cancela en Mercado Pago; el taller conserva el acceso hasta el último día pagado.
  router.post('/cancel', ...authenticate, requireRole('OWNER'), asyncRoute(async (req, res) => {
    const ctx = paymentContext(req, res)
    if (!ctx) return
    const existing = await getWorkshopSubscription(db, ctx.workshopId)
    if (!existing?.provider_subscription_id || !PAID_STATUSES.includes(existing.status) || existing.cancel_at_period_end) {
      return res.status(409).json({ code: 'NO_ACTIVE_SUBSCRIPTION', message: 'No hay una suscripción activa que cancelar.' })
    }
    await ctx.mp.updatePreapproval(existing.provider_subscription_id, { status: 'canceled' })
    const processor = createBillingProcessor({ db, mp: ctx.mp, onChange })
    await processor.syncPreapproval(await ctx.mp.getPreapproval(existing.provider_subscription_id), { source: 'cancel' })
    await auditSafe(writeAudit({ db, req, userId: req.authUserId, workshopId: ctx.workshopId, action: 'SUBSCRIPTION_CANCEL_REQUESTED', entity: 'subscriptions', entityId: ctx.workshopId, description: 'Suscripción cancelada por el dueño', oldValues: { plan: existing.plan?.code ?? null } }))
    res.json({ data: await subscriptionResponse(ctx.workshopId) })
  }))

  return router
}

// POST /api/billing/webhook. Mercado Pago firma cada notificación (x-signature);
// el cuerpo solo dice qué cambió y el estado se vuelve a leer de su API.
export function createBillingWebhookHandler({
  db = supabaseAdmin,
  env = () => process.env,
  mp,
  mpFactory = defaultMpFactory,
  onChange = invalidateLicenseCache,
} = {}) {
  const context = createContext({ env, mpFactory, mp })
  return async function webhook(req, res) {
    const ctx = context()
    if (ctx.error) return res.status(503).json({ code: 'BILLING_NOT_CONFIGURED', message: 'La facturación no está configurada.' })
    const query = new URL(req.originalUrl ?? req.url, 'http://local').searchParams
    const body = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {}
    const dataId = query.get('data.id') ?? (body.data?.id != null ? String(body.data.id) : null)
    const type = body.type ?? query.get('type') ?? query.get('topic') ?? null
    const requestId = req.headers['x-request-id'] ?? null

    if (!dataId || !verifyNotificationSignature({ signature: req.headers['x-signature'], requestId, dataId, secret: ctx.config.webhookSecret })) {
      return res.status(401).json({ message: 'Firma de notificación no válida' })
    }

    // Un reintento de Mercado Pago repite el id de la notificación.
    const eventId = body.id != null ? `mp:${body.id}` : `mp:${type}:${dataId}:${requestId ?? ''}`
    try {
      const { error: insertError } = await db.from('billing_events').insert({ provider_event_id: eventId, type: type ?? 'desconocido', payload: { ...body, data_id: dataId } })
      if (insertError) {
        if (insertError.code !== '23505') throw insertError
        const { data: seen, error: seenError } = await db.from('billing_events').select('processed_at').eq('provider_event_id', eventId).maybeSingle()
        if (seenError) throw seenError
        if (seen?.processed_at) return res.json({ received: true, duplicate: true })
      }

      const { processNotification } = createBillingProcessor({ db, mp: ctx.mp, onChange })
      const result = await processNotification({ type, dataId })

      const { error: doneError } = await db.from('billing_events').update({ processed_at: new Date().toISOString() }).eq('provider_event_id', eventId)
      if (doneError) throw doneError
      res.json({ received: true, handled: Boolean(result?.handled) })
    } catch (error) {
      // 500 para que Mercado Pago reintente; el procesamiento es idempotente.
      console.error('Error procesando notificación de Mercado Pago', { type, id: eventId, code: error?.code ?? null, status: error?.providerStatus ?? null })
      res.status(500).json({ message: 'No se pudo procesar la notificación' })
    }
  }
}

export default createBillingRouter()
