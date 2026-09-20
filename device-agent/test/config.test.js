import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import packageJson from '../package.json' with { type: 'json' }
import { loadConfig, loadDotEnv, PRODUCTION_ORIGIN, runtimeRoot } from '../src/config.js'

function fixture(t) {
  const prefix = path.join(os.tmpdir(), 'carlostech-agent-config-')
  const root = mkdtempSync(prefix)
  t.after(() => {
    assert.ok(path.isAbsolute(root) && root.startsWith(prefix))
    rmSync(root, { recursive: true, force: true })
  })
  return root
}

test('configuration follows the executable or source tree, independently of the launching directory', () => {
  const root = path.resolve('agent-fixture')
  assert.equal(runtimeRoot({ packaged: true, execPath: path.join(root, 'CarlosTechDeviceAgent.exe') }), root)
  assert.equal(runtimeRoot({ packaged: false, sourceDirectory: path.join(root, 'src') }), root)
  assert.equal(runtimeRoot({ packaged: false, sourceDirectory: path.join(root, 'dist') }), root)
  assert.equal(runtimeRoot(), path.dirname(path.dirname(fileURLToPath(import.meta.url))))
})

test('dotenv supports Windows BOM, quotes and comments while keeping existing process settings', (t) => {
  const root = fixture(t)
  const envFile = path.join(root, '.env')
  writeFileSync(envFile, '\uFEFF# Local config\r\nDEVICE_AGENT_PORT=6000\r\nexport DEVICE_AGENT_ID="taller #1" # comment\r\nDEVICE_AGENT_FILES_DIR=\'C:\\Fotos del taller\'\r\nDEVICE_AGENT_SECRET=local-secret\r\n')
  const env = { DEVICE_AGENT_PORT: '7000', DEVICE_AGENT_SECRET: '' }
  loadDotEnv(envFile, env)
  assert.equal(env.DEVICE_AGENT_PORT, '7000')
  assert.equal(env.DEVICE_AGENT_ID, 'taller #1')
  assert.equal(env.DEVICE_AGENT_FILES_DIR, 'C:\\Fotos del taller')
  assert.equal(env.DEVICE_AGENT_SECRET, '')
})

test('shipped environment template uses bundled tools and contains no pairing credentials', (t) => {
  const root = fixture(t)
  mkdirSync(path.join(root, 'platform-tools'))
  for (const name of ['adb.exe', 'fastboot.exe']) writeFileSync(path.join(root, 'platform-tools', name), '')
  writeFileSync(path.join(root, '.env'), readFileSync(new URL('../.env.example', import.meta.url)))
  const config = loadConfig({ root, env: {}, platform: 'win32' })
  assert.equal(config.adb, path.join(root, 'platform-tools', 'adb.exe'))
  assert.equal(config.fastboot, path.join(root, 'platform-tools', 'fastboot.exe'))
  assert.equal(config.secret, '')
  assert.equal(config.workshopId, '')
  assert.equal(config.host, '127.0.0.1')
  assert.ok(config.allowedOrigins.has(PRODUCTION_ORIGIN))
  assert.ok(!config.allowedOrigins.has('https://untrusted.example'))
})

test('configuration loads beside executable and relative paths stay relative to that location', (t) => {
  const root = fixture(t)
  writeFileSync(path.join(root, '.env'), 'DEVICE_AGENT_PORT=6010\nDEVICE_AGENT_FILES_DIR=files\nDEVICE_AGENT_STATE_FILE=data/state.json\nADB_PATH=custom/adb.exe\nFASTBOOT_PATH=custom-fastboot\nDEVICE_AGENT_ALLOWED_ORIGINS=https://workshop.example\n')
  const config = loadConfig({ root, env: {}, platform: 'win32' })
  assert.equal(config.port, 6010)
  assert.equal(config.filesRoot, path.join(root, 'files'))
  assert.equal(config.stateFile, path.join(root, 'data', 'state.json'))
  assert.equal(config.adb, path.join(root, 'custom', 'adb.exe'))
  assert.equal(config.fastboot, 'custom-fastboot')
  assert.deepEqual([...config.allowedOrigins], ['https://workshop.example'])
})

test('defaults allow production, fall back to PATH and use the embedded release version', (t) => {
  const root = fixture(t)
  const warnings = []
  const config = loadConfig({ root, env: {}, warn: (value) => warnings.push(value) })
  assert.equal(config.backendUrl, PRODUCTION_ORIGIN)
  assert.ok(config.allowedOrigins.has(PRODUCTION_ORIGIN))
  assert.equal(config.adb, 'adb')
  assert.equal(config.fastboot, 'fastboot')
  assert.equal(config.version, packageJson.version)
  assert.deepEqual(warnings, [])
})

test('BOM version manifests are readable and invalid manifests fall back to embedded version', (t) => {
  const root = fixture(t)
  const manifest = path.join(root, 'version.json')
  writeFileSync(manifest, '\uFEFF{"version":"1.0.9"}\r\n')
  assert.equal(loadConfig({ root, env: {} }).version, '1.0.9')
  assert.equal(loadConfig({ root, env: { DEVICE_AGENT_VERSION: '1.0.10' } }).version, '1.0.10')
  for (const content of ['not JSON', '{"version":{}}', '{"version":""}']) {
    writeFileSync(manifest, content)
    assert.equal(loadConfig({ root, env: {} }).version, packageJson.version)
  }
})
