import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import packageJson from '../package.json' with { type: 'json' }

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.resolve(process.env.DEVICE_AGENT_BUILD_DIR || path.join(root, 'dist', 'unsigned'))
const scratch = await mkdtemp(path.join(output, 'smoke-'))
let child
let closed
try {
  const probe = net.createServer()
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve) })
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const exe = path.join(scratch, 'CarlosTechDeviceAgent.exe')
  await copyFile(path.join(output, 'CarlosTechDeviceAgent.exe'), exe)
  const otherCwd = path.join(scratch, 'other-working-directory')
  await mkdir(otherCwd)
  // Deliberately absent tool/state paths: never touch attached phones or real pairing.
  await writeFile(path.join(scratch, '.env'), [
    'DEVICE_AGENT_HOST=127.0.0.1', `DEVICE_AGENT_PORT=${port}`,
    'DEVICE_AGENT_STATE_FILE=isolated-state.json', 'DEVICE_AGENT_POLL_MS=60000',
    'ADB_PATH=./no-tools/adb.exe', 'FASTBOOT_PATH=./no-tools/fastboot.exe',
    'DEVICE_AGENT_ALLOWED_ORIGINS=https://carlostech-ai-production.up.railway.app',
  ].join('\n'))
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(DEVICE_AGENT_|ADB_PATH$|FASTBOOT_PATH$)/.test(key)) delete env[key]
  }
  child = spawn(exe, [], { env, cwd: otherCwd, windowsHide: true, stdio: 'ignore' })
  let spawnError
  child.on('error', (error) => { spawnError = error })
  closed = new Promise((resolve) => child.once('close', resolve))
  const base = `http://127.0.0.1:${port}`
  const headers = { Origin: 'https://carlostech-ai-production.up.railway.app' }
  let response
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError
    if (child.exitCode !== null) throw new Error(`Packaged agent exited before health check: ${child.exitCode}`)
    try { response = await fetch(`${base}/health`, { headers, signal: AbortSignal.timeout(500) }); break } catch { await delay(100) }
  }
  assert.ok(response, 'Executable must start using its adjacent .env, independently of cwd')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).version, packageJson.version)
  assert.equal(response.headers.get('access-control-allow-origin'), headers.Origin)
  assert.equal((await fetch(`${base}/health`, { headers: { Origin: 'https://untrusted.example' } })).status, 403)
  const pairing = await fetch(`${base}/pairing/status`, { headers }).then((result) => result.json())
  assert.equal(pairing.data.pairing_required, true)
  assert.equal((await fetch(`${base}/devices`, { headers })).status, 401)
  console.log(`EXE SMOKE: SUCCESS (version ${packageJson.version}, adjacent .env, production origin, rejects untrusted origin and unauthenticated commands)`)
} finally {
  if (child) { child.kill(); await closed }
  // Only the uniquely created test directory is removed.
  await rm(scratch, { recursive: true, force: true })
}
