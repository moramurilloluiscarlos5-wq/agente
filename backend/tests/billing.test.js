import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import Stripe from 'stripe'
import { createFakeDb } from './helpers/fakeBillingDb.js'
import { createBillingRouter, createBillingWebhookHandler } from '../routes/billing.routes.js'
import { createLicenseMiddleware, invalidateLicenseCache } from '../middleware/license.js'
import { assertBillingConfig, loadBillingConfig, licensingEnabled } from '../config/billing.js'
import { evaluateLicense, ensureTrialSubscription, mapStripeStatus } from '../services/billingService.js'

// Estas pruebas asumen licencias activas aunque el .env local las apague (LICENSING_ENABLED=false).
process.env.LICENSING_ENABLED = 'true'

const WORKSHOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DAY = 86_400_000
const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  STRIPE_PRICE_MONTHLY: 'price_month', STRIPE_PRICE_YEARLY: 'price_year',
  APP_PUBLIC_URL: 'https://app.example.com', TRIAL_DAYS: '14', BILLING_GRACE_DAYS: '7',
}
const signer = new Stripe(ENV.STRIPE_SECRET_KEY)
const unix = (ms) => Math.floor(ms / 1000)

function stripeStub(subscriptions = {}) {
  return {
    webhooks: signer.webhooks,
    subscriptions: { retrieve: async (id) => subscriptions[id] },
    checkout: { sessions: { create: async (params) => { stripeStub.lastCheckout = params; return { url: 'https://checkout.stripe.test/s' } } } },
    billingPortal: { sessions: { create: async (params) => { stripeStub.lastPortal = params; return { url: 'https://billing.stripe.test/p' } } } },
  }
}

const stripeSub = (overrides = {}) => ({
  id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { workshop_id: WORKSHOP },
  cancel_at_period_end: false, trial_end: null, items: { data: [{ price: { id: 'price_month' }, current_period_end: unix(Date.now() + 30 * DAY) }] },
  ...overrides,
})
let eventCounter = 0
const stripeEvent = (type, object, created = unix(Date.now())) => ({ id: `evt_${++eventCounter}`, object: 'event', type, created, data: { object } })

function seededDb(subscription) {
  return createFakeDb({
    workshops: [{ id: WORKSHOP, plan: 'FREE' }, { id: OTHER, plan: 'FREE' }],
    plans: [{ id: 'plan-m', code: 'base_monthly', price_cents: 2900, currency: 'usd', interval: 'month', stripe_price_id: null, active: true },
      { id: 'plan-y', code: 'base_yearly', price_cents: 29000, currency: 'usd', interval: 'year', stripe_price_id: null, active: true }],
    subscriptions: subscription ? [{ workshop_id: WORKSHOP, last_event_at: new Date(0).toISOString(), ...subscription }] : [],
  })
}

async function serveWebhook(t, db, stripe = stripeStub()) {
  const app = express()
  app.post('/webhook', express.raw({ type: 'application/json' }), createBillingWebhookHandler({ db, env: () => ENV, stripe, onChange: invalidateLicenseCache }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return async (event, { secret = ENV.STRIPE_WEBHOOK_SECRET, signature } = {}) => {
    const payload = JSON.stringify(event)
    const header = signature === undefined ? signer.webhooks.generateTestHeaderString({ payload, secret }) : signature
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...(header ? { 'stripe-signature': header } : {}) }, body: payload })
    return { status: response.status, body: await response.json() }
  }
}

// ─── Configuración ──────────────────────────────────────────────────────
test('configuración: valida variables y no filtra valores', () => {
  assert.equal(loadBillingConfig(ENV).ok, true)
  assert.equal(loadBillingConfig(ENV).config.testMode, true)
  const missing = loadBillingConfig({ ...ENV, STRIPE_SECRET_KEY: '', STRIPE_PRICE_YEARLY: 'nope' })
  assert.equal(missing.ok, false)
  assert.match(missing.problems.join(), /STRIPE_SECRET_KEY/)
  assert.match(missing.problems.join(), /STRIPE_PRICE_YEARLY/)
  assert.throws(() => assertBillingConfig({ ...ENV, STRIPE_WEBHOOK_SECRET: 'whsec_super_secret_value', APP_PUBLIC_URL: 'http://x.com', NODE_ENV: 'production' }),
    (error) => /APP_PUBLIC_URL/.test(error.message) && !error.message.includes('super_secret_value'))
  assert.equal(loadBillingConfig({ ...ENV, TRIAL_DAYS: 'abc' }).ok, false)
})

