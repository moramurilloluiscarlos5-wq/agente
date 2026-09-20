import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')
const installer = 'CarlosTechDeviceAgentSetup.exe'
function release(version) {
  const tag = `device-agent-v${version}`
  return { version, tag, platform: 'windows-x64', installer, signed: true, sha256: 'a'.repeat(64), size: 12345,
    downloadUrl: `https://github.com/example/device-agent/releases/download/${tag}/${installer}`,
    releaseUrl: `https://github.com/example/device-agent/releases/tag/${tag}` }
}

// All responses are fixtures; these UI tests never publish, download or contact the real agent.
async function setup(page, installed = '1.0.0') {
  const profile = { id: '11111111-1111-4111-8111-111111111111', role: 'OWNER', full_name: 'Release Test', is_active: true,
    workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Test', status: 'ACTIVE' },
    workspace_access: 'ACTIVE', permissions: ['*'], permissionsSource: 'rbac' }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: profile.id, email: 'release@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated' }
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.')
  const session = { user, access_token: token, refresh_token: 'test-refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer' }
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, value: session })
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: session }))
  const state = { release: release('1.0.1'), status: 200, requests: 0 }
  await page.route(/\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '')
    if (path === '/auth/me') return route.fulfill({ json: { profile } })
    if (path === '/device-tools/release') {
      state.requests += 1
      return route.fulfill({ status: state.status, json: state.status === 200 ? { data: state.release } : { message: 'No hay una release oficial firmada disponible.' } })
    }
    return route.fulfill({ json: { data: [] } })
  })
  await page.route('http://127.0.0.1:5391/**', (route) => {
    if (new URL(route.request().url()).pathname === '/health') return route.fulfill({ json: { version: installed } })
    return route.fulfill({ json: { data: { pairing_required: true, pairing_code: '123456' } } })
  })
  return state
}

test('offers the official installer and an update from 1.0.0 to 1.0.1', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/herramientas-dispositivo')
  await expect(page.getByText('Nueva versión disponible: 1.0.1', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Descargar CarlosTech Device Agent', exact: true })).toHaveAttribute('href', state.release.downloadUrl)
  await expect(page.getByRole('link', { name: 'Actualizar', exact: true })).toHaveAttribute('href', state.release.downloadUrl)
})

test('rejects unsigned metadata and recovers through retry', async ({ page }) => {
  const state = await setup(page)
  state.release.signed = false
  await page.goto('/herramientas-dispositivo')
  await expect(page.getByRole('alert')).toContainText('no contiene un instalador firmado válido')
  await expect(page.getByRole('link', { name: 'Descargar CarlosTech Device Agent', exact: true })).toHaveCount(0)
  state.release.signed = true
  await page.getByRole('button', { name: 'Reintentar descarga' }).click()
  await expect(page.getByRole('link', { name: 'Descargar CarlosTech Device Agent', exact: true })).toBeVisible()
})

test('shows a real release error without a dead download link', async ({ page }) => {
  const state = await setup(page)
  state.status = 503
  await page.goto('/herramientas-dispositivo')
  await expect(page.getByRole('alert')).toContainText('No hay una release oficial firmada disponible.')
  await expect(page.getByRole('link', { name: 'Descargar CarlosTech Device Agent', exact: true })).toHaveCount(0)
  state.status = 200
  await page.getByRole('button', { name: 'Reintentar descarga' }).click()
  await expect(page.getByRole('link', { name: 'Descargar CarlosTech Device Agent', exact: true })).toBeVisible()
})

test('refreshes on focus and never proposes a downgrade', async ({ page }) => {
  const state = await setup(page, '1.0.9')
  await page.goto('/herramientas-dispositivo')
  await expect(page.getByRole('link', { name: 'Descargar CarlosTech Device Agent', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Actualizar', exact: true })).toHaveCount(0)
  state.release = release('1.0.10')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('Nueva versión disponible: 1.0.10', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Actualizar', exact: true })).toHaveAttribute('href', state.release.downloadUrl)
})

test('polls each minute and removes the timer when leaving Device Tools', async ({ page }) => {
  await page.clock.install()
  const state = await setup(page)
  await page.goto('/herramientas-dispositivo')
  await expect(page.getByRole('link', { name: 'Descargar CarlosTech Device Agent', exact: true })).toBeVisible()
  state.release = release('1.0.2')
  await page.clock.fastForward(60000)
  await expect(page.getByText('Nueva versión disponible: 1.0.2', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Clientes', exact: true }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  const count = state.requests
  await page.clock.fastForward(60000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  expect(state.requests).toBe(count)
})
