import { auditSafe, writeAudit } from './auditService.js'

// Stripe es la fuente de verdad. Aquí solo se traduce su estado a la base de
// datos y se decide si una licencia permite usar el sistema.

const DAY_MS = 86_400_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_STATUSES = ['trialing', 'active', 'past_due']
const DEAD_STATUSES = ['canceled', 'unpaid', 'incomplete']

export const isUuid = (value) => typeof value === 'string' && UUID.test(value)

// ─── Utilidades de forma de datos de Stripe ─────────────────────────────
export const stripeId = (value) => (typeof value === 'string' ? value : value?.id ?? null)
const fromUnix = (seconds) => (seconds == null ? null : new Date(seconds * 1000).toISOString())

// Desde la API 2025-03-31 el fin de periodo vive en los items de la suscripción.
export function stripePeriodEnd(subscription) {
  return fromUnix(subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null)
}

// Desde la misma versión la suscripción de la factura cuelga de `parent`.
export function invoiceSubscriptionId(invoice) {
  return stripeId(invoice.subscription) ?? stripeId(invoice.parent?.subscription_details?.subscription) ?? null
}

export function mapStripeStatus(status) {
  switch (status) {
    case 'trialing': case 'active': case 'past_due': case 'canceled': case 'unpaid': case 'incomplete':
      return status
    case 'incomplete_expired': return 'canceled'
    default: return 'unpaid' // paused u otros estados desconocidos: sin acceso
  }
}

// ─── Decisión de licencia ───────────────────────────────────────────────
export function evaluateLicense(subscription, { now = Date.now(), graceDays = 7 } = {}) {
  if (!subscription) return { allowed: false, reason: 'no_subscription', grace: false, graceUntil: null }
  const graceMs = graceDays * DAY_MS
  const time = (value) => (value ? new Date(value).getTime() : null)

  switch (subscription.status) {
    case 'trialing': {
      const end = time(subscription.trial_end)
      return end != null && end > now
        ? { allowed: true, reason: 'trialing', grace: false, graceUntil: null }
        : { allowed: false, reason: 'trial_expired', grace: false, graceUntil: null }
    }
    case 'active': {
      // Red de seguridad si se perdieron webhooks: el periodo pagado venció hace
      // más que la gracia y Stripe nunca avisó de la renovación ni de la baja.
      const end = time(subscription.current_period_end)
      if (end != null && now > end + graceMs) return { allowed: false, reason: 'period_ended', grace: false, graceUntil: null }
      return { allowed: true, reason: 'active', grace: false, graceUntil: null }
    }
    case 'past_due': {
      const since = time(subscription.past_due_since) ?? time(subscription.updated_at)
      if (since == null) return { allowed: false, reason: 'past_due_expired', grace: false, graceUntil: null }
      const until = since + graceMs
      return now <= until
        ? { allowed: true, reason: 'past_due_grace', grace: true, graceUntil: new Date(until).toISOString() }
        : { allowed: false, reason: 'past_due_expired', grace: false, graceUntil: null }
    }
    default:
      return { allowed: false, reason: subscription.status, grace: false, graceUntil: null }
  }
}

export const LICENSE_MESSAGES = {
  no_subscription: 'Tu taller no tiene una licencia activa. Elige un plan para continuar.',
  trial_expired: 'Tu periodo de prueba terminó. Elige un plan para seguir usando Taller Flow.',
  period_ended: 'Tu licencia venció. Renueva tu suscripción para continuar.',
  past_due_expired: 'No pudimos cobrar tu suscripción y el periodo de gracia terminó. Actualiza tu método de pago.',
  canceled: 'Tu suscripción fue cancelada. Elige un plan para volver a usar Taller Flow.',
  unpaid: 'Tu suscripción tiene pagos pendientes. Actualiza tu método de pago para continuar.',
  incomplete: 'Tu pago aún no se ha completado. Termina el pago para activar tu licencia.',
}

export const licenseMessage = (reason) => LICENSE_MESSAGES[reason] ?? 'Tu licencia no está activa. Revisa tu facturación para continuar.'

// ─── Transiciones de estado (puras, sin I/O) ────────────────────────────
// Una suscripción de Stripe solo reemplaza a la guardada si es la misma, si no
// había ninguna o si la guardada ya está muerta (re-suscripción).
export function canApplySubscription(existing, stripeSubscriptionId) {
  if (!existing || !existing.stripe_subscription_id) return true
  if (existing.stripe_subscription_id === stripeSubscriptionId) return true
  return DEAD_STATUSES.includes(existing.status)
}