test('configuración: LICENSING_ENABLED=false solo se apaga con "false"', () => {
  assert.equal(licensingEnabled({}), true)
  assert.equal(licensingEnabled({ LICENSING_ENABLED: 'true' }), true)
  assert.equal(licensingEnabled({ LICENSING_ENABLED: ' FALSE ' }), false)
})

test('middleware: con licencias apagadas deja pasar sin consultar la BD', async () => {
  const previous = process.env.LICENSING_ENABLED
  process.env.LICENSING_ENABLED = 'false'
  try {
    const broken = { from: () => { throw new Error('no debe consultarse') } }
    assert.equal((await runLicense(broken, { role: 'OWNER', workshop_id: WORKSHOP })).nextCalled, true)
  } finally {
    if (previous === undefined) delete process.env.LICENSING_ENABLED
    else process.env.LICENSING_ENABLED = previous
  }
})

// ─── Licencia: decisión ─────────────────────────────────────────────────
test('licencia: activo, prueba, vencido, gracia y sin suscripción', () => {
  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  assert.equal(evaluateLicense(null, { now }).allowed, false)
  assert.equal(evaluateLicense(null, { now }).reason, 'no_subscription')
  assert.equal(evaluateLicense({ status: 'active', current_period_end: iso(now + DAY) }, { now }).allowed, true)
  assert.equal(evaluateLicense({ status: 'active', current_period_end: iso(now - 30 * DAY) }, { now }).reason, 'period_ended')
  assert.equal(evaluateLicense({ status: 'trialing', trial_end: iso(now + DAY) }, { now }).allowed, true)
  assert.equal(evaluateLicense({ status: 'trialing', trial_end: iso(now - 1) }, { now }).reason, 'trial_expired')
  const grace = evaluateLicense({ status: 'past_due', past_due_since: iso(now - 3 * DAY) }, { now, graceDays: 7 })
  assert.deepEqual([grace.allowed, grace.grace], [true, true])
  assert.equal(evaluateLicense({ status: 'past_due', past_due_since: iso(now - 8 * DAY) }, { now, graceDays: 7 }).allowed, false)
  for (const status of ['canceled', 'unpaid', 'incomplete']) assert.equal(evaluateLicense({ status }, { now }).allowed, false)
  assert.equal(mapStripeStatus('incomplete_expired'), 'canceled')
  assert.equal(mapStripeStatus('paused'), 'unpaid')
})

// ─── Middleware ─────────────────────────────────────────────────────────
async function runLicense(db, profile, graceDays = 7) {
  invalidateLicenseCache()
  const middleware = createLicenseMiddleware({ db, graceDays: () => graceDays, ttlMs: 0 })
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  let nextCalled = false
  await middleware({ profile }, res, () => { nextCalled = true })
  return { res, nextCalled }
}

test('middleware: permite activo y rechaza con 402 LICENSE_REQUIRED', async () => {
  const profile = { role: 'OWNER', workshop_id: WORKSHOP }
  const active = await runLicense(seededDb({ status: 'active', current_period_end: new Date(Date.now() + DAY).toISOString() }), profile)
  assert.equal(active.nextCalled, true)
  const none = await runLicense(seededDb(null), profile)
  assert.equal(none.nextCalled, false)
  assert.equal(none.res.statusCode, 402)
  assert.equal(none.res.body.code, 'LICENSE_REQUIRED')
  const expired = await runLicense(seededDb({ status: 'canceled' }), profile)
  assert.equal(expired.res.statusCode, 402)
  const grace = await runLicense(seededDb({ status: 'past_due', past_due_since: new Date(Date.now() - 2 * DAY).toISOString() }), profile)
  assert.equal(grace.nextCalled, true)
  const lapsed = await runLicense(seededDb({ status: 'past_due', past_due_since: new Date(Date.now() - 9 * DAY).toISOString() }), profile)
  assert.equal(lapsed.res.statusCode, 402)
})

test('middleware: SUPER_ADMIN pasa, errores de BD fallan cerrado', async () => {
  assert.equal((await runLicense(seededDb(null), { role: 'SUPER_ADMIN', workshop_id: null })).nextCalled, true)
  const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: 'XX000' } }) }) }) }) }
  const result = await runLicense(broken, { role: 'OWNER', workshop_id: WORKSHOP })
  assert.equal(result.nextCalled, false)
  assert.equal(result.res.statusCode, 503)
})

