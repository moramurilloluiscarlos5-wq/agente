import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')
const customerId = '11111111-1111-4111-8111-111111111111'
const deviceId = '22222222-2222-4222-8222-222222222222'
const adminId = '33333333-3333-4333-8333-333333333333'
const technicianId = '44444444-4444-4444-8444-444444444444'
const timestamp = '2026-09-18T12:00:00.000Z'

// Cada prueba usa una sesión ficticia y una API interceptada: nunca escribe en Supabase.
async function workshop(page, role = 'ADMINISTRADOR') {
  const profile = { id: role === 'TECNICO' ? technicianId : adminId, full_name: 'Usuario de prueba', role, is_active: true, workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'ACTIVE', name: 'Taller de prueba' }, workspace_access: 'ACTIVE' }
  const user = { id: profile.id, email: 'test@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated' }
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: user.id, exp: expiresAt, role: 'authenticated' })).toString('base64url'),
    'test-signature',
  ].join('.')
  const session = { access_token: token, refresh_token: 'test-refresh', expires_at: expiresAt, expires_in: 3600, token_type: 'bearer', user }
  const storageKey = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: session })
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: session }))
  const state = {
    customers: [{ id: customerId, first_name: 'Luis', last_name: 'Prueba', phone: '6141234567', email: 'cliente@example.invalid', created_at: timestamp }],
    devices: [{ id: deviceId, customer_id: customerId, brand: 'Samsung', model: 'Galaxy S21', imei: '123456789012345', physical_condition: 'Pantalla rota', created_at: timestamp }],
    repairs: [{ id: '55555555-5555-4555-8555-555555555555', order_number: 'CAR-2026-0001', customer_id: customerId, device_id: deviceId, technician_id: technicianId, status: 'recibido', reported_problem: 'Pantalla rota', estimated_cost: 1200, deposit: 200, received_at: timestamp, created_at: timestamp }],
    history: [{ id: 'history-1', status: 'recibido', note: 'Equipo recibido', created_at: timestamp, user: { full_name: 'Usuario de prueba' } }],
    mutations: [],
    failCustomers: false,
  }
  const customer = (id) => state.customers.find((row) => row.id === id)
  const device = (row) => ({ ...row, customer: customer(row.customer_id) })
  const repair = (row) => ({ ...row, customer: customer(row.customer_id), device: state.devices.find((item) => item.id === row.device_id), technician: { id: technicianId, full_name: 'Técnico de prueba' } })
  await page.route(/\/api\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/, '')
    const method = request.method()
    const body = request.postDataJSON()
    const respond = (json, status = 200) => route.fulfill({ status, json })
    if (!request.headers().authorization?.startsWith('Bearer ')) return respond({ message: 'Falta sesión de prueba' }, 401)
    if (method !== 'GET') state.mutations.push({ path, method, body })
    if (path === '/auth/me') return respond({ id: profile.id, role, profile })
    if (path === '/whatsapp/messages') return respond({ data: [] })
    const consent = path.match(/^\/whatsapp\/customers\/([^/]+)\/consent$/)
    if (consent && method === 'PATCH') {
      const row = customer(consent[1])
      if (!row) return respond({ message: 'No encontrado' }, 404)
      Object.assign(row, body)
      return respond({ data: row })
    }
    if (path === '/technicians') return respond({ data: [{ id: technicianId, full_name: 'Técnico de prueba' }] })
    if (path === '/auth/users') return respond({ data: [profile] })
    if (path === '/dashboard') return respond({ data: { stats: { pending: 1, diagnostics: 0, inRepair: 0, waitingParts: 0, ready: 0, delivered: 0 }, recentRepairs: [], recentCustomers: [], upcomingDeliveries: [] } })
    if (path === '/customers' && method === 'POST') {
      const row = { ...body, id: '66666666-6666-4666-8666-666666666666', created_at: timestamp }
      state.customers.push(row)
      return respond({ data: row }, 201)
    }
    if (path === '/devices' && method === 'POST') {
      const row = { ...body, id: '77777777-7777-4777-8777-777777777777', created_at: timestamp }
      state.devices.push(row)
      return respond({ data: device(row) }, 201)
    }
    if (path === '/repairs' && method === 'POST') {
      const row = { ...body, id: '88888888-8888-4888-8888-888888888888', order_number: 'CAR-2026-0002', status: 'recibido', created_at: timestamp }
      state.repairs.push(row)
      return respond({ data: repair(row) }, 201)
    }
    for (const kind of ['customers', 'devices', 'repairs']) {
      if (path === `/${kind}` && method === 'GET') {
        if (kind === 'customers' && state.failCustomers) return respond({ message: 'Error de conexión simulado' }, 503)
        let data = state[kind]
        if (url.searchParams.get('customer_id')) data = data.filter((row) => row.customer_id === url.searchParams.get('customer_id'))
        if (url.searchParams.get('status')) data = data.filter((row) => row.status === url.searchParams.get('status'))
        const q = url.searchParams.get('q')?.toLowerCase()
        if (q) data = data.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
        const count = data.length
        const limit = Number(url.searchParams.get('limit') || 25)
        const currentPage = Number(url.searchParams.get('page') || 1)
        data = data.slice((currentPage - 1) * limit, currentPage * limit).map(kind === 'devices' ? device : kind === 'repairs' ? repair : (row) => row)
        return respond({ data, count, page: currentPage, limit })
      }
    }
    const match = path.match(/^\/(customers|devices|repairs)\/([^/]+)(\/history)?$/)
    if (match) {
      const [, kind, id, isHistory] = match
      const row = state[kind].find((item) => kind === 'repairs' ? item.order_number === id : item.id === id)
      if (!row) return respond({ message: 'No encontrado' }, 404)
      if (isHistory && method === 'POST') {
        row.status = body.status
        state.history.push({ id: `history-${state.history.length + 1}`, ...body, created_at: timestamp, user: { full_name: profile.full_name } })
        return respond({ data: repair(row) })
      }
      if (method === 'PATCH') Object.assign(row, body)
      if (method === 'DELETE') {
        state[kind] = state[kind].filter((item) => item !== row)
        return route.fulfill({ status: 204 })
      }
      if (kind === 'customers') return respond({ data: row, devices: state.devices.filter((item) => item.customer_id === id), repairs: state.repairs.filter((item) => item.customer_id === id).map(repair) })
      if (kind === 'devices') return respond({ data: device(row), repairs: state.repairs.filter((item) => item.device_id === id).map(repair) })
      return respond({ data: repair(row), history: state.history })
    }
    return respond({ message: `Ruta sin fixture: ${method} ${path}` }, 500)
  })
  return state
}

