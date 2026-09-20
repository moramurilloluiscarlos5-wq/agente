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
  pending: ['Pendientes', Clock3, 'text-amber-300'],
  sent: ['Enviados', CheckCircle2, 'text-cyan-300'],
  delivered: ['Entregados', CheckCheck, 'text-emerald-300'],
  read: ['Leídos', CheckCheck, 'text-blue-300'],
  failed: ['Fallidos', AlertCircle, 'text-red-300'],
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
    setLoading(true)
    setError('')
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
    try {
      await api.post(`/whatsapp/messages/${encodeURIComponent(message.id)}/retry`, {})
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const visibleMessages = filter === 'all' ? messages : messages.filter((message) => message.status === filter)
  const counts = Object.fromEntries(Object.keys(STATUS_META).map((key) => [key, messages.filter((message) => message.status === key).length]))

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><MessageCircle className="text-emerald-400" /> Comunicaciones</h1><p className="mt-1 text-sm text-slate-400">Mensajes de WhatsApp, estados de entrega y automatizaciones de reparaciones.</p></div><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" onClick={load} disabled={loading}><RefreshCw size={15} /> Actualizar</button></header>
    {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}
    {status && <div className={`rounded-lg border p-4 text-sm ${status.configured || status.simulate ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>{status.simulate ? 'Modo simulado activado explícitamente.' : status.configured ? 'WhatsApp Business Cloud API configurado.' : 'Integración de WhatsApp no configurada.'}</div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{Object.entries(STATUS_META).map(([key, [label, Icon, color]]) => <button key={key} type="button" onClick={() => setFilter(filter === key ? 'all' : key)} className={`rounded-xl border p-4 text-left transition ${filter === key ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'}`}><Icon size={18} className={color} /><p className="mt-3 text-2xl font-semibold text-white">{counts[key] ?? 0}</p><p className="text-xs text-slate-400">{label}</p></button>)}</div>
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Settings2 size={17} className="text-cyan-300" /> Automatizaciones</h2><div className="grid gap-2 md:grid-cols-2">{automations.map((automation) => <label key={automation.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-sm text-slate-300"><span>{EVENT_LABELS[automation.event_type] || automation.event_type}</span><input type="checkbox" checked={automation.enabled} onChange={() => toggleAutomation(automation)} disabled={!canManage || loading} className="h-4 w-4 accent-cyan-500" /></label>)}</div>{!canManage && <p className="mt-3 text-xs text-slate-500">Solo administración y recepción pueden cambiar automatizaciones.</p>}</section>
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"><h2 className="mb-4 font-semibold">Historial de mensajes</h2>{loading ? <p className="text-sm text-slate-400">Cargando mensajes…</p> : visibleMessages.length === 0 ? <p className="text-sm text-slate-500">No hay mensajes para este filtro.</p> : <div className="space-y-2">{visibleMessages.map((message) => <article key={message.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3 md:grid-cols-[180px_1fr_auto] md:items-center"><div><p className="text-sm font-medium text-slate-100">{message.customer ? `${message.customer.first_name} ${message.customer.last_name}` : message.phone}</p><p className="text-xs text-slate-500">{message.repair?.order_number || 'Sin orden'} · {formatDateTime(message.created_at)}</p></div><p className="line-clamp-2 text-sm text-slate-300">{message.message}</p><div className="flex items-center gap-3"><span className={`text-xs font-medium ${STATUS_META[message.status]?.[2] || 'text-slate-400'}`}>{message.status}</span>{message.status === 'failed' && message.retry_count < 3 && <button type="button" onClick={() => retryMessage(message)} className="text-xs text-cyan-300 hover:underline">Reintentar</button>}</div></article>)}</div>}</section>
  </div>
}
