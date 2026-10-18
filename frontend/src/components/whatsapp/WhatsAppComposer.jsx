import { useMemo, useState } from 'react'
import { CheckCircle2, LoaderCircle, MessageCircle, Send, X } from 'lucide-react'
import { api } from '../../services/api.js'
import { repairButtonClass, repairInputClass, repairSecondaryClass } from '../repairs/repairForm.js'

const QUICK_MESSAGES = [
  ['received', 'Equipo recibido', ({ repair, customer }) => `Hola ${customerName(customer)}. Tu equipo ${deviceName(repair)} fue recibido correctamente. Orden: ${repair.order_number}. Te mantendremos informado sobre el avance de tu reparación.`],
  ['diagnosis', 'Diagnóstico completado', ({ repair, customer }) => `Hola ${customerName(customer)}. El diagnóstico de tu ${deviceName(repair)} ha sido completado. Orden: ${repair.order_number}. Comunícate con nosotros para revisar las opciones de reparación.`],
  ['authorization', 'Esperando autorización', ({ repair, customer }) => `Hola ${customerName(customer)}. Ya tenemos la cotización de tu ${deviceName(repair)}. Orden: ${repair.order_number}. Total estimado: $${Number(repair.estimated_cost || 0).toFixed(2)}. Estamos esperando tu autorización.`],
  ['started', 'Reparación iniciada', ({ repair, customer }) => `Hola ${customerName(customer)}. La reparación de tu ${deviceName(repair)} ya comenzó. Orden: ${repair.order_number}.`],
  ['part', 'Esperando pieza', ({ repair, customer }) => `Hola ${customerName(customer)}. Tu equipo ${deviceName(repair)} está esperando una refacción. Te avisaremos cuando podamos continuar.`],
  ['ready', 'Listo para entregar', ({ repair, customer }) => `Hola ${customerName(customer)}. Buenas noticias: tu ${deviceName(repair)} ya está listo para entregar. Orden: ${repair.order_number}. Total: $${Number(repair.estimated_cost || 0).toFixed(2)}.`],
  ['payment', 'Pago pendiente', ({ repair, customer }) => `Hola ${customerName(customer)}. La reparación ${repair.order_number} tiene un saldo pendiente de $${Math.max(0, Number(repair.estimated_cost || 0) - Number(repair.deposit || 0)).toFixed(2)}.`],
]

function customerName(customer) { return [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'cliente' }
function deviceName(repair) { return [repair?.brand || repair?.device?.brand, repair?.model || repair?.device?.model].filter(Boolean).join(' ') || 'tu equipo' }

export default function WhatsAppComposer({ repair = null, customer, onSent }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('received')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const context = useMemo(() => ({ repair: repair || {}, customer }), [repair, customer])
  const optIn = Boolean(customer?.whatsapp_opt_in)
  const phone = customer?.whatsapp_e164 || customer?.whatsapp || customer?.phone || ''

  function openComposer() {
    setError('')
    setNotice('')
    const quick = QUICK_MESSAGES.find(([key]) => key === selected)
    setMessage(quick ? quick[2](context) : '')
    setOpen(true)
  }

  function chooseQuick(key) {
    setSelected(key)
    const quick = QUICK_MESSAGES.find(([item]) => item === key)
    setMessage(quick ? quick[2](context) : '')
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post('/whatsapp/messages', { customer_id: customer.id, repair_order_id: repair?.id, message })
      setNotice(response.simulated ? 'Mensaje simulado registrado.' : 'Mensaje enviado correctamente.')
      onSent?.(response.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <button type="button" className={repairSecondaryClass} onClick={openComposer} disabled={!customer}><MessageCircle size={16} /> WhatsApp</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--tf-surface-sunken)] p-4" role="dialog" aria-modal="true" aria-labelledby="whatsapp-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--tf-radius-dialog)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-5">
        <div className="flex items-start justify-between gap-4"><div><h2 id="whatsapp-title" className="flex items-center gap-2 text-lg font-semibold text-[var(--tf-text)]"><MessageCircle className="text-[#86efac]" size={20} />Enviar WhatsApp</h2><p className="mt-1 text-sm text-[var(--tf-text-muted)]">{customerName(customer)} · {phone || 'Sin teléfono'}</p></div><button type="button" className={repairSecondaryClass} onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16} /></button></div>
        {!optIn ? <div className="mt-5 rounded-lg border border-[rgba(251,191,36,.3)] bg-[var(--tf-warning-soft)] p-4 text-sm text-[#fcd34d]">El cliente no autorizó recibir actualizaciones por WhatsApp. Registra el consentimiento desde Clientes antes de enviar.</div> : <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="rounded-lg border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] p-3 text-sm text-[var(--tf-text-muted)]"><p><span className="text-[var(--tf-text-subtle)]">Cliente:</span> {customerName(customer)}</p><p><span className="text-[var(--tf-text-subtle)]">Número:</span> +{phone.replace(/^\+/, '')}</p>{repair && <p><span className="text-[var(--tf-text-subtle)]">Orden:</span> {repair.order_number}</p>}</div>
          <div className="flex flex-wrap gap-2">{QUICK_MESSAGES.map(([key, label]) => <button key={key} type="button" onClick={() => chooseQuick(key)} className={`rounded-lg border px-3 py-2 text-xs transition ${selected === key ? 'border-[rgba(74,222,128,.3)] bg-[var(--tf-success-soft)] text-[#86efac]' : 'border-[var(--tf-border)] text-[var(--tf-text-muted)] hover:border-[var(--tf-border)]'}`}>{label}</button>)}<button type="button" onClick={() => chooseQuick('custom')} className={`rounded-lg border px-3 py-2 text-xs transition ${selected === 'custom' ? 'border-[rgba(74,222,128,.3)] bg-[var(--tf-success-soft)] text-[#86efac]' : 'border-[var(--tf-border)] text-[var(--tf-text-muted)] hover:border-[var(--tf-border)]'}`}>Mensaje personalizado</button></div>
          <label className="block space-y-2 text-sm text-[var(--tf-text-muted)]"><span>Mensaje <span className="text-[var(--tf-text-subtle)]">({message.length}/4096)</span></span><textarea className={repairInputClass} rows={8} maxLength={4096} value={message} onChange={(event) => { setSelected('custom'); setMessage(event.target.value) }} required /></label>
          {error && <p role="alert" className="rounded-lg border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-3 text-sm text-[#fca5a5]">{error}</p>}
          {notice && <p role="status" className="flex items-center gap-2 rounded-lg border border-[rgba(74,222,128,.3)] bg-[var(--tf-success-soft)] p-3 text-sm text-[#86efac]"><CheckCircle2 size={16} />{notice}</p>}
          <div className="flex justify-end gap-3"><button type="button" className={repairSecondaryClass} onClick={() => setOpen(false)} disabled={saving}>Cerrar</button><button type="submit" className={repairButtonClass} disabled={saving || !message.trim()}>{saving ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}{saving ? 'Enviando mensaje…' : 'Enviar WhatsApp'}</button></div>
        </form>}
      </div>
    </div>}
  </>
}
