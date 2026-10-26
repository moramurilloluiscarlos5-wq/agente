import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')

// Todos los intentos de autenticación y correos se interceptan antes de navegar.
async function mockAuth(page, { loginCode = 'invalid_credentials', resendStatus = 200 } = {}) {
  const state = { authCalls: [], apiCalls: [] }
  await page.route(`${env.VITE_SUPABASE_URL}/auth/v1/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    state.authCalls.push({ path, body: route.request().postDataJSON() })
    if (path.endsWith('/token')) {
      return route.fulfill({
        status: 400,
        json: { code: loginCode, msg: loginCode === 'email_not_confirmed' ? 'Email not confirmed' : 'Invalid login credentials' },
      })
    }
    if (path.endsWith('/resend') && resendStatus !== 200) {
      return route.fulfill({ status: resendStatus, json: { code: 'over_email_send_rate_limit', msg: 'Too many requests' } })
    }
    return route.fulfill({ json: {} })
  })
  await page.route(/\/api\//, (route) => {
    state.apiCalls.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 400, json: { message: 'Solicitud inesperada en esta prueba.' } })
  })
  return state
}

async function submitLogin(page) {
  await page.getByLabel('Correo electrónico', { exact: true }).fill('qa@example.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example123!')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
}

for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [768, 1024], [430, 932], [390, 844], [375, 812]]) {
  test(`login y registro mantienen controles accesibles sin desbordamiento horizontal en ${width}x${height}`, async ({ page }) => {
    await mockAuth(page)
    await page.setViewportSize({ width, height })
    for (const [path, heading, submit] of [
      ['/login', 'Iniciar sesión', 'Iniciar sesión'],
      ['/registro?plan=pro_monthly', 'Crea tu taller en TallerFlow', 'Crear mi taller y continuar al pago'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const bounds = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll('main input, main button, main a')]
          .filter((control) => control.getClientRects().length)
          .map((control) => {
            const rect = control.getBoundingClientRect()
            return { left: rect.left, right: rect.right }
          }),
      }))
      expect(bounds.document).toBeLessThanOrEqual(bounds.viewport + 1)
      expect(bounds.controls.length).toBeGreaterThan(0)
      for (const control of bounds.controls) {
        expect(control.left).toBeGreaterThanOrEqual(-1)
        expect(control.right).toBeLessThanOrEqual(bounds.viewport + 1)
      }
      const submitButton = page.getByRole('button', { name: submit, exact: true })
      await submitButton.scrollIntoViewIfNeeded()
      await expect(submitButton).toBeInViewport()
      await expect(submitButton).toBeEnabled()
    }
  })
}

test('la contraseña se puede mostrar y ocultar sin perder el valor; credenciales inválidas muestran error', async ({ page }) => {
  const state = await mockAuth(page)
  await page.goto('/login')
  const password = page.getByLabel('Contraseña', { exact: true })
  await password.fill('Example123!')
  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('Example123!')
  await page.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await submitLogin(page)
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos.')
  await expect(page).toHaveURL(/\/login$/)
  expect(state.authCalls.filter(({ path }) => path.endsWith('/token'))).toHaveLength(1)
  expect(state.apiCalls).toEqual([])
})

test('recuperación valida el correo y muestra la confirmación con el envío simulado', async ({ page }) => {
  const state = await mockAuth(page)
  await page.goto('/login')
  const recover = page.getByRole('button', { name: '¿Olvidaste tu contraseña?', exact: true })
  await recover.click()
  await expect(page.getByRole('alert')).toContainText('Ingresa tu correo')
  expect(state.authCalls).toHaveLength(0)
  await page.getByLabel('Correo electrónico', { exact: true }).fill('qa@example.invalid')
  await recover.click()
  await expect(page.getByRole('status')).toContainText('enlace para restablecer tu contraseña')
  const recoverCalls = state.authCalls.filter(({ path }) => path.endsWith('/recover'))
  expect(recoverCalls).toHaveLength(1)
  expect(recoverCalls[0].body.email).toBe('qa@example.invalid')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('correo sin confirmar permite reenviar confirmación y evita envíos repetidos', async ({ page }) => {
  const state = await mockAuth(page, { loginCode: 'email_not_confirmed' })
  await page.goto('/login')
  await submitLogin(page)
  await expect(page.getByRole('alert')).toContainText('pendiente de confirmación')
  const resend = page.getByRole('button', { name: 'Reenviar correo de confirmación', exact: true })
  await resend.click()
  await expect(page.getByRole('status')).toContainText('Solicitud enviada')
  await expect(resend).toBeDisabled()
  const resendCalls = state.authCalls.filter(({ path }) => path.endsWith('/resend'))
  expect(resendCalls).toHaveLength(1)
  expect(resendCalls[0].body).toMatchObject({ type: 'signup', email: 'qa@example.invalid' })
})

test('el límite de reenvío muestra una indicación útil para volver a intentar', async ({ page }) => {
  await mockAuth(page, { loginCode: 'email_not_confirmed', resendStatus: 429 })
  await page.goto('/login')
  await submitLogin(page)
  const resend = page.getByRole('button', { name: 'Reenviar correo de confirmación', exact: true })
  await resend.click()
  await expect(page.getByRole('alert')).toContainText('Espera un minuto')
  await expect(resend).toBeEnabled()
})

test('registro rechaza contraseñas diferentes antes de enviar datos', async ({ page }) => {
  const state = await mockAuth(page)
  await page.goto('/registro?plan=pro_monthly')
  await page.getByLabel('Nombre completo').fill('Propietario de prueba')
  await page.getByLabel('Correo electrónico', { exact: true }).fill('qa@example.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example123!')
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill('Different123!')
  await page.getByLabel('Nombre del taller').fill('Taller de prueba')
  await page.getByRole('button', { name: 'Crear mi taller y continuar al pago', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Las contraseñas no coinciden.')
  // Solo se leyó el plan elegido para mostrarlo; el registro no llegó a enviarse.
  expect(state.apiCalls.filter((path) => path !== '/api/billing/plans')).toEqual([])
  expect(state.authCalls).toEqual([])
})
