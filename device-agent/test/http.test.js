import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { PRODUCTION_ORIGIN } from '../src/config.js'

test('real HTTP errors remain readable by the allowed web app for pairing recovery', async (t) => {
  const prefix = path.join(os.tmpdir(), 'carlostech-agent-http-')
  const scratch = await mkdtemp(prefix)
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const secret = crypto.randomBytes(32).toString('hex')
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(DEVICE_AGENT_|ADB_PATH$|FASTBOOT_PATH$)/.test(key)) delete env[key]
  }
  Object.assign(env, {
    DEVICE_AGENT_HOST: '127.0.0.1', DEVICE_AGENT_PORT: String(port),
    DEVICE_AGENT_ID: 'http-test-agent', DEVICE_AGENT_SECRET: secret,
    DEVICE_AGENT_WORKSHOP_ID: 'http-test-workshop',
    DEVICE_AGENT_STATE_FILE: path.join(scratch, 'state.json'),
    DEVICE_AGENT_ALLOWED_ORIGINS: PRODUCTION_ORIGIN,
    DEVICE_AGENT_POLL_MS: '60000',
    ADB_PATH: path.join(scratch, 'absent-adb.exe'),
    FASTBOOT_PATH: path.join(scratch, 'absent-fastboot.exe'),
  })
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], {
    env, cwd: scratch, windowsHide: true, stdio: 'ignore',
  })
  let spawnError
  child.on('error', (error) => { spawnError = error })
  const closed = new Promise((resolve) => child.once('close', resolve))
  t.after(async () => {
    child.kill()
    await closed
    assert.ok(path.isAbsolute(scratch) && scratch.startsWith(prefix))
    await rm(scratch, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${port}`
  const headers = { Origin: PRODUCTION_ORIGIN }
  let health
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnError) throw spawnError
    assert.equal(child.exitCode, null, 'Agent must stay running')
    try { health = await fetch(`${base}/health`, { headers, signal: AbortSignal.timeout(500) }); break }
    catch { await delay(100) }
  }
  assert.equal(health?.status, 200)

  const now = Math.floor(Date.now() / 1000)
  const body = Buffer.from(JSON.stringify({ iat: now, exp: now + 60, workshop_id: 'http-test-workshop', agent_id: 'http-test-agent' })).toString('base64url')
  const token = `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`
  const authorized = { ...headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  for (const [endpoint, options, status] of [
    ['/devices', { headers }, 401],
    ['/devices', { headers: { ...headers, Authorization: 'Bearer stale-token' } }, 401],
    ['/pairing/exchange', { method: 'POST', headers, body: '{' }, 400],
    ['/devices', { method: 'POST', headers: authorized, body: '{' }, 400],
    ['/devices', { method: 'DELETE', headers: authorized }, 405],
    ['/unknown', { headers: authorized }, 404],
  ]) {
    const response = await fetch(`${base}${endpoint}`, options)
    assert.equal(response.status, status, endpoint)
    assert.equal(response.headers.get('access-control-allow-origin'), PRODUCTION_ORIGIN, `${endpoint}: browser must read ${status}`)
    assert.ok((await response.json()).error)
  }
  const preflight = await fetch(`${base}/devices`, { method: 'OPTIONS', headers: {
    ...headers, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,content-type', 'Access-Control-Request-Private-Network': 'true',
  } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), PRODUCTION_ORIGIN)
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true')
  for (const endpoint of ['/health', '/pairing/status', '/devices']) {
    const forbidden = await fetch(`${base}${endpoint}`, { headers: { ...authorized, Origin: 'https://untrusted.example' } })
    assert.equal(forbidden.status, 403)
    assert.equal(forbidden.headers.get('access-control-allow-origin'), null)
  }
})