// ─── Webhook: firma e idempotencia ──────────────────────────────────────
test('webhook: rechaza firma ausente, incorrecta o manipulada', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: new Date(Date.now() + DAY).toISOString() })
  const post = await serveWebhook(t, db)
  const event = stripeEvent('customer.subscription.updated', stripeSub())
  assert.equal((await post(event, { signature: null })).status, 400)
  assert.equal((await post(event, { secret: 'whsec_otra' })).status, 400)
  assert.equal((await post(event, { signature: 't=1,v1=abc' })).status, 400)
  assert.equal(db.tables.billing_events.length, 0)
  assert.equal(db.tables.subscriptions[0].status, 'trialing')
})

test('webhook: es idempotente por provider_event_id', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: new Date(Date.now() + DAY).toISOString() })
  const post = await serveWebhook(t, db)
  const event = stripeEvent('customer.subscription.created', stripeSub())
  const first = await post(event)
  assert.deepEqual([first.status, first.body.handled], [200, true])
  const auditCount = db.tables.audit_logs.length
  const second = await post(event)
  assert.deepEqual([second.status, second.body.duplicate], [200, true])
  assert.equal(db.tables.billing_events.length, 1)
  assert.ok(db.tables.billing_events[0].processed_at)
  assert.equal(db.tables.audit_logs.length, auditCount)
})

test('webhook: reintenta un evento recibido pero no procesado', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: new Date(Date.now() + DAY).toISOString() })
  const event = stripeEvent('customer.subscription.created', stripeSub())
  db.tables.billing_events.push({ provider_event_id: event.id, type: event.type, processed_at: null })
  const post = await serveWebhook(t, db)
  assert.equal((await post(event)).body.handled, true)
  assert.equal(db.tables.subscriptions[0].status, 'active')
})

test('webhook: un fallo de procesamiento responde 500 sin marcar procesado', async (t) => {
  const db = seededDb(null)
  const stripe = stripeStub()
  stripe.subscriptions.retrieve = async () => { throw new Error('stripe caído') }
  const post = await serveWebhook(t, db, stripe)
  const event = stripeEvent('checkout.session.completed', { mode: 'subscription', subscription: 'sub_1', client_reference_id: WORKSHOP })
  assert.equal((await post(event)).status, 500)
  assert.equal(db.tables.billing_events[0].processed_at ?? null, null)
})

// ─── Webhook: transiciones de estado ────────────────────────────────────
test('transiciones: checkout completado activa la licencia y audita', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: new Date(Date.now() + DAY).toISOString() })
  const post = await serveWebhook(t, db, stripeStub({ sub_1: stripeSub() }))
  const result = await post(stripeEvent('checkout.session.completed', { mode: 'subscription', subscription: 'sub_1', client_reference_id: WORKSHOP, customer: 'cus_1' }))
  assert.equal(result.body.handled, true)
  const row = db.tables.subscriptions[0]
  assert.deepEqual([row.status, row.stripe_subscription_id, row.stripe_customer_id, row.plan_id], ['active', 'sub_1', 'cus_1', 'plan-m'])
  assert.equal(db.tables.workshops[0].plan, 'PRO')
  assert.equal(db.tables.audit_logs.at(-1).action, 'SUBSCRIPTION_STATUS_CHANGED')
})

