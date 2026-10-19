import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, RefreshCw, RotateCcw } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Badge, Button, Card, DataCard, EmptyState, ErrorAlert, FilterSelect, TableSkeleton } from '../components/ui/DesignSystem.jsx'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { friendlyError } from '../utils/errors.js'
import { formatDateTime } from '../utils/formatters.js'

const EVENT_LABELS = {
  recibido: 'Equipo recibido',
  diagnostico: 'Diagnóstico terminado',
  esperando_autorizacion: 'Esperando autorización',
  esperando_refaccion: 'Esperando refacción',
  en_reparacion: 'Reparación iniciada',
  en_pruebas: 'Equipo en pruebas',
  listo_para_entregar: 'Listo para entregar',
  entregado: 'Equipo entregado',
  pago_pendiente: 'Pago pendiente',
}
const STATUS = {
  pending: ['Pendiente', 'warning'], queued: ['En cola', 'neutral'], sent: ['Enviado', 'info'], delivered: ['Entregado', 'success'],
  read: ['Leído', 'success'], failed: ['No se entregó', 'danger'], simulated: ['Simulado', 'neutral'],
}
const SUMMARY = { pending: 'Pendientes', sent: 'Enviados', delivered: 'Entregados', read: 'Leídos', failed: 'No entregados' }
const MANAGE_ROLES = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN']

