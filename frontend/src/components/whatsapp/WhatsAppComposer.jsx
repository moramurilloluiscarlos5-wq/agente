import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Send } from 'lucide-react'
import { api } from '../../services/api.js'
import { useToast } from '../../hooks/useToast.js'
import { formatCurrency } from '../../utils/formatters.js'
import { Alert, Button, Dialog, ErrorAlert, Select, Textarea } from '../ui/DesignSystem.jsx'

function customerName(customer) { return [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'cliente' }
function deviceName(repair) { return [repair?.brand || repair?.device?.brand, repair?.model || repair?.device?.model].filter(Boolean).join(' ') || 'tu equipo' }

const TEMPLATES = {
  received: ['Equipo recibido', ({ repair, customer }) => `Hola ${customerName(customer)}. Recibimos tu ${deviceName(repair)}. Tu número de orden es ${repair.order_number}. Te avisaremos de cada avance.`],
  diagnosis: ['Diagnóstico listo', ({ repair, customer }) => `Hola ${customerName(customer)}. Ya terminamos el diagnóstico de tu ${deviceName(repair)} (orden ${repair.order_number}). Escríbenos para revisar las opciones de reparación.`],
  authorization: ['Pedir autorización', ({ repair, customer }) => `Hola ${customerName(customer)}. La reparación de tu ${deviceName(repair)} (orden ${repair.order_number}) cuesta ${formatCurrency(repair.estimated_cost)}. Respóndenos para autorizarla y empezamos.`],
  started: ['Reparación iniciada', ({ repair, customer }) => `Hola ${customerName(customer)}. Ya empezamos a reparar tu ${deviceName(repair)} (orden ${repair.order_number}).`],
  part: ['Esperando refacción', ({ repair, customer }) => `Hola ${customerName(customer)}. Tu ${deviceName(repair)} está en espera de una refacción. Te avisamos en cuanto llegue para continuar.`],
  ready: ['Listo para entregar', ({ repair, customer }) => `Hola ${customerName(customer)}. Tu ${deviceName(repair)} ya está listo (orden ${repair.order_number}). Total: ${formatCurrency(repair.estimated_cost)}. Te esperamos en el taller.`],
  payment: ['Saldo pendiente', ({ repair, customer }) => `Hola ${customerName(customer)}. La orden ${repair.order_number} tiene un saldo pendiente de ${formatCurrency(Math.max(0, Number(repair.estimated_cost || 0) - Number(repair.deposit || 0)))}.`],
  custom: ['Mensaje libre', () => ''],
}

// Panel lateral para enviar un aviso por WhatsApp sin salir de la orden.
export default function WhatsAppComposer({ repair = null, customer, onSent }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [template, setTemplate] = useState('received')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [requestError, setRequestError] = useState(null)
  const [saving, setSaving] = useState(false)
  const context = { repair: repair || {}, customer }
  const optIn = Boolean(customer?.whatsapp_opt_in)
  const phone = customer?.whatsapp_e164 || customer?.whatsapp || customer?.phone || ''

  function openComposer() {
    setError(''); setRequestError(null)
    setMessage(TEMPLATES[template][1](context))
    setOpen(true)
  }

  function chooseTemplate(key) {
    setTemplate(key)
    setMessage(TEMPLATES[key][1](context))
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    if (!message.trim()) { setError('Escribe el mensaje que quieres enviar.'); document.getElementById('whatsapp-message')?.focus(); return }
    setSaving(true); setRequestError(null)
    try {
      const response = await api.post('/whatsapp/messages', { customer_id: customer.id, repair_order_id: repair?.id, message })
      toast.success(response.simulated ? 'Envío simulado: WhatsApp aún no está conectado.' : `Mensaje enviado a ${customerName(customer)}.`)
      onSent?.(response.data)
      setOpen(false)
    } catch (err) {
      setRequestError(err)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <Button icon={MessageCircle} onClick={openComposer} disabled={!customer}>Enviar WhatsApp</Button>
    <Dialog sheet open={open} onClose={saving ? undefined : () => setOpen(false)} title="Enviar WhatsApp" description={`${customerName(customer)}${phone ? `, +${phone.replace(/^\+/, '')}` : ''}${repair?.order_number ? `. Orden ${repair.order_number}` : ''}`}
      footer={optIn && <><Button onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="whatsapp-form" icon={Send} busy={saving}>{saving ? 'Enviando…' : 'Enviar mensaje'}</Button></>}>
      {!optIn ? (
        <Alert tone="warning" title="Falta la autorización del cliente" action={customer?.id && <Link to={`/clientes/${customer.id}/editar`} className="ct-btn ct-btn-secondary ct-btn-sm">Registrar autorización</Link>}>
          Para enviarle mensajes, marca en su ficha que acepta recibir avisos por WhatsApp.
        </Alert>
      ) : (
        <form id="whatsapp-form" onSubmit={submit} noValidate className="space-y-4">
          <Select label="Plantilla" value={template} onChange={(event) => chooseTemplate(event.target.value)} hint="Puedes ajustar el texto antes de enviarlo.">
            {Object.entries(TEMPLATES).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
          </Select>
          <Textarea id="whatsapp-message" label="Mensaje" required rows={8} maxLength={4096} value={message} error={error}
            onChange={(event) => { setMessage(event.target.value); setError('') }} hint={`${message.length} de 4096 caracteres`} />
          {requestError && <ErrorAlert error={requestError} action="enviar el mensaje" />}
        </form>
      )}
    </Dialog>
  </>
}
