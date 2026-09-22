import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')

async function setup(page, { paired = true } = {}) {
  const profile = {
    id: '11111111-1111-4111-8111-111111111111', role: 'OWNER', full_name: 'Pairing Test', is_active: true,
    workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Test', status: 'ACTIVE' },
    workspace_access: 'ACTIVE', permissions: ['*'], permissionsSource: 'rbac',
  }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: profile.id, email: 'pairing@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated' }
  const session = {
    user, access_token: 'test-supabase-session-token', refresh_token: 'test-refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer',
  }
  const storageKey = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: session })
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: session }))

  const state = { paired, sessionStatus: 200, stalledPath: null, localRequests: [] }
  await page.route(/\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '')
    if (path === '/auth/me') return route.fulfill({ json: { profile } })
    if (path === '/device-tools/session') {
      expect(route.request().method()).toBe('POST')
      expect(route.request().postDataJSON()).toEqual({ agent_id: 'agent-test', pairing_code: '123456' })
      if (state.sessionStatus !== 200) return route.fulfill({ status: state.sessionStatus, json: { message: 'El servicio de sesiones no está disponible temporalmente.' } })
      return route.fulfill({ json: { data: { token: 'signed-capability-token', agent_id: 'agent-test' } } })
    }
    if (path === '/device-tools/release') return route.fulfill({ status: 503, json: { message: 'Release no configurada en esta prueba.' } })
    return route.fulfill({ json: { data: [] } })
  })

  await page.route('http://127.0.0.1:5391/**', (route) => {
    const path = new URL(route.request().url()).pathname
    state.localRequests.push(path)
    if (path === state.stalledPath) return
    if (path === '/health') return route.fulfill({ json: { status: 'ok', version: '1.0.1' } })
    if (path === '/pairing/status') return route.fulfill({ json: { data: { paired: state.paired, pairing_required: !state.paired, agent_id: 'agent-test', pairing_code: '123456' } } })
    if (path === '/devices') return route.fulfill({ status: 401, json: { error: 'Token del agente ausente, inválido o expirado.' } })
    return route.fulfill({ json: { data: {} } })
  })
  return state
}

test('a rejected paired-agent token offers recovery pairing instead of a dead-end error', async ({ page }) => {
  await setup(page)
  await page.goto('/herramientas-dispositivo')
  await expect(page.getByRole('heading', { name: 'Conectar esta computadora con CARLOSTECH AI' })).toBeVisible()
  await expect(page.getByText('El agente respondió, pero su secreto anterior ya no coincide.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Permitir y vincular' })).toBeVisible()
  await expect(page.getByText('Agent detectado · pendiente de vincular', { exact: true })).toBeVisible()
})

test('expired agent sessions renew once before concurrent local requests', async ({ page }) => {
  await setup(page)
  let sessions = 0
  const tokens = []
  await page.route('**/api/dashboard', (route) => route.fulfill({ json: { data: null } }))
  await page.route('**/api/device-tools/session', (route) => {
    sessions += 1
    return route.fulfill({ json: { data: {
      token: `token-${sessions}`, agent_id: 'agent-test',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    } } })
  })
  await page.route('http://127.0.0.1:5391/devices', (route) => {
    tokens.push(route.request().headers().authorization)
    return route.fulfill({ json: { data: { devices: [] } } })
  })
  await page.goto('/')
  await page.evaluate(async () => {
    const { openDeviceAgent } = await import('/src/services/deviceAgent.js')
    const agent = await openDeviceAgent()
    agent.session.expires_at = new Date(Date.now() - 1000).toISOString()
    await Promise.all([agent.request('/devices'), agent.request('/devices')])
  })
  expect(sessions).toBe(2)
  expect(tokens).toEqual(['Bearer token-1', 'Bearer token-2', 'Bearer token-2'])
})

test('a failed renewal sends no local command and can be retried', async ({ page }) => {
  await setup(page)
  let sessions = 0
  let localRequests = 0
  await page.route('**/api/dashboard', (route) => route.fulfill({ json: { data: null } }))
  await page.route('**/api/device-tools/session', (route) => {
    sessions += 1
    return route.fulfill({ json: { data: sessions === 2 ? {} : {
      token: `token-${sessions}`, agent_id: 'agent-test',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    } } })
  })
  await page.route('http://127.0.0.1:5391/devices', (route) => {
    localRequests += 1
    return route.fulfill({ json: { data: { devices: [] } } })
  })
  await page.goto('/')
  const outcome = await page.evaluate(async () => {
    const { openDeviceAgent } = await import('/src/services/deviceAgent.js')
    const agent = await openDeviceAgent()
    agent.session.expires_at = new Date(Date.now() - 1000).toISOString()
    let code
    try { await agent.request('/devices') } catch (error) { code = error.code }
    await agent.request('/devices')
    return code
  })
  expect(outcome).toBe('AGENT_SESSION_ERROR')
  expect(sessions).toBe(3)
  expect(localRequests).toBe(2)
})

test('a backend session failure keeps the detected agent visible and allows retry', async ({ page }) => {
  const state = await setup(page)
  state.sessionStatus = 503
  await page.goto('/herramientas-dispositivo')
  await expect(page.getByRole('heading', { name: 'El agente está activo; falta completar la conexión' })).toBeVisible()
  await expect(page.getByText('Agent detectado · conexión pendiente', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'El servicio de sesiones no está disponible temporalmente.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'CarlosTech Device Agent no está conectado' })).toHaveCount(0)
  state.sessionStatus = 200
  await page.getByRole('button', { name: 'Reintentar conexión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Permitir y vincular' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'El agente está activo; falta completar la conexión' })).toHaveCount(0)
})

for (const path of ['/health', '/pairing/status']) {
  test(`a stalled ${path} times out and the installation button can retry discovery`, async ({ page }) => {
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    const state = await setup(page, { paired: false })
    state.stalledPath = path
    await page.goto('/herramientas-dispositivo')
    await expect.poll(() => state.localRequests.includes(path)).toBe(true)
    await expect(page.getByRole('button', { name: 'Comprobar instalación', exact: true })).toBeDisabled()
    await page.clock.runFor(8001)
    await expect(page.getByRole('alert').filter({ hasText: 'El agente local no respondió a tiempo.' })).toBeVisible()
    await expect(page.getByText('Agent sin conexión', { exact: true })).toBeVisible()
    state.stalledPath = null
    await page.getByRole('button', { name: 'Comprobar instalación', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Permitir y vincular' })).toBeVisible()
    await expect(page.getByText('Agent detectado · pendiente de vincular', { exact: true })).toBeVisible()
  })
}
