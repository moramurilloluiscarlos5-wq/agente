import os from 'node:os'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import packageJson from '../package.json' with { type: 'json' }

export const PRODUCTION_ORIGIN = 'https://carlostech-ai-production.up.railway.app'
const DEFAULT_ORIGINS = `${PRODUCTION_ORIGIN},http://localhost:5173,http://127.0.0.1:5173`

export function runtimeRoot({ packaged = Boolean(process.pkg), execPath = process.execPath, sourceDirectory } = {}) {
  if (packaged) return path.dirname(execPath)
  // esbuild's CommonJS bundle lives in dist/; the ESM sources live in src/.
  const moduleDirectory = sourceDirectory || (typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url)))
  return path.resolve(moduleDirectory, '..')
}

export function loadDotEnv(file, env = process.env, warn = console.warn) {
  try {
    const values = parseEnv(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    for (const [key, value] of Object.entries(values)) {
      // An explicitly configured process variable always takes priority.
      if (!Object.prototype.hasOwnProperty.call(env, key)) env[key] = value
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') warn(`No se pudo cargar la configuración local: ${error.message}`)
  }
}

function releaseVersion(root) {
  try {
    const value = JSON.parse(readFileSync(path.join(root, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).version
    if (typeof value === 'string' && value.trim()) return value.trim()
  } catch { /* Development and portable binaries use the embedded package version. */ }
  return packageJson.version
}

export function loadConfig({ root = runtimeRoot(), env = process.env, platform = process.platform, warn = console.warn } = {}) {
  loadDotEnv(path.join(root, '.env'), env, warn)
  const bundledTool = (name, override) => {
    if (override?.trim()) {
      const executable = override.trim()
      return /[\\/]/.test(executable) ? path.resolve(root, executable) : executable
    }
    const bundled = path.join(root, 'platform-tools', `${name}${platform === 'win32' ? '.exe' : ''}`)
    return existsSync(bundled) ? bundled : name
  }
  return {
    host: env.DEVICE_AGENT_HOST || '127.0.0.1',
    port: Number(env.DEVICE_AGENT_PORT || 5391),
    version: env.DEVICE_AGENT_VERSION || releaseVersion(root),
    stateFile: env.DEVICE_AGENT_STATE_FILE ? path.resolve(root, env.DEVICE_AGENT_STATE_FILE) : path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'CarlosTech', 'DeviceAgent', 'state.json'),
    backendUrl: env.DEVICE_AGENT_BACKEND_URL || PRODUCTION_ORIGIN,
    secret: env.DEVICE_AGENT_SECRET || '',
    workshopId: env.DEVICE_AGENT_WORKSHOP_ID || '',
    agentId: env.DEVICE_AGENT_ID || `agent-${os.hostname()}`,
    allowedOrigins: new Set((env.DEVICE_AGENT_ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((value) => value.trim()).filter(Boolean)),
    adb: bundledTool('adb', env.ADB_PATH),
    fastboot: bundledTool('fastboot', env.FASTBOOT_PATH),
    filesRoot: env.DEVICE_AGENT_FILES_DIR ? path.resolve(root, env.DEVICE_AGENT_FILES_DIR) : null,
    pollMs: Math.max(1000, Number(env.DEVICE_AGENT_POLL_MS || 2000)),
  }
}
