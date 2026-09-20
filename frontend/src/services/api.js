import { supabase } from './supabase.js'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// Obtiene el JWT actual de la sesión de Supabase para adjuntarlo al backend.
async function getSessionToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function request(path, options = {}) {
  const token = await getSessionToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      // La sesión se envía por Authorization; no usamos cookies del backend.
      credentials: 'omit',
      headers,
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté iniciado e intenta de nuevo.')
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw Object.assign(new Error(errorBody?.message ?? `Error ${response.status} al conectar con el servidor`), { status: response.status, code: errorBody?.code })
  }

  if (response.status === 204) return null
  return response.json()
}

export const api = {
  get: (path, options = {}) => request(path, options),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
