import test from 'node:test'
import assert from 'node:assert/strict'
import { OpenAIProvider, createAIProvider } from '../services/aiProvider.js'
import { AIProviderError, AIService, validateDiagnosticResult } from '../services/aiService.js'

const validResult = {
  summary: 'No inicia por una falla probable de alimentación.',
  possibleCauses: [{ cause: 'Batería dañada', probability: 'high', explanation: 'La batería no conserva carga.' }],
  tests: ['Medir voltaje de batería'],
  tools: ['Multímetro'],
  difficulty: 'media',
  risk: 'media',
  recommendation: 'Confirmar con un técnico antes de sustituir piezas.',
}

function providerWith(response, env = { AI_API_KEY: 'key', AI_MODEL: 'model', AI_PROVIDER: 'openai' }) {
  return new OpenAIProvider({ env, fetchImpl: async () => response })
}

test('AI provider factory does not configure a provider without explicit provider', () => {
  assert.equal(createAIProvider({ env: {} }), null)
})

test('OpenAI provider sends only the diagnostic payload and validates a JSON result', async () => {
  let request
  const provider = new OpenAIProvider({
    env: { AI_PROVIDER: 'openai', AI_API_KEY: 'secret', AI_MODEL: 'model', AI_BASE_URL: 'https://ai.example.test/v1' },
    fetchImpl: async (_url, options) => { request = { url: _url, options }; return Response.json({ choices: [{ message: { content: JSON.stringify(validResult) } }], usage: { total_tokens: 42 } }) },
  })
  const service = new AIService({ provider })
  const result = await service.generateDiagnostic({ device_brand: 'Samsung', issue: 'No enciende' })
  assert.equal(result.usage.total_tokens, 42)
  assert.equal(result.result.possibleCauses[0].probability, 'high')
  assert.equal(request.url, 'https://ai.example.test/v1/chat/completions')
  assert.match(request.options.headers.Authorization, /^Bearer /)
  assert.doesNotMatch(request.options.body, /customer|password|token/i)
})

test('provider translates rate limits, timeouts and invalid JSON', async () => {
  await assert.rejects(() => providerWith(new Response(JSON.stringify({ error: { message: 'limit' } }), { status: 429, headers: { 'content-type': 'application/json' } })).generateDiagnostic({ issue: 'x' }), (error) => error.code === 'AI_RATE_LIMIT' && error.status === 429)
  const timeout = new OpenAIProvider({ env: { AI_API_KEY: 'key', AI_MODEL: 'model' }, fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error } })
  await assert.rejects(() => timeout.generateDiagnostic({ issue: 'x' }), (error) => error.code === 'AI_TIMEOUT' && error.status === 504)
  await assert.rejects(() => providerWith(Response.json({ choices: [{ message: { content: '{bad' } }] })).generateDiagnostic({ issue: 'x' }), (error) => error.code === 'AI_INVALID_JSON')
})

test('service returns a clear error when IA is not configured and rejects malformed output', async () => {
  await assert.rejects(() => new AIService({ provider: null }).generateDiagnostic({ issue: 'x' }), (error) => error.code === 'AI_NOT_CONFIGURED' && error.status === 503)
  assert.throws(() => validateDiagnosticResult({ summary: 'x' }), (error) => error instanceof AIProviderError && error.code === 'AI_INVALID_RESULT')
})
