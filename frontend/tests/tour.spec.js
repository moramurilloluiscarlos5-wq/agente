import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')
const owner = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Carlos Martínez', role: 'OWNER', is_active: true, workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Taller Centro', status: 'ACTIVE' }, workspace_access: 'ACTIVE', permissions: ['*'], permissionsSource: 'rbac', last_login_at: '2026-10-01T00:00:00Z' }

async function setup(page, profile = owner) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: owner.id, email: 'qa@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated' }
  const access_token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.')
  const session = { user, access_token, expires_at: exp, expires_in: 3600, refresh_token: 'qa-refresh', token_type: 'bearer' }
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, value: session })
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: session }))
  await page.route(/\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '')
    if (path === '/auth/me') return route.fulfill({ json: { profile, workshop: owner.workshop, workspace_access: 'ACTIVE' } })
    if (path === '/health') return route.fulfill({ json: { status: 'ok' } })
    return route.fulfill({ json: { data: [] } })
  })
}

test('el recorrido guiado explica cada opción del menú paso a paso', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const launcher = page.getByRole('button', { name: /Recorrido guiado/ })
  await launcher.click()
  await expect(page.getByRole('dialog', { name: 'Te damos la bienvenida a TallerFlow' })).toContainText('1 de 22')
  await expect(page.getByRole('button', { name: 'Anterior' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeFocused()

  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('dialog', { name: 'Tu taller' })).toContainText('2 de 22')
  await page.keyboard.press('ArrowRight')
  const panel = page.getByRole('dialog', { name: 'Panel de control' })
  await expect(panel).toContainText('Resumen del día')
  await expect(panel).toContainText('Cuándo usarla:')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Reparaciones' })).toContainText('4 de 22')
  await page.getByRole('button', { name: 'Anterior' }).click()
  await expect(page.getByRole('dialog', { name: 'Panel de control' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(launcher).toBeFocused()
})

test('el último paso termina el recorrido y señala dónde repetirlo', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: /Recorrido guiado/ }).click()
  for (let step = 1; step < 22; step += 1) await page.keyboard.press('ArrowRight')
  const finish = page.getByRole('dialog', { name: '¡Listo!' })
  await expect(finish).toContainText('22 de 22')
  await expect(finish.getByRole('button', { name: 'Omitir' })).toHaveCount(0)
  await finish.getByRole('button', { name: 'Terminar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('en el primer inicio de sesión del personal el recorrido arranca solo y no se repite', async ({ page }) => {
  await setup(page, { ...owner, role: 'TECNICO', last_login_at: null })
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: 'Te damos la bienvenida a TallerFlow' })).toBeVisible()
  await page.getByRole('button', { name: 'Omitir' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Panel de control', level: 1 })).toBeVisible()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('en celular el recorrido abre el menú para mostrar cada opción y lo cierra para la barra superior', async ({ page }) => {
  await setup(page, { ...owner, entitlements: { tier: 'plus', name: 'Plus', trial: false, max_users: 3, features: [] } })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('button', { name: /Recorrido guiado/ }).click()
  await expect(page.getByRole('dialog')).toContainText('1 de 21')

  const sidebar = page.getByRole('complementary', { name: 'Menú lateral' })
  await page.keyboard.press('ArrowRight')
  await expect(sidebar).toBeInViewport()
  for (let step = 2; step < 6; step += 1) await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Diagnóstico IA' })).toContainText('disponible desde el plan Max')

  for (let step = 6; step < 17; step += 1) await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible()
  await expect(sidebar).not.toBeInViewport()
  await page.getByRole('button', { name: 'Omitir' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
