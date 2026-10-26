import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')
const owner = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Carlos Martínez', role: 'OWNER', is_active: true, workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Taller Centro', status: 'ACTIVE' }, workspace_access: 'ACTIVE', permissions: ['*'], permissionsSource: 'rbac' }

const PRICING_MODULE = '**/src/pages/Pricing.jsx*'
const INVENTORY_MODULE = '**/src/pages/Inventory.jsx*'
// Lo que devolvía el servidor antes: index.html (200) en lugar de un 404 para un asset que ya no existe.
const staleChunk = (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>spa</title>' })
const pricingHeading = (page) => page.getByRole('heading', { name: 'Licencia de activación', exact: true })

async function mockPublicNetwork(page) {
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: {} }))
  await page.route(/\/api\//, (route) => route.fulfill({ json: { data: [] } }))
}

async function signIn(page) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: owner.id, email: 'qa@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated' }
  const access_token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.')
  const session = { user, access_token, expires_at: exp, expires_in: 3600, refresh_token: 'qa-refresh', token_type: 'bearer' }
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, value: session })
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: session }))
  await page.route(/\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '')
    if (path === '/auth/me') return route.fulfill({ json: { profile: owner, workshop: owner.workshop, workspace_access: 'ACTIVE' } })
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } })
    return route.fulfill({ json: { data: [] } })
  })
}

// Navegación dentro de la SPA (sin recargar) hacia una pantalla cuyo JavaScript aún no se había descargado.
async function openPricing(page) {
  await page.goto('/login')
  await page.getByRole('link', { name: /Comprar licencia de activación/ }).click()
}

function countLoads(page) {
  const counter = { value: 0 }
  page.on('load', () => { counter.value += 1 })
  return counter
}

test('si falta el JavaScript de una pantalla tras un deploy, la app recarga sola y se recupera', async ({ page }) => {
  await mockPublicNetwork(page)
  let requests = 0
  await page.route(PRICING_MODULE, (route) => (requests++ === 0 ? staleChunk(route) : route.continue()))

  await openPricing(page)

  await expect(pricingHeading(page)).toBeVisible()
  expect(requests).toBeGreaterThanOrEqual(2)
})

test('si el fallo persiste no hay bucle de recargas: se avisa y "Recargar" recupera cuando el deploy termina', async ({ page }) => {
  await mockPublicNetwork(page)
  await page.route(PRICING_MODULE, staleChunk)
  const loads = countLoads(page)

  await openPricing(page)

  const notice = page.getByRole('alert').filter({ hasText: 'Hay una versión nueva de TallerFlow' })
  await expect(notice).toBeVisible()
  const settled = loads.value
  await page.waitForTimeout(1500)
  expect(loads.value).toBe(settled)
  await expect(notice).toBeVisible()

  await page.unroute(PRICING_MODULE)
  await notice.getByRole('button', { name: 'Recargar' }).click()
  await expect(pricingHeading(page)).toBeVisible()
})

test('un error que no es de versión muestra el aviso genérico y no recarga solo', async ({ page }) => {
  await mockPublicNetwork(page)
  await page.route(PRICING_MODULE, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'throw new Error("boom")' }))
  const loads = countLoads(page)

  await openPricing(page)

  const notice = page.getByRole('alert').filter({ hasText: 'No pudimos mostrar esta pantalla' })
  await expect(notice).toBeVisible()
  await expect(notice.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  await expect(notice.getByRole('button', { name: 'Recargar' })).toBeVisible()
  const settled = loads.value
  await page.waitForTimeout(1000)
  expect(loads.value).toBe(settled)
})

test('dentro de la aplicación el aviso ocupa solo el contenido y el menú sigue disponible', async ({ page }) => {
  await signIn(page)
  // Recarga ya consumida: equivale a un fallo persistente, así que no se recarga sola.
  await page.addInitScript(() => sessionStorage.setItem('tf:chunk-reload-at', String(Date.now())))
  await page.route(INVENTORY_MODULE, staleChunk)

  await page.goto('/ruta-que-no-existe')
  await page.getByRole('link', { name: 'Inventario' }).first().click()

  const content = page.locator('#main-content')
  await expect(content.getByRole('alert').filter({ hasText: 'Hay una versión nueva de TallerFlow' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Inventario' }).first()).toBeVisible()
})
