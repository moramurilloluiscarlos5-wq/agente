import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { WebSocketServer } from 'ws'
import { loadConfig } from './config.js'

const config = loadConfig()
const HOST = config.host
const PORT = config.port
const AGENT_VERSION = config.version
const STATE_FILE = config.stateFile
const BACKEND_URL = config.backendUrl
let SECRET = config.secret
let WORKSHOP_ID = config.workshopId
const AGENT_ID = config.agentId
const ALLOWED_ORIGINS = config.allowedOrigins
const ADB = config.adb
const FASTBOOT = config.fastboot
const FILE_ROOT = config.filesRoot
const POLL_MS = config.pollMs
const MAX_OUTPUT = 120_000
const COMMAND_TIMEOUT = 45_000

let pairingCode = String(Math.floor(100000 + Math.random() * 900000))
try {
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  if (state.agent_id === AGENT_ID && /^\d{6}$/.test(state.pairing_code)) pairingCode = state.pairing_code
  if (!SECRET && state.secret) SECRET = state.secret
  if (!WORKSHOP_ID && state.workshop_id) WORKSHOP_ID = state.workshop_id
} catch { /* first run: pairing creates the state file */ }
if (SECRET.length < 32) console.warn('Device Agent requiere pairing desde CARLOSTECH AI antes de ejecutar comandos.')
if (!WORKSHOP_ID) console.warn('DEVICE_AGENT_WORKSHOP_ID no está configurado; el agente rechazará tokens de cualquier taller.')

function savePairingState() {
  try { mkdirSync(path.dirname(STATE_FILE), { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify({ agent_id: AGENT_ID, pairing_code: pairingCode, secret: SECRET, workshop_id: WORKSHOP_ID, backend_url: BACKEND_URL }, null, 2), { mode: 0o600 }) } catch (error) { console.error('No se pudo guardar el estado de pairing.', error.message) }
}

const clients = new Set()
const logs = []
let lastAdb = []
let lastFastboot = []

function log(level, message, details = {}) {
  const entry = { at: new Date().toISOString(), level, message, ...details }
  logs.push(entry)
  while (logs.length > 300) logs.shift()
  broadcast({ type: 'agent.log', data: entry })
  if (level === 'error') console.error(`[${level}] ${message}`, details)
  else console.log(`[${level}] ${message}`)
}

function json(res, status, body) {
  const value = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(value), 'cache-control': 'no-store' })
  res.end(value)
}

function setOriginHeader(req, res) {
  if (req.headers.origin) res.setHeader('access-control-allow-origin', req.headers.origin)
}

function originAllowed(req) {
  const origin = req.headers.origin
  return !origin || ALLOWED_ORIGINS.has(origin)
}

function paired() {
  return Boolean(SECRET.length >= 32 && WORKSHOP_ID)
}

function healthPayload() {
  return { status: 'ok', agent: 'CarlosTech Device Agent', version: AGENT_VERSION }
}

function pairingPayload() {
  return { ...healthPayload(), agent_id: AGENT_ID, paired: paired(), pairing_required: !paired(), host: HOST, port: PORT, pairing_code: pairingCode }
}

function backendRoot(value) {
  const target = new URL(value || BACKEND_URL)
  const isLocal = ['localhost', '127.0.0.1'].includes(target.hostname)
  if (!isLocal && target.protocol !== 'https:') throw Object.assign(new Error('El backend de pairing debe usar HTTPS.'), { status: 400 })
  return target.toString().replace(/\/$/, '').replace(/\/api$/, '')
}

