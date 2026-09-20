import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(supabaseUrl && anonKey)

// Cliente público (anon key). La autenticación y los datos sensibles
// se manejan siempre desde el backend con la service role key.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null