test('transiciones: pago fallido → past_due y pago exitoso → active', async (t) => {
  const db = seededDb({ status: 'active', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' })
  const post = await serveWebhook(t, db)
  const now = unix(Date.now())
  await post(stripeEvent('invoice.payment_failed', { subscription: 'sub_1' }, now + 1))
  assert.equal(db.tables.subscriptions[0].status, 'past_due')
  assert.ok(db.tables.subscriptions[0].past_due_since)
  await post(stripeEvent('invoice.paid', { parent: { subscription_details: { subscription: 'sub_1' } } }, now + 2))
  assert.deepEqual([db.tables.subscriptions[0].status, db.tables.subscriptions[0].past_due_since], ['active', null])
})

test('transiciones: cancelación, impago y re-suscripción', async (t) => {
  const db = seededDb({ status: 'active', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' })
  const post = await serveWebhook(t, db)
  const now = unix(Date.now())
  await post(stripeEvent('customer.subscription.deleted', stripeSub({ status: 'canceled' }), now + 1))
  assert.equal(db.tables.subscriptions[0].status, 'canceled')
  assert.equal(db.tables.workshops[0].plan, 'FREE')
  await post(stripeEvent('customer.subscription.updated', stripeSub({ status: 'unpaid' }), now + 2))
  assert.equal(db.tables.subscriptions[0].status, 'unpaid')
  await post(stripeEvent('customer.subscription.created', stripeSub({ id: 'sub_2', status: 'active' }), now + 3))
  assert.deepEqual([db.tables.subscriptions[0].status, db.tables.subscriptions[0].stripe_subscription_id], ['active', 'sub_2'])
})

test('transiciones: eventos viejos y suscripciones ajenas no pisan el estado', async (t) => {
  const db = seededDb({ status: 'active', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1', last_event_at: new Date().toISOString() })
  const post = await serveWebhook(t, db)
  const stale = await post(stripeEvent('customer.subscription.deleted', stripeSub({ status: 'canceled' }), unix(Date.now() - DAY)))
  assert.equal(stale.body.handled, false)
  assert.equal(db.tables.subscriptions[0].status, 'active')
  const other = await post(stripeEvent('customer.subscription.updated', stripeSub({ id: 'sub_otra', status: 'canceled' }), unix(Date.now() + DAY)))
  assert.equal(other.body.handled, false)
  assert.equal(db.tables.subscriptions[0].stripe_subscription_id, 'sub_1')
})

test('transiciones: tipos desconocidos y talleres inexistentes se ignoran con 200', async (t) => {
  const db = seededDb(null)
  const post = await serveWebhook(t, db)
  assert.equal((await post(stripeEvent('charge.refunded', {}))).body.handled, false)
  const ghost = stripeSub({ metadata: { workshop_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } })
  const result = await post(stripeEvent('customer.subscription.created', ghost))
  assert.deepEqual([result.status, result.body.handled], [200, false])
  assert.equal(db.tables.subscriptions.length, 0)
})

test('integración: ciclo completo registro → compra → fallo → cancelación con el middleware', async (t) => {
  const db = seededDb(null)
  await ensureTrialSubscription({ db, workshopId: WORKSHOP, trialDays: 14 })
  await ensureTrialSubscription({ db, workshopId: WORKSHOP, trialDays: 14 })
  assert.equal(db.tables.subscriptions.length, 1)
  const profile = { role: 'OWNER', workshop_id: WORKSHOP }
  assert.equal((await runLicense(db, profile)).nextCalled, true)

  const post = await serveWebhook(t, db, stripeStub({ sub_1: stripeSub() }))
  const now = unix(Date.now())
  await post(stripeEvent('checkout.session.completed', { mode: 'subscription', subscription: 'sub_1', client_reference_id: WORKSHOP }, now))
  assert.equal(db.tables.subscriptions[0].status, 'active')
  assert.equal((await runLicense(db, profile)).nextCalled, true)

  await post(stripeEvent('invoice.payment_failed', { subscription: 'sub_1' }, now + 1))
  assert.equal((await runLicense(db, profile)).nextCalled, true)
  db.tables.subscriptions[0].past_due_since = new Date(Date.now() - 10 * DAY).toISOString()
  assert.equal((await runLicense(db, profile)).res.statusCode, 402)

  await post(stripeEvent('customer.subscription.deleted', stripeSub({ status: 'canceled' }), now + 2))
  assert.equal((await runLicense(db, profile)).res.body.reason, 'canceled')
})

// ─── Rutas /api/billing ─────────────────────────────────────────────────
async function serveBilling(t, db, profile, options = {}) {
  const stripe = stripeStub()
  const app = express()
  app.use(express.json())
  const authenticate = [(req, _res, next) => { req.authUserId = 'user-1'; req.profile = profile; next() }]
  app.use('/billing', createBillingRouter({ db, authenticate, env: () => options.env ?? ENV, stripe, checkoutLimiter: options.limiter ?? ((_req, _res, next) => next()) }))
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/billing${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
    return { status: response.status, body: await response.json() }
  }
}

const owner = { id: 'user-1', role: 'OWNER', workshop_id: WORKSHOP, workspace_access: 'ACTIVE', email: 'o@example.com' }

test('rutas: /plans es público y no expone ids de Stripe', async (t) => {
  const db = seededDb(null)
  db.tables.plans[0].stripe_price_id = 'price_secreto_interno'
  const request = await serveBilling(t, db, owner)
  const result = await request('/plans')
  assert.equal(result.status, 200)
  assert.equal(result.body.data.length, 2)
  assert.equal(result.body.trial_days, 14)
  assert.ok(!JSON.stringify(result.body).includes('price_secreto_interno'))
})

test('rutas: checkout usa el taller de la sesión, nunca el del body', async (t) => {
  const request = await serveBilling(t, seededDb({ status: 'trialing', trial_end: new Date(Date.now() + DAY).toISOString() }), owner)
  const result = await request('/checkout', { interval: 'year', workshop_id: OTHER, price: 'price_hack' })
  assert.deepEqual([result.status, result.body.data.url], [200, 'https://checkout.stripe.test/s'])
  const params = stripeStub.lastCheckout
  assert.equal(params.mode, 'subscription')
  assert.equal(params.client_reference_id, WORKSHOP)
  assert.equal(params.metadata.workshop_id, WORKSHOP)
  assert.equal(params.subscription_data.metadata.workshop_id, WORKSHOP)
  assert.equal(params.line_items[0].price, 'price_year')
  assert.equal(params.success_url, 'https://app.example.com/facturacion?checkout=success')
})

test('rutas: checkout valida rol, taller, estado, duplicados y configuración', async (t) => {
  const trial = { status: 'trialing', trial_end: new Date(Date.now() + DAY).toISOString() }
  assert.equal((await (await serveBilling(t, seededDb(trial), { ...owner, role: 'TECNICO' }))('/checkout', { interval: 'month' })).status, 403)
  assert.equal((await (await serveBilling(t, seededDb(trial), { ...owner, workshop_id: null }))('/checkout', { interval: 'month' })).status, 403)
  assert.equal((await (await serveBilling(t, seededDb(trial), { ...owner, workspace_access: 'SUSPENDED' }))('/checkout', { interval: 'month' })).status, 403)
  assert.equal((await (await serveBilling(t, seededDb(trial), owner))('/checkout', {})).status, 400)
  assert.equal((await (await serveBilling(t, seededDb(trial), owner))('/checkout', { plan: 'no_existe' })).status, 404)
  const subscribed = seededDb({ status: 'active', stripe_subscription_id: 'sub_1' })
  assert.equal((await (await serveBilling(t, subscribed, owner))('/checkout', { interval: 'month' })).body.code, 'ALREADY_SUBSCRIBED')
  const unconfigured = await (await serveBilling(t, seededDb(trial), owner, { env: {} }))('/checkout', { interval: 'month' })
  assert.deepEqual([unconfigured.status, unconfigured.body.code], [503, 'BILLING_NOT_CONFIGURED'])
})

test('rutas: checkout aplica el limitador de peticiones', async (t) => {
  const request = await serveBilling(t, seededDb(null), owner, { limiter: (_req, res) => res.status(429).json({ message: 'límite' }) })
  assert.equal((await request('/checkout', { interval: 'month' })).status, 429)
})

test('rutas: portal solo para OWNER con cliente de Stripe', async (t) => {
  const withCustomer = seededDb({ status: 'active', stripe_customer_id: 'cus_1' })
  const ok = await (await serveBilling(t, withCustomer, owner))('/portal', {})
  assert.deepEqual([ok.status, ok.body.data.url], [200, 'https://billing.stripe.test/p'])
  assert.equal(stripeStub.lastPortal.customer, 'cus_1')
  assert.equal((await (await serveBilling(t, withCustomer, { ...owner, role: 'ADMINISTRADOR' }))('/portal', {})).status, 403)
  assert.equal((await (await serveBilling(t, seededDb({ status: 'trialing' }), owner))('/portal', {})).body.code, 'NO_BILLING_ACCOUNT')
})

test('rutas: /subscription devuelve el estado sin ids de Stripe y solo para administradores', async (t) => {
  const db = seededDb({ status: 'past_due', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', past_due_since: new Date(Date.now() - DAY).toISOString() })
  const result = await (await serveBilling(t, db, owner))('/subscription')
  assert.equal(result.body.data.status, 'past_due')
  assert.equal(result.body.data.license.grace, true)
  assert.equal(result.body.data.has_billing_account, true)
  assert.ok(!JSON.stringify(result.body).includes('cus_1'))
  assert.equal((await (await serveBilling(t, db, { ...owner, role: 'CAJERO' }))('/subscription')).status, 403)
})
