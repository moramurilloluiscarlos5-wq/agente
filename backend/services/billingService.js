import { auditSafe, writeAudit } from './auditService.js'
import { entitlementsFor } from '../config/plans.js'

// Mercado Pago es la fuente de verdad del cobro. Aquí solo se traduce el estado
// de sus suscripciones (preapproval) a la base de datos y se decide si una
// licencia permite usar el sistema y qué incluye.

const DAY_MS = 86_400_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAID_STATUSES = ['active', 'past_due']

export const isUuid = (value) => typeof value === 'string' && UUID.test(value)
const time = (value) => (value ? new Date(value).getTime() : null)
const isoOr = (value, fallback) => (value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : fallback)

// ─── Estado de Mercado Pago → estado interno ────────────────────────────
// `paused` no es un estado de la base: se trata como una cancelación al final del periodo.
export function mapPreapprovalStatus(status) {
  switch (status) {
    case 'authorized': return 'active'
    case 'pending': return 'incomplete'
    case 'paused': return 'paused'
    case 'cancelled': case 'canceled': return 'canceled'
    default: return 'unpaid' // estados desconocidos: sin acceso
  }
}

// ─── Decisión de licencia ───────────────────────────────────────────────
export function evaluateLicense(subscription, { now = Date.now(), graceDays = 10 } = {}) {
  if (!subscription) return { allowed: false, reason: 'no_subscription', grace: false, graceUntil: null }
  const graceMs = graceDays * DAY_MS

  switch (subscription.status) {
    case 'trialing': {
      const end = time(subscription.trial_end)
      return end != null && end > now
        ? { allowed: true, reason: 'trialing', grace: false, graceUntil: null }
        : { allowed: false, reason: 'trial_expired', grace: false, graceUntil: null }
    }
    case 'active': {
      const end = time(subscription.current_period_end)
      // Cancelada por el taller: conserva el acceso hasta el último día pagado.
      if (subscription.cancel_at_period_end && end != null && now > end) return { allowed: false, reason: 'canceled', grace: false, graceUntil: null }
      // Red de seguridad si se perdieron notificaciones: el periodo pagado venció
      // hace más que la gracia y Mercado Pago nunca avisó de la renovación ni de la baja.
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
  trial_expired: 'Tu periodo de prueba terminó. Elige un plan para seguir usando TallerFlow.',
  period_ended: 'Tu licencia venció. Contrata un plan para continuar.',
  past_due_expired: 'Mercado Pago no pudo cobrar tu suscripción y el periodo de gracia terminó. Contrata de nuevo con otra tarjeta para continuar.',
  canceled: 'Tu suscripción terminó. Elige un plan para volver a usar TallerFlow.',
  unpaid: 'Tu suscripción tiene pagos pendientes. Contrata de nuevo con otra tarjeta para continuar.',
  incomplete: 'Tu pago aún no se ha completado. Termina el pago en Mercado Pago para activar tu licencia.',
}

export const licenseMessage = (reason) => LICENSE_MESSAGES[reason] ?? 'Tu licencia no está activa. Revisa tu facturación para continuar.'

// Lo que incluye la licencia de un taller (ver config/plans.js).
export function entitlementsForSubscription(row) {
  if (row?.status === 'trialing') return entitlementsFor({ trial: true })
  return entitlementsFor({ tier: row?.plan?.tier ?? null })
}

// ─── Planes ↔ suscripciones de Mercado Pago ─────────────────────────────
export const monthsFor = (interval) => (interval === 'year' ? 12 : 1)

export function preapprovalRequest({ plan, workshopId, payerEmail, appPublicUrl }) {
  return {
    reason: `TallerFlow ${plan.name}`,
    external_reference: workshopId,
    payer_email: payerEmail,
    auto_recurring: { frequency: monthsFor(plan.interval), frequency_type: 'months', transaction_amount: plan.price_cents / 100, currency_id: plan.currency.toUpperCase() },
    back_url: `${appPublicUrl}/facturacion?checkout=success`,
    status: 'pending',
  }
}

// El plan se reconoce por frecuencia, monto y moneda: así un cambio de monto hecho en
// Mercado Pago se refleja sin depender de datos que envíe el navegador.
export function planForPreapproval(plans, preapproval) {
  const recurring = preapproval?.auto_recurring ?? {}
  const months = recurring.frequency_type === 'months' ? Number(recurring.frequency) : null
  const interval = months === 12 ? 'year' : months === 1 ? 'month' : null
  const cents = Math.round(Number(recurring.transaction_amount) * 100)
  const currency = String(recurring.currency_id ?? '').toLowerCase()
  const matches = (plans ?? []).filter((plan) => plan.interval === interval && plan.price_cents === cents && (!currency || plan.currency === currency))
  return matches.find((plan) => plan.active !== false) ?? matches[0] ?? null
}

// ─── Transiciones de estado (puras, sin I/O) ────────────────────────────
// Devuelve el cambio para la fila del taller o null si no aplica.
export function buildPreapprovalPatch(preapproval, existing, { planId = null, versionIso, now = Date.now() }) {
  const same = existing?.provider_subscription_id === preapproval.id
  const mapped = mapPreapprovalStatus(preapproval.status)
  if (mapped === 'incomplete') return null // checkout sin pagar: no cambia una licencia vigente
  const keep = (column) => (same ? existing?.[column] ?? null : null)
  const base = {
    provider_subscription_id: preapproval.id,
    provider_customer_id: preapproval.payer_id != null ? String(preapproval.payer_id) : keep('provider_customer_id'),
    plan_id: planId ?? keep('plan_id'),
    last_event_at: versionIso,
  }

  if (mapped === 'active') {
    // Una suscripción autorizada sigue así mientras Mercado Pago reintenta un cobro:
    // solo un cobro aprobado saca al taller de past_due.
    const status = same && existing.status === 'past_due' ? 'past_due' : 'active'
    return {
      ...base, status, cancel_at_period_end: false,
      current_period_end: isoOr(preapproval.next_payment_date, keep('current_period_end')),
      past_due_since: status === 'past_due' ? existing.past_due_since ?? new Date(now).toISOString() : null,
    }
  }

  if (mapped === 'paused' || mapped === 'canceled') {
    const paidThrough = keep('current_period_end')
    const stillPaid = same && existing.status === 'active' && time(paidThrough) != null && time(paidThrough) > now
    return stillPaid
      ? { ...base, status: 'active', cancel_at_period_end: true, current_period_end: paidThrough, past_due_since: null }
      : { ...base, status: 'canceled', cancel_at_period_end: false, current_period_end: paidThrough, past_due_since: null }
  }

  return { ...base, status: 'unpaid', cancel_at_period_end: false, past_due_since: null }
}

// Resultado de un cobro recurrente (authorized_payment): rechazado → past_due, aprobado → active.
export function buildPaymentPatch(payment, existing, { versionIso, nowIso }) {
  if (!existing || existing.provider_subscription_id !== String(payment.preapproval_id)) return null
  const paymentStatus = payment.payment?.status ?? null
  const approved = paymentStatus === 'approved'
  const failed = payment.status === 'recycling' || paymentStatus === 'rejected'
  if (approved && ['past_due', 'unpaid'].includes(existing.status)) return { status: 'active', past_due_since: null, last_payment_at: versionIso }
  if (failed && PAID_STATUSES.includes(existing.status) && !existing.cancel_at_period_end) {
    return { status: 'past_due', past_due_since: (existing.status === 'past_due' && existing.past_due_since) || nowIso, last_payment_at: versionIso }
  }
  return approved || failed ? { last_payment_at: versionIso } : null
}

// ─── Acceso a datos ─────────────────────────────────────────────────────
async function single(db, column, value) {
  const { data, error } = await db.from('subscriptions').select('*').eq(column, value).maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function getWorkshopSubscription(db, workshopId) {
  const { data, error } = await db.from('subscriptions')
    .select('*,plan:plans(code,name,tier,price_cents,currency,interval)')
    .eq('workshop_id', workshopId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function countActiveUsers(db, workshopId) {
  const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('workshop_id', workshopId).eq('is_active', true)
  if (error) throw error
  return count ?? 0
}

// Licencias apagadas: todo incluido y sin límites.
export async function loadWorkshopEntitlements({ db, workshopId, enabled = true }) {
  if (!enabled || !workshopId) return entitlementsFor({ unlimited: true })
  return entitlementsForSubscription(await getWorkshopSubscription(db, workshopId))
}

// El último día cuenta completo: a 3,5 días del final quedan 4.
const daysUntil = (value, now) => Math.max(0, Math.ceil((time(value) - now) / DAY_MS))

// Lo que la sesión necesita saber de la licencia (/auth/me) para avisar de la prueba, de un
// cobro pendiente o del bloqueo desde el inicio de sesión. Cada ruta lo vuelve a validar.
export function licenseSummary(row, { graceDays, now = Date.now() } = {}) {
  const license = evaluateLicense(row, { now, graceDays })
  const trialing = row?.status === 'trialing'
  return {
    enabled: true,
    allowed: license.allowed,
    reason: license.reason,
    message: license.allowed ? null : licenseMessage(license.reason),
    status: row?.status ?? null,
    trial_end: trialing ? row.trial_end ?? null : null,
    days_left: trialing && license.allowed ? daysUntil(row.trial_end, now) : null,
    current_period_end: row?.current_period_end ?? null,
    cancel_at_period_end: Boolean(row?.cancel_at_period_end),
    grace_until: license.graceUntil,
  }
}

// Licencia y lo que incluye el plan con una sola lectura. Licencias apagadas o sin taller: sin bloqueo.
export async function loadWorkshopAccess({ db, workshopId, enabled = true, graceDays = 10, now = Date.now() }) {
  if (!enabled || !workshopId) return { entitlements: entitlementsFor({ unlimited: true }), license: { enabled: Boolean(enabled), allowed: true, reason: enabled ? 'unlimited' : 'disabled' } }
  const row = await getWorkshopSubscription(db, workshopId)
  return { entitlements: entitlementsForSubscription(row), license: licenseSummary(row, { graceDays, now }) }
}

// Códigos de PostgREST/Postgres que significan "falta una migración", no un fallo pasajero.
const MISSING_SCHEMA = new Set(['PGRST205', 'PGRST200', 'PGRST204', '42P01', '42703'])

// ¿Tiene la base las tablas y columnas de licencias (migraciones 019 y 020)?
// `missing: true` solo cuando la respuesta lo confirma; un error de red no cuenta.
export async function checkLicensingSchema(db) {
  try {
    const { error } = await db.from('subscriptions').select('workshop_id,provider_subscription_id,last_payment_at,plan:plans(tier)').limit(1)
    if (!error) return { ok: true, missing: false }
    return { ok: false, missing: MISSING_SCHEMA.has(error.code) }
  } catch {
    return { ok: false, missing: false }
  }
}

export function serializeSubscription(row, { graceDays, now = Date.now(), activeUsers = null } = {}) {
  const license = evaluateLicense(row, { now, graceDays })
  const entitlements = entitlementsForSubscription(row)
  const base = { license: { allowed: license.allowed, reason: license.reason, grace: license.grace, grace_until: license.graceUntil }, entitlements, usage: { active_users: activeUsers, max_users: entitlements.max_users } }
  if (!row) return { status: null, plan: null, ...base }
  return {
    status: row.status,
    plan: row.plan ?? null,
    trial_end: row.trial_end ?? null,
    current_period_end: row.current_period_end ?? null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    has_billing_account: Boolean(row.provider_subscription_id),
    ...base,
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

// ─── Procesamiento de notificaciones ────────────────────────────────────
export function createBillingProcessor({ db, mp, onChange = () => {}, now = () => Date.now() }) {
  async function loadPlans() {
    const { data, error } = await db.from('plans').select('id,code,name,tier,interval,price_cents,currency,active')
    if (error) throw error
    return data ?? []
  }

  async function record({ workshopId, previous, next, source, plans }) {
    onChange(workshopId)
    const status = next.status ?? previous?.status
    const cancel = next.cancel_at_period_end ?? previous?.cancel_at_period_end ?? false
    const planId = next.plan_id !== undefined ? next.plan_id : previous?.plan_id ?? null
    const statusChanged = previous?.status !== status || (previous?.cancel_at_period_end ?? false) !== cancel
    const planChanged = (previous?.plan_id ?? null) !== planId
    if (!statusChanged && !planChanged) return
    const plan = plans.find((row) => row.id === planId) ?? null
    const previousPlan = plans.find((row) => row.id === previous?.plan_id) ?? null
    if (statusChanged) {
      await auditSafe(writeAudit({
        db, workshopId, action: 'SUBSCRIPTION_STATUS_CHANGED', entity: 'subscriptions', entityId: workshopId,
        description: `Suscripción: ${previous?.status ?? 'sin suscripción'} → ${status}${cancel ? ' (termina al final del periodo)' : ''} (${source})`,
        oldValues: previous ? { status: previous.status, cancel_at_period_end: previous.cancel_at_period_end ?? false } : null,
        newValues: { status, cancel_at_period_end: cancel, source },
      }))
    }
    if (planChanged) {
      await auditSafe(writeAudit({
        db, workshopId, action: 'PLAN_CHANGED', entity: 'subscriptions', entityId: workshopId,
        description: `Plan: ${previousPlan?.name ?? 'sin plan'} → ${plan?.name ?? 'sin plan'}`,
        oldValues: { plan: previousPlan?.code ?? null }, newValues: { plan: plan?.code ?? null, source },
      }))
    }
    // workshops.status es la suspensión manual de plataforma: no se toca aquí.
    // Solo se refleja el nivel contratado para los listados de SUPER_ADMIN.
    const paid = PAID_STATUSES.includes(status) && plan?.tier
    const { error } = await db.from('workshops').update({ plan: paid ? plan.tier.toUpperCase() : 'FREE' }).eq('id', workshopId)
    if (error) console.error('No se pudo reflejar el plan del taller', { code: error.code ?? null })
  }

  async function write({ workshopId, existing, patch, guardColumn, guardValue }) {
    if (existing) {
      let query = db.from('subscriptions').update(patch).eq('workshop_id', workshopId)
      if (guardColumn) query = query.lte(guardColumn, guardValue)
      const { data, error } = await query.select('id')
      if (error) throw error
      return Boolean(data?.length)
    }
    const { error } = await db.from('subscriptions').insert({ workshop_id: workshopId, ...patch })
    if (error?.code === '23503') return null
    if (error) throw error
    return true
  }

  // Aplica el estado actual de una suscripción de Mercado Pago a la fila del taller.
  async function syncPreapproval(preapproval, { source = 'mercadopago' } = {}) {
    if (!preapproval?.id) return { handled: false, reason: 'no_subscription' }
    let workshopId = isUuid(preapproval.external_reference) ? preapproval.external_reference : null
    let existing = workshopId ? await single(db, 'workshop_id', workshopId) : await single(db, 'provider_subscription_id', preapproval.id)
    workshopId = workshopId ?? existing?.workshop_id ?? null
    if (!workshopId) return { handled: false, reason: 'unknown_workshop' }

    const same = existing?.provider_subscription_id === preapproval.id
    const mapped = mapPreapprovalStatus(preapproval.status)
    // Otra suscripción del mismo taller solo reemplaza a la guardada cuando ya está autorizada.
    if (existing?.provider_subscription_id && !same && mapped !== 'active') return { handled: false, reason: 'superseded_subscription' }
    if (!existing?.provider_subscription_id && mapped !== 'active') return { handled: false, reason: mapped === 'incomplete' ? 'pending_checkout' : 'not_authorized' }

    const versionIso = isoOr(preapproval.last_modified ?? preapproval.date_created, new Date(now()).toISOString())
    if (same && time(existing.last_event_at) > time(versionIso)) return { handled: false, reason: 'stale_event' }

    const plans = await loadPlans()
    const plan = planForPreapproval(plans, preapproval)
    const patch = buildPreapprovalPatch(preapproval, existing, { planId: plan?.id ?? null, versionIso, now: now() })
    if (!patch) return { handled: false, reason: 'no_transition' }
    const written = await write({ workshopId, existing, patch, ...(same ? { guardColumn: 'last_event_at', guardValue: versionIso } : {}) })
    if (written === null) return { handled: false, reason: 'unknown_workshop' }
    if (!written) return { handled: false, reason: 'stale_event' }

    // La suscripción anterior seguiría cobrando: se cancela en Mercado Pago para no cobrar doble.
    const replaced = existing?.provider_subscription_id && !same && PAID_STATUSES.includes(existing.status) && !existing.cancel_at_period_end
    if (replaced) {
      try { await mp.updatePreapproval(existing.provider_subscription_id, { status: 'canceled' }) } catch (error) {
        console.error('No se pudo cancelar la suscripción reemplazada en Mercado Pago', { workshopId, status: error?.providerStatus ?? null })
      }
    }
    await record({ workshopId, previous: existing, next: patch, source, plans })
    return { handled: true, workshopId, status: patch.status }
  }

  async function applyPayment(payment, { source }) {
    const existing = await single(db, 'provider_subscription_id', String(payment.preapproval_id))
    if (!existing) return { handled: false, reason: 'unknown_subscription' }
    const versionIso = isoOr(payment.last_modified ?? payment.date_created, new Date(now()).toISOString())
    if (time(existing.last_payment_at) > time(versionIso)) return { handled: false, reason: 'stale_event' }
    const patch = buildPaymentPatch(payment, existing, { versionIso, nowIso: new Date(now()).toISOString() })
    if (!patch) return { handled: false, reason: 'no_transition' }
    const written = await write({ workshopId: existing.workshop_id, existing, patch, guardColumn: 'last_payment_at', guardValue: versionIso })
    if (!written) return { handled: false, reason: 'stale_event' }
    if (patch.status) await record({ workshopId: existing.workshop_id, previous: existing, next: patch, source, plans: await loadPlans() })
    return { handled: Boolean(patch.status), workshopId: existing.workshop_id, status: patch.status ?? existing.status }
  }

  // Cada notificación solo dice qué cambió; el estado se vuelve a leer de Mercado Pago.
  async function processNotification({ type, dataId }) {
    switch (type) {
      case 'subscription_preapproval':
        return syncPreapproval(await mp.getPreapproval(dataId), { source: type })
      case 'subscription_authorized_payment': {
        const payment = await mp.getAuthorizedPayment(dataId)
        if (!payment?.preapproval_id) return { handled: false, reason: 'no_subscription' }
        const synced = await syncPreapproval(await mp.getPreapproval(payment.preapproval_id), { source: type })
        const applied = await applyPayment(payment, { source: type })
        return { handled: synced.handled || applied.handled, workshopId: applied.workshopId ?? synced.workshopId, status: applied.status ?? synced.status }
      }
      default:
        return { handled: false, reason: 'ignored_type' }
    }
  }

  return { processNotification, syncPreapproval }
}
