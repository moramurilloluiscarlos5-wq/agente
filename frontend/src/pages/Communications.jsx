import { useEffect, useState } from 'react'
import { AlertCircle, CheckCheck, CheckCircle2, Clock3, MessageCircle, RefreshCw, Settings2 } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatDateTime } from '../utils/formatters.js'

const EVENT_LABELS = {
  recibido: 'Avisar cuando se recibe el equipo',
  diagnostico: 'Avisar cuando termina el diagnóstico',
  esperando_autorizacion: 'Avisar cuando espera autorización',
  esperando_refaccion: 'Avisar cuando espera refacción',
  en_reparacion: 'Avisar cuando inicia la reparación',
  en_pruebas: 'Avisar cuando está en pruebas',
  listo_para_entregar: 'Avisar cuando está listo',
  entregado: 'Avisar cuando se entrega',
  pago_pendiente: 'Avisar sobre pagos pendientes',
}

const STATUS_META = {
  pending: ['Pendientes', Clock3, 'text-[#fcd34d]'],
  sent: ['Enviados', CheckCircle2, 'text-[var(--tf-link)]'],
  delivered: ['Entregados', CheckCheck, 'text-[#86efac]'],
  read: ['Leídos', CheckCheck, 'text-[var(--tf-link)]'],
  failed: ['Fallidos', AlertCircle, 'text-[#fca5a5]'],
}

export default function Communications() {
  const { profile } = useAuth()
  const [status, setStatus] = useState(null)
  const [automations, setAutomations] = useState([])
  const [messages, setMessages] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canManage = ['OWNER', 'ADMINISTRADOR', 'RECEPCION'].includes(profile?.role)

  async function load() {
    try {
      const [statusResponse, automationResponse, messageResponse] = await Promise.all([
        api.get('/whatsapp/status'),
        api.get('/whatsapp/automations'),
        api.get('/whatsapp/messages'),
      ])
      setStatus(statusResponse.data)
      setAutomations(automationResponse.data ?? [])
      setMessages(messageResponse.data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // The initial loading state is already set; load updates it after the API responds.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { load() }, [])

  async function toggleAutomation(automation) {
    try {
      const response = await api.patch(`/whatsapp/automations/${encodeURIComponent(automation.event_type)}`, { enabled: !automation.enabled })
      setAutomations((current) => current.map((item) => item.id === automation.id ? response.data : item))
    } catch (err) {
      setError(err.message)
    }
  }

  async function retryMessage(message) {
    setLoading(true)
    setError('')
    try {
      await api.post(`/whatsapp/messages/${encodeURIComponent(message.id)}/retry`, {})
      await load()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const visibleMessages = filter === 'all' ? messages : messages.filter((message) => message.status === filter)
  const counts = Object.fromEntries(Object.keys(STATUS_META).map((key) => [key, messages.filter((message) => message.status === key).length]))

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><MessageCircle className="text-[#86efac]" /> Comunicaciones</h1><p className="mt-1 text-sm text-[var(--tf-text-muted)]">Mensajes de WhatsApp, estados de entrega y automatizaciones de reparaciones.</p></div><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[var(--tf-border)] px-3 py-2 text-sm text-[var(--tf-text-muted)]" onClick={() => { setLoading(true); setError(''); load() }} disabled={loading}><RefreshCw size={15} /> Actualizar</button></header>
    {error && <p role="alert" className="rounded-lg border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-4 text-sm text-[#fca5a5]">{error}</p>}
    {status && <div className={`rounded-lg border p-4 text-sm ${status.configured || status.simulate ? 'border-[rgba(74,222,128,.3)] bg-[var(--tf-success-soft)] text-[#86efac]' : 'border-[rgba(251,191,36,.3)] bg-[var(--tf-warning-soft)] text-[#fcd34d]'}`}>{status.simulate ? 'Modo simulado activado explícitamente.' : status.configured ? 'WhatsApp Business Cloud API configurado.' : 'Integración de WhatsApp no configurada.'}</div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{Object.entries(STATUS_META).map(([key, [label, Icon, color]]) => <button key={key} type="button" onClick={() => setFilter(filter === key ? 'all' : key)} className={`rounded-[var(--tf-radius-card)] border p-4 text-left transition ${filter === key ? 'border-[var(--tf-accent)] bg-[var(--tf-accent-soft)]' : 'border-[var(--tf-border)] bg-[var(--tf-surface)] hover:border-[var(--tf-border)]'}`}><Icon size={18} className={color} /><p className="mt-3 text-2xl font-semibold text-[var(--tf-text)]">{counts[key] ?? 0}</p><p className="text-xs text-[var(--tf-text-muted)]">{label}</p></button>)}</div>
    <section className="rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Settings2 size={17} className="text-[var(--tf-link)]" /> Automatizaciones</h2><div className="grid gap-2 md:grid-cols-2">{automations.map((automation) => <label key={automation.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] px-3 py-3 text-sm text-[var(--tf-text-muted)]"><span>{EVENT_LABELS[automation.event_type] || automation.event_type}</span><input type="checkbox" checked={automation.enabled} onChange={() => toggleAutomation(automation)} disabled={!canManage || loading} className="h-4 w-4 accent-[var(--tf-primary)]" /></label>)}</div>{!canManage && <p className="mt-3 text-xs text-[var(--tf-text-subtle)]">Solo administración y recepción pueden cambiar automatizaciones.</p>}</section>
    <section className="rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-5"><h2 className="mb-4 font-semibold">Historial de mensajes</h2>{loading ? <p className="text-sm text-[var(--tf-text-muted)]">Cargando mensajes…</p> : visibleMessages.length === 0 ? <p className="text-sm text-[var(--tf-text-subtle)]">No hay mensajes para este filtro.</p> : <div className="space-y-2">{visibleMessages.map((message) => <article key={message.id} className="grid gap-2 rounded-lg border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] p-3 md:grid-cols-[180px_1fr_auto] md:items-center"><div><p className="text-sm font-medium text-[var(--tf-text)]">{message.customer ? `${message.customer.first_name} ${message.customer.last_name}` : message.phone}</p><p className="text-xs text-[var(--tf-text-subtle)]">{message.repair?.order_number || 'Sin orden'} · {formatDateTime(message.created_at)}</p></div><p className="line-clamp-2 text-sm text-[var(--tf-text-muted)]">{message.message}</p><div className="flex items-center gap-3"><span className={`text-xs font-medium ${STATUS_META[message.status]?.[2] || 'text-[var(--tf-text-muted)]'}`}>{message.status}</span>{message.status === 'failed' && message.retry_count < 3 && <button type="button" onClick={() => retryMessage(message)} className="text-xs text-[var(--tf-link)] hover:underline">Reintentar</button>}</div></article>)}</div>}</section>
  </div>
}
