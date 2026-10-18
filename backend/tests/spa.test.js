import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { mountSpa } from '../middleware/spa.js'

function makePublicDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-spa-'))
  fs.mkdirSync(path.join(dir, 'assets'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>')
  fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'export default 1')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

async function serve(t, publicDir) {
  const app = express()
  mountSpa(app, publicDir)
  app.use((_req, res) => res.status(404).json({ message: 'no encontrado' }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return (route) => fetch(`http://127.0.0.1:${server.address().port}${route}`)
}

test('los assets con hash son inmutables y las rutas de la SPA devuelven index.html sin caché', async (t) => {
  const request = await serve(t, makePublicDir(t))
  const asset = await request('/assets/app-abc123.js')
  assert.equal(asset.status, 200)
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')

  for (const route of ['/', '/login', '/reparaciones/OR-1', '/index.html']) {
    const page = await request(route)
    assert.equal(page.status, 200, route)
    assert.equal(page.headers.get('cache-control'), 'no-store', route)
    assert.match(await page.text(), /<div id="root">/, route)
  }
})

test('un asset que ya no existe tras un deploy responde 404 en lugar de index.html', async (t) => {
  const request = await serve(t, makePublicDir(t))
  for (const route of ['/assets/Inventory-VERSIONANTERIOR.js', '/assets/viejo.css', '/assets/']) {
    const response = await request(route)
    assert.equal(response.status, 404, route)
    assert.equal(response.headers.get('cache-control'), 'no-store', route)
    assert.doesNotMatch(response.headers.get('content-type'), /html/, route)
    assert.doesNotMatch(await response.text(), /<div id="root">/, route)
  }
})

test('las rutas /api no caen en el fallback de la SPA', async (t) => {
  const request = await serve(t, makePublicDir(t))
  const response = await request('/api/no-existe')
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { message: 'no encontrado' })
})

test('sin carpeta public (desarrollo) no se sirve nada y el 404 sigue activo', async (t) => {
  const request = await serve(t, path.join(os.tmpdir(), 'tf-spa-no-existe'))
  for (const route of ['/login', '/assets/app.js']) {
    const response = await request(route)
    assert.equal(response.status, 404, route)
    assert.deepEqual(await response.json(), { message: 'no encontrado' }, route)
  }
})
