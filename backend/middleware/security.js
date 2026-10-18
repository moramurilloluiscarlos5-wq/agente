const buckets = new Map()
const MAX_BUCKETS = 10_000

// Elimina ventanas vencidas para que el mapa no crezca sin límite.
function pruneBuckets(now) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.startedAt >= bucket.windowMs) buckets.delete(key)
  }
}

export const CSP_REPORT_PATH = '/api/csp-report'

// El navegador del técnico habla directamente con el Device Agent local.
const DEVICE_AGENT_ORIGINS = ['http://127.0.0.1:5391', 'http://localhost:5391']

function originOf(value) {
  try { return new URL(value).origin } catch { return null }
}

// 'unsafe-inline' en style-src cubre los style="" que genera React; Inter se carga desde Google Fonts.
export function buildCsp(env = process.env) {
  const supabase = originOf(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const connect = ["'self'", ...(supabase ? [supabase, supabase.replace(/^http/, 'ws')] : []), ...DEVICE_AGENT_ORIGINS]
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${connect.join(' ')}`,
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ')
}

// La CSP va en modo "solo reporte" salvo CSP_ENFORCE=true. HSTS solo tiene sentido
// tras HTTPS; con trust proxy, req.secure refleja X-Forwarded-Proto.
export function createSecurityHeaders({ env = process.env } = {}) {
  const production = env.NODE_ENV === 'production'
  const cspHeader = String(env.CSP_ENFORCE ?? '').trim().toLowerCase() === 'true' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'
  const csp = buildCsp(env)
  return (req, res, next) => {
    res.removeHeader('X-Powered-By')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()')
    if (production && req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
    if (/^\/api(\/|$)/.test(req.path)) res.setHeader('Cache-Control', 'no-store')
    else if (!req.path.startsWith('/assets/')) res.setHeader(cspHeader, csp)
    next()
  }
}

export const securityHeaders = createSecurityHeaders()

export function rateLimit({ windowMs = 60_000, max = 60, message = 'Demasiadas solicitudes. Intenta nuevamente en un momento.', keyFn } = {}) {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : `${req.ip}:${req.baseUrl || req.path}`
    const now = Date.now()
    const current = buckets.get(key)
    if (!current || now - current.startedAt >= windowMs) {
      if (buckets.size >= MAX_BUCKETS) pruneBuckets(now)
      buckets.set(key, { startedAt: now, count: 1, windowMs })
      return next()
    }
    current.count += 1
    if (current.count > max) return res.status(429).json({ message })
    next()
  }
}
