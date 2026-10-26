import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createFakeDb } from './helpers/fakeBillingDb.js'
import { createBillingRouter, createBillingWebhookHandler } from '../routes/billing.routes.js'
import { createAuthRouter } from '../routes/auth.routes.js'
import { createLicenseMiddleware, invalidateLicenseCache, requireFeature } from '../middleware/license.js'
import { assertBillingConfig, loadBillingConfig, licensingEnabled } from '../config/billing.js'
import { entitlementsFor, minimumTierFor } from '../config/plans.js'
import { LICENSE_MESSAGES, checkLicensingSchema, ensureTrialSubscription, entitlementsForSubscription, evaluateLicense, licenseSummary, mapPreapprovalStatus, planForPreapproval } from '../services/billingService.js'
import { createMercadoPagoClient, signNotification, verifyNotificationSignature } from '../services/mercadoPago.js'

// Estas pruebas asumen licencias activas aunque el .env local las apague (LICENSING_ENABLED=false).
process.env.LICENSING_ENABLED = 'true'

const WORKSHOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DAY = 86_400_000
const ENV = {
  MP_ACCESS_TOKEN: 'TEST-1234567890-abcdef', MP_WEBHOOK_SECRET: 'secreto-de-webhook-de-prueba-0123456789',
  APP_PUBLIC_URL: 'https://app.example.com', TRIAL_DAYS: '14', BILLING_GRACE_DAYS: '10',
}
const iso = (ms) => new Date(ms).toISOString()

const PLANS = [
  { id: 'plan-plus-m', code: 'plus_monthly', name: 'Plus mensual', tier: 'plus', price_cents: 29900, currency: 'mxn', interval: 'month', active: true },
  { id: 'plan-pro-m', code: 'pro_monthly', name: 'Pro mensual', tier: 'pro', price_cents: 54900, currency: 'mxn', interval: 'month', active: true },
  { id: 'plan-pro-y', code: 'pro_yearly', name: 'Pro anual', tier: 'pro', price_cents: 549000, currency: 'mxn', interval: 'year', active: true },
  { id: 'plan-max-m', code: 'max_monthly', name: 'Max mensual', tier: 'max', price_cents: 89900, currency: 'mxn', interval: 'month', active: true },
  { id: 'plan-old', code: 'base_monthly', name: 'Mensual (Stripe)', tier: 'max', price_cents: 2900, currency: 'usd', interval: 'month', active: false },
]

// Suscripción de Mercado Pago (preapproval) tal como la devuelve GET /preapproval/{id}.
const preapproval = (overrides = {}) => ({
  id: 'pre_1', status: 'authorized', external_reference: WORKSHOP, payer_id: 777,
  auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 549, currency_id: 'MXN' },
  next_payment_date: iso(Date.now() + 30 * DAY), last_modified: iso(Date.now()),
  ...overrides,
})

function mpStub({ preapprovals = {}, payments = {} } = {}) {
  const stub = {
    created: [], updated: [],
    getPreapproval: async (id) => { if (!preapprovals[id]) throw Object.assign(new Error('not found'), { providerStatus: 404 }); return preapprovals[id] },
    getAuthorizedPayment: async (id) => payments[id],
    createPreapproval: async (body) => { stub.created.push(body); return { id: 'pre_new', status: 'pending', init_point: 'https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=pre_new' } },
    updatePreapproval: async (id, body) => {
      stub.updated.push({ id, body })
      const current = preapprovals[id]
      if (current) {
        preapprovals[id] = { ...current, ...(body.status ? { status: body.status === 'canceled' ? 'cancelled' : body.status } : {}), auto_recurring: { ...current.auto_recurring, ...(body.auto_recurring ?? {}) }, last_modified: iso(Date.now() + 1000) }
      }
      return preapprovals[id] ?? { id }
    },
  }
  return stub
}

function seededDb(subscription, extra = {}) {
  return createFakeDb({
    workshops: [{ id: WORKSHOP, plan: 'FREE' }, { id: OTHER, plan: 'FREE' }],
    plans: PLANS,
    subscriptions: subscription ? [{ workshop_id: WORKSHOP, last_event_at: new Date(0).toISOString(), last_payment_at: new Date(0).toISOString(), cancel_at_period_end: false, ...subscription }] : [],
    ...extra,
  })
}

let notificationCounter = 0
async function serveWebhook(t, db, mp = mpStub()) {
  const app = express()
  app.post('/webhook', express.json(), createBillingWebhookHandler({ db, env: () => ENV, mp, onChange: invalidateLicenseCache }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return async (type, dataId, { secret = ENV.MP_WEBHOOK_SECRET, signature, notificationId = ++notificationCounter, requestId = `req-${notificationCounter}` } = {}) => {
    const ts = String(Math.floor(Date.now() / 1000))
    const header = signature === undefined ? `ts=${ts},v1=${signNotification({ dataId, requestId, ts, secret })}` : signature
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook?data.id=${encodeURIComponent(dataId)}&type=${type}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': requestId, ...(header ? { 'x-signature': header } : {}) },
      body: JSON.stringify({ id: notificationId, type, action: 'updated', data: { id: dataId } }),
    })
    return { status: response.status, body: await response.json() }
  }
}

// ─── Configuración ──────────────────────────────────────────────────────
test('configuración: valida variables de Mercado Pago y no filtra valores', () => {
  assert.equal(loadBillingConfig(ENV).ok, true)
  assert.equal(loadBillingConfig(ENV).config.testCredentials, true)
  assert.equal(loadBillingConfig(ENV).config.graceDays, 10)
  const missing = loadBillingConfig({ ...ENV, MP_ACCESS_TOKEN: '', MP_WEBHOOK_SECRET: 'corta' })
  assert.equal(missing.ok, false)
  assert.match(missing.problems.join(), /MP_ACCESS_TOKEN/)
  assert.match(missing.problems.join(), /MP_WEBHOOK_SECRET/)
  assert.match(loadBillingConfig({ ...ENV, MP_ACCESS_TOKEN: 'sk_live_x' }).problems.join(), /APP_USR/)
  assert.throws(() => assertBillingConfig({ ...ENV, MP_ACCESS_TOKEN: 'APP_USR-super-secret-value', APP_PUBLIC_URL: 'http://x.com', NODE_ENV: 'production' }),
    (error) => /APP_PUBLIC_URL/.test(error.message) && !error.message.includes('super-secret-value'))
  assert.equal(loadBillingConfig({ ...ENV, TRIAL_DAYS: 'abc' }).ok, false)
})

