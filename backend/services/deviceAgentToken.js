import crypto from 'node:crypto'

// Short-lived capability token shared only with a paired local Device Agent.
// The token contains the workshop and user identity so the agent cannot be
// used as a generic localhost command runner or moved between tenants.
function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function createDeviceAgentToken({ workshopId, userId, agentId = process.env.DEVICE_AGENT_ID || null, ttlSeconds = 300 }) {
  const secret = process.env.DEVICE_AGENT_SECRET
  if (!secret || secret.length < 32) {
    const error = new Error('El agente local no está configurado. Define DEVICE_AGENT_SECRET (mínimo 32 caracteres).')
    error.status = 503
    error.publicMessage = error.message
    throw error
  }
  const now = Math.floor(Date.now() / 1000)
  const payload = { workshop_id: workshopId, user_id: userId, agent_id: agentId, iat: now, exp: now + ttlSeconds, jti: crypto.randomUUID() }
  const body = encode(payload)
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return { token: `${body}.${signature}`, expires_at: new Date((now + ttlSeconds) * 1000).toISOString(), agent_id: agentId }
}
