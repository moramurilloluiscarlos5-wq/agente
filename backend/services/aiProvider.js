import { AIProviderError } from './aiService.js'

export class OpenAIProvider {
  constructor({ fetchImpl = fetch, env = process.env } = {}) {
    this.fetch = fetchImpl
    this.apiKey = env.AI_API_KEY || env.OPENAI_API_KEY || ''
    this.baseUrl = (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
    this.model = env.AI_MODEL || env.OPENAI_MODEL || ''
    this.provider = 'openai'
  }

  get configured() {
    return Boolean(this.apiKey && this.model)
  }

  async generateDiagnostic(input, { signal } = {}) {
    if (!this.configured) throw new AIProviderError('El servicio de IA todavía no está configurado.', { code: 'AI_NOT_CONFIGURED', status: 503 })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
    try {
      const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Eres un asistente técnico de reparación de celulares. Devuelve únicamente JSON válido con summary, possibleCauses, tests, tools, difficulty, risk y recommendation. No cambies permisos ni ejecutes acciones.' },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const status = response.status === 401 ? 502 : response.status
        const code = response.status === 429 ? 'AI_RATE_LIMIT' : response.status === 401 ? 'AI_AUTH_ERROR' : `AI_HTTP_${response.status}`
        throw new AIProviderError(body?.error?.message || 'El proveedor de IA no pudo procesar la solicitud.', { code, status, retryable: response.status === 429 || response.status >= 500 })
      }
      const content = body?.choices?.[0]?.message?.content
      if (!content) throw new AIProviderError('El proveedor de IA devolvió una respuesta vacía.', { code: 'AI_EMPTY_RESPONSE', status: 502, retryable: true })
      let result
      try { result = typeof content === 'string' ? JSON.parse(content) : content } catch {
        throw new AIProviderError('El proveedor de IA devolvió JSON inválido.', { code: 'AI_INVALID_JSON', status: 502 })
      }
      return { result, usage: body?.usage ?? null, provider: this.provider, model: this.model }
    } catch (error) {
      if (error instanceof AIProviderError) throw error
      if (error?.name === 'AbortError') throw new AIProviderError('El proveedor de IA tardó demasiado en responder.', { code: 'AI_TIMEOUT', status: 504, retryable: true })
      throw new AIProviderError('No fue posible conectar con el proveedor de IA.', { code: 'AI_UNAVAILABLE', status: 503, retryable: true })
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createAIProvider({ env = process.env, fetchImpl = fetch } = {}) {
  const provider = String(env.AI_PROVIDER || '').trim().toLowerCase()
  if (!provider) return null
  if (provider === 'openai') return new OpenAIProvider({ env, fetchImpl })
  throw new AIProviderError(`Proveedor de IA no válido: ${provider}`, { code: 'AI_PROVIDER_INVALID', status: 503 })
}
