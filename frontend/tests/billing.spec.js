import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')
const owner = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Carlos Martínez', role: 'OWNER', is_active: true, workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Taller Centro', status: 'ACTIVE' }, workspace_access: 'ACTIVE', permissions: ['*'], permissionsSource: 'rbac' }
const PRO_FEATURES = ['whatsapp', 'reports', 'audit']
const MAX_FEATURES = [...PRO_FEATURES, 'ai', 'device_tools']
const plans = [
  { code: 'plus_monthly', name: 'Plus mensual', tier: 'plus', price_cents: 29900, currency: 'mxn', interval: 'month', max_users: 3, features: [] },
  { code: 'pro_monthly', name: 'Pro mensual', tier: 'pro', price_cents: 54900, currency: 'mxn', interval: 'month', max_users: 10, features: PRO_FEATURES },
  { code: 'max_monthly', name: 'Max mensual', tier: 'max', price_cents: 89900, currency: 'mxn', interval: 'month', max_users: null, features: MAX_FEATURES },
  { code: 'plus_yearly', name: 'Plus anual', tier: 'plus', price_cents: 299000, currency: 'mxn', interval: 'year', max_users: 3, features: [] },
  { code: 'pro_yearly', name: 'Pro anual', tier: 'pro', price_cents: 549000, currency: 'mxn', interval: 'year', max_users: 10, features: PRO_FEATURES },
  { code: 'max_yearly', name: 'Max anual', tier: 'max', price_cents: 899000, currency: 'mxn', interval: 'year', max_users: null, features: MAX_FEATURES },
]
const license = (overrides = {}) => ({ allowed: true, reason: 'active', grace: false, grace_until: null, ...overrides })

async function setup(page, { dashboard = 'ok', subscription, entitlements, role = 'OWNER', profileLicense, paymentsReady } = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: owner.id, email: 'qa@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated' }
  const access_token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.')
  const session = { user, access_token, expires_at: exp, expires_in: 3600, refresh_token: 'qa-refresh', token_type: 'bearer' }
  const calls = []
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, value: session })
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: session }))
  await page.route(/\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '')
    calls.push(`${route.request().method()} ${path} ${route.request().postData() ?? ''}`)
    if (path === '/auth/me') return route.fulfill({ json: { profile: { ...owner, role, entitlements: entitlements ?? null, ...(profileLicense ? { license: profileLicense } : {}) }, workshop: owner.workshop, workspace_access: 'ACTIVE' } })
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } })
    if (path === '/billing/plans') return route.fulfill({ json: { data: plans, trial_days: 14, ...(paymentsReady === false ? { payments_ready: false } : {}) } })
    if (path === '/billing/subscription') return route.fulfill({ json: { data: subscription } })
    if (path === '/billing/checkout') return route.fulfill({ json: { data: { url: '/precios?checkout=cancelled' } } })
    if (path === '/billing/change-plan') return route.fulfill({ json: { data: { changed: true, subscription } } })
    if (path === '/billing/cancel') return route.fulfill({ json: { data: { ...subscription, cancel_at_period_end: true } } })
    if (path === '/dashboard' && dashboard === 'licenseRequired') return route.fulfill({ status: 402, json: { code: 'LICENSE_REQUIRED', reason: 'trial_expired', message: 'Tu periodo de prueba terminó. Elige un plan para seguir usando TallerFlow.' } })
    return route.fulfill({ json: { data: [] } })
  })
  return calls
}

const activeSubscription = {
  status: 'active', plan: { code: 'pro_monthly', name: 'Pro mensual', tier: 'pro', interval: 'month', price_cents: 54900, currency: 'mxn' },
  current_period_end: '2030-01-15T00:00:00Z', trial_end: null, cancel_at_period_end: false, has_billing_account: true,
  license: license(), entitlements: { tier: 'pro', name: 'Pro', trial: false, max_users: 10, features: PRO_FEATURES }, usage: { active_users: 4, max_users: 10 },
}

