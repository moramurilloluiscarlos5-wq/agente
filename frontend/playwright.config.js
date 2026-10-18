import { defineConfig } from '@playwright/test'

// PLAYWRIGHT_PORT permite correr las pruebas sin chocar con un servidor de desarrollo ya abierto.
const port = process.env.PLAYWRIGHT_PORT || '5173'
const origin = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  // El primer test de cada ejecución paga el arranque en frío de Edge y Vite (hasta ~25 s en esta máquina).
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: origin,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: origin,
    reuseExistingServer: true,
  },
})
