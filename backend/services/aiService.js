export class AIProviderError extends Error {
  constructor(message, { code = 'AI_ERROR', status = 502, retryable = false } = {}) {
    super(message)
    this.name = 'AIProviderError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.publicMessage = message
  }
}

function text(value, field, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AIProviderError(`Respuesta IA inválida: ${field}`, { code: 'AI_INVALID_RESULT', status: 502 })
  return value.trim()
}

export function validateDiagnosticResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AIProviderError('Respuesta IA inválida.', { code: 'AI_INVALID_RESULT', status: 502 })
  if (!Array.isArray(value.possibleCauses) || !Array.isArray(value.tests) || !Array.isArray(value.tools)) throw new AIProviderError('Respuesta IA inválida.', { code: 'AI_INVALID_RESULT', status: 502 })
  const possibleCauses = value.possibleCauses.slice(0, 10).map((cause) => {
    if (!cause || typeof cause !== 'object') throw new AIProviderError('Respuesta IA inválida.', { code: 'AI_INVALID_RESULT', status: 502 })
    const probability = ['high', 'medium', 'low'].includes(cause.probability) ? cause.probability : 'medium'
    return { cause: text(cause.cause, 'cause', 500), probability, explanation: text(cause.explanation, 'explanation', 1500) }
  })
  const list = (items, field) => items.slice(0, 20).map((item) => text(item, field, 500))
  return {
    summary: text(value.summary, 'summary', 2000),
    possibleCauses,
    tests: list(value.tests, 'tests'),
    tools: list(value.tools, 'tools'),
    difficulty: text(value.difficulty, 'difficulty', 100),
    risk: text(value.risk, 'risk', 100),
    recommendation: text(value.recommendation, 'recommendation', 2000),
    // Compatibility with the current frontend while it migrates to the canonical shape.
    likely_causes: possibleCauses.map((item) => `${item.cause}: ${item.explanation}`),
    recommended_checks: list(value.tests, 'tests'),
    risk_level: text(value.risk, 'risk', 100),
    note: text(value.recommendation, 'recommendation', 2000),
  }
}

export class AIService {
  constructor({ provider }) { this.provider = provider }

  getStatus() {
    return { configured: Boolean(this.provider?.configured), provider: this.provider?.provider || null }
  }

  async generateDiagnostic(input, options = {}) {
    if (!this.provider) throw new AIProviderError('El servicio de IA todavía no está configurado.', { code: 'AI_NOT_CONFIGURED', status: 503 })
    const response = await this.provider.generateDiagnostic(input, options)
    return { ...response, result: validateDiagnosticResult(response.result) }
  }
}