export default function Communications() {
  const { profile } = useAuth()
  const toast = useToast()
  const [state, setState] = useState({ key: -1, status: null, automations: [], messages: [], error: null })
  const [revision, setRevision] = useState(0)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState('')
  const loading = state.key !== revision
  const canManage = MANAGE_ROLES.includes(profile?.role)

  useEffect(() => {
    let active = true
    Promise.all([api.get('/whatsapp/status'), api.get('/whatsapp/automations'), api.get('/whatsapp/messages')])
      .then(([status, automations, messages]) => { if (active) setState({ key: revision, status: status.data, automations: automations.data ?? [], messages: messages.data ?? [], error: null }) })
      .catch((error) => { if (active) setState((current) => ({ ...current, key: revision, error })) })
    return () => { active = false }
  }, [revision])

  const reload = () => setRevision((value) => value + 1)

  async function toggleAutomation(automation) {
    setBusy(automation.id)
    try {
      const response = await api.patch(`/whatsapp/automations/${encodeURIComponent(automation.event_type)}`, { enabled: !automation.enabled })
      setState((current) => ({ ...current, automations: current.automations.map((item) => (item.id === automation.id ? response.data : item)) }))
      toast.success(`${EVENT_LABELS[automation.event_type] ?? automation.event_type}: aviso ${response.data.enabled ? 'activado' : 'desactivado'}.`)
    } catch (error) {
      toast.error(friendlyError(error, 'cambiar el aviso'))
    } finally {
      setBusy('')
    }
  }

  async function retryMessage(message) {
    setBusy(message.id)
    try {
      await api.post(`/whatsapp/messages/${encodeURIComponent(message.id)}/retry`, {})
      toast.success('Reintentamos el envío.')
      reload()
    } catch (error) {
      toast.error(friendlyError(error, 'reintentar el envío'))
    } finally {
      setBusy('')
    }
  }

  const { status, automations, messages } = state
  const visible = filter ? messages.filter((message) => message.status === filter) : messages
  const counts = Object.fromEntries(Object.keys(SUMMARY).map((key) => [key, messages.filter((message) => message.status === key).length]))
  const connection = status?.simulate ? ['info', 'Modo de prueba: los mensajes se registran pero no salen a WhatsApp.']
    : status?.configured ? ['success', 'WhatsApp Business está conectado y enviando mensajes.']
      : ['warning', 'WhatsApp Business aún no está conectado. Los avisos no se enviarán hasta configurarlo en el servidor.']

  return (
    <div className="space-y-6">
      <PageHeader title="Comunicaciones" description="Avisos automáticos por WhatsApp y el estado de cada mensaje enviado."
        actions={<Button icon={RefreshCw} busy={loading} onClick={reload}>Actualizar</Button>} />
      {state.error && <ErrorAlert error={state.error} action="cargar las comunicaciones" onRetry={reload} />}
      {status && <Alert tone={connection[0]}>{connection[1]}</Alert>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(SUMMARY).map(([key, label]) => (
          <article key={key} className="ct-kpi">
            <p className="ct-kpi-label">{label}</p>
            <p className="ct-kpi-value">{loading ? '—' : counts[key]}</p>
          </article>
        ))}
      </div>

      <Card title="Avisos automáticos" description="Se envían solos cuando una orden cambia a ese estado, si el cliente los autorizó.">
        {loading && !automations.length ? <TableSkeleton rows={3} columns={2} />
          : !automations.length ? <p className="text-sm text-[var(--tf-text-subtle)]">No hay avisos configurados para este taller.</p>
            : <ul className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              {automations.map((automation) => (
                <li key={automation.id}>
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-b border-[var(--tf-border)] py-2 text-sm text-[var(--tf-text)]">
                    <span>{EVENT_LABELS[automation.event_type] || automation.event_type}</span>
                    <input type="checkbox" role="switch" aria-checked={automation.enabled} checked={automation.enabled} onChange={() => toggleAutomation(automation)} disabled={!canManage || busy === automation.id} className="tf-switch" />
                  </label>
                </li>
              ))}
            </ul>}
        {!canManage && <p className="mt-4 text-xs text-[var(--tf-text-subtle)]">Solo el dueño, administración o recepción pueden cambiar estos avisos.</p>}
      </Card>

      <DataCard toolbar={<>
        <FilterSelect label="Estado del mensaje" ariaLabel="Filtrar mensajes por estado" value={filter} onChange={setFilter}>
          <option value="">Todos</option>
          {Object.entries(STATUS).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}
        </FilterSelect>
        {filter && <Button variant="ghost" onClick={() => setFilter('')}>Quitar filtro</Button>}
        <span className="tf-toolbar-meta tf-num">{visible.length} mensajes</span>
      </>}>
        {loading && !messages.length ? <TableSkeleton rows={5} columns={4} />
          : !visible.length ? (filter
            ? <EmptyState icon={MessageCircle} title="No hay mensajes con ese estado" description="Elige otro estado para ver más mensajes." action={<Button onClick={() => setFilter('')}>Quitar filtro</Button>} />
            : <EmptyState icon={MessageCircle} title="Aún no se envían mensajes" description="Los avisos de las órdenes y los mensajes que envíes desde una reparación aparecerán aquí."
              action={<Link to="/reparaciones" className="ct-btn ct-btn-secondary">Ver reparaciones</Link>} />)
            : <div className="ct-table-shell"><table className="ct-table min-w-[48rem]">
              <thead><tr><th scope="col">Cliente</th><th scope="col">Mensaje</th><th scope="col">Estado</th><th scope="col">Fecha</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>{visible.map((message) => {
                const [label, tone] = STATUS[message.status] ?? [message.status, 'neutral']
                return (
                  <tr key={message.id}>
                    <td><p className="font-medium text-[var(--tf-text)]">{message.customer ? `${message.customer.first_name} ${message.customer.last_name}` : message.phone}</p>
                      {message.repair?.order_number ? <Link to={`/reparaciones/${encodeURIComponent(message.repair.order_number)}`} className="tf-link tf-num text-xs">{message.repair.order_number}</Link> : <p className="text-xs text-[var(--tf-text-subtle)]">Sin orden</p>}</td>
                    <td className="max-w-[24rem]"><p className="line-clamp-2">{message.message}</p></td>
                    <td><Badge tone={tone}>{label}</Badge></td>
                    <td className="whitespace-nowrap">{formatDateTime(message.created_at)}</td>
                    <td className="text-right">{message.status === 'failed' && message.retry_count < 3 && canManage && <Button size="sm" icon={RotateCcw} busy={busy === message.id} onClick={() => retryMessage(message)}>Reintentar envío</Button>}</td>
                  </tr>
                )
              })}</tbody>
            </table></div>}
      </DataCard>
    </div>
  )
}
