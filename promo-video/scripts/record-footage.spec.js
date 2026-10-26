// Graba las pantallas del promo con datos de ejemplo. Para volver a grabar: cópialo a frontend/tests/ y corre
// npx playwright test tests/record-footage.spec.js desde frontend/ (escribe en promo-video/public/footage).
import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')
const OUT = path.resolve(process.cwd(), '../promo-video/public/footage')
fs.mkdirSync(OUT, { recursive: true })

const T = '2026-10-24T15:30:00.000Z'
const ids = { owner: '11111111-1111-4111-8111-111111111111', tech: '44444444-4444-4444-8444-444444444444', c1: 'c1111111-1111-4111-8111-111111111111', d1: 'd1111111-1111-4111-8111-111111111111' }
const owner = { id: ids.owner, full_name: 'Carlos Martínez', role: 'OWNER', is_active: true, workshop_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workshop: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Taller Centro', status: 'ACTIVE' }, workspace_access: 'ACTIVE', permissions: ['*'], permissionsSource: 'rbac', last_login_at: '2026-10-01T00:00:00Z' }

const people = [['María', 'Torres'], ['Roberto', 'Díaz'], ['Lucía', 'Hernández'], ['Jorge', 'Ramírez'], ['Ana', 'Gómez'], ['Diego', 'Castillo']]
const phones = [['Apple', 'iPhone 13'], ['Samsung', 'Galaxy A54'], ['Xiaomi', 'Redmi Note 12'], ['Motorola', 'Moto G84'], ['Apple', 'iPhone 11'], ['Samsung', 'Galaxy S23']]
const problems = ['Pantalla estrellada', 'No carga', 'Batería inflada', 'Se reinicia solo', 'Cámara borrosa', 'Sin señal']
const statuses = ['en_reparacion', 'listo_para_entregar', 'esperando_refaccion', 'diagnostico', 'recibido', 'en_pruebas']

function data() {
  const customers = people.map(([first, last], i) => ({ id: i === 0 ? ids.c1 : `c${i}111111-1111-4111-8111-11111111111${i}`, first_name: first, last_name: last, full_name: `${first} ${last}`, phone: `614 55${i} 20${i}${i}`, email: `${first.toLowerCase()}@correo.mx`, created_at: T }))
  const devices = phones.map(([brand, model], i) => ({ id: i === 0 ? ids.d1 : `d${i}111111-1111-4111-8111-11111111111${i}`, customer_id: customers[i].id, brand, model, imei: `35${i}9876543210${i}`, created_at: T }))
  const repairs = problems.map((problem, i) => ({ id: `r${i}111111-1111-4111-8111-11111111111${i}`, order_number: `TF-00${42 - i}`, customer_id: customers[i].id, device_id: devices[i].id, technician_id: ids.tech, status: statuses[i], reported_problem: problem, estimated_cost: [1850, 650, 900, 1200, 750, 1400][i], deposit: [500, 200, 300, 0, 200, 400][i], received_at: `2026-10-${24 - i}T15:00:00.000Z`, estimated_delivery_at: `2026-10-${27 + (i % 3)}T18:00:00.000Z`, created_at: T }))
  return { customers, devices, repairs, history: [{ id: 'h1', status: 'recibido', note: 'Equipo recibido en mostrador', created_at: '2026-10-24T15:00:00.000Z', user: { full_name: 'Carlos Martínez' } }, { id: 'h2', status: 'diagnostico', note: 'Display dañado, touch sin respuesta', created_at: '2026-10-24T17:20:00.000Z', user: { full_name: 'Luis Reyes' } }, { id: 'h3', status: 'en_reparacion', note: 'Cambio de pantalla original', created_at: '2026-10-25T10:05:00.000Z', user: { full_name: 'Luis Reyes' } }] }
}

// Punto que sigue al mouse: en el video se ve dónde se toca.
const CURSOR = `addEventListener('DOMContentLoaded', () => {
  const d = document.createElement('div')
  d.style.cssText = 'position:fixed;z-index:99999;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(230,182,46,.55);border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;left:-50px;top:-50px;transition:transform .12s'
  document.body.appendChild(d)
  addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px' }, true)
  addEventListener('mousedown', () => { d.style.transform = 'scale(.7)' }, true)
  addEventListener('mouseup', () => { d.style.transform = 'none' }, true)
})`

async function workshop(page, { cursor = true } = {}) {
  const state = data()
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: owner.id, email: 'carlos@tallercentro.mx', app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated' }
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })).toString('base64url'), 'sig'].join('.')
  const session = { user, access_token: token, expires_at: exp, expires_in: 3600, refresh_token: 'r', token_type: 'bearer' }
  await page.addInitScript(({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem('tf-theme-mode', 'light') }, { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, value: session })
  if (cursor) await page.addInitScript(CURSOR)
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: session }))
  const customer = (id) => state.customers.find((row) => row.id === id)
  const deviceOf = (row) => ({ ...row, customer: customer(row.customer_id) })
  const repairOf = (row) => ({ ...row, customer: customer(row.customer_id), device: state.devices.find((item) => item.id === row.device_id), technician: { id: ids.tech, full_name: 'Luis Reyes' } })
  await page.route(/\/api\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const p = url.pathname.replace(/^\/api/, '')
    const method = request.method()
    const body = request.postDataJSON()
    const respond = (json, status = 200) => route.fulfill({ status, json })
    if (p === '/health') return respond({ status: 'ok' })
    if (p === '/auth/me') return respond({ profile: owner, workshop: owner.workshop, workspace_access: 'ACTIVE' })
    if (p === '/technicians') return respond({ data: [{ id: ids.tech, full_name: 'Luis Reyes' }] })
    if (p === '/auth/users') return respond({ data: [owner, { id: ids.tech, full_name: 'Luis Reyes', role: 'TECNICO', is_active: true }] })
    if (p.startsWith('/public/tracking/')) return respond({ data: {
      orderNumber: 'TF-0042', status: 'listo_para_entregar', statusLabel: 'Listo para entregar', statusHeadline: '¡Tu iPhone 13 está listo!', statusMessage: 'Ya puedes pasar por él al taller. Te esperamos.',
      device: { brand: 'Apple', model: 'iPhone 13', color: 'Azul', maskedImei: '•••• •••• 2104' }, receivedAt: '2026-10-24T15:00:00.000Z', estimatedDeliveryAt: '2026-10-26T18:00:00.000Z',
      timeline: [
        { status: 'recibido', label: 'Recibido', reached: true, at: '2026-10-24T15:00:00.000Z', publicMessage: 'Recibimos tu equipo en el mostrador.' },
        { status: 'diagnostico', label: 'Diagnóstico', reached: true, at: '2026-10-24T17:20:00.000Z', publicMessage: 'Un técnico revisó qué tiene.' },
        { status: 'en_reparacion', label: 'En reparación', reached: true, at: '2026-10-25T10:05:00.000Z', publicMessage: 'Cambiamos la pantalla por una original.' },
        { status: 'listo_para_entregar', label: 'Listo para entregar', reached: true, at: '2026-10-25T16:40:00.000Z', publicMessage: 'Pasó todas las pruebas.' },
        { status: 'entregado', label: 'Entregado', reached: false, at: null, publicMessage: null },
      ],
    } })
    if (p === '/dashboard') return respond({ data: {
      stats: { received: 4, diagnostics: 3, awaitingApproval: 1, inRepair: 12, testing: 2, waitingParts: 3, ready: 5, delivered: 86, deliveredLast30Days: 38, pending: 30, overdue: 2 },
      revenue: { currentMonth: 48250, previousMonth: 41200, pendingCurrentMonth: 6300 },
      recentRepairs: state.repairs.slice(0, 5).map((r) => ({ orderNumber: r.order_number, customer: customer(r.customer_id).full_name, device: `${state.devices.find((d) => d.id === r.device_id).brand} ${state.devices.find((d) => d.id === r.device_id).model}`, status: r.status, receivedAt: r.received_at })),
      recentCustomers: state.customers.slice(0, 3).map((c) => ({ id: c.id, name: c.full_name, phone: c.phone, createdAt: T })),
      upcomingDeliveries: state.repairs.slice(0, 3).map((r) => ({ orderNumber: r.order_number, device: `${state.devices.find((d) => d.id === r.device_id).brand} ${state.devices.find((d) => d.id === r.device_id).model}`, customer: customer(r.customer_id).full_name, estDelivery: r.estimated_delivery_at })),
    } })
    if (p === '/repairs' && method === 'POST') {
      const row = { ...body, id: 'r9999999-9999-4999-8999-999999999999', order_number: 'TF-0043', status: 'recibido', received_at: T, created_at: T }
      state.repairs.unshift(row)
      return respond({ data: repairOf(row) }, 201)
    }
    for (const kind of ['customers', 'devices', 'repairs']) {
      if (p === `/${kind}` && method === 'GET') {
        let rows = state[kind]
        if (url.searchParams.get('customer_id')) rows = rows.filter((row) => row.customer_id === url.searchParams.get('customer_id'))
        if (url.searchParams.get('status')) rows = rows.filter((row) => row.status === url.searchParams.get('status'))
        const q = url.searchParams.get('q')?.toLowerCase()
        if (q) rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
        return respond({ data: rows.map(kind === 'devices' ? deviceOf : kind === 'repairs' ? repairOf : (row) => row), count: rows.length, page: 1, limit: 25 })
      }
    }
    const match = p.match(/^\/(customers|devices|repairs)\/([^/]+)(\/history)?$/)
    if (match) {
      const [, kind, id, isHistory] = match
      const row = state[kind].find((item) => (kind === 'repairs' ? item.order_number === id : item.id === id))
      if (!row) return respond({ message: 'No encontrado' }, 404)
      if (isHistory && method === 'POST') {
        row.status = body.status
        state.history.push({ id: `h${state.history.length + 1}`, ...body, created_at: '2026-10-25T16:40:00.000Z', user: { full_name: 'Carlos Martínez' } })
        return respond({ data: repairOf(row) })
      }
      if (kind === 'customers') return respond({ data: row, devices: state.devices.filter((item) => item.customer_id === id), repairs: state.repairs.filter((item) => item.customer_id === id).map(repairOf) })
      if (kind === 'devices') return respond({ data: deviceOf(row), repairs: state.repairs.filter((item) => item.device_id === id).map(repairOf) })
      return respond({ data: repairOf(row), history: state.history })
    }
    return respond({ data: [] })
  })
}

