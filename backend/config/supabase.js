import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const isSupabaseConfigured = Boolean(supabaseUrl && serviceRoleKey)

// Cliente con permisos de servicio (omite RLS). Sólo debe usarse en el backend.
export const supabaseAdmin = isSupabaseConfigured
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

// Protege rutas que requieren Supabase con un mensaje claro de configuración.
export function requireSupabase(_req, res, next) {
  if (!isSupabaseConfigured) {
    return res.status(503).json({
      message: 'Supabase no está configurado. Revisa las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en backend/.env',
    })
  }
  next()
}