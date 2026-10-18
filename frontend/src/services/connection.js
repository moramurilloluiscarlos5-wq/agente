import { API_BASE_URL } from './api.js'
import { AGENT_URL } from './deviceAgent.js'

// ConnectionService: única fuente de verdad sobre la conectividad.
// - apiStatus:    'checking' | 'online' | 'offline'  (backend Railway, vía /api/health)
// - agentStatus:  'checking' | 'connected' | 'not_detected' (Device Agent local 127.0.0.1)
// Ambos son INDEPENDIENTES: el Agent estar apagado no implica API offline y
// viceversa. Las páginas se suscriben en vez de implementar su propia lógica.

export const API_STATUS = {
  CHECKING: 'checking',
  ONLINE: 'online',
  OFFLINE: 'offline',
}

export const AGENT_STATUS = {
  CHECKING: 'checking',
  CONNECTED: 'connected',
  NOT_DETECTED: 'not_detected',
}

// Healthcheck del Device Agent: timeout corto (es localhost, debe responder
// en milisegundos; si tarda, mejor reportar no_detected y reintentar luego).
const AGENT_HEALTH_TIMEOUT_MS = 4000
const API_HEALTH_TIMEOUT_MS = 8000

// Backoff del monitor del API: 3s, 6s, 12s, 24s, luego tope 30s. Sin loops
// infinitos agresivos y con recheck inmediato ante 'online' del navegador.
const API_RETRY_BASE_MS = 3000
const API_RETRY_MAX_MS = 30_000

let state = {
  apiStatus: API_STATUS.CHECKING,
  agentStatus: AGENT_STATUS.CHECKING,
  apiDetail: null, // 'timeout' | 'unreachable' | null
  agentDetail: null, // payload /health del agente o null
  apiLastOnlineAt: 0,
  apiLastOfflineAt: 0,
}

const listeners = new Set()

export function getConnectionState() {
  return state
}

export function subscribe(listener) {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

function setState(patch) {
  const next = { ...state, ...patch }
  const changed = Object.keys(patch).some((key) => state[key] !== next[key])
  state = next
  if (changed) for (const listener of listeners) listener(state)
}

function fetchWithTimeout(url, timeoutMs, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal, credentials: 'omit' }).finally(() => clearTimeout(timer))
}

// ── API (backend Railway) ────────────────────────────────────────────────
export async function checkApi({ timeoutMs = API_HEALTH_TIMEOUT_MS } = {}) {
  setState({ apiStatus: API_STATUS.CHECKING })
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`, timeoutMs)
    if (!response.ok) throw new Error(`El API respondió ${response.status}.`)
    const body = await response.json().catch(() => null)
    if (body?.status !== 'ok') throw new Error('El API respondió sin estado válido.')
    setState({ apiStatus: API_STATUS.ONLINE, apiDetail: null, apiLastOnlineAt: Date.now() })
    return API_STATUS.ONLINE
  } catch (error) {
    setState({ apiStatus: API_STATUS.OFFLINE, apiDetail: error?.name === 'AbortError' ? 'timeout' : 'unreachable', apiLastOfflineAt: Date.now() })
    return API_STATUS.OFFLINE
  }
}

// ── Device Agent local (127.0.0.1) ───────────────────────────────────────
export async function checkAgent({ timeoutMs = AGENT_HEALTH_TIMEOUT_MS } = {}) {
  setState({ agentStatus: AGENT_STATUS.CHECKING })
  try {
    const response = await fetchWithTimeout(`${AGENT_URL}/health`, timeoutMs, { headers: { 'Content-Type': 'application/json' } })
    if (!response.ok) throw new Error(`El agente respondió ${response.status}.`)
    const body = await response.json().catch(() => null)
    if (body?.status !== 'ok') throw new Error('El agente respondió sin estado válido.')
    setState({ agentStatus: AGENT_STATUS.CONNECTED, agentDetail: body })
    return AGENT_STATUS.CONNECTED
  } catch {
    // Importante: 'not_detected' significa SOLO que no hay agente local en
    // esta computadora. No dice nada sobre el API ni la base de datos.
    setState({ agentStatus: AGENT_STATUS.NOT_DETECTED, agentDetail: null })
    return AGENT_STATUS.NOT_DETECTED
  }
}

// ── Monitor del API con backoff controlado ───────────────────────────────
let monitorTimer = null
let attempt = 0
let monitorStarted = false

function scheduleNext(delayMs) {
  clearTimeout(monitorTimer)
  monitorTimer = setTimeout(runMonitorCycle, delayMs)
}

async function runMonitorCycle() {
  const result = await checkApi()
  if (result === API_STATUS.ONLINE) {
    attempt = 0
    scheduleNext(30_000) // latido suave mientras la app está abierta
  } else {
    attempt += 1
    scheduleNext(Math.min(API_RETRY_MAX_MS, API_RETRY_BASE_MS * 2 ** (attempt - 1)))
  }
}

export function startApiMonitor() {
  if (monitorStarted) return
  monitorStarted = true
  runMonitorCycle()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { attempt = 0; runMonitorCycle() })
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.apiStatus !== API_STATUS.ONLINE) { attempt = 0; runMonitorCycle() }
    })
  }
}

export function retryApiNow() {
  attempt = 0
  runMonitorCycle()
}

export function stopApiMonitorForTests() {
  clearTimeout(monitorTimer)
  monitorTimer = null
  monitorStarted = false
  attempt = 0
}