test('configuración: LICENSING_ENABLED=false solo se apaga con "false"', () => {
  assert.equal(licensingEnabled({}), true)
  assert.equal(licensingEnabled({ LICENSING_ENABLED: 'true' }), true)
  assert.equal(licensingEnabled({ LICENSING_ENABLED: ' FALSE ' }), false)
})

// ─── Niveles y lo que incluye cada plan ─────────────────────────────────
test('niveles: Plus, Pro y Max incluyen usuarios y funciones distintas; la prueba es Max', () => {
  assert.deepEqual(entitlementsFor({ tier: 'plus' }), { tier: 'plus', name: 'Plus', trial: false, max_users: 3, features: [] })
  assert.equal(entitlementsFor({ tier: 'pro' }).max_users, 10)
  assert.deepEqual(entitlementsFor({ tier: 'pro' }).features, ['whatsapp', 'reports', 'audit'])
  assert.equal(entitlementsFor({ tier: 'max' }).max_users, null)
  assert.ok(entitlementsFor({ tier: 'max' }).features.includes('ai'))
  assert.deepEqual([entitlementsFor({ trial: true }).tier, entitlementsFor({ trial: true }).trial], ['max', true])
  assert.equal(entitlementsFor({ unlimited: true }).max_users, null)
  assert.equal(entitlementsFor({ tier: 'desconocido' }).tier, 'max')
  assert.deepEqual([minimumTierFor('whatsapp'), minimumTierFor('ai'), minimumTierFor('device_tools')], ['pro', 'max', 'max'])
  assert.equal(entitlementsForSubscription({ status: 'trialing' }).tier, 'max')
  assert.equal(entitlementsForSubscription({ status: 'active', plan: { tier: 'plus' } }).tier, 'plus')
})

test('niveles: el plan se reconoce por frecuencia, monto y moneda de la suscripción', () => {
  assert.equal(planForPreapproval(PLANS, preapproval()).code, 'pro_monthly')
  assert.equal(planForPreapproval(PLANS, preapproval({ auto_recurring: { frequency: 12, frequency_type: 'months', transaction_amount: 5490, currency_id: 'MXN' } })).code, 'pro_yearly')
  assert.equal(planForPreapproval(PLANS, preapproval({ auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 123, currency_id: 'MXN' } })), null)
  assert.deepEqual(['authorized', 'pending', 'paused', 'cancelled', 'canceled', 'raro'].map(mapPreapprovalStatus), ['active', 'incomplete', 'paused', 'canceled', 'canceled', 'unpaid'])
})

test('requireFeature: bloquea con 402 PLAN_UPGRADE_REQUIRED y nombra el plan que lo incluye', () => {
  const run = (entitlements, feature) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
    let nextCalled = false
    requireFeature(feature)({ entitlements }, res, () => { nextCalled = true })
    return { res, nextCalled }
  }
  const blocked = run(entitlementsFor({ tier: 'plus' }), 'ai')
  assert.deepEqual([blocked.nextCalled, blocked.res.statusCode, blocked.res.body.code, blocked.res.body.required_tier], [false, 402, 'PLAN_UPGRADE_REQUIRED', 'max'])
  assert.match(blocked.res.body.message, /plan Max/)
  assert.match(run(entitlementsFor({ tier: 'plus' }), 'reports').res.body.message, /plan Pro/)
  assert.equal(run(entitlementsFor({ tier: 'pro' }), 'whatsapp').nextCalled, true)
  assert.equal(run(entitlementsFor({ tier: 'max' }), 'device_tools').nextCalled, true)
  // Sin licencia evaluada (licencias apagadas o SUPER_ADMIN) no hay límite.
  assert.equal(run(undefined, 'ai').nextCalled, true)
})

// ─── Licencia: decisión ─────────────────────────────────────────────────
test('licencia: activo, prueba, vencido, gracia, cancelada al final del periodo y sin suscripción', () => {
  const now = Date.now()
  assert.equal(evaluateLicense(null, { now }).reason, 'no_subscription')
  assert.equal(evaluateLicense({ status: 'active', current_period_end: iso(now + DAY) }, { now }).allowed, true)
  assert.equal(evaluateLicense({ status: 'active', current_period_end: iso(now - 30 * DAY) }, { now }).reason, 'period_ended')
  assert.equal(evaluateLicense({ status: 'active', cancel_at_period_end: true, current_period_end: iso(now + DAY) }, { now }).allowed, true)
  assert.equal(evaluateLicense({ status: 'active', cancel_at_period_end: true, current_period_end: iso(now - 1) }, { now }).reason, 'canceled')
  assert.equal(evaluateLicense({ status: 'trialing', trial_end: iso(now + DAY) }, { now }).allowed, true)
  assert.equal(evaluateLicense({ status: 'trialing', trial_end: iso(now - 1) }, { now }).reason, 'trial_expired')
  const grace = evaluateLicense({ status: 'past_due', past_due_since: iso(now - 9 * DAY) }, { now, graceDays: 10 })
  assert.deepEqual([grace.allowed, grace.grace], [true, true])
  assert.equal(evaluateLicense({ status: 'past_due', past_due_since: iso(now - 11 * DAY) }, { now, graceDays: 10 }).allowed, false)
  for (const status of ['canceled', 'unpaid', 'incomplete']) assert.equal(evaluateLicense({ status }, { now }).allowed, false)
})

