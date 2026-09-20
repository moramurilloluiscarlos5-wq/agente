import { existsSync, rmSync, cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(rootDir, 'frontend', 'dist')
const targetDir = join(rootDir, 'backend', 'public')

if (!existsSync(sourceDir)) {
  throw new Error(`No existe frontend/dist. Ejecuta primero el build del frontend.`)
}

rmSync(targetDir, { recursive: true, force: true })
mkdirSync(targetDir, { recursive: true })
cpSync(sourceDir, targetDir, { recursive: true })

console.log(`Frontend compilado copiado a ${targetDir}`)