async function pairWithBackend(body) {
  if (typeof body?.session_token !== 'string' || !body.session_token || typeof body?.pairing_code !== 'string' || body.pairing_code !== pairingCode) throw Object.assign(new Error('Código de pairing o sesión web no válidos.'), { status: 401 })
  const target = backendRoot(body.backend_url)
  const response = await fetch(`${target}/api/device-tools/pairing/exchange`, { method: 'POST', headers: { authorization: `Bearer ${body.session_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ agent_id: AGENT_ID, pairing_code: pairingCode }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.data?.secret) throw Object.assign(new Error(result.message || result.error || 'El backend rechazó el pairing.'), { status: response.status || 502 })
  SECRET = result.data.secret
  WORKSHOP_ID = result.data.workshop_id
  savePairingState()
  log('info', 'Device Agent vinculado a CARLOSTECH AI.', { event: 'agent.paired' })
  return { paired: true, agent_id: AGENT_ID, workshop_id: WORKSHOP_ID, version: AGENT_VERSION }
}

function tokenFrom(req, url) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token')
}

function verifyToken(token) {
  if (!token || !SECRET) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  let claims
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  const now = Math.floor(Date.now() / 1000)
  if (!claims || claims.exp <= now || claims.iat > now + 30 || claims.workshop_id !== WORKSHOP_ID || (claims.agent_id && claims.agent_id !== AGENT_ID)) return null
  return claims
}

function authorize(req, url) {
  if (!originAllowed(req)) return { status: 403, message: 'Origen no permitido.' }
  const claims = verifyToken(tokenFrom(req, url))
  return claims ? { claims } : { status: 401, message: 'Token del agente ausente, inválido o expirado.' }
}

function serial(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw Object.assign(new Error('Serial no válido.'), { status: 400 })
  return value
}

function safePath(value, { mustExist = false } = {}) {
  if (!FILE_ROOT || typeof value !== 'string' || !value.trim()) throw Object.assign(new Error('Configura DEVICE_AGENT_FILES_DIR y selecciona un archivo dentro de esa carpeta.'), { status: 400 })
  const target = path.resolve(value)
  const relative = path.relative(FILE_ROOT, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Object.assign(new Error('La ruta está fuera de la carpeta permitida del agente.'), { status: 400 })
  if (mustExist && (!existsSync(target) || !statSync(target).isFile())) throw Object.assign(new Error('Archivo no encontrado en la carpeta permitida.'), { status: 400 })
  return target
}

function run(file, args, { timeout = COMMAND_TIMEOUT, allowNonZero = false } = {}) {
  return new Promise((resolve) => {
    const started = Date.now()
    let child
    try { child = spawn(file, args, { windowsHide: true, shell: false }) }
    catch (error) { return resolve({ ok: false, code: 'NOT_FOUND', stdout: '', stderr: error.message, duration_ms: Date.now() - started }) }
    let stdout = ''
    let stderr = ''
    let killed = false
    const append = (key, chunk) => {
      const value = String(chunk)
      if (key === 'stdout') stdout = (stdout + value).slice(-MAX_OUTPUT)
      else stderr = (stderr + value).slice(-MAX_OUTPUT)
    }
    child.stdout?.on('data', (chunk) => append('stdout', chunk))
    child.stderr?.on('data', (chunk) => append('stderr', chunk))
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL') }, timeout)
    child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, code: 'NOT_FOUND', stdout, stderr: `${stderr}${error.message}`, duration_ms: Date.now() - started }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      const result = { ok: !killed && (allowNonZero || code === 0), code: killed ? 'TIMEOUT' : code, stdout, stderr, duration_ms: Date.now() - started }
      resolve(result)
    })
  })
}

function runToFile(file, args, target, { timeout = COMMAND_TIMEOUT } = {}) {
  return new Promise((resolve) => {
    const started = Date.now()
    let child
    try { child = spawn(file, args, { windowsHide: true, shell: false }) }
    catch (error) { return resolve({ ok: false, code: 'NOT_FOUND', stdout: '', stderr: error.message, duration_ms: Date.now() - started }) }
    const chunks = []
    let stderr = ''
    let killed = false
    child.stdout?.on('data', (chunk) => chunks.push(chunk))
    child.stderr?.on('data', (chunk) => { stderr = (stderr + String(chunk)).slice(-MAX_OUTPUT) })
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL') }, timeout)
    child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, code: 'NOT_FOUND', stdout: '', stderr: `${stderr}${error.message}`, duration_ms: Date.now() - started }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      const result = { ok: !killed && code === 0, code: killed ? 'TIMEOUT' : code, stdout: '', stderr, duration_ms: Date.now() - started }
      if (result.ok) {
        try { writeFileSync(target, Buffer.concat(chunks)); result.bytes = statSync(target).size } catch (error) { result.ok = false; result.stderr += error.message }
      }
      resolve(result)
    })
  })
}

function parseAdbDevices(stdout) {
  return stdout.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [serialValue, state, ...pairs] = line.split(/\s+/)
    const details = Object.fromEntries(pairs.map((pair) => {
      const index = pair.indexOf(':')
      return index > 0 ? [pair.slice(0, index), pair.slice(index + 1)] : [pair, true]
    }))
    return { serial: serialValue, state: state || 'unknown', product: details.product || null, model: details.model?.replace(/^model:/, '') || null, transport_id: details.transport_id || null }
  })
}

function parseProps(stdout) {
  return Object.fromEntries(stdout.split(/\r?\n/).map((line) => {
    const match = line.match(/^\[([^\]]+)\]: \[([^\]]*)\]$/)
    return match ? [match[1], match[2]] : null
  }).filter(Boolean))
}

function outputValue(result) {
  return `${result.stdout || ''}${result.stderr ? `\n${result.stderr}` : ''}`.trim()
}

async function adbDevices() {
  const result = await run(ADB, ['devices', '-l'], { allowNonZero: true })
  if (result.code === 'NOT_FOUND') return { devices: [], error: 'ADB_NOT_FOUND', result }
  const devices = result.ok || result.stdout ? parseAdbDevices(result.stdout) : []
  return { devices, error: result.code === 'TIMEOUT' ? 'COMMAND_TIMEOUT' : null, result }
}

async function fastbootDevices() {
  const result = await run(FASTBOOT, ['devices'], { allowNonZero: true })
  if (result.code === 'NOT_FOUND') return { devices: [], error: 'FASTBOOT_NOT_FOUND', result }
  const devices = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [serialValue, ...rest] = line.split(/\s+/)
    return { serial: serialValue, state: rest.join(' ') || 'fastboot' }
  })
  return { devices, error: result.code === 'TIMEOUT' ? 'COMMAND_TIMEOUT' : null, result }
}

async function deviceInfo(value) {
  const valueSerial = serial(value)
  const [props, battery, size, density, storage, memory, ip, uptime] = await Promise.all([
    run(ADB, ['-s', valueSerial, 'shell', 'getprop']),
    run(ADB, ['-s', valueSerial, 'shell', 'dumpsys', 'battery'], { allowNonZero: true }),
    run(ADB, ['-s', valueSerial, 'shell', 'wm', 'size'], { allowNonZero: true }),
    run(ADB, ['-s', valueSerial, 'shell', 'wm', 'density'], { allowNonZero: true }),
    run(ADB, ['-s', valueSerial, 'shell', 'df', '-k', '/data'], { allowNonZero: true }),
    run(ADB, ['-s', valueSerial, 'shell', 'cat', '/proc/meminfo'], { allowNonZero: true }),
    run(ADB, ['-s', valueSerial, 'shell', 'ip', 'route'], { allowNonZero: true }),
    run(ADB, ['-s', valueSerial, 'shell', 'cat', '/proc/uptime'], { allowNonZero: true }),
  ])
  const p = parseProps(props.stdout)
  const batteryFields = Object.fromEntries(battery.stdout.split(/\r?\n/).map((line) => line.split(':').map((x) => x.trim())).filter(([key, val]) => key && val).map(([key, val]) => [key, val]))
  const sizeMatch = size.stdout.match(/Physical size:\s*(\d+x\d+)|Override size:\s*(\d+x\d+)/)
  const densityMatch = density.stdout.match(/(?:Physical|Override) density:\s*(\d+)/)
  const dataLine = storage.stdout.split(/\r?\n/).find((line) => /\/data\s*$/.test(line.trim()))?.trim().split(/\s+/) || []
  const memoryMatch = memory.stdout.match(/^MemTotal:\s+(\d+)\s+kB/m)
  const ipMatch = ip.stdout.match(/src\s+([^\s]+)/)
  const uptimeSeconds = Number.parseFloat(uptime.stdout.trim().split(/\s+/)[0])
  return {
    serial: valueSerial, source: 'adb', captured_at: new Date().toISOString(),
    manufacturer: p['ro.product.manufacturer'] || null, brand: p['ro.product.brand'] || null,
    model: p['ro.product.model'] || null, product: p['ro.product.name'] || null,
    device: p['ro.product.device'] || null, hardware: p['ro.hardware'] || null,
    android: p['ro.build.version.release'] || null, sdk: p['ro.build.version.sdk'] || null,
    build: p['ro.build.display.id'] || p['ro.build.id'] || null, fingerprint: p['ro.build.fingerprint'] || null,
    abi: p['ro.product.cpu.abilist'] || p['ro.product.cpu.abi'] || null,
    bootloader: p['ro.bootloader'] || null, verified_boot: p['ro.boot.verifiedbootstate'] || null,
    active_slot: p['ro.boot.slot_suffix']?.replace(/^_/, '') || p['ro.boot.slot'] || null,
    battery: { level: batteryFields.level || null, temperature_c: batteryFields.temperature ? Number(batteryFields.temperature) / 10 : null, status: batteryFields.status || null, health: batteryFields.health || null, ac: batteryFields['AC powered'] || null, usb: batteryFields['USB powered'] || null, wireless: batteryFields['Wireless powered'] || null },
    storage: { total_kb: dataLine[1] ? Number(dataLine[1]) : null, available_kb: dataLine[3] ? Number(dataLine[3]) : null, raw: dataLine.length ? dataLine.join(' ') : null },
    memory: { total_kb: memoryMatch ? Number(memoryMatch[1]) : null }, display: { size: sizeMatch?.[1] || sizeMatch?.[2] || null, density_dpi: densityMatch ? Number(densityMatch[1]) : null },
    network: { ip: ipMatch?.[1] || null, wifi: ip.stdout.includes('wlan'), operator: p['gsm.operator.alpha'] || p['gsm.sim.operator.alpha'] || null }, uptime_seconds: Number.isFinite(uptimeSeconds) ? uptimeSeconds : null,
  }
}

async function fastbootInfo(value) {
  const valueSerial = serial(value)
  const keys = ['product', 'current-slot', 'slot-count', 'secure', 'unlocked', 'version-bootloader']
  const values = {}
  const results = []
  for (const key of keys) {
    const result = await run(FASTBOOT, ['-s', valueSerial, 'getvar', key], { allowNonZero: true })
    results.push(result)
    const match = `${result.stdout}\n${result.stderr}`.match(new RegExp(`${key.replace('-', '[-_]')}[^:]*:\\s*([^\\r\\n]+)`, 'i'))
    if (match) values[key] = match[1].trim()
  }
  const allResult = await run(FASTBOOT, ['-s', valueSerial, 'getvar', 'all'], { timeout: 60_000, allowNonZero: true })
  const rawAll = `${allResult.stdout}\n${allResult.stderr}`.trim().slice(-MAX_OUTPUT)
  for (const match of rawAll.matchAll(/-?\s*([\w.-]+):\s*([^\r\n]+)/g)) values[match[1]] = match[2].trim()
  return { serial: valueSerial, source: 'fastboot', captured_at: new Date().toISOString(), ...values, variables: values, raw_variables: rawAll, errors: [...results, allResult].filter((result) => !result.ok).map(outputValue).filter(Boolean) }
}

async function diagnostics() {
  const [adbVersion, fastbootVersion, adbState] = await Promise.all([
    run(ADB, ['version'], { allowNonZero: true }),
    run(FASTBOOT, ['--version'], { allowNonZero: true }),
    run(ADB, ['get-state'], { allowNonZero: true }),
  ])
  const adbServer = await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 5037 })
    socket.setTimeout(1500)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.on('error', () => resolve(false))
  })
  return {
    agent: { id: AGENT_ID, version: AGENT_VERSION, host: HOST, platform: process.platform, node: process.version },
    adb: { found: adbVersion.code !== 'NOT_FOUND', version: outputValue(adbVersion).split(/\r?\n/)[0] || null, server_5037: adbServer, state: outputValue(adbState) || null },
    fastboot: { found: fastbootVersion.code !== 'NOT_FOUND', version: outputValue(fastbootVersion).split(/\r?\n/)[0] || null },
    platform_tools_ready: adbVersion.code !== 'NOT_FOUND' && fastbootVersion.code !== 'NOT_FOUND',
  }
}

function files() {
  if (!FILE_ROOT || !existsSync(FILE_ROOT)) return { root: FILE_ROOT, files: [] }
  return { root: FILE_ROOT, files: readdirSync(FILE_ROOT, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => { const full = path.join(FILE_ROOT, entry.name); return { name: entry.name, path: full, size: statSync(full).size } }) }
}

async function dispatch(method, pathname, body = {}) {
  const parts = pathname.split('/').filter(Boolean).map((part) => { try { return decodeURIComponent(part) } catch { return part } })
  if (method === 'GET' && pathname === '/devices') return adbDevices()
  if (method === 'GET' && pathname === '/fastboot/devices') return fastbootDevices()
  if (method === 'GET' && pathname === '/diagnostics') return diagnostics()
  if (method === 'GET' && pathname === '/files') return files()
  if (method === 'GET' && parts[0] === 'devices' && parts[2] === 'info') return deviceInfo(parts[1])
  if (method === 'GET' && parts[0] === 'fastboot' && parts[2] === 'info') return fastbootInfo(parts[1])
  if (parts[0] === 'devices' && parts[2]) {
    const valueSerial = serial(parts[1])
    const action = parts[2]
    const actions = {
      reboot: ['reboot'], recovery: ['reboot', 'recovery'], bootloader: ['reboot', 'bootloader'], fastboot: ['reboot', 'fastboot'],
      packages: ['shell', 'pm', 'list', 'packages'], processes: ['shell', 'ps'], battery: ['shell', 'dumpsys', 'battery'], storage: ['shell', 'df', '-h'], properties: ['shell', 'getprop'], logs: ['logcat', '-d', '-t', '300'],
    }
    if (action === 'screenshot') {
      const target = safePath(body.path)
      return runToFile(ADB, ['-s', valueSerial, 'exec-out', 'screencap', '-p'], target, { timeout: 20_000 })
    }
    if (action === 'shell') {
      const commands = { battery: ['shell', 'dumpsys', 'battery'], properties: ['shell', 'getprop'], storage: ['shell', 'df', '-h'], processes: ['shell', 'ps'], uptime: ['shell', 'cat', '/proc/uptime'], wifi: ['shell', 'ip', 'route'] }
      const selected = commands[body.command]
      if (!selected) throw Object.assign(new Error('Shell limitado: selecciona una consulta autorizada.'), { status: 400 })
      return run(ADB, ['-s', valueSerial, ...selected], { allowNonZero: true })
    }
    if (action === 'install-apk') {
      const target = safePath(body.path, { mustExist: true })
      return run(ADB, ['-s', valueSerial, 'install', '-r', target], { timeout: 180_000, allowNonZero: true })
    }
    if (action === 'push') {
      const source = safePath(body.path, { mustExist: true })
      if (typeof body.destination !== 'string' || !/^\/(sdcard|data\/local\/tmp)(\/[-A-Za-z0-9._]+)+$/.test(body.destination)) throw Object.assign(new Error('Destino restringido a /sdcard o /data/local/tmp.'), { status: 400 })
      return run(ADB, ['-s', valueSerial, 'push', source, body.destination], { timeout: 180_000, allowNonZero: true })
    }
    if (action === 'pull') {
      if (typeof body.source !== 'string' || !/^\/(sdcard|data\/local\/tmp)(\/[-A-Za-z0-9._]+)+$/.test(body.source)) throw Object.assign(new Error('Origen restringido a /sdcard o /data/local/tmp.'), { status: 400 })
      const target = safePath(body.path)
      return run(ADB, ['-s', valueSerial, 'pull', body.source, target], { timeout: 180_000, allowNonZero: true })
    }
    if (!actions[action]) throw Object.assign(new Error('Acción ADB no permitida.'), { status: 404 })
    return run(ADB, ['-s', valueSerial, ...actions[action]], { timeout: action === 'logs' ? 30_000 : COMMAND_TIMEOUT, allowNonZero: true })
  }
  if (parts[0] === 'fastboot' && parts[2]) {
    const valueSerial = serial(parts[1])
    if (parts[2] === 'reboot') return run(FASTBOOT, ['-s', valueSerial, 'reboot'], { allowNonZero: true })
    if (parts[2] === 'reboot-bootloader') return run(FASTBOOT, ['-s', valueSerial, 'reboot-bootloader'], { allowNonZero: true })
    if (parts[2] === 'set-active-slot') {
      if (!['a', 'b'].includes(body.slot)) throw Object.assign(new Error('Solo se permiten los slots A o B.'), { status: 400 })
      return run(FASTBOOT, ['-s', valueSerial, 'set_active', body.slot], { allowNonZero: true })
    }
  }
  throw Object.assign(new Error('Endpoint de Device Agent no permitido.'), { status: 404 })
}

async function handleHttp(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  if (req.method === 'OPTIONS') {
    if (!originAllowed(req)) return json(res, 403, { error: 'Origen no permitido.' })
    const headers = { 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
    if (req.headers.origin) headers['access-control-allow-origin'] = req.headers.origin
    res.writeHead(204, headers)
    return res.end()
  }
  if (!originAllowed(req)) return json(res, 403, { error: 'Origen no permitido.' })
  if (url.pathname === '/health' && req.method === 'GET') { setOriginHeader(req, res); return json(res, 200, healthPayload()) }
  if (url.pathname === '/pairing/status' && req.method === 'GET') { setOriginHeader(req, res); return json(res, 200, { data: pairingPayload() }) }
  if (url.pathname === '/pairing/exchange' && req.method === 'POST') {
    let raw = ''
    for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) return json(res, 413, { error: 'Solicitud demasiado grande.' }) }
    let body
    try { body = raw ? JSON.parse(raw) : {} } catch { return json(res, 400, { error: 'JSON no válido.' }) }
    try { setOriginHeader(req, res); return json(res, 200, { data: await pairWithBackend(body) }) } catch (error) { setOriginHeader(req, res); return json(res, error.status || 502, { error: error.message }) }
  }
  const auth = authorize(req, url)
  if (!auth.claims) return json(res, auth.status, { error: auth.message })
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Método no permitido.' })
  let body = {}
  if (req.method === 'POST') {
    let raw = ''
    for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) return json(res, 413, { error: 'Solicitud demasiado grande.' }) }
    try { body = raw ? JSON.parse(raw) : {} } catch { return json(res, 400, { error: 'JSON no válido.' }) }
  }
  try {
    const data = await dispatch(req.method, url.pathname, body)
    const responseOrigin = req.headers.origin
    res.setHeader('access-control-allow-origin', responseOrigin || '*')
    return json(res, 200, { data })
  } catch (error) {
    const status = error.status || 500
    log('error', error.message, { path: url.pathname, code: error.code || null })
    return json(res, status, { error: error.message || 'Error del agente.' })
  }
}

function broadcast(message) {
  const encoded = JSON.stringify(message)
  for (const client of clients) if (client.readyState === 1) client.send(encoded)
}

const server = http.createServer((req, res) => handleHttp(req, res).catch((error) => json(res, 500, { error: error.message })))
const wss = new WebSocketServer({ noServer: true, maxPayload: 20_000 })
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  const claims = verifyToken(tokenFrom(req, url))
  if (url.pathname !== '/ws' || !originAllowed(req) || !claims) return socket.destroy()
  wss.handleUpgrade(req, socket, head, (client) => {
    clients.add(client)
    const expiryTimer = setTimeout(() => client.close(4001, 'Token expirado'), Math.max(1000, (claims.exp * 1000) - Date.now()))
    client.send(JSON.stringify({ type: 'agent.ready', data: { agent_id: AGENT_ID, workshop_id: WORKSHOP_ID, logs } }))
    client.on('message', async (raw) => {
      let message
      try { message = JSON.parse(raw.toString()) } catch { return client.send(JSON.stringify({ type: 'response', error: 'JSON no válido.' })) }
      if (!message?.id || typeof message.path !== 'string' || !['GET', 'POST'].includes(message.method || 'GET')) return client.send(JSON.stringify({ type: 'response', id: message.id, error: 'Solicitud WebSocket no válida.' }))
      try { client.send(JSON.stringify({ type: 'response', id: message.id, data: await dispatch(message.method || 'GET', message.path, message.body || {}) })) }
      catch (error) { client.send(JSON.stringify({ type: 'response', id: message.id, error: error.message })) }
    })
    client.on('close', () => { clearTimeout(expiryTimer); clients.delete(client) })
  })
})

async function poll() {
  const [adb, fastboot] = await Promise.all([adbDevices(), fastbootDevices()])
  const adbKey = JSON.stringify(adb.devices)
  const fastbootKey = JSON.stringify(fastboot.devices)
  if (adbKey !== JSON.stringify(lastAdb)) {
    for (const device of adb.devices.filter((item) => !lastAdb.some((previous) => previous.serial === item.serial))) log('info', device.state === 'unauthorized' ? 'Dispositivo ADB requiere autorización USB.' : 'Dispositivo ADB conectado.', { event: device.state === 'unauthorized' ? 'adb.unauthorized' : 'device.connected', serial: device.serial, state: device.state })
    for (const device of lastAdb.filter((item) => !adb.devices.some((current) => current.serial === item.serial))) log('info', 'Dispositivo ADB desconectado.', { event: 'device.disconnected', serial: device.serial })
    broadcast({ type: 'devices.changed', data: { adb: adb.devices, fastboot: fastboot.devices, adb_error: adb.error, fastboot_error: fastboot.error } })
    lastAdb = adb.devices
  }
  if (fastbootKey !== JSON.stringify(lastFastboot)) { broadcast({ type: 'devices.changed', data: { adb: adb.devices, fastboot: fastboot.devices, adb_error: adb.error, fastboot_error: fastboot.error } }); lastFastboot = fastboot.devices }
}

server.listen(PORT, HOST, () => { log('info', `CarlosTech Device Agent listo en http://${HOST}:${PORT}`, { event: 'agent.ready', version: AGENT_VERSION, pairing_required: !paired() }); poll(); setInterval(poll, POLL_MS) })