// ─── Middleware ─────────────────────────────────────────────────────────
async function runLicense(db, profile, graceDays = 10) {
  invalidateLicenseCache()
  const middleware = createLicenseMiddleware({ db, graceDays: () => graceDays, ttlMs: 0 })
  const req = { profile }
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  let nextCalled = false
  await middleware(req, res, () => { nextCalled = true })
  return { req, res, nextCalled }
}

test('middleware: con licencias apagadas deja pasar sin consultar la BD', async () => {
  process.env.LICENSING_ENABLED = 'false'
  try {
    const broken = { from: () => { throw new Error('no debe consultarse') } }
    assert.equal((await runLicense(broken, { role: 'OWNER', workshop_id: WORKSHOP })).nextCalled, true)
  } finally { process.env.LICENSING_ENABLED = 'true' }
})

test('middleware: permite activo con lo que incluye su plan y rechaza con 402 LICENSE_REQUIRED', async () => {
  const profile = { role: 'OWNER', workshop_id: WORKSHOP }
  const active = await runLicense(seededDb({ status: 'active', plan_id: 'plan-plus-m', current_period_end: iso(Date.now() + DAY) }), profile)
  assert.equal(active.nextCalled, true)
  assert.equal(active.req.entitlements.tier, 'plus')
  const trial = await runLicense(seededDb({ status: 'trialing', trial_end: iso(Date.now() + DAY) }), profile)
  assert.deepEqual([trial.req.entitlements.tier, trial.req.entitlements.trial], ['max', true])
  const none = await runLicense(seededDb(null), profile)
  assert.deepEqual([none.nextCalled, none.res.statusCode, none.res.body.code], [false, 402, 'LICENSE_REQUIRED'])
  assert.equal((await runLicense(seededDb({ status: 'canceled' }), profile)).res.statusCode, 402)
  assert.equal((await runLicense(seededDb({ status: 'past_due', past_due_since: iso(Date.now() - 2 * DAY) }), profile)).nextCalled, true)
  assert.equal((await runLicense(seededDb({ status: 'past_due', past_due_since: iso(Date.now() - 11 * DAY) }), profile)).res.statusCode, 402)
})

test('middleware: SUPER_ADMIN pasa, errores de BD fallan cerrado', async () => {
  assert.equal((await runLicense(seededDb(null), { role: 'SUPER_ADMIN', workshop_id: null })).nextCalled, true)
  const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: 'XX000' } }) }) }) }) }
  const result = await runLicense(broken, { role: 'OWNER', workshop_id: WORKSHOP })
  assert.deepEqual([result.nextCalled, result.res.statusCode], [false, 503])
})

// ─── Firma de notificaciones ────────────────────────────────────────────
test('firma: acepta solo el HMAC del id, request-id y ts con la clave secreta', () => {
  const args = { dataId: '2c9380847a', requestId: 'req-1', ts: '1704908010', secret: ENV.MP_WEBHOOK_SECRET }
  const signature = `ts=${args.ts},v1=${signNotification(args)}`
  assert.equal(verifyNotificationSignature({ signature, requestId: args.requestId, dataId: args.dataId, secret: args.secret }), true)
  assert.equal(verifyNotificationSignature({ signature, requestId: args.requestId, dataId: '2C9380847A', secret: args.secret }), true)
  assert.equal(verifyNotificationSignature({ signature, requestId: args.requestId, dataId: 'otro-id', secret: args.secret }), false)
  assert.equal(verifyNotificationSignature({ signature, requestId: 'req-2', dataId: args.dataId, secret: args.secret }), false)
  assert.equal(verifyNotificationSignature({ signature, requestId: args.requestId, dataId: args.dataId, secret: 'otra-clave-secreta-0123456789' }), false)
  assert.equal(verifyNotificationSignature({ signature: 'ts=abc,v1=00', requestId: args.requestId, dataId: args.dataId, secret: args.secret }), false)
  assert.equal(verifyNotificationSignature({ signature: undefined, requestId: args.requestId, dataId: args.dataId, secret: args.secret }), false)
})

test('cliente de Mercado Pago: llama a la API con el token y no expone detalles del proveedor', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.Authorization, body: init.body })
    if (url.endsWith('/preapproval/falla')) return new Response(JSON.stringify({ message: 'detalle interno de Mercado Pago' }), { status: 400 })
    return new Response(JSON.stringify({ id: 'pre_1', init_point: 'https://mp/checkout' }), { status: 201 })
  }
  const client = createMercadoPagoClient({ accessToken: 'TEST-token', fetchImpl })
  assert.equal((await client.createPreapproval({ reason: 'x' })).init_point, 'https://mp/checkout')
  await client.updatePreapproval('pre 1', { status: 'canceled' })
  assert.deepEqual(calls.map((call) => [call.method, call.url, call.auth]), [
    ['POST', 'https://api.mercadopago.com/preapproval', 'Bearer TEST-token'],
    ['PUT', 'https://api.mercadopago.com/preapproval/pre%201', 'Bearer TEST-token'],
  ])
  await assert.rejects(client.getPreapproval('falla'), (error) => error.status === 502 && error.providerStatus === 400 && !error.publicMessage.includes('detalle interno'))
  const offline = createMercadoPagoClient({ accessToken: 'TEST-token', fetchImpl: async () => { throw new TypeError('fetch failed') } })
  await assert.rejects(offline.getAuthorizedPayment(1), (error) => error.code === 'PAYMENT_PROVIDER_ERROR')
})

// ─── Webhook: firma e idempotencia ──────────────────────────────────────
test('webhook: rechaza firma ausente, incorrecta o de otro id sin tocar la licencia', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: iso(Date.now() + DAY) })
  const post = await serveWebhook(t, db, mpStub({ preapprovals: { pre_1: preapproval() } }))
  assert.equal((await post('subscription_preapproval', 'pre_1', { signature: null })).status, 401)
  assert.equal((await post('subscription_preapproval', 'pre_1', { secret: 'otra-clave-secreta-0123456789' })).status, 401)
  assert.equal((await post('subscription_preapproval', 'pre_1', { signature: 'ts=1,v1=abc' })).status, 401)
  assert.equal(db.tables.billing_events.length, 0)
  assert.equal(db.tables.subscriptions[0].status, 'trialing')
})

