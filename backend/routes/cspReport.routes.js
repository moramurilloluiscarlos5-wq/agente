import express from 'express'
import { rateLimit } from '../middleware/security.js'

const MAX_FIELD = 200
const EXTENSION_SOURCE = /^(chrome|moz|safari|safari-web)-extension:/i
let routerCount = 0

const clip = (value) => (typeof value === 'string' ? value.slice(0, MAX_FIELD) : undefined)

// Sin query ni fragmento y con los segmentos largos (ids, tokens de seguimiento) enmascarados.
function safeUri(value) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (url.origin === 'null') return url.protocol
    const path = url.pathname.split('/').map((part) => (part.length > 24 ? ':id' : part)).join('/')
    return clip(`${url.origin}${path}`)
  } catch {
    return clip(value) // palabras clave de CSP como "inline" o "eval"
  }
}

// Recibe los reportes de la CSP (report-uri). Es público: el navegador los envía sin sesión.
export function createCspReportRouter({ logger = console, max = 30 } = {}) {
  const router = express.Router()
  const id = ++routerCount
  const limiter = rateLimit({ windowMs: 60_000, max, message: 'Demasiados reportes.', keyFn: (req) => `csp-report:${id}:${req.ip}` })
  const parse = express.json({ type: ['application/csp-report', 'application/json'], limit: '16kb' })

  // El navegador no reintenta ni lee la respuesta: un cuerpo inválido o enorme se ignora con 204.
  router.post('/', limiter, (req, res, next) => parse(req, res, () => next()), (req, res) => {
    const report = req.body?.['csp-report']
    if (report && typeof report === 'object' && !EXTENSION_SOURCE.test(String(report['blocked-uri'] ?? ''))) {
      logger.info('[csp-report]', JSON.stringify({
        directive: clip(report['effective-directive'] ?? report['violated-directive']),
        blocked: safeUri(report['blocked-uri']),
        page: safeUri(report['document-uri']),
        disposition: clip(report.disposition),
      }))
    }
    res.status(204).end()
  })
  return router
}
