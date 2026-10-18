import { supabase } from '../../services/supabase.js'
import { resolveApiBaseUrl } from '../../utils/apiBase.js'

export function baseApiUrl() {
  // Misma resolución segura que services/api.js: en producción siempre es
  // el mismo origen; nunca la PC del visitante aunque el build venga envenenado.
  return resolveApiBaseUrl(
    import.meta.env.VITE_API_URL,
    typeof window !== 'undefined' ? window.location.hostname : 'localhost',
  )
}

export async function authHeaders() {
  const headers = {}
  if (!supabase) return headers
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function copyText(value) {
  await navigator.clipboard.writeText(value)
}