test('webhook: es idempotente por id de notificación', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: iso(Date.now() + DAY) })
  const post = await serveWebhook(t, db, mpStub({ preapprovals: { pre_1: preapproval() } }))
  const first = await post('subscription_preapproval', 'pre_1', { notificationId: 5001 })
  assert.deepEqual([first.status, first.body.handled], [200, true])
  const auditCount = db.tables.audit_logs.length
  const second = await post('subscription_preapproval', 'pre_1', { notificationId: 5001 })
  assert.deepEqual([second.status, second.body.duplicate], [200, true])
  assert.equal(db.tables.billing_events.length, 1)
  assert.ok(db.tables.billing_events[0].processed_at)
  assert.equal(db.tables.audit_logs.length, auditCount)
})

test('webhook: reintenta una notificación recibida pero no procesada', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: iso(Date.now() + DAY) })
  db.tables.billing_events.push({ provider_event_id: 'mp:6001', type: 'subscription_preapproval', processed_at: null })
  const post = await serveWebhook(t, db, mpStub({ preapprovals: { pre_1: preapproval() } }))
  assert.equal((await post('subscription_preapproval', 'pre_1', { notificationId: 6001 })).body.handled, true)
  assert.equal(db.tables.subscriptions[0].status, 'active')
})

test('webhook: si Mercado Pago no responde, devuelve 500 sin marcar procesado', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: iso(Date.now() + DAY) })
  const mp = mpStub()
  mp.getPreapproval = async () => { throw new Error('mercado pago caído') }
  const post = await serveWebhook(t, db, mp)
  assert.equal((await post('subscription_preapproval', 'pre_1')).status, 500)
  assert.equal(db.tables.billing_events[0].processed_at ?? null, null)
  assert.equal(db.tables.subscriptions[0].status, 'trialing')
})

// ─── Transiciones de estado ─────────────────────────────────────────────
test('transiciones: una suscripción autorizada activa la licencia con su plan y audita', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: iso(Date.now() + DAY) })
  const post = await serveWebhook(t, db, mpStub({ preapprovals: { pre_1: preapproval() } }))
  assert.equal((await post('subscription_preapproval', 'pre_1')).body.handled, true)
  const row = db.tables.subscriptions[0]
  assert.deepEqual([row.status, row.provider_subscription_id, row.provider_customer_id, row.plan_id, row.cancel_at_period_end], ['active', 'pre_1', '777', 'plan-pro-m', false])
  assert.ok(new Date(row.current_period_end).getTime() > Date.now())
  assert.equal(db.tables.workshops[0].plan, 'PRO')
  assert.deepEqual(db.tables.audit_logs.map((entry) => entry.action), ['SUBSCRIPTION_STATUS_CHANGED', 'PLAN_CHANGED'])
})

test('transiciones: un pago pendiente no quita la prueba gratuita', async (t) => {
  const db = seededDb({ status: 'trialing', trial_end: iso(Date.now() + DAY) })
  const post = await serveWebhook(t, db, mpStub({ preapprovals: { pre_1: preapproval({ status: 'pending' }) } }))
  const result = await post('subscription_preapproval', 'pre_1')
  assert.deepEqual([result.status, result.body.handled], [200, false])
  assert.equal(db.tables.subscriptions[0].status, 'trialing')
})

