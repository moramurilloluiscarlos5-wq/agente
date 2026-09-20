import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'
const env = loadEnv('development', process.cwd(), 'VITE_')
const A = { id: '11111111-1111-4111-8111-111111111111', role: 'OWNER', full_name: 'Owner A', is_active: true, workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Taller A', status: 'ACTIVE' }, workspace_access: 'ACTIVE', permissions: ['*'], permissionsSource: 'rbac' }
const B = { ...A, id: '22222222-2222-4222-8222-222222222222', full_name: 'Owner B', workshop_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', workshop: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Taller B', status: 'ACTIVE' } }
function session(profile) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: profile.id, email: 'qa@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated' }
  const access_token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.')
  return { user, access_token, expires_at: exp, expires_in: 3600, refresh_token: 'qa-refresh', token_type: 'bearer' }
}
async function setup(page, { profile = A, signedIn = false, duplicate = false } = {}) {
  const state = { profile: structuredClone(profile), calls: [], registrations: 0 }
  if (signedIn) await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, value: session(profile) })
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 })
    if (path.endsWith('/token')) {
      const body = route.request().postDataJSON()
      if (body?.email === 'b@example.invalid') state.profile = structuredClone(B)
    }
    return route.fulfill({ json: session(state.profile) })
  })
  await page.route(/\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '')
    state.calls.push(path)
    if (path === '/auth/register-workshop' || path === '/auth/create-workshop') {
      state.registrations += 1
      if (duplicate) return route.fulfill({ status: 409, json: { message: 'Ya existe una cuenta con este correo. Inicia sesión para continuar.' } })
      const body = route.request().postDataJSON()
      state.profile = { ...A, full_name: body.full_name || 'Owner A', workshop: { ...A.workshop, name: body.workshop_name } }
      return route.fulfill({ status: 201, json: { data: { profile: state.profile, workshop: state.profile.workshop } } })
    }
    if (path === '/auth/me') return route.fulfill({ json: { profile: state.profile, workshop: state.profile.workshop, workspace_access: state.profile.workspace_access } })
    if (path === '/dashboard') return route.fulfill({ json: { data: { stats: { pending: 0, diagnostics: 0, inRepair: 0, waitingParts: 0, ready: 0, delivered: 0 }, recentRepairs: [], recentCustomers: [], upcomingDeliveries: [] } } })
    if (path === '/customers') return route.fulfill({ json: { data: [{ id: state.profile.id, first_name: state.profile.workshop.name, last_name: 'Cliente', phone: '6140000000' }], count: 1 } })
    return route.fulfill({ json: { data: [] } })
  })
  return state
}
async function login(page, email = 'a@example.invalid') {
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill('Example123!')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
}

for (const profile of [A, B, { ...A, role: 'TECNICO', permissions: ['dashboard.view', 'clients.view'] }]) {
  test(`login ${profile.full_name} ${profile.role} entra a su dashboard sin crear taller`, async ({ page }) => {
    const state = await setup(page, { profile })
    await page.goto('/login')
    await login(page)
    await expect(page.getByRole('heading', { name: 'Panel de control' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    expect(state.registrations).toBe(0)
    if (profile.role === 'TECNICO') await expect(page.getByText('Resumen de tus reparaciones asignadas')).toBeVisible()
    else await expect(page.getByText(`Resumen de ${profile.workshop.name}`, { exact: true })).toBeVisible()
  })
}

test('sin taller va a crear taller sin consultar datos de negocio y puede completar onboarding', async ({ page }) => {
  const state = await setup(page, { profile: { ...A, workshop: null, workshop_id: null, workspace_access: 'NO_WORKSHOP' } })
  await page.goto('/login')
  await login(page)
  await expect(page).toHaveURL(/\/crear-taller$/)
  expect(state.calls.filter((p) => p === '/dashboard' || p === '/customers')).toEqual([])
  await page.getByLabel('Nombre del taller').fill('Mi taller')
  await page.getByRole('button', { name: 'Crear mi taller', exact: true }).click()
  await expect(page.getByRole('heading', { name: '¡Tu taller está listo!' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Invitar empleado' })).toBeVisible()
  await page.getByRole('link', { name: 'Ir al Dashboard' }).click()
  await expect(page.getByText('Resumen de Mi taller', { exact: true })).toBeVisible()
  expect(state.registrations).toBe(1)
})

for (const status of ['SUSPENDED', 'INACTIVE']) {
  test(`${status} muestra bloqueo y no monta dashboard`, async ({ page }) => {
    const state = await setup(page, { profile: { ...A, workspace_access: status, workshop: { ...A.workshop, status } } })
    await page.goto('/login')
    await login(page)
    await expect(page).toHaveURL(/\/taller-suspendido$/)
    await expect(page.getByRole('heading', { name: status === 'SUSPENDED' ? 'Taller temporalmente suspendido' : 'Taller inactivo' })).toBeVisible()
    expect(state.calls).not.toContain('/dashboard')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
}

test('SUPER_ADMIN usa el panel existente sin onboarding', async ({ page }) => {
  const state = await setup(page, { profile: { ...A, role: 'SUPER_ADMIN', workshop_id: null, workshop: null, workspace_access: 'PLATFORM' } })
  await page.goto('/login')
  await login(page)
  await expect(page.getByText('Administración de la plataforma', { exact: true })).toBeVisible()
  expect(state.registrations).toBe(0)
})

async function registrationForm(page) {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Registra tu taller gratis' }).click()
  await expect(page).toHaveURL(/\/registro$/)
  await page.getByLabel('Nombre completo').fill('Nuevo Owner')
  await page.getByLabel('Correo', { exact: true }).fill('new@example.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example123!')
  await page.getByLabel('Confirmar contraseña').fill('Example123!')
  await page.getByLabel('Nombre del taller').fill('Taller nuevo')
}

test('nuevo registro y doble submit crean una sola solicitud y muestran bienvenida', async ({ page }) => {
  const state = await setup(page)
  await registrationForm(page)
  await page.locator('form').evaluate((form) => { form.requestSubmit(); form.requestSubmit() })
  await expect(page.getByRole('heading', { name: '¡Tu taller está listo!' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Registrar primer cliente' })).toBeVisible()
  expect(state.registrations).toBe(1)
  await page.getByRole('link', { name: 'Ir al Dashboard' }).click()
  await expect(page.getByText('Resumen de Taller nuevo', { exact: true })).toBeVisible()
})

test('correo duplicado muestra error sin sesión ni éxito falso', async ({ page }) => {
  await setup(page, { duplicate: true })
  await registrationForm(page)
  await page.getByRole('button', { name: 'Crear mi taller', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Ya existe una cuenta')
  await expect(page.getByRole('heading', { name: '¡Tu taller está listo!' })).toHaveCount(0)
  await expect(page).toHaveURL(/\/registro$/)
})

test('logout A, login B elimina datos y cache del taller anterior', async ({ page }) => {
  await setup(page)
  await page.goto('/login')
  await login(page)
  await page.getByRole('link', { name: 'Clientes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Taller A Cliente', exact: true })).toBeVisible()
  await page.evaluate(() => { localStorage.setItem('carlostech-records', 'A'); sessionStorage.setItem('carlostech-records', 'A') })
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, 'b@example.invalid')
  await page.getByRole('link', { name: 'Clientes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Taller B Cliente', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Taller A Cliente', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => [localStorage.getItem('carlostech-records'), sessionStorage.getItem('carlostech-records')])).toEqual([null, null])
})
