import crypto from 'node:crypto'

// Short-lived capability token shared only with a paired local Device Agent.
// The token contains the workshop and user identity so the agent cannot be
// used as a generic localhost command runner or moved between tenants.
function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function deriveDeviceAgentSecret({ workshopId, agentId, pairingCode, masterSecret = process.env.DEVICE_AGENT_SECRET }) {
  if (!masterSecret || masterSecret.length < 32) {
    const error = new Error('El agente local no está configurado. Define DEVICE_AGENT_SECRET (mínimo 32 caracteres).')
    error.status = 503
    error.publicMessage = error.message
    throw error
  }
  if (typeof workshopId !== 'string' || !workshopId || typeof agentId !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(agentId) || typeof pairingCode !== 'string' || !/^\d{6}$/.test(pairingCode)) {
    const error = new Error('Identidad o código de vinculación del agente no válidos.')
    error.status = 400
    error.publicMessage = error.message
    throw error
  }
  return crypto.createHmac('sha256', masterSecret)
    .update(`carlostech-device-agent:v1:${workshopId}:${agentId}:${pairingCode}`)
    .digest('base64url')
}

export function createDeviceAgentToken({ workshopId, userId, agentId, pairingCode, ttlSeconds = 300 }) {
  const secret = deriveDeviceAgentSecret({ workshopId, agentId, pairingCode })
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