test('transiciones: cobro rechazado → past_due; cobro aprobado → active', async (t) => {
  const db = seededDb({ status: 'active', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m', current_period_end: iso(Date.now() + DAY) })
  const preapprovals = { pre_1: preapproval({ last_modified: iso(Date.now() - DAY) }) }
  const payments = {
    pay_1: { id: 'pay_1', preapproval_id: 'pre_1', status: 'recycling', payment: { id: 1, status: 'rejected' }, last_modified: iso(Date.now() + 1000) },
    pay_2: { id: 'pay_2', preapproval_id: 'pre_1', status: 'processed', payment: { id: 2, status: 'approved' }, last_modified: iso(Date.now() + 2000) },
  }
  const post = await serveWebhook(t, db, mpStub({ preapprovals, payments }))
  await post('subscription_authorized_payment', 'pay_1')
  assert.equal(db.tables.subscriptions[0].status, 'past_due')
  assert.ok(db.tables.subscriptions[0].past_due_since)
  // Una notificación de la suscripción (sigue "authorized") no saca al taller de past_due.
  await post('subscription_preapproval', 'pre_1')
  assert.equal(db.tables.subscriptions[0].status, 'past_due')
  await post('subscription_authorized_payment', 'pay_2')
  assert.deepEqual([db.tables.subscriptions[0].status, db.tables.subscriptions[0].past_due_since], ['active', null])
  // Un resultado de cobro viejo que llega tarde no regresa a past_due.
  await post('subscription_authorized_payment', 'pay_1', { notificationId: 'tarde' })
  assert.equal(db.tables.subscriptions[0].status, 'active')
})

test('transiciones: cancelar conserva el acceso hasta el último día pagado', async (t) => {
  const paidThrough = iso(Date.now() + 20 * DAY)
  const db = seededDb({ status: 'active', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m', current_period_end: paidThrough })
  const post = await serveWebhook(t, db, mpStub({ preapprovals: { pre_1: preapproval({ status: 'cancelled', next_payment_date: null }) } }))
  await post('subscription_preapproval', 'pre_1')
  const row = db.tables.subscriptions[0]
  assert.deepEqual([row.status, row.cancel_at_period_end, row.current_period_end], ['active', true, paidThrough])
  assert.equal((await runLicense(db, { role: 'OWNER', workshop_id: WORKSHOP })).nextCalled, true)
  row.current_period_end = iso(Date.now() - 1000)
  assert.equal((await runLicense(db, { role: 'OWNER', workshop_id: WORKSHOP })).res.body.reason, 'canceled')
})

test('transiciones: una suscripción cancelada sin periodo pagado termina el acceso', async (t) => {
  const db = seededDb({ status: 'past_due', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m', past_due_since: iso(Date.now() - 5 * DAY), current_period_end: iso(Date.now() - 5 * DAY) })
  const post = await serveWebhook(t, db, mpStub({ preapprovals: { pre_1: preapproval({ status: 'cancelled', next_payment_date: null }) } }))
  await post('subscription_preapproval', 'pre_1')
  assert.equal(db.tables.subscriptions[0].status, 'canceled')
  assert.equal(db.tables.workshops[0].plan, 'FREE')
})

test('transiciones: una suscripción nueva autorizada reemplaza a la anterior y la cancela en Mercado Pago', async (t) => {
  const db = seededDb({ status: 'active', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m', current_period_end: iso(Date.now() + 10 * DAY) })
  const mp = mpStub({ preapprovals: {
    pre_1: preapproval(),
    pre_2: preapproval({ id: 'pre_2', auto_recurring: { frequency: 12, frequency_type: 'months', transaction_amount: 5490, currency_id: 'MXN' }, next_payment_date: iso(Date.now() + 365 * DAY) }),
  } })
  const post = await serveWebhook(t, db, mp)
  await post('subscription_preapproval', 'pre_2')
  const row = db.tables.subscriptions[0]
  assert.deepEqual([row.provider_subscription_id, row.plan_id, row.status], ['pre_2', 'plan-pro-y', 'active'])
  assert.deepEqual(mp.updated, [{ id: 'pre_1', body: { status: 'canceled' } }])
  // La notificación de la cancelación de la anterior ya no pisa el estado.
  const old = await post('subscription_preapproval', 'pre_1')
  assert.equal(old.body.handled, false)
  assert.equal(db.tables.subscriptions[0].provider_subscription_id, 'pre_2')
})

test('transiciones: versiones viejas, suscripciones no autorizadas ajenas, tipos y talleres desconocidos se ignoran', async (t) => {
  const db = seededDb({ status: 'active', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m', last_event_at: iso(Date.now()) })
  const mp = mpStub({ preapprovals: {
    pre_1: preapproval({ status: 'cancelled', last_modified: iso(Date.now() - DAY) }),
    pre_x: preapproval({ id: 'pre_x', status: 'pending' }),
    pre_ghost: preapproval({ id: 'pre_ghost', external_reference: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
  } })
  const post = await serveWebhook(t, db, mp)
  assert.equal((await post('subscription_preapproval', 'pre_1')).body.handled, false)
  assert.equal(db.tables.subscriptions[0].status, 'active')
  assert.equal((await post('subscription_preapproval', 'pre_x')).body.handled, false)
  assert.equal(db.tables.subscriptions[0].provider_subscription_id, 'pre_1')
  assert.equal((await post('payment', '123')).body.handled, false)
  const ghost = await post('subscription_preapproval', 'pre_ghost')
  assert.deepEqual([ghost.status, ghost.body.handled], [200, false])
  assert.equal(db.tables.subscriptions.length, 1)
})

test('integración: registro → prueba → compra → cobro rechazado → gracia → bloqueo', async (t) => {
  const db = seededDb(null)
  await ensureTrialSubscription({ db, workshopId: WORKSHOP, trialDays: 14 })
  await ensureTrialSubscription({ db, workshopId: WORKSHOP, trialDays: 14 })
  assert.equal(db.tables.subscriptions.length, 1)
  const profile = { role: 'OWNER', workshop_id: WORKSHOP }
  assert.equal((await runLicense(db, profile)).nextCalled, true)

  const payments = { pay_1: { id: 'pay_1', preapproval_id: 'pre_1', status: 'recycling', payment: { status: 'rejected' }, last_modified: iso(Date.now() + 1000) } }
  const post = await serveWebhook(t, db, mpStub({ preapprovals: { pre_1: preapproval({ auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 299, currency_id: 'MXN' } }) }, payments }))
  await post('subscription_preapproval', 'pre_1')
  const licensed = await runLicense(db, profile)
  assert.deepEqual([db.tables.subscriptions[0].status, licensed.req.entitlements.tier], ['active', 'plus'])

  await post('subscription_authorized_payment', 'pay_1')
  assert.equal((await runLicense(db, profile)).nextCalled, true)
  db.tables.subscriptions[0].past_due_since = iso(Date.now() - 11 * DAY)
  assert.equal((await runLicense(db, profile)).res.body.reason, 'past_due_expired')
})

// ─── Rutas /api/billing ─────────────────────────────────────────────────
const owner = { id: 'user-1', role: 'OWNER', workshop_id: WORKSHOP, workspace_access: 'ACTIVE', permissions: ['*'] }

async function serveBilling(t, db, profile, options = {}) {
  const mp = options.mp ?? mpStub()
  const app = express()
  app.use(express.json())
  const authenticate = [(req, _res, next) => { req.authUserId = 'user-1'; req.profile = profile; next() }]
  app.use('/billing', createBillingRouter({ db, authenticate, env: () => options.env ?? ENV, mp, checkoutLimiter: options.limiter ?? ((_req, _res, next) => next()) }))
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ message: error.publicMessage ?? error.message }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/billing${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
    return { status: response.status, body: await response.json() }
  }
  request.mp = mp
  return request
}

test('rutas: /plans es público, ordena Plus → Pro → Max y solo muestra planes activos con nivel', async (t) => {
  const request = await serveBilling(t, seededDb(null), owner)
  const result = await request('/plans')
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.data.map((plan) => plan.code), ['plus_monthly', 'pro_monthly', 'pro_yearly', 'max_monthly'])
  assert.deepEqual([result.body.data[0].max_users, result.body.data[0].features], [3, []])
  assert.equal(result.body.data[3].max_users, null)
  assert.equal(result.body.trial_days, 14)
  assert.equal(result.body.features.ai, 'Diagnóstico IA')
  assert.ok(!JSON.stringify(result.body).includes('plan-pro-m'))
})

test('rutas: /plans avisa si ya se puede contratar sin revelar la configuración', async (t) => {
  assert.equal((await (await serveBilling(t, seededDb(null), owner))('/plans')).body.payments_ready, true)
  const result = await (await serveBilling(t, seededDb(null), owner, { env: { TRIAL_DAYS: '14' } }))('/plans')
  assert.deepEqual([result.status, result.body.payments_ready, result.body.data.length], [200, false, 4])
  assert.ok(!JSON.stringify(result.body).includes('MP_'))
})

test('rutas: checkout cobra el monto del plan guardado al taller de la sesión, nunca al del body', async (t) => {
  const request = await serveBilling(t, seededDb({ status: 'trialing', trial_end: iso(Date.now() + DAY) }), owner)
  const result = await request('/checkout', { plan: 'pro_yearly', workshop_id: OTHER, amount: 1, payer_email: 'Dueno@Correo.com' })
  assert.deepEqual([result.status, result.body.data.url], [200, 'https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=pre_new'])
  const body = request.mp.created[0]
  assert.equal(body.external_reference, WORKSHOP)
  assert.equal(body.payer_email, 'dueno@correo.com')
  assert.deepEqual(body.auto_recurring, { frequency: 12, frequency_type: 'months', transaction_amount: 5490, currency_id: 'MXN' })
  assert.equal(body.status, 'pending')
  assert.equal(body.back_url, 'https://app.example.com/facturacion?checkout=success')
})

test('rutas: checkout usa el correo de la cuenta si no se indica otro', async (t) => {
  const db = seededDb(null, { auth_users: [{ id: 'user-1', email: 'owner@taller.com' }] })
  const request = await serveBilling(t, db, owner)
  assert.equal((await request('/checkout', { plan: 'plus_monthly' })).status, 200)
  assert.equal(request.mp.created[0].payer_email, 'owner@taller.com')
})

test('rutas: checkout valida rol, taller, estado, plan, correo, duplicados y configuración', async (t) => {
  const trial = { status: 'trialing', trial_end: iso(Date.now() + DAY) }
  const call = async (profile, body, options) => (await serveBilling(t, seededDb(trial), profile, options))('/checkout', body)
  assert.equal((await call({ ...owner, role: 'TECNICO' }, { plan: 'plus_monthly' })).status, 403)
  assert.equal((await call({ ...owner, workshop_id: null }, { plan: 'plus_monthly' })).status, 403)
  assert.equal((await call({ ...owner, workspace_access: 'SUSPENDED' }, { plan: 'plus_monthly' })).status, 403)
  assert.equal((await call(owner, {})).status, 400)
  assert.equal((await call(owner, { plan: 'no_existe' })).status, 404)
  assert.equal((await call(owner, { plan: 'base_monthly' })).status, 404)
  assert.equal((await call(owner, { plan: 'plus_monthly', payer_email: 'no-es-correo' })).status, 400)
  assert.equal((await call(owner, { plan: 'plus_monthly' })).status, 400) // sin correo en la cuenta ni en el body
  const subscribed = await (await serveBilling(t, seededDb({ status: 'active', provider_subscription_id: 'pre_1' }), owner))('/checkout', { plan: 'plus_monthly', payer_email: 'a@b.co' })
  assert.equal(subscribed.body.code, 'ALREADY_SUBSCRIBED')
  const unconfigured = await call(owner, { plan: 'plus_monthly', payer_email: 'a@b.co' }, { env: {} })
  assert.deepEqual([unconfigured.status, unconfigured.body.code], [503, 'BILLING_NOT_CONFIGURED'])
})

test('rutas: checkout aplica el limitador de peticiones', async (t) => {
  const request = await serveBilling(t, seededDb(null), owner, { limiter: (_req, res) => res.status(429).json({ message: 'límite' }) })
  assert.equal((await request('/checkout', { plan: 'plus_monthly' })).status, 429)
})

test('rutas: checkout permite contratar de nuevo si la suscripción ya se canceló', async (t) => {
  const db = seededDb({ status: 'active', cancel_at_period_end: true, provider_subscription_id: 'pre_1', current_period_end: iso(Date.now() + DAY) })
  assert.equal((await (await serveBilling(t, db, owner))('/checkout', { plan: 'max_monthly', payer_email: 'a@b.co' })).status, 200)
})

test('rutas: bajar de plan con el mismo cobro ajusta el monto en Mercado Pago y cambia el plan ya', async (t) => {
  const db = seededDb({ status: 'active', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m', current_period_end: iso(Date.now() + 10 * DAY), last_event_at: iso(Date.now() - DAY) })
  const mp = mpStub({ preapprovals: { pre_1: preapproval({ last_modified: iso(Date.now() - DAY) }) } })
  const request = await serveBilling(t, db, owner, { mp })
  const result = await request('/change-plan', { plan: 'plus_monthly' })
  assert.equal(result.status, 200)
  assert.equal(result.body.data.changed, true)
  assert.deepEqual(mp.updated[0], { id: 'pre_1', body: { reason: 'TallerFlow Plus mensual', auto_recurring: { transaction_amount: 299, currency_id: 'MXN' } } })
  assert.equal(db.tables.subscriptions[0].plan_id, 'plan-plus-m')
  assert.equal(result.body.data.subscription.entitlements.tier, 'plus')
  assert.equal(db.tables.workshops[0].plan, 'PLUS')
})

test('rutas: subir de plan abre un pago nuevo y no cambia el plan hasta que se pague', async (t) => {
  const db = seededDb({ status: 'active', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m', current_period_end: iso(Date.now() + 10 * DAY) })
  const request = await serveBilling(t, db, owner)
  const result = await request('/change-plan', { plan: 'max_monthly', payer_email: 'a@b.co' })
  assert.equal(result.body.data.url, 'https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=pre_new')
  assert.equal(request.mp.created[0].auto_recurring.transaction_amount, 899)
  assert.equal(request.mp.updated.length, 0)
  assert.equal(db.tables.subscriptions[0].plan_id, 'plan-pro-m')
})

test('rutas: cambiar entre mensual y anual abre un pago nuevo', async (t) => {
  const db = seededDb({ status: 'active', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m' })
  const request = await serveBilling(t, db, owner)
  const result = await request('/change-plan', { plan: 'pro_yearly', payer_email: 'a@b.co' })
  assert.equal(result.body.data.url, 'https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=pre_new')
  assert.equal(request.mp.created[0].auto_recurring.frequency, 12)
  assert.equal(request.mp.updated.length, 0)
})

test('rutas: cambiar de plan exige dueño, suscripción activa y un plan distinto', async (t) => {
  const active = { status: 'active', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m' }
  assert.equal((await (await serveBilling(t, seededDb(active), { ...owner, role: 'ADMINISTRADOR' }))('/change-plan', { plan: 'max_monthly' })).status, 403)
  assert.equal((await (await serveBilling(t, seededDb({ status: 'trialing' }), owner))('/change-plan', { plan: 'max_monthly' })).body.code, 'NO_ACTIVE_SUBSCRIPTION')
  assert.equal((await (await serveBilling(t, seededDb(active), owner))('/change-plan', { plan: 'pro_monthly' })).body.code, 'SAME_PLAN')
})

test('rutas: cancelar solo lo hace el dueño y conserva el acceso hasta fin de periodo', async (t) => {
  const paidThrough = iso(Date.now() + 15 * DAY)
  const db = seededDb({ status: 'active', provider_subscription_id: 'pre_1', plan_id: 'plan-pro-m', current_period_end: paidThrough, last_event_at: iso(Date.now() - DAY) })
  const mp = mpStub({ preapprovals: { pre_1: preapproval({ last_modified: iso(Date.now() - DAY) }) } })
  assert.equal((await (await serveBilling(t, db, { ...owner, role: 'ADMINISTRADOR' }, { mp }))('/cancel', {})).status, 403)
  const result = await (await serveBilling(t, db, owner, { mp }))('/cancel', {})
  assert.equal(result.status, 200)
  assert.deepEqual(mp.updated[0], { id: 'pre_1', body: { status: 'canceled' } })
  assert.deepEqual([db.tables.subscriptions[0].status, db.tables.subscriptions[0].cancel_at_period_end, db.tables.subscriptions[0].current_period_end], ['active', true, paidThrough])
  assert.equal(result.body.data.cancel_at_period_end, true)
  assert.equal((await (await serveBilling(t, db, owner, { mp }))('/cancel', {})).body.code, 'NO_ACTIVE_SUBSCRIPTION')
})

test('rutas: /subscription devuelve estado, plan y uso sin ids de Mercado Pago, solo para administradores', async (t) => {
  const db = seededDb({ status: 'past_due', provider_customer_id: '777', provider_subscription_id: 'pre_1', plan_id: 'plan-plus-m', past_due_since: iso(Date.now() - DAY) }, {
    profiles: [{ id: 'p1', workshop_id: WORKSHOP, is_active: true }, { id: 'p2', workshop_id: WORKSHOP, is_active: true }, { id: 'p3', workshop_id: WORKSHOP, is_active: false }, { id: 'p4', workshop_id: OTHER, is_active: true }],
  })
  const result = await (await serveBilling(t, db, owner))('/subscription')
  assert.equal(result.body.data.status, 'past_due')
  assert.equal(result.body.data.license.grace, true)
  assert.equal(result.body.data.plan.tier, 'plus')
  assert.deepEqual(result.body.data.usage, { active_users: 2, max_users: 3 })
  assert.equal(result.body.data.has_billing_account, true)
  assert.ok(!JSON.stringify(result.body).includes('pre_1'))
  assert.ok(!JSON.stringify(result.body).includes('"777"'))
  assert.equal((await (await serveBilling(t, db, { ...owner, role: 'CAJERO' }))('/subscription')).status, 403)
})

// ─── Licencia en la sesión (/auth/me) ───────────────────────────────────
test('sesión: el resumen de licencia cuenta los días de prueba y explica el bloqueo', () => {
  const now = Date.now()
  const trial = licenseSummary({ status: 'trialing', trial_end: iso(now + 3.5 * DAY) }, { graceDays: 10, now })
  assert.deepEqual([trial.allowed, trial.reason, trial.days_left, trial.message], [true, 'trialing', 4, null])
  const expired = licenseSummary({ status: 'trialing', trial_end: iso(now - DAY) }, { graceDays: 10, now })
  assert.deepEqual([expired.allowed, expired.reason, expired.days_left, expired.message], [false, 'trial_expired', null, LICENSE_MESSAGES.trial_expired])
  const grace = licenseSummary({ status: 'past_due', past_due_since: iso(now - DAY) }, { graceDays: 10, now })
  assert.deepEqual([grace.allowed, grace.reason, grace.grace_until], [true, 'past_due_grace', iso(now + 9 * DAY)])
  const ending = licenseSummary({ status: 'active', cancel_at_period_end: true, current_period_end: iso(now + 5 * DAY) }, { graceDays: 10, now })
  assert.deepEqual([ending.allowed, ending.cancel_at_period_end, ending.trial_end], [true, true, null])
  assert.deepEqual([licenseSummary(null, { graceDays: 10, now }).allowed, licenseSummary(null, { graceDays: 10, now }).reason], [false, 'no_subscription'])
})

async function serveMe(t, db, profile) {
  const app = express()
  const stub = (req, _res, next) => { req.authUserId = profile.id; req.profile = profile; next() }
  app.use('/auth', createAuthRouter({ db, authenticate: stub, sessionLoader: (_req, _res, next) => next(), configured: (_req, _res, next) => next() }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return (await (await fetch(`http://127.0.0.1:${server.address().port}/auth/me`)).json()).profile
}

test('sesión: /auth/me trae la licencia para llevar a cada quien a su pantalla al iniciar sesión', async (t) => {
  const recent = { ...owner, last_login_at: new Date().toISOString() }
  const trial = await serveMe(t, seededDb({ status: 'trialing', trial_end: iso(Date.now() + 5 * DAY) }), recent)
  assert.deepEqual([trial.license.allowed, trial.license.status, trial.license.days_left, trial.entitlements.tier], [true, 'trialing', 5, 'max'])
  const expired = await serveMe(t, seededDb({ status: 'trialing', trial_end: iso(Date.now() - DAY) }), { ...recent, role: 'TECNICO' })
  assert.deepEqual([expired.license.allowed, expired.license.reason, expired.license.message], [false, 'trial_expired', LICENSE_MESSAGES.trial_expired])
  const platform = await serveMe(t, seededDb(null), { ...recent, role: 'SUPER_ADMIN', workshop_id: null })
  assert.deepEqual([platform.license.allowed, platform.entitlements.max_users], [true, null])
})

test('sesión: con licencias apagadas /auth/me no bloquea a nadie', async (t) => {
  process.env.LICENSING_ENABLED = 'false'
  t.after(() => { process.env.LICENSING_ENABLED = 'true' })
  const profile = await serveMe(t, seededDb({ status: 'trialing', trial_end: iso(Date.now() - DAY) }), { ...owner, last_login_at: new Date().toISOString() })
  assert.deepEqual([profile.license.enabled, profile.license.allowed, profile.entitlements.max_users], [false, true, null])
})

test('arranque: distingue una migración faltante de un fallo pasajero', async () => {
  const dbWith = (result) => ({ from: () => ({ select: () => ({ limit: async () => { if (result instanceof Error) throw result; return result } }) }) })
  assert.deepEqual(await checkLicensingSchema(dbWith({ data: [], error: null })), { ok: true, missing: false })
  assert.deepEqual(await checkLicensingSchema(dbWith({ data: null, error: { code: 'PGRST205' } })), { ok: false, missing: true })
  assert.deepEqual(await checkLicensingSchema(dbWith({ data: null, error: { code: '42703' } })), { ok: false, missing: true })
  assert.deepEqual(await checkLicensingSchema(dbWith({ data: null, error: { code: '57014' } })), { ok: false, missing: false })
  assert.deepEqual(await checkLicensingSchema(dbWith(new Error('fetch failed'))), { ok: false, missing: false })
})

// ─── Límite de usuarios del plan ────────────────────────────────────────
test('usuarios: el plan Plus no deja crear ni reactivar una cuarta cuenta activa', async (t) => {
  const profiles = [
    { id: 'user-1', workshop_id: WORKSHOP, role: 'OWNER', is_active: true },
    { id: 'u2', workshop_id: WORKSHOP, role: 'TECNICO', is_active: true },
    { id: 'u3', workshop_id: WORKSHOP, role: 'RECEPCION', is_active: true },
    { id: 'u4', workshop_id: WORKSHOP, role: 'CAJERO', is_active: false },
  ]
  const db = seededDb({ status: 'active', plan_id: 'plan-plus-m', provider_subscription_id: 'pre_1', current_period_end: iso(Date.now() + DAY) }, { profiles })
  db.auth.admin.createUser = async () => { throw new Error('no debe crear el usuario') }
  const app = express()
  app.use(express.json())
  const stubAuth = (req, _res, next) => { req.authUserId = 'user-1'; req.profile = owner; next() }
  app.use('/auth', createAuthRouter({ db, authenticate: stubAuth, profileLoader: (_req, _res, next) => next(), configured: (_req, _res, next) => next() }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const call = async (method, path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }
  const created = await call('POST', '/users', { email: 'nuevo@taller.com', password: 'contrasena-segura', full_name: 'Nuevo', role: 'TECNICO' })
  assert.deepEqual([created.status, created.body.code], [402, 'PLAN_UPGRADE_REQUIRED'])
  assert.match(created.body.message, /Plus permite hasta 3 usuarios/)
  const reactivated = await call('PATCH', '/users/u4/status', { is_active: true })
  assert.deepEqual([reactivated.status, reactivated.body.code], [402, 'PLAN_UPGRADE_REQUIRED'])
  assert.equal(db.tables.profiles.find((profile) => profile.id === 'u4').is_active, false)
})

test('usuarios: dos altas al mismo tiempo no pasan juntas el último lugar del plan', async (t) => {
  const profiles = [
    { id: 'user-1', workshop_id: WORKSHOP, role: 'OWNER', is_active: true },
    { id: 'u2', workshop_id: WORKSHOP, role: 'TECNICO', is_active: true },
  ]
  const db = seededDb({ status: 'active', plan_id: 'plan-plus-m', provider_subscription_id: 'pre_1', current_period_end: iso(Date.now() + DAY) }, { profiles })
  let createdUsers = 0
  db.auth.admin.createUser = async ({ email }) => {
    await new Promise((resolve) => setTimeout(resolve, 30)) // Supabase tarda: aquí se colaría la segunda alta
    const id = `new-${++createdUsers}`
    db.tables.profiles.push({ id, workshop_id: WORKSHOP, role: 'TECNICO', full_name: email, is_active: true })
    return { data: { user: { id } }, error: null }
  }
  const app = express()
  app.use(express.json())
  const stubAuth = (req, _res, next) => { req.authUserId = 'user-1'; req.profile = owner; next() }
  app.use('/auth', createAuthRouter({ db, authenticate: stubAuth, profileLoader: (_req, _res, next) => next(), configured: (_req, _res, next) => next() }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const create = (email) => fetch(`http://127.0.0.1:${server.address().port}/auth/users`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'contrasena-segura', full_name: 'Nuevo', role: 'TECNICO' }) }).then((response) => response.status)
  const statuses = await Promise.all([create('a@taller.com'), create('b@taller.com')])
  assert.deepEqual(statuses.sort(), [201, 402])
  assert.equal(createdUsers, 1)
})
