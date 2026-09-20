import { build } from 'esbuild'
import { exec as pkg } from '@yao-pkg/pkg'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import packageJson from '../package.json' with { type: 'json' }

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.resolve(process.env.DEVICE_AGENT_BUILD_DIR || path.join(root, 'dist', 'unsigned'))
await mkdir(output, { recursive: true })
// Bundle only explicit runtime imports; never package .env, state.json or keys.
await build({
  entryPoints: [path.join(root, 'src/index.js')], bundle: true,
  platform: 'node', target: 'node22', format: 'cjs',
  outfile: path.join(output, 'index.cjs'), minify: true, sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' },
})
await pkg([path.join(output, 'index.cjs'), '--targets', 'node22-win-x64',
  '--output', path.join(output, 'CarlosTechDeviceAgent.exe')])
await writeFile(path.join(output, 'version.json'), JSON.stringify({ version: packageJson.version, platform: 'windows-x64' }, null, 2) + '\n')
console.log(`BUILD: SUCCESS (Windows x64 Release ${packageJson.version}); signing still required.`)