export function buildSubscriptionPatch(subscription, existing, { planId = null, eventIso, nowIso }) {
  const status = mapStripeStatus(subscription.status)
  return {
    stripe_customer_id: stripeId(subscription.customer) ?? existing?.stripe_customer_id ?? null,
    stripe_subscription_id: subscription.id,
    status,
    plan_id: planId ?? existing?.plan_id ?? null,
    current_period_end: stripePeriodEnd(subscription),
    trial_end: fromUnix(subscription.trial_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    past_due_since: status === 'past_due' ? (existing?.status === 'past_due' && existing.past_due_since) || nowIso : null,
    last_event_at: eventIso,
  }
}

// invoice.payment_failed / invoice.paid: devuelven el cambio o null si no aplica.
export function buildInvoicePatch(type, existing, { eventIso, nowIso }) {
  if (!existing) return null
  if (type === 'invoice.payment_failed' && ['active', 'trialing', 'past_due'].includes(existing.status)) {
    return { status: 'past_due', past_due_since: (existing.status === 'past_due' && existing.past_due_since) || nowIso, last_event_at: eventIso }
  }
  if (type === 'invoice.paid' && ['past_due', 'unpaid'].includes(existing.status)) {
    return { status: 'active', past_due_since: null, last_event_at: eventIso }
  }
  return null
}

// ─── Acceso a datos ─────────────────────────────────────────────────────
async function single(db, column, value) {
  const { data, error } = await db.from('subscriptions').select('*').eq(column, value).maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function getWorkshopSubscription(db, workshopId) {
  const { data, error } = await db.from('subscriptions')
    .select('*,plan:plans(code,name,price_cents,currency,interval)')
    .eq('workshop_id', workshopId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export function serializeSubscription(row, { graceDays, now = Date.now() } = {}) {
  if (!row) return { status: null, plan: null, license: evaluateLicense(null, { now, graceDays }) }
  const license = evaluateLicense(row, { now, graceDays })
  return {
    status: row.status,
    plan: row.plan ?? null,
    trial_end: row.trial_end ?? null,
    current_period_end: row.current_period_end ?? null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    has_billing_account: Boolean(row.stripe_customer_id),
    license: { allowed: license.allowed, reason: license.reason, grace: license.grace, grace_until: license.graceUntil },
  }
}

// Prueba sin tarjeta al registrar un taller. No pisa una suscripción existente.
export async function ensureTrialSubscription({ db, workshopId, trialDays, now = Date.now() }) {
  if (!db || !workshopId || !(trialDays > 0)) return null
  const trialEnd = new Date(now + trialDays * DAY_MS).toISOString()
  const { error } = await db.from('subscriptions').upsert(
    { workshop_id: workshopId, status: 'trialing', trial_end: trialEnd },
    { onConflict: 'workshop_id', ignoreDuplicates: true },
  )
  if (error) throw error
  return trialEnd
}

async function planIdForSubscription(db, subscription, config) {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null
  if (!priceId) return null
  const { data, error } = await db.from('plans').select('id,interval,stripe_price_id')
  if (error) throw error
  const plans = data ?? []
  const byPrice = plans.find((plan) => plan.stripe_price_id === priceId)
  if (byPrice) return byPrice.id
  const interval = priceId === config.priceMonthly ? 'month' : priceId === config.priceYearly ? 'year' : null
  return plans.find((plan) => plan.interval === interval && !plan.stripe_price_id)?.id ?? plans.find((plan) => plan.interval === interval)?.id ?? null
}

// ─── Procesamiento de eventos ───────────────────────────────────────────
export function createBillingProcessor({ db, stripe, config, onChange = () => {}, now = () => Date.now() }) {
  async function record({ workshopId, previous, next, event }) {
    onChange(workshopId)
    const changed = previous?.status !== next.status || (previous?.cancel_at_period_end ?? false) !== (next.cancel_at_period_end ?? previous?.cancel_at_period_end ?? false)
    if (!changed) return
    await auditSafe(writeAudit({
      db, workshopId, action: 'SUBSCRIPTION_STATUS_CHANGED', entity: 'subscriptions', entityId: workshopId,
      description: `Suscripción: ${previous?.status ?? 'sin suscripción'} → ${next.status} (${event.type})`,
      oldValues: previous ? { status: previous.status, cancel_at_period_end: previous.cancel_at_period_end } : null,
      newValues: { status: next.status, cancel_at_period_end: next.cancel_at_period_end ?? previous?.cancel_at_period_end ?? false, stripe_event: event.id },
    }))
    // workshops.status es la suspensión manual de plataforma: no se toca aquí.
    // Solo se refleja el plan comercial para los listados de SUPER_ADMIN.
    const { error } = await db.from('workshops').update({ plan: VALID_STATUSES.includes(next.status) ? 'PRO' : 'FREE' }).eq('id', workshopId)
    if (error) console.error('No se pudo reflejar el plan del taller', { code: error.code ?? null })
  }

  async function syncSubscription({ subscription, workshopHint, event }) {
    const eventIso = new Date((event.created ?? now() / 1000) * 1000).toISOString()
    let workshopId = isUuid(workshopHint) ? workshopHint : null
    let existing = null
    if (workshopId) existing = await single(db, 'workshop_id', workshopId)
    else {
      existing = await single(db, 'stripe_subscription_id', subscription.id)
        ?? (stripeId(subscription.customer) ? await single(db, 'stripe_customer_id', stripeId(subscription.customer)) : null)
      workshopId = existing?.workshop_id ?? null
    }
    if (!workshopId) return { handled: false, reason: 'unknown_workshop' }
    if (!canApplySubscription(existing, subscription.id)) return { handled: false, reason: 'superseded_subscription' }
    if (existing && new Date(existing.last_event_at ?? 0).getTime() > new Date(eventIso).getTime()) return { handled: false, reason: 'stale_event' }

    const patch = buildSubscriptionPatch(subscription, existing, { planId: await planIdForSubscription(db, subscription, config), eventIso, nowIso: new Date(now()).toISOString() })
    if (existing) {
      const { data, error } = await db.from('subscriptions').update(patch).eq('workshop_id', workshopId).lte('last_event_at', eventIso).select('id')
      if (error) throw error
      if (!data?.length) return { handled: false, reason: 'stale_event' }
    } else {
      const { error } = await db.from('subscriptions').insert({ workshop_id: workshopId, ...patch })
      if (error?.code === '23503') return { handled: false, reason: 'unknown_workshop' }
      if (error) throw error
    }
    await record({ workshopId, previous: existing, next: patch, event })
    return { handled: true, workshopId, status: patch.status }
  }

  async function applyInvoice(event) {
    const subscriptionId = invoiceSubscriptionId(event.data.object)
    if (!subscriptionId) return { handled: false, reason: 'no_subscription' }
    const existing = await single(db, 'stripe_subscription_id', subscriptionId)
    const eventIso = new Date((event.created ?? now() / 1000) * 1000).toISOString()
    if (existing && new Date(existing.last_event_at ?? 0).getTime() > new Date(eventIso).getTime()) return { handled: false, reason: 'stale_event' }
    const patch = buildInvoicePatch(event.type, existing, { eventIso, nowIso: new Date(now()).toISOString() })
    if (!patch) return { handled: false, reason: 'no_transition' }
    const { data, error } = await db.from('subscriptions').update(patch).eq('workshop_id', existing.workshop_id).lte('last_event_at', eventIso).select('id')
    if (error) throw error
    if (!data?.length) return { handled: false, reason: 'stale_event' }
    await record({ workshopId: existing.workshop_id, previous: existing, next: patch, event })
    return { handled: true, workshopId: existing.workshop_id, status: patch.status }
  }

  return async function processEvent(event) {
    const object = event.data?.object ?? {}
    switch (event.type) {
      case 'checkout.session.completed': {
        if (object.mode !== 'subscription' || !object.subscription) return { handled: false, reason: 'not_subscription' }
        // Se relee la suscripción: es el estado actual aunque el evento llegue tarde.
        const subscription = await stripe.subscriptions.retrieve(stripeId(object.subscription))
        return syncSubscription({ subscription, workshopHint: object.client_reference_id ?? object.metadata?.workshop_id ?? subscription.metadata?.workshop_id, event })
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return syncSubscription({ subscription: object, workshopHint: object.metadata?.workshop_id ?? null, event })
      case 'invoice.payment_failed':
      case 'invoice.paid':
        return applyInvoice(event)
      default:
        return { handled: false, reason: 'ignored_type' }
    }
  }
}
