import { supabase } from './supabase.js'
import { resolveApiBaseUrl } from '../utils/apiBase.js'

// Base del API resuelta de forma segura (ver utils/apiBase.js):
// en producción siempre cae al mismo origen (`/api`); si un build local
// incluyera una URL de localhost y un visitante externo abriera la página,
// se neutraliza en vez de apuntar a SU propia computadora.
export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_URL,
  typeof window !== 'undefined' ? window.location.hostname : 'localhost',
)

// Timeout por defecto para llamadas normales al API. Evita requests
// pendientes indefinidamente cuando el servidor está frío o inalcanzable.
export const DEFAULT_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  constructor(message, { status = null, code = null, cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    if (cause) this.cause = cause
  }
}

function friendlyNetworkError(timedOut) {
  return timedOut
    ? 'El servidor de CARLOSTECH tardó demasiado en responder. Inténtalo de nuevo en unos segundos.'
    : 'CARLOSTECH no pudo conectarse con el servidor. Revisa tu conexión e inténtalo de nuevo.'
}

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

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const callerAborts = Boolean(options.signal)
  const controller = callerAborts ? null : new AbortController()
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  const signal = options.signal ?? controller?.signal

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal,
      // La sesión se envía por Authorization; no usamos cookies del backend.
      credentials: 'omit',
      headers,
    })
  } catch (error) {
    if (callerAborts && options.signal?.aborted) {
      throw new ApiError('Solicitud cancelada.', { code: 'ABORTED', cause: error })
    }
    const timedOut = Boolean(controller?.signal.aborted)
    // Fallo de red o timeout: el API no está alcanzable AHORA. No confundir
    // con el Device Agent local (127.0.0.1) ni con errores de la base de datos.
    throw new ApiError(friendlyNetworkError(timedOut), { code: timedOut ? 'API_TIMEOUT' : 'API_OFFLINE', cause: error })
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const status = response.status
    // Clasificación mínima para que la UI distinga sesión de datos o servidor.
    const fallbackCode = status === 401 || status === 403
      ? 'AUTH_REQUIRED'
      : status >= 500
        ? 'SERVER_ERROR'
        : `HTTP_${status}`
    throw new ApiError(errorBody?.message ?? `Error ${status} al comunicarse con el servidor`, { status, code: errorBody?.code ?? fallbackCode })
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
