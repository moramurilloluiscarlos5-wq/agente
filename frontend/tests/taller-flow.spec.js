import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')
const owner = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Carlos Martínez', role: 'OWNER', is_active: true, workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Taller Centro', status: 'ACTIVE' }, workspace_access: 'ACTIVE', permissions: ['*'], permissionsSource: 'rbac' }
const staff = [owner, { id: 'tech-1', full_name: 'Ana López', role: 'TECNICO', is_active: true, email: 'ana@example.invalid' }, { id: 'desk-1', full_name: 'Luis García', role: 'RECEPCION', is_active: false }]

async function setup(page) {
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
    if (path === '/auth/users') return route.fulfill({ json: { data: staff } })
    if (path === '/dashboard') return route.fulfill({ json: { data: {
      stats: { pending: 8, inRepair: 12, waitingParts: 3, ready: 5 },
      recentRepairs: [{ orderNumber: 'TF-0042', customer: 'María Torres', device: 'iPhone 13', status: 'en_reparacion', receivedAt: '2026-10-16' }, { orderNumber: 'TF-0041', customer: 'Roberto Díaz', device: 'Samsung A54', status: 'listo_para_entregar', receivedAt: '2026-10-15' }],
      recentCustomers: [{ id: 'c1', name: 'María Torres', phone: '614 000 0000', createdAt: '2026-10-16' }],
      upcomingDeliveries: [{ orderNumber: 'TF-0041', device: 'Samsung A54', customer: 'Roberto Díaz', status: 'listo_para_entregar', estDelivery: '2026-10-18' }],
    } } })
    return route.fulfill({ json: { data: [] } })
  })
}

test('el panel permite buscar con teclado y cerrar notificaciones', async ({ page }, testInfo) => {
  await setup(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Panel de control' })).toBeVisible()
  await expect(page.locator('.ct-kpi-value').first()).toHaveText('8')
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.getByRole('button', { name: 'Notificaciones', exact: true }).click()
  await expect(page.locator('#notifications-panel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#notifications-panel')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true, animations: 'disabled' })
})

test('personal filtra miembros y muestra al propietario con su rol correcto', async ({ page }, testInfo) => {
  await setup(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/personal')
  const ownerRole = page.getByLabel('Rol de Carlos Martínez')
  await expect(ownerRole).toHaveValue('OWNER')
  await expect(ownerRole).toBeDisabled()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page.getByLabel('Buscar personal').fill('Ana')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody')).toContainText('Ana López')
  await page.getByLabel('Buscar personal').fill('')
  await page.getByLabel('Filtrar por estado').selectOption('inactive')
  await expect(page.locator('tbody')).toContainText('Luis García')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Filtrar por estado').selectOption('all')
  await page.screenshot({ path: testInfo.outputPath('staff-desktop.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Nuevo usuario' }).click()
  await expect(page.getByLabel('Nombre completo')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar formulario' }).click()
  await expect(page.locator('#staff-form')).toHaveCount(0)
})

test('móvil conserva las etiquetas tras colapsar el menú y respeta movimiento reducido', async ({ page }, testInfo) => {
  await setup(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Colapsar menú' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.ct-kpi-value').first()).toHaveText('8')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('dashboard-mobile.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByText('Personal')).toBeVisible()
  await page.getByRole('link', { name: 'Personal', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Personal', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.locator('.tf-page-enter').evaluate((node) => parseFloat(getComputedStyle(node).animationDuration))).toBeLessThan(.001)
  await page.screenshot({ path: testInfo.outputPath('staff-mobile.png'), fullPage: true, animations: 'disabled' })
})

test('la identidad de Taller Flow se muestra en el acceso', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible()
  await expect(page).toHaveTitle('Iniciar sesión | Taller Flow')
  await page.screenshot({ path: testInfo.outputPath('login-desktop.png'), fullPage: true, animations: 'disabled' })
})
