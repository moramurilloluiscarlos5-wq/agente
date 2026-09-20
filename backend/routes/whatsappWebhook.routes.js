import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { databaseError } from '../utils/operations.js'
import { whatsappProvider } from '../services/whatsappService.js'

export function createWhatsAppWebhookRouter({ db = supabaseAdmin, provider = whatsappProvider } = {}) {
  const router = Router()

  router.get('/', (req, res) => {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && provider.verifyWebhookToken(token)) return res.status(200).send(challenge)
    res.sendStatus(403)
  })

  router.post('/', async (req, res) => {
    const rawBody = req.body
    const signature = req.headers['x-hub-signature-256']
    if (!provider.validateWebhookSignature(rawBody, signature)) return res.sendStatus(403)

    let payload
    try {
      payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody))
    } catch {
      return res.sendStatus(400)
    }

    const statuses = extractStatuses(payload)
    for (const status of statuses) {
      const eventId = `${status.id}:${status.status}:${status.timestamp || ''}`
      const { error: eventError } = await db.from('whatsapp_webhook_events').insert({ provider_event_id: eventId, payload: status })
      if (eventError?.code === '23505') continue
      databaseError(eventError)
      await updateMessageStatus(db, status)
      await db.from('whatsapp_webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider_event_id', eventId)
    }

    res.sendStatus(200)
  })

  return router
}

function extractStatuses(payload) {
  const statuses = []
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (status.id && ['sent', 'delivered', 'read', 'failed'].includes(status.status)) statuses.push(status)
      }
    }
  }
  return statuses
}

async function updateMessageStatus(db, status) {
  const values = { status: status.status }
  const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString()
  if (status.status === 'sent') values.sent_at = timestamp
  if (status.status === 'delivered') values.delivered_at = timestamp
  if (status.status === 'read') values.read_at = timestamp
  if (status.status === 'failed') {
    values.failed_at = timestamp
    values.error_code = status.errors?.[0]?.code ? String(status.errors[0].code) : 'PROVIDER_FAILED'
    values.error_message = 'WhatsApp no pudo entregar el mensaje'
  }
  const { error } = await db.from('whatsapp_messages').update(values).eq('provider_message_id', status.id)
  databaseError(error)
}

export default createWhatsAppWebhookRouter()