const glide = async (page, locator, steps = 28) => {
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps })
}

async function record(browser, name, viewport, scale, run) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, recordVideo: { dir: OUT, size: viewport } })
  const page = await context.newPage()
  await page.mouse.move(viewport.width * 0.7, viewport.height * 0.6)
  await run(page)
  const video = page.video()
  await context.close()
  await video.saveAs(path.join(OUT, `${name}.webm`))
  await video.delete()
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(120000)

test('panel', async ({ browser }) => {
  await record(browser, 'panel', { width: 1280, height: 800 }, 1, async (page) => {
    await workshop(page)
    await page.goto('/')
    await page.getByRole('heading', { name: 'Panel de control', level: 1 }).waitFor()
    await page.waitForTimeout(1800)
    await glide(page, page.getByRole('link', { name: /^Listos: 5/ }))
    await page.waitForTimeout(700)
    await glide(page, page.getByRole('link', { name: /^En reparación: 14/ }))
    await page.waitForTimeout(500)
    await page.mouse.down(); await page.mouse.up()
    await page.getByRole('link', { name: /^En reparación: 14/ }).click()
    await page.waitForTimeout(2200)
  })
})

test('nueva-orden', async ({ browser }) => {
  await record(browser, 'nueva-orden', { width: 1280, height: 800 }, 1, async (page) => {
    await workshop(page)
    await page.goto(`/reparaciones/nueva?customer_id=${ids.c1}&device_id=${ids.d1}`)
    const problem = page.getByLabel('Problema reportado')
    await problem.waitFor()
    await page.waitForTimeout(900)
    await glide(page, problem)
    await problem.click()
    await problem.pressSequentially('Pantalla estrellada, el touch no responde', { delay: 45 })
    const cost = page.getByLabel('Costo estimado')
    await glide(page, cost, 18); await cost.click(); await cost.fill(''); await cost.pressSequentially('1850', { delay: 90 })
    const deposit = page.getByLabel('Anticipo recibido')
    await glide(page, deposit, 18); await deposit.click(); await deposit.fill(''); await deposit.pressSequentially('500', { delay: 90 })
    await page.getByLabel('Enciende', { exact: true }).selectOption('true')
    await page.getByLabel('Responsable', { exact: true }).selectOption(ids.tech)
    const save = page.getByRole('button', { name: /Registrar reparación|Crear orden|Guardar reparación/ })
    await save.scrollIntoViewIfNeeded()
    await glide(page, save)
    await page.waitForTimeout(400)
    await save.click()
    await page.waitForURL(/TF-0043/)
    await page.waitForTimeout(2600)
  })
})

