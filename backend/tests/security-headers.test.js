import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { buildCsp, createSecurityHeaders } from '../middleware/security.js'
import { createCspReportRouter } from '../routes/cspReport.routes.js'

async function listen(t, app) {
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return (path, { method = 'GET', body, headers = {} } = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers, body })
}

function appWith(env) {
  const app = express()
  app.set('trust proxy', 1)
  app.use(createSecurityHeaders({ env }))
  app.get('/api/ping', (_req, res) => res.json({ ok: true }))
  app.get('/assets/app.js', (_req, res) => res.type('js').send('void 0'))
  app.get('*', (_req, res) => res.send('spa'))
  return app
}

test('cabeceras base, CSP en modo reporte y sin HSTS fuera de producción', async (t) => {
  const request = await listen(t, appWith({}))
  const page = await request('/login', { headers: { 'x-forwarded-proto': 'https' } })
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(page.headers.get('x-frame-options'), 'DENY')
  assert.equal(page.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.match(page.headers.get('permissions-policy'), /camera=\(\).*payment=\(\)/)
  assert.equal(page.headers.get('x-powered-by'), null)
  assert.equal(page.headers.get('strict-transport-security'), null)
  assert.equal(page.headers.get('content-security-policy'), null)
  const csp = page.headers.get('content-security-policy-report-only')
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /report-uri \/api\/csp-report/)
})

test('las rutas /api salen sin caché y sin CSP; los assets no cargan CSP', async (t) => {
  const request = await listen(t, appWith({}))
  const api = await request('/api/ping')
  assert.equal(api.headers.get('cache-control'), 'no-store')
  assert.equal(api.headers.get('content-security-policy-report-only'), null)
  assert.equal((await request('/assets/app.js')).headers.get('content-security-policy-report-only'), null)
})

test('HSTS solo en producción y únicamente tras HTTPS', async (t) => {
  const production = await listen(t, appWith({ NODE_ENV: 'production' }))
  assert.equal((await production('/login', { headers: { 'x-forwarded-proto': 'https' } })).headers.get('strict-transport-security'), 'max-age=31536000')
  assert.equal((await production('/login')).headers.get('strict-transport-security'), null)
})

test('CSP_ENFORCE=true aplica la política en lugar de solo reportarla', async (t) => {
  const request = await listen(t, appWith({ CSP_ENFORCE: ' TRUE ' }))
  const page = await request('/login')
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/)
  assert.equal(page.headers.get('content-security-policy-report-only'), null)
})

test('la CSP permite el Supabase configurado y el Device Agent local, y nada de Supabase si no hay URL', () => {
  assert.match(
    buildCsp({ SUPABASE_URL: 'https://abc.supabase.co/rest/v1/' }),
    /connect-src 'self' https:\/\/abc\.supabase\.co wss:\/\/abc\.supabase\.co http:\/\/127\.0\.0\.1:5391 http:\/\/localhost:5391/,
  )
  assert.doesNotMatch(buildCsp({}), /supabase/)
})

test('reportes CSP: registra una línea sin query, fragmento ni tokens y responde 204', async (t) => {
  const logs = []
  const app = express()
  app.use(express.json())
  app.use('/api/csp-report', createCspReportRouter({ logger: { info: (...args) => logs.push(args.join(' ')) } }))
  const request = await listen(t, app)
  const post = (body, type = 'application/csp-report') => request('/api/csp-report', {
    method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body),
  })

  const reported = await post({ 'csp-report': {
    'document-uri': 'https://app.example.com/seguimiento/abcdefghijklmnopqrstuvwxyz0123?token=secret#frag',
    'blocked-uri': 'https://evil.example.net/x.js?a=1',
    'effective-directive': 'script-src-elem',
    disposition: 'report',
  } })
  assert.equal(reported.status, 204)
  assert.equal(logs.length, 1)
  assert.match(logs[0], /^\[csp-report\] /)
  assert.doesNotMatch(logs[0], /secret|frag|a=1|abcdefghijklmnopqrstuvwxyz0123/)
  assert.match(logs[0], /"blocked":"https:\/\/evil\.example\.net\/x\.js"/)
  assert.match(logs[0], /"page":"https:\/\/app\.example\.com\/seguimiento\/:id"/)

  assert.equal((await post({ 'csp-report': { 'blocked-uri': 'chrome-extension://abc/content.js', 'effective-directive': 'script-src-elem' } })).status, 204)
  assert.equal((await post('{no es json')).status, 204)
  assert.equal((await post(`{"csp-report":{"blocked-uri":"${'a'.repeat(20_000)}"}}`)).status, 204)
  assert.equal(logs.length, 1)
})

test('reportes CSP: limita el volumen por IP', async (t) => {
  const app = express()
  app.use('/api/csp-report', createCspReportRouter({ logger: { info() {} }, max: 2 }))
  const request = await listen(t, app)
  const statuses = []
  for (let attempt = 0; attempt < 3; attempt += 1) {
    statuses.push((await request('/api/csp-report', { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: '{}' })).status)
  }
  assert.deepEqual(statuses, [204, 204, 429])
})
