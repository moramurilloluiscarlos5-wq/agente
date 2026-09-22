import { api } from './api.js'
import { supabase } from './supabase.js'
import { resolveApiBaseUrl } from '../utils/apiBase.js'

const AGENT_URL = (import.meta.env.VITE_DEVICE_AGENT_URL || 'http://127.0.0.1:5391').replace(/\/$/, '')
const DETECTION_TIMEOUT_MS = 8000

async function getSessionToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function backendOrigin() {
  // Resolución segura compartida (utils/apiBase.js): evita que un build con
  // VITE_API_URL de localhost haga que el pairing hable con la PC del visitante.
  const resolved = resolveApiBaseUrl(import.meta.env.VITE_API_URL, typeof window !== 'undefined' ? window.location.hostname : 'localhost')
  if (/^https?:\/\//i.test(resolved)) return resolved.replace(/\/api\/?$/, '')
  return window.location.origin
}

async function localJson(path, options = {}) {
  // Only discovery requests have a short deadline; pairing and USB operations can take longer.
  const controller = ['/health', '/pairing/status'].includes(path) ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), DETECTION_TIMEOUT_MS) : null
  let response
  let body
  try {
    response = await fetch(`${AGENT_URL}${path}`, { ...options, ...(controller ? { signal: controller.signal } : {}), headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } })
    body = await response.json().catch((error) => { if (controller?.signal.aborted) throw error; return {} })
  } catch {
    const timedOut = controller?.signal.aborted
    throw Object.assign(new Error(timedOut
      ? 'El agente local no respondió a tiempo. Si ya está activo, permite el acceso a la red local en el navegador y vuelve a comprobar.'
      : 'No se pudo conectar con CarlosTech Device Agent. Comprueba que esté ejecutándose en esta computadora y que el navegador tenga permiso para acceder a la red local.'), { code: timedOut ? 'AGENT_TIMEOUT' : 'AGENT_UNAVAILABLE' })
  } finally { if (timer) clearTimeout(timer) }
  if (!response.ok) throw Object.assign(new Error(body.error || `El agente respondió ${response.status}.`), { status: response.status, code: 'AGENT_ERROR' })
  return body
}

async function probe() {
  return localJson('/health')
}

export async function openDeviceAgent() {
  const health = await probe()
  const status = await localJson('/pairing/status')
  const makePairing = async () => {
    const currentStatus = await localJson('/pairing/status')
    const sessionToken = await getSessionToken()
    if (!sessionToken) throw new Error('Inicia sesión en CARLOSTECH para vincular esta computadora.')
    await localJson('/pairing/exchange', { method: 'POST', body: JSON.stringify({ pairing_code: currentStatus.data?.pairing_code, session_token: sessionToken, backend_url: backendOrigin() }) })
    return openDeviceAgent()
  }
  if (status.data?.pairing_required) {
    return { health, pairingRequired: true, pairingCode: status.data?.pairing_code || null, pair: makePairing }
  }

  let session
  try {
    const response = await api.post('/device-tools/session', {
      agent_id: status.data?.agent_id,
      pairing_code: status.data?.pairing_code,
    })
    session = response.data
    if (!session?.token) throw new Error('El backend no entregó una sesión para el agente local.')
  } catch (error) {
    throw Object.assign(error, { code: 'AGENT_SESSION_ERROR', agentHealth: health })
  }
  async function request(path, options = {}) {
    let result
    try {
      result = await fetch(`${AGENT_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
    } catch { throw Object.assign(new Error('No se pudo conectar con CarlosTech Device Agent. Comprueba que esté ejecutándose en esta computadora.'), { code: 'AGENT_UNAVAILABLE' }) }
    const body = await result.json().catch(() => ({}))
    if (!result.ok) throw Object.assign(new Error(body.error || `El agente respondió ${result.status}.`), { status: result.status, code: result.status === 401 ? 'AGENT_AUTH_INVALID' : 'AGENT_ERROR' })
    return body.data
  }
  try { await request('/devices') } catch (error) {
    if (error.status === 401) {
      const currentStatus = await localJson('/pairing/status')
      return { health, pairingRequired: true, pairingCode: currentStatus.data?.pairing_code || null, pair: makePairing, rePairing: true }
    }
    throw error
  }
  function connect(onMessage, onClose) {
    const websocketUrl = AGENT_URL.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(session.token)}`
    const socket = new WebSocket(websocketUrl)
    socket.addEventListener('message', (event) => { try { onMessage(JSON.parse(event.data)) } catch { /* ignore malformed agent events */ } })
    socket.addEventListener('close', onClose)
    socket.addEventListener('error', onClose)
    return socket
  }
  return { session, health, request, connect, pairingRequired: false }
}

export { AGENT_URL, getSessionToken }