test('/precios es público, muestra Plus, Pro y Max y la compra sigue al registro con el plan elegido', async ({ page }) => {
  await page.route(/\/api\//, (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/billing/plans') ? { data: plans, trial_days: 14 } : { data: [] } }))
  await page.goto('/precios')
  await expect(page.getByRole('heading', { name: 'Licencia de activación' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Pasos para activar tu taller' })).toContainText('Elige tu plan')
  await expect(page.getByRole('article', { name: 'Plan Plus' })).toContainText('Hasta 3 usuarios')
  await expect(page.getByRole('article', { name: 'Plan Pro' })).toContainText('$549')
  await expect(page.getByRole('article', { name: 'Plan Max' })).toContainText('Diagnóstico IA')
  await page.getByRole('button', { name: /Anual/ }).click()
  await expect(page.getByRole('article', { name: 'Plan Pro' })).toContainText('$5,490')
  await expect(page.getByRole('article', { name: 'Plan Pro' })).toContainText('ahorras')
  await page.getByRole('button', { name: 'Comprar Pro' }).click()
  await expect(page).toHaveURL(/\/registro\?plan=pro_yearly$/)
})

test('con las licencias apagadas el registro sigue libre desde /precios', async ({ page }) => {
  await page.route(/\/api\//, (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/billing/plans') ? { data: [], trial_days: 0, disabled: true } : { data: [] } }))
  await page.goto('/precios')
  await page.getByRole('link', { name: 'Crear mi taller' }).click()
  await expect(page).toHaveURL(/\/registro$/)
  await expect(page.getByRole('heading', { name: 'Crea tu taller en TallerFlow', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear mi taller', exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Pasos para activar tu taller' })).toHaveCount(0)
})

test('un 402 LICENSE_REQUIRED redirige a /facturacion con un mensaje claro', async ({ page }) => {
  await setup(page, { dashboard: 'licenseRequired', subscription: { status: 'trialing', plan: null, trial_end: '2020-01-01T00:00:00Z', has_billing_account: false, license: license({ allowed: false, reason: 'trial_expired' }) } })
  await page.goto('/')
  await expect(page).toHaveURL(/\/facturacion/)
  await expect(page.getByRole('alert').filter({ hasText: 'Tu periodo de prueba terminó' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Planes disponibles' })).toBeVisible()
})

const expiredTrial = { enabled: true, allowed: false, reason: 'trial_expired', message: 'Tu periodo de prueba terminó. Elige un plan para seguir usando TallerFlow.', status: 'trialing', trial_end: null, days_left: null, current_period_end: null, cancel_at_period_end: false, grace_until: null }
const expiredSubscription = { status: 'trialing', plan: null, trial_end: '2020-01-01T00:00:00Z', has_billing_account: false, license: license({ allowed: false, reason: 'trial_expired' }) }

test('al iniciar sesión con la prueba vencida, el dueño llega a Facturación sin abrir el panel', async ({ page }) => {
  const calls = await setup(page, { profileLicense: expiredTrial, subscription: expiredSubscription })
  await page.goto('/')
  await expect(page).toHaveURL(/\/facturacion/)
  await expect(page.getByRole('alert').filter({ hasText: 'Tu periodo de prueba terminó' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Planes disponibles' })).toBeVisible()
  await page.goto('/reparaciones')
  await expect(page).toHaveURL(/\/facturacion/)
  expect(calls.some((call) => /^GET \/(dashboard|repairs)/.test(call))).toBe(false)
})

test('un técnico con la licencia vencida ve a quién pedirla y entra en cuanto se renueva', async ({ page }) => {
  const calls = await setup(page, { role: 'TECNICO', profileLicense: expiredTrial, subscription: expiredSubscription })
  await page.goto('/reparaciones')
  await expect(page).toHaveURL(/\/licencia-vencida/)
  await expect(page.getByRole('heading', { name: 'La licencia de Taller Centro no está activa' })).toBeVisible()
  await expect(page.getByText('El periodo de prueba del taller terminó. Pide al dueño del taller')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  expect(calls.some((call) => /^GET \/(dashboard|repairs|billing\/subscription)/.test(call))).toBe(false)

  await page.getByRole('button', { name: 'Ya se renovó' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'La licencia sigue sin renovarse' })).toBeVisible()
  await page.route(/\/api\/auth\/me/, (route) => route.fulfill({ json: { profile: { ...owner, role: 'TECNICO', entitlements: null, license: { ...expiredTrial, allowed: true, reason: 'active', message: null, status: 'active' } }, workshop: owner.workshop, workspace_access: 'ACTIVE' } }))
  await page.getByRole('button', { name: 'Ya se renovó' }).click()
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
})

test('la prueba gratuita se ve desde que entras: aviso con los días y estado en el menú', async ({ page }) => {
  const trialEnd = new Date(Date.now() + 9 * 86_400_000).toISOString()
  await setup(page, { profileLicense: { enabled: true, allowed: true, reason: 'trialing', message: null, status: 'trialing', trial_end: trialEnd, days_left: 9, current_period_end: null, cancel_at_period_end: false, grace_until: null }, subscription: { status: 'trialing', plan: null, trial_end: trialEnd, has_billing_account: false, license: license({ reason: 'trialing' }) } })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const banner = page.getByRole('status').filter({ hasText: 'Prueba gratuita: te quedan 9 días con todo incluido' })
  await expect(banner).toBeVisible()
  await expect(page.getByTestId('workspace-status')).toHaveText('Prueba gratuita · 9 días')
  await banner.getByRole('link', { name: 'Elegir plan' }).click()
  await expect(page).toHaveURL(/\/facturacion/)
  await expect(page.getByText('Prueba gratuita: te quedan')).toHaveCount(0)
})

test('sin Mercado Pago conectado se ven los planes, pero todavía no se contratan', async ({ page }) => {
  await setup(page, { paymentsReady: false, subscription: expiredSubscription })
  await page.goto('/facturacion?plan=pro_monthly')
  await expect(page.getByText('Mercado Pago todavía no está conectado')).toBeVisible()
  await expect(page.getByRole('article', { name: 'Plan Pro' }).getByRole('button', { name: 'Contratar Pro' })).toBeDisabled()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('facturación: contratar confirma el plan y envía solo el plan y el correo de Mercado Pago', async ({ page }) => {
  const calls = await setup(page, { dashboard: 'licenseRequired', subscription: { status: 'canceled', plan: null, has_billing_account: true, license: license({ allowed: false, reason: 'canceled' }) } })
  await page.goto('/facturacion')
  await page.getByRole('button', { name: 'Contratar Pro' }).click()
  const dialog = page.getByRole('dialog', { name: 'Contratar Pro mensual' })
  await expect(dialog).toContainText('$549')
  await dialog.getByLabel('Correo de tu cuenta de Mercado Pago').fill('pagos@taller.com')
  await dialog.getByRole('button', { name: 'Ir a pagar con Mercado Pago' }).click()
  await expect(page).toHaveURL(/\/precios\?checkout=cancelled/)
  const checkout = calls.find((call) => call.includes('/billing/checkout'))
  expect(checkout).toContain('"plan":"pro_monthly"')
  expect(checkout).toContain('"payer_email":"pagos@taller.com"')
  expect(checkout).not.toMatch(/workshop|status|amount|price/)
})

test('configuración muestra plan, estado, próximo cobro y usuarios del plan', async ({ page }) => {
  await setup(page, { subscription: activeSubscription })
  await page.goto('/configuracion')
  const card = page.getByRole('region', { name: 'Estado de la licencia' })
  await expect(card.getByTestId('license-plan')).toHaveText('Pro mensual')
  await expect(card.getByTestId('license-status')).toHaveText('Activa')
  await expect(card.getByTestId('license-next')).toContainText('2030')
  await expect(card.getByTestId('license-users')).toHaveText('4 de 10')
  await expect(card.getByRole('link', { name: 'Administrar plan' })).toBeVisible()
})

test('el dueño baja de plan con el mismo cobro sin salir de TallerFlow', async ({ page }) => {
  const calls = await setup(page, { subscription: activeSubscription })
  await page.goto('/facturacion')
  await expect(page.getByRole('article', { name: 'Plan Pro' }).getByRole('button', { name: 'Tu plan actual' })).toBeDisabled()
  await page.getByRole('article', { name: 'Plan Plus' }).getByRole('button', { name: 'Cambiar a Plus' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cambiar a Plus mensual' })
  await expect(dialog).toContainText('ahora mismo')
  await expect(dialog.getByLabel('Correo de tu cuenta de Mercado Pago')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cambiar a Plus' }).click()
  await expect(page.getByText('Listo. Tu plan ahora es Plus.')).toBeVisible()
  expect(calls.find((call) => call.includes('/billing/change-plan'))).toContain('"plan":"plus_monthly"')
})

test('subir de plan lleva a pagar en Mercado Pago antes de activarlo', async ({ page }) => {
  await setup(page, { subscription: activeSubscription })
  await page.goto('/facturacion')
  await page.getByRole('article', { name: 'Plan Max' }).getByRole('button', { name: 'Cambiar a Max' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cambiar a Max mensual' })
  await expect(dialog).toContainText('En cuanto se confirme el pago se activa')
  await expect(dialog.getByLabel('Correo de tu cuenta de Mercado Pago')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ir a pagar con Mercado Pago' })).toBeVisible()
})

test('el dueño cancela con confirmación y conserva el acceso hasta fin de periodo', async ({ page }) => {
  const calls = await setup(page, { subscription: activeSubscription })
  await page.goto('/facturacion')
  await page.getByRole('button', { name: 'Cancelar suscripción' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Cancelar la suscripción de Taller Centro?' })
  await expect(dialog.getByRole('button', { name: 'Mantener mi plan' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancelar suscripción' }).click()
  await expect(page.getByText(/Cancelamos tu suscripción\. Conservas el acceso hasta el 1[45] de enero de 2030/)).toBeVisible()
  await expect(dialog).toHaveCount(0)
  expect(calls.some((call) => call.startsWith('POST /billing/cancel'))).toBe(true)
})

test('una sección fuera del plan muestra candado y explica en qué plan está', async ({ page }) => {
  await setup(page, { subscription: activeSubscription, entitlements: { tier: 'plus', name: 'Plus', trial: false, max_users: 3, features: [] } })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Reportes, disponible desde el plan Pro' })).toBeVisible()
  await page.getByRole('link', { name: 'Diagnóstico IA, disponible desde el plan Max' }).click()
  await expect(page.getByRole('heading', { name: 'Disponible desde el plan Max' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver planes' })).toHaveAttribute('href', '/facturacion')
})

test('licencias apagadas: /precios no se queda cargando y /facturacion explica el estado', async ({ page }) => {
  await setup(page, { subscription: { disabled: true, status: null, plan: null, license: license({ reason: 'disabled' }) } })
  await page.route(/\/api\/billing\/plans/, (route) => route.fulfill({ json: { data: [], trial_days: 0, disabled: true } }))
  await page.goto('/precios')
  await expect(page.getByText('Los planes de pago aún no están disponibles')).toBeVisible()
  await expect(page.getByText('Cargando planes…')).toHaveCount(0)
  await page.goto('/facturacion')
  await expect(page.getByRole('region', { name: 'Licencias desactivadas' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Planes disponibles' })).toHaveCount(0)
})
