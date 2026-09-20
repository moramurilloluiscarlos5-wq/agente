const buckets = new Map()

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
}

export function rateLimit({ windowMs = 60_000, max = 60, message = 'Demasiadas solicitudes. Intenta nuevamente en un momento.', keyFn } = {}) {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : `${req.ip}:${req.baseUrl || req.path}`
    const now = Date.now()
    const current = buckets.get(key)
    if (!current || now - current.startedAt >= windowMs) {
      buckets.set(key, { startedAt: now, count: 1 })
      return next()
    }
    current.count += 1
    if (current.count > max) return res.status(429).json({ message })
    next()
  }
}
