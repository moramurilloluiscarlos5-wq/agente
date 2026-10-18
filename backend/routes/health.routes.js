import { Router } from 'express'
import { isSupabaseConfigured, supabaseAdmin } from '../config/supabase.js'

const router = Router()

const DB_CHECK_TIMEOUT_MS = 4000

// GET /health (y /api/health): {"status":"ok"} con HTTP 200. Rápido por
// defecto porque Railway lo usa como healthcheck de despliegue.
// Con ?deep=1 verifica adicionalmente la base de datos real (Supabase) y
// expone `database: ok | error | not_configured`, útil para distinguir un
// problema de API de un problema de datos.
router.get('/', async (req, res) => {
  const payload = { status: 'ok', service: 'carlostech-backend', timestamp: new Date().toISOString() }

  if (req.query.deep === '1') {
    payload.database = 'unknown'
    if (!isSupabaseConfigured || !supabaseAdmin) {
      payload.database = 'not_configured'
    } else {
      try {
        const { error } = await Promise.race([
          supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).limit(1),
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error('db-timeout')), DB_CHECK_TIMEOUT_MS)),
        ])
        payload.database = error ? 'error' : 'ok'
      } catch {
        payload.database = 'error'
      }
    }
  }

  res.json(payload)
})

export default router