test('avance', async ({ browser }) => {
  await record(browser, 'avance', { width: 1280, height: 800 }, 1, async (page) => {
    await workshop(page)
    await page.goto('/reparaciones/TF-0042')
    const status = page.getByLabel('Estado', { exact: true })
    await status.waitFor()
    await page.waitForTimeout(1200)
    await status.scrollIntoViewIfNeeded()
    await glide(page, status)
    await status.selectOption('listo_para_entregar')
    await page.waitForTimeout(500)
    const note = page.getByLabel('Nota (opcional)')
    await glide(page, note, 16); await note.click()
    await note.pressSequentially('Pasó todas las pruebas. Listo para recoger.', { delay: 40 })
    const send = page.getByRole('button', { name: 'Registrar avance' })
    await glide(page, send)
    await send.click()
    await page.waitForTimeout(2600)
  })
})

test('celular', async ({ browser }) => {
  const shots = async (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await workshop(page, { cursor: false })
  await page.goto('/seguimiento/demo-token')
  await page.getByRole('heading', { name: '¡Tu iPhone 13 está listo!' }).waitFor()
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(OUT, 'seguimiento-full.png'), fullPage: true, animations: 'disabled' })
  await page.goto('/')
  await page.getByRole('heading', { name: 'Panel de control', level: 1 }).waitFor()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, 'panel-celular-full.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.waitForTimeout(500)
  await shots(page, 'menu-celular')
  await context.close()
})

test('pantallas', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await workshop(page, { cursor: false })
  for (const [route, name, heading] of [['/reparaciones', 'reparaciones', 'Reparaciones'], ['/reparaciones/TF-0042', 'detalle', null], ['/', 'panel', 'Panel de control']]) {
    await page.goto(route)
    if (heading) await page.getByRole('heading', { name: heading, level: 1 }).waitFor()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' })
  }
  await context.close()
})
