import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')
const owner = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Carlos Martínez', role: 'OWNER', is_active: true, workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Taller Centro', status: 'ACTIVE' }, workspace_access: 'ACTIVE', permissions: ['*'], permissionsSource: 'rbac' }
const plans = [
  { code: 'base_monthly', name: 'TallerFlow Mensual', price_cents: 2900, currency: 'usd', interval: 'month' },
  { code: 'base_yearly', name: 'TallerFlow Anual', price_cents: 29000, currency: 'usd', interval: 'year' },
]

async function setup(page, { dashboard = 'ok', subscription } = {}) {
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
    if (path === '/auth/me') return route.fulfill({ json: { profile: owner, workshop: owner.workshop, workspace_access: 'ACTIVE' } })
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } })
    if (path === '/billing/plans') return route.fulfill({ json: { data: plans, trial_days: 14 } })
    if (path === '/billing/subscription') return route.fulfill({ json: { data: subscription } })
    if (path === '/billing/checkout') return route.fulfill({ json: { data: { url: '/precios?checkout=cancelled' } } })
    if (path === '/dashboard' && dashboard === 'licenseRequired') return route.fulfill({ status: 402, json: { code: 'LICENSE_REQUIRED', reason: 'trial_expired', message: 'Tu periodo de prueba terminó. Elige un plan para seguir usando TallerFlow.' } })
    return route.fulfill({ json: { data: [] } })
  })
  return calls
}

const activeSubscription = { status: 'active', plan: { name: 'TallerFlow Mensual' }, current_period_end: '2030-01-15T00:00:00Z', trial_end: null, cancel_at_period_end: false, has_billing_account: true, license: { allowed: true, reason: 'active', grace: false, grace_until: null } }

test('/precios es público, muestra planes y "Comprar" lleva al registro sin sesión', async ({ page }) => {
  await page.route(/\/api\//, (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/billing/plans') ? { data: plans, trial_days: 14 } : { data: [] } }))
  await page.goto('/precios')
  await expect(page.getByRole('heading', { name: 'Precios simples para tu taller' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'TallerFlow Mensual' })).toContainText('$29')
  await expect(page.getByRole('article', { name: 'TallerFlow Anual' })).toContainText('Ahorra')
  await page.getByRole('button', { name: 'Comprar' }).first().click()
  await expect(page).toHaveURL(/\/registro/)
})

test('un 402 LICENSE_REQUIRED redirige a /facturacion con un mensaje claro', async ({ page }) => {
  await setup(page, { dashboard: 'licenseRequired', subscription: { status: 'trialing', plan: null, trial_end: '2020-01-01T00:00:00Z', has_billing_account: false, license: { allowed: false, reason: 'trial_expired', grace: false, grace_until: null } } })
  await page.goto('/')
  await expect(page).toHaveURL(/\/facturacion/)
  await expect(page.getByRole('alert').filter({ hasText: 'Tu periodo de prueba terminó' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Planes disponibles' })).toBeVisible()
})

test('facturación: comprar envía solo el plan; el cliente nunca decide taller ni estado', async ({ page }) => {
  const calls = await setup(page, { dashboard: 'licenseRequired', subscription: { status: 'canceled', plan: null, has_billing_account: true, license: { allowed: false, reason: 'canceled', grace: false, grace_until: null } } })
  await page.goto('/facturacion')
  await page.getByRole('button', { name: 'Comprar' }).first().click()
  await expect(page).toHaveURL(/\/precios\?checkout=cancelled/)
  const checkout = calls.find((call) => call.includes('/billing/checkout'))
  expect(checkout).toContain('"plan":"base_monthly"')
  expect(checkout).not.toMatch(/workshop|status/)
})

test('configuración muestra plan, estado, próximo cobro y gestionar pago', async ({ page }) => {
  await setup(page, { subscription: activeSubscription })
  await page.goto('/configuracion')
  const card = page.getByRole('region', { name: 'Estado de la licencia' })
  await expect(card.getByTestId('license-plan')).toHaveText('TallerFlow Mensual')
  await expect(card.getByTestId('license-status')).toHaveText('Activa')
  await expect(card.getByTestId('license-next')).toContainText('2030')
  await expect(card.getByRole('button', { name: 'Gestionar pago' })).toBeVisible()
})
