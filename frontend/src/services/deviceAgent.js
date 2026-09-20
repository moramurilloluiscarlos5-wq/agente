import { api } from './api.js'
import { supabase } from './supabase.js'

const AGENT_URL = (import.meta.env.VITE_DEVICE_AGENT_URL || 'http://127.0.0.1:5391').replace(/\/$/, '')

async function getSessionToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function backendOrigin() {
  const configured = import.meta.env.VITE_API_URL || '/api'
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/api\/?$/, '')
  return window.location.origin
}

async function localJson(path, options = {}) {
  let response
  try { response = await fetch(`${AGENT_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } }) }
  catch { throw Object.assign(new Error('No se pudo conectar con CarlosTech Device Agent. Comprueba que esté instalado y ejecutándose en esta computadora.'), { code: 'AGENT_UNAVAILABLE' }) }
  const body = await response.json().catch(() => ({}))
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

  const response = await api.get('/device-tools/session')
  const session = response.data
  if (!session?.token) throw new Error('El backend no entregó una sesión para el agente local.')
  async function request(path, options = {}) {
    let result
    try {
      result = await fetch(`${AGENT_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
    } catch { throw Object.assign(new Error('No se pudo conectar con CarlosTech Device Agent. Comprueba que esté ejecutándose en esta computadora.'), { code: 'AGENT_UNAVAILABLE' }) }
    const body = await result.json().catch(() => ({}))
    if (!result.ok) throw Object.assign(new Error(body.error || `El agente respondió ${result.status}.`), { status: result.status, code: 'AGENT_ERROR' })
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
