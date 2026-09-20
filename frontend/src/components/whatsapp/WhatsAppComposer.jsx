import { useMemo, useState } from 'react'
import { CheckCircle2, LoaderCircle, MessageCircle, Send, X } from 'lucide-react'
import { api } from '../../services/api.js'
import { repairButtonClass, repairInputClass, repairSecondaryClass } from '../repairs/repairForm.js'

const QUICK_MESSAGES = [
  ['received', 'Equipo recibido', ({ repair, customer }) => `Hola ${customerName(customer)}. Tu equipo ${deviceName(repair)} fue recibido correctamente en CARLOSTECH. Orden: ${repair.order_number}. Te mantendremos informado sobre el avance de tu reparación.`],
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
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-labelledby="whatsapp-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="whatsapp-title" className="flex items-center gap-2 text-lg font-semibold text-white"><MessageCircle className="text-emerald-400" size={20} />Enviar WhatsApp</h2><p className="mt-1 text-sm text-slate-400">{customerName(customer)} · {phone || 'Sin teléfono'}</p></div><button type="button" className={repairSecondaryClass} onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16} /></button></div>
        {!optIn ? <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">El cliente no autorizó recibir actualizaciones por WhatsApp. Registra el consentimiento desde Clientes antes de enviar.</div> : <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300"><p><span className="text-slate-500">Cliente:</span> {customerName(customer)}</p><p><span className="text-slate-500">Número:</span> +{phone.replace(/^\+/, '')}</p>{repair && <p><span className="text-slate-500">Orden:</span> {repair.order_number}</p>}</div>
          <div className="flex flex-wrap gap-2">{QUICK_MESSAGES.map(([key, label]) => <button key={key} type="button" onClick={() => chooseQuick(key)} className={`rounded-lg border px-3 py-2 text-xs transition ${selected === key ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>{label}</button>)}<button type="button" onClick={() => chooseQuick('custom')} className={`rounded-lg border px-3 py-2 text-xs transition ${selected === 'custom' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>Mensaje personalizado</button></div>
          <label className="block space-y-2 text-sm text-slate-300"><span>Mensaje <span className="text-slate-500">({message.length}/4096)</span></span><textarea className={repairInputClass} rows={8} maxLength={4096} value={message} onChange={(event) => { setSelected('custom'); setMessage(event.target.value) }} required /></label>
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
          {notice && <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"><CheckCircle2 size={16} />{notice}</p>}
          <div className="flex justify-end gap-3"><button type="button" className={repairSecondaryClass} onClick={() => setOpen(false)} disabled={saving}>Cerrar</button><button type="submit" className={repairButtonClass} disabled={saving || !message.trim()}>{saving ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}{saving ? 'Enviando mensaje…' : 'Enviar WhatsApp'}</button></div>
        </form>}
      </div>
    </div>}
  </>
}
