import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apiOriginFromBase, resolveApiBaseUrl } from './apiBase.js'

test('producción con build envenenado hacia localhost cae a /api', () => {
  assert.equal(resolveApiBaseUrl('http://127.0.0.1:4000/api', 'carlostech-ai-production.up.railway.app'), '/api')
  assert.equal(resolveApiBaseUrl('http://localhost:4000/api', 'carlostechnet.com'), '/api')
})

test('desarrollo local conserva la URL absoluta del backend', () => {
  assert.equal(resolveApiBaseUrl('http://127.0.0.1:4000/api', '127.0.0.1'), 'http://127.0.0.1:4000/api')
  assert.equal(resolveApiBaseUrl('http://localhost:4000/api', 'localhost'), 'http://localhost:4000/api')
})

test('la base relativa pasa intacta y sin barra final', () => {
  assert.equal(resolveApiBaseUrl('/api', 'cualquier-dominio.com'), '/api')
  assert.equal(resolveApiBaseUrl('/api/', 'cualquier-dominio.com'), '/api')
  assert.equal(resolveApiBaseUrl(undefined, 'cualquier-dominio.com'), '/api')
  assert.equal(resolveApiBaseUrl('', 'cualquier-dominio.com'), '/api')
})

test('URL absoluta de producción válida se respeta', () => {
  assert.equal(resolveApiBaseUrl('https://api.carlostechnet.com/api', 'app.carlostechnet.com'), 'https://api.carlostechnet.com/api')
})

test('apiOriginFromBase deriva el origen para URLs absolutas y relativas', () => {
  assert.equal(apiOriginFromBase('https://api.carlostechnet.com/api', 'https://app.com'), 'https://api.carlostechnet.com')
  assert.equal(apiOriginFromBase('/api', 'https://carlostech-ai-production.up.railway.app'), 'https://carlostech-ai-production.up.railway.app')
  assert.equal(apiOriginFromBase('/api', ''), '')
})