test('registra un cliente, conserva sus datos y muestra el perfil del administrador', async ({ page }) => {
  const state = await workshop(page)
  await page.goto('/clientes')
  await expect(page.getByText('Usuario de prueba', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click()
  await page.getByLabel('Nombre', { exact: false }).fill('Ana')
  await page.getByLabel('Apellidos').fill('Pérez')
  await page.getByLabel('Teléfono', { exact: false }).fill('6149876543')
  await page.getByRole('button', { name: 'Guardar cliente' }).click()
  await expect(page.getByRole('heading', { name: 'Ana Pérez' })).toBeVisible()
  expect(state.mutations).toHaveLength(2)
  expect(state.mutations[0].body).toMatchObject({ first_name: 'Ana', last_name: 'Pérez', phone: '6149876543' })
  expect(state.mutations[1].path).toMatch(/\/consent$/)
})

test('recupera el listado tras un fallo de API sin mostrar un éxito falso', async ({ page }) => {
  const state = await workshop(page)
  state.failCustomers = true
  await page.goto('/clientes')
  await expect(page.getByRole('alert')).toContainText('Error de conexión simulado')
  state.failCustomers = false
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByRole('button', { name: 'Luis Prueba', exact: true })).toBeVisible()
})

test('el técnico consulta clientes pero no puede abrir altas ni administrar personal', async ({ page }) => {
  await workshop(page, 'TECNICO')
  await page.goto('/clientes')
  await expect(page.getByRole('button', { name: 'Luis Prueba', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo cliente', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Personal', exact: true })).toHaveCount(0)
  await page.goto('/personal')
  await expect(page.getByText('No tienes permisos para acceder a esta sección.')).toBeVisible()
  await page.goto('/reparaciones/nueva')
  await expect(page.getByRole('button', { name: /Crear orden|Guardar reparación|Registrar reparación/ })).toHaveCount(0)
})

test('una orden nueva conserva cliente, equipo, revisión y anticipo', async ({ page }) => {
  const state = await workshop(page)
  await page.goto(`/reparaciones/nueva?customer_id=${customerId}&device_id=${deviceId}`)
  await page.getByLabel('Problema reportado').fill('No carga después de una caída')
  await page.getByLabel('Costo estimado').fill('950')
  await page.getByLabel('Anticipo recibido').fill('150')
  await page.getByLabel('Enciende', { exact: true }).selectOption('true')
  await page.getByLabel('Responsable', { exact: true }).selectOption(technicianId)
  await page.getByRole('button', { name: /Crear orden|Guardar reparación|Registrar reparación/ }).click()
  await expect(page).toHaveURL(/\/reparaciones\/CAR-2026-0002$/)
  expect(state.mutations[0].body).toMatchObject({ customer_id: customerId, device_id: deviceId, powers_on: true, estimated_cost: 950, deposit: 150, technician_id: technicianId })
})

test('los clientes caben en una pantalla móvil', async ({ page }) => {
  await workshop(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/clientes')
  await expect(page.getByRole('button', { name: 'Luis Prueba', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
