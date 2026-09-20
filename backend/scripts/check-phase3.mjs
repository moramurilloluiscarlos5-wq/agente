import 'dotenv/config'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Falta configurar Supabase en backend/.env.')
  process.exitCode = 1
} else {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`Supabase respondió HTTP ${response.status}.`)
    const schema = await response.json()
    const required = ['/customers', '/devices', '/repair_orders', '/repair_status_history',
      '/rpc/create_repair_order', '/rpc/update_repair_order', '/rpc/append_repair_history']
    const missing = required.filter((path) => !schema.paths?.[path])
    if (missing.length) {
      console.log(`Pendiente en Supabase: ${missing.join(', ')}`)
      console.log('Ejecuta database/migrations/003_phase3.sql en SQL Editor después del esquema inicial.')
      process.exitCode = 1
    } else {
      console.log('Supabase: tablas y funciones de reparación de fase 3 disponibles.')
    }
  } catch (error) {
    console.error(`No se pudo verificar Supabase: ${error.message}`)
    process.exitCode = 1
  }
}
