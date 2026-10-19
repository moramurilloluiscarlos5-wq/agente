import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Pencil, Send } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { REPAIR_STATUSES } from '../utils/constants.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters.js'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import WhatsAppComposer from '../components/whatsapp/WhatsAppComposer.jsx'
import RepairFields from '../components/repairs/RepairFields.jsx'
import RepairTrackingPanel from '../components/tracking/RepairTrackingPanel.jsx'
import { Alert, Badge, Button, Card, EmptyState, ErrorAlert, Select, Skeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { customerName, deviceName, repairFormPayload, repairFormValues } from '../components/repairs/repairForm.js'

const MANAGE_ROLES = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN']
// Camino normal de una orden. "Esperando autorización/refacción" y "En pruebas" se agrupan en su etapa.
const STAGES = [
  { label: 'Recibido', statuses: ['recibido'] },
  { label: 'Diagnóstico', statuses: ['diagnostico', 'esperando_autorizacion'] },
  { label: 'Reparación', statuses: ['en_reparacion', 'esperando_refaccion', 'en_pruebas'] },
  { label: 'Listo', statuses: ['listo_para_entregar'] },
  { label: 'Entregado', statuses: ['entregado'] },
]
const WHATSAPP_STATUS = { queued: ['En cola', 'neutral'], sent: ['Enviado', 'info'], delivered: ['Entregado', 'success'], read: ['Leído', 'success'], failed: ['No se entregó', 'danger'], simulated: ['Simulado', 'neutral'] }

function useRepair(orderNumber) {
  const endpoint = `/repairs/${encodeURIComponent(orderNumber)}`
  const [result, setResult] = useState({ key: null, data: null, history: [], error: null })
  const [revision, setRevision] = useState(0)
  const key = `${endpoint}#${revision}`
  useEffect(() => {
    let active = true
    api.get(endpoint).then((response) => { if (active) setResult({ key, data: response.data, history: response.history ?? [], error: null }) })
      .catch((error) => { if (active) setResult({ key, data: null, history: [], error }) })
    return () => { active = false }
  }, [endpoint, key])
  return { endpoint, ...result, loading: result.key !== key, reload: () => setRevision((value) => value + 1), patch: (data) => setResult((current) => ({ ...current, data: { ...current.data, ...data } })) }
}

function useTechnicians(enabled) {
  const [state, setState] = useState({ list: [], error: '' })
  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    api.get('/technicians').then((response) => { if (active) setState({ list: response.data ?? [], error: '' }) })
      .catch(() => { if (active) setState({ list: [], error: 'No pudimos cargar la lista de responsables. Intenta de nuevo más tarde.' }) })
    return () => { active = false }
  }, [enabled])
  return state
}

function Fact({ label, children, wide = false }) {
  return <div className={wide ? 'sm:col-span-2' : ''}><dt className="text-xs text-[var(--tf-text-subtle)]">{label}</dt><dd className={`mt-1 whitespace-pre-wrap break-words text-sm ${children ? 'text-[var(--tf-text)]' : 'text-[var(--tf-text-subtle)]'}`}>{children || 'Sin registrar'}</dd></div>
}

function StatusProgress({ status }) {
  if (status === 'cancelado') return <Alert tone="warning" title="Orden cancelada">Esta orden ya no avanza. Su historial se conserva abajo.</Alert>
  const current = STAGES.findIndex((stage) => stage.statuses.includes(status))
  return (
    <ol className="tf-progress" aria-label="Avance de la orden">
      {STAGES.map((stage, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'next'
        return (
          <li key={stage.label} className={`tf-progress-step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="tf-progress-dot" aria-hidden="true">{state === 'done' ? <Check size={12} strokeWidth={3} /> : null}</span>
            <span className="tf-progress-label">{stage.label}</span>
            {state === 'current' && stage.statuses.length > 1 && <span className="tf-progress-sub">{REPAIR_STATUSES[status]?.label}</span>}
          </li>
        )
      })}
    </ol>
  )
}

function StatusUpdate({ repair, endpoint, onSaved }) {
  const toast = useToast()
  const [nextStatus, setNextStatus] = useState(repair.status)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [requestError, setRequestError] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  async function submit(event) {
    event.preventDefault()
    if (savingRef.current) return
    if (nextStatus === repair.status && !note.trim()) { setError('Elige otro estado o escribe una nota para registrar el avance.'); focusFirstInvalid('status-form'); return }
    savingRef.current = true
    setSaving(true); setRequestError(null)
    try {
      await api.post(`${endpoint}/history`, { status: nextStatus, note: note.trim() || null })
      toast.success(nextStatus !== repair.status ? `Orden en ${REPAIR_STATUSES[nextStatus]?.label ?? nextStatus}.` : 'Nota agregada a la bitácora.')
      setNote('')
      onSaved()
    } catch (err) {
      setRequestError(err)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <form id="status-form" onSubmit={submit} noValidate className="space-y-4 border-b border-[var(--tf-border)] p-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Select label="Estado" value={nextStatus} onChange={(event) => { setNextStatus(event.target.value); setError('') }}>
          {Object.entries(REPAIR_STATUSES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
        </Select>
        <Textarea label="Nota (opcional)" rows={2} maxLength={10000} value={note} error={error} onChange={(event) => { setNote(event.target.value); setError('') }}
          placeholder="Cambié el puerto de carga y probé con dos cargadores." className="min-h-[2.5rem]" />
      </div>
      {requestError && <ErrorAlert error={requestError} action="registrar el avance" />}
      <div className="flex justify-end"><Button variant="primary" type="submit" icon={Send} busy={saving}>{saving ? 'Registrando…' : 'Registrar avance'}</Button></div>
    </form>
  )
}

function RepairDetailContent({ orderNumber }) {
  const { profile, user } = useAuth()
  const repairState = useRepair(orderNumber)
  const { data: repair, history, loading, error, endpoint, reload } = repairState
  const [messages, setMessages] = useState({ key: null, list: [] })
  const canManage = MANAGE_ROLES.includes(profile?.role)
  const canEdit = canManage || (profile?.role === 'TECNICO' && repair?.technician_id === (profile?.id ?? user?.id))

  useEffect(() => {
    if (!repair?.id) return undefined
    let active = true
    api.get(`/whatsapp/messages?repair_order_id=${encodeURIComponent(repair.id)}`)
      .then((response) => { if (active) setMessages({ key: repair.id, list: response.data ?? [] }) })
      .catch(() => { if (active) setMessages({ key: repair.id, list: [] }) })
    return () => { active = false }
  }, [repair?.id, history.length])

  const back = <Link className="tf-form-page-back" to="/reparaciones"><ArrowLeft size={16} aria-hidden="true" />Reparaciones</Link>
  if (loading && !repair) return (
    <div className="space-y-6" role="status" aria-label="Cargando orden">
      {back}<Skeleton className="h-8 w-56" /><Skeleton className="h-12 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"><div className="tf-card space-y-4 p-6">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-4 w-full" />)}</div><div className="tf-card space-y-4 p-6">{[0, 1].map((key) => <Skeleton key={key} className="h-4 w-full" />)}</div></div>
    </div>
  )
  if (error || !repair) return <div className="space-y-4">{back}<ErrorAlert error={error ?? { status: 404 }} action="cargar la orden" onRetry={reload} /></div>

  const messageList = messages.key === repair.id ? messages.list : []
  const balance = Math.max(0, Number(repair.estimated_cost || 0) - Number(repair.deposit || 0))

  return (
    <div className="space-y-6">
      <div>
        {back}
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3"><h1 className="ct-page-title tf-num">{repair.order_number}</h1><StatusBadge status={repair.status} /></div>
            <p className="ct-page-description">{deviceName(repair.device ?? repair)} de {customerName(repair.customer)}. Recibido el {formatDate(repair.received_at)}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <WhatsAppComposer repair={repair} customer={repair.customer} onSent={(message) => setMessages((current) => ({ key: repair.id, list: [message, ...(current.key === repair.id ? current.list : [])] }))} />
            {canEdit && <Link to={`/reparaciones/${encodeURIComponent(repair.order_number)}/editar`} className="ct-btn ct-btn-secondary"><Pencil size={16} aria-hidden="true" />{canManage ? 'Editar orden' : 'Editar diagnóstico'}</Link>}
          </div>
        </div>
      </div>

      <section className="tf-card px-6 py-4"><StatusProgress status={repair.status} /></section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card title="Recepción y diagnóstico">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Fact label="Problema reportado" wide>{repair.reported_problem}</Fact>
              <Fact label="Síntomas">{repair.symptoms}</Fact>
              <Fact label="Estado físico">{repair.physical_condition}</Fact>
              <Fact label="Accesorios recibidos">{repair.accessories_received}</Fact>
              <Fact label="Golpes o líquido">{[repair.is_water_damaged ? 'Daño por líquido' : null, repair.is_dropped ? 'Golpes o caída' : null].filter(Boolean).join(' y ') || 'Ninguno reportado'}</Fact>
              <div className="sm:col-span-2">
                <dt className="text-xs text-[var(--tf-text-subtle)]">Revisión al recibir</dt>
                <dd className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {Object.entries({ powers_on: 'Enciende', charges: 'Carga', displays_image: 'Muestra imagen', touch_works: 'Táctil' }).map(([key, label]) => (
                    <span key={key} className="text-[var(--tf-text-muted)]">{label}: <span className={repair[key] == null ? 'text-[var(--tf-text-subtle)]' : repair[key] ? 'text-[var(--tf-success)]' : 'text-[var(--tf-danger)]'}>{repair[key] == null ? 'sin revisar' : repair[key] ? 'sí' : 'no'}</span></span>
                  ))}
                </dd>
              </div>
              <Fact label="Diagnóstico inicial" wide>{repair.initial_diagnosis}</Fact>
              <Fact label="Notas internas" wide>{repair.internal_notes}</Fact>
            </dl>
          </Card>

          <Card title="Bitácora" description="Cada cambio de estado y nota, en orden." bodyClassName={null}>
            {canEdit && <StatusUpdate key={repair.status} repair={repair} endpoint={endpoint} onSaved={reload} />}
            {!history.length ? <EmptyState title="Sin movimientos todavía" description="Registra el primer avance cuando empieces a revisar el equipo." className="!py-8" />
              : <ol className="tf-timeline p-6">{history.map((entry) => (
                <li key={entry.id} className="tf-timeline-item">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={entry.status} /><time className="text-xs text-[var(--tf-text-subtle)]" dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></div>
                  {entry.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--tf-text-muted)]">{entry.note}</p>}
                  <p className="mt-1 text-xs text-[var(--tf-text-subtle)]">{entry.user?.full_name || 'Usuario no disponible'}</p>
                </li>))}</ol>}
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card title="Cobro">
            <dl className="space-y-4">
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Costo estimado</dt><dd className="tf-num mt-1 text-2xl font-semibold tracking-tight text-[var(--tf-text)]">{formatCurrency(repair.estimated_cost)}</dd></div>
              <div className="grid grid-cols-2 gap-4">
                <div><dt className="text-xs text-[var(--tf-text-subtle)]">Anticipo</dt><dd className="tf-num mt-1 text-sm text-[var(--tf-text)]">{formatCurrency(repair.deposit)}</dd></div>
                <div><dt className="text-xs text-[var(--tf-text-subtle)]">Saldo</dt><dd className={`tf-num mt-1 text-sm ${balance > 0 ? 'text-[var(--tf-warning)]' : 'text-[var(--tf-text)]'}`}>{formatCurrency(balance)}</dd></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><dt className="text-xs text-[var(--tf-text-subtle)]">Entrega estimada</dt><dd className="mt-1 text-sm text-[var(--tf-text)]">{repair.estimated_delivery_at ? formatDateTime(repair.estimated_delivery_at) : <span className="text-[var(--tf-text-subtle)]">Sin fecha</span>}</dd></div>
                <div><dt className="text-xs text-[var(--tf-text-subtle)]">Responsable</dt><dd className="mt-1 text-sm text-[var(--tf-text)]">{repair.technician?.full_name || <span className="text-[var(--tf-text-subtle)]">Sin asignar</span>}</dd></div>
              </div>
            </dl>
          </Card>

          <Card title="Cliente y equipo">
            <dl className="space-y-4">
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Cliente</dt><dd className="mt-1"><Link to={`/clientes/${encodeURIComponent(repair.customer_id)}`} className="tf-link text-sm font-medium">{customerName(repair.customer)}</Link><span className="tf-num block text-sm text-[var(--tf-text-muted)]">{repair.customer?.phone || 'Sin teléfono'}</span></dd></div>
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Equipo</dt><dd className="mt-1">{repair.device_id ? <Link to={`/dispositivos/${encodeURIComponent(repair.device_id)}`} className="tf-link text-sm font-medium">{deviceName(repair.device ?? repair)}</Link> : <span className="text-sm text-[var(--tf-text)]">{deviceName(repair)}</span>}
                <span className="tf-num block break-all text-sm text-[var(--tf-text-muted)]">{repair.device?.imei ? `IMEI ${repair.device.imei}` : repair.device?.serial_number ? `Serie ${repair.device.serial_number}` : 'Sin IMEI ni serie'}</span></dd></div>
            </dl>
          </Card>

          <RepairTrackingPanel orderNumber={repair.order_number} />

          <Card title="Mensajes de WhatsApp" bodyClassName={null}>
            {!messageList.length ? <p className="p-6 text-sm text-[var(--tf-text-subtle)]">Aún no hay mensajes de esta orden.</p>
              : <ul className="tf-list">{messageList.map((message) => {
                const [label, tone] = WHATSAPP_STATUS[message.status] ?? ['Pendiente', 'neutral']
                return (
                  <li key={message.id} className="space-y-2 px-6 py-4">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs text-[var(--tf-text-subtle)]">{formatDateTime(message.created_at)}</span><Badge tone={tone}>{label}</Badge></div>
                    <p className="whitespace-pre-wrap text-sm text-[var(--tf-text-muted)]">{message.message}</p>
                    {message.error_message && <p className="text-xs text-[var(--tf-danger)]">No se entregó: {message.error_message}</p>}
                  </li>
                )
              })}</ul>}
          </Card>
        </aside>
      </div>
    </div>
  )
}

export default function RepairDetail() {
  const { orderNumber } = useParams()
  return <RepairDetailContent key={orderNumber} orderNumber={orderNumber} />
}

/* ---------- Edición (página propia) ---------- */
function RepairEditForm({ repair, endpoint, canManage }) {
  const navigate = useNavigate()
  const toast = useToast()
  const technicians = useTechnicians(canManage)
  const [form, setForm] = useState(() => repairFormValues(repair))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [requestError, setRequestError] = useState(null)
  const detailPath = `/reparaciones/${encodeURIComponent(repair.order_number)}`

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (canManage && !form.reported_problem.trim()) next.reported_problem = 'Describe el problema que reporta el cliente.'
    if (canManage && !form.received_at) next.received_at = 'Indica la fecha y hora de recepción.'
    if (canManage) for (const key of ['estimated_cost', 'deposit']) if (!(Number(form[key]) >= 0)) next[key] = 'Escribe un importe en pesos, por ejemplo 950.'
    if (Object.keys(next).length) { setErrors(next); focusFirstInvalid('repair-edit-form'); return }
    setSaving(true); setRequestError(null)
    try {
      await api.patch(endpoint, repairFormPayload(form, !canManage))
      toast.success('Cambios guardados.')
      navigate(detailPath)
    } catch (error) {
      setRequestError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link to={detailPath} className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />{repair.order_number}</Link>
        <h1 className="ct-page-title mt-2">{canManage ? 'Editar orden' : 'Editar diagnóstico'}</h1>
        <p className="ct-page-description">Para cambiar el estado usa la bitácora de la orden; así queda registro.</p>
      </div>
      <form id="repair-edit-form" onSubmit={submit} noValidate className="space-y-6">
        <RepairFields form={form} setForm={setForm} technicians={technicians.list} technicianError={technicians.error} technicalOnly={!canManage} disabled={saving} errors={errors}
          onFieldChange={(key) => setErrors((current) => (current[key] ? { ...current, [key]: null } : current))} />
        {requestError && <ErrorAlert error={requestError} action="guardar los cambios" />}
        <div className="tf-form-page-actions !m-0 rounded-[var(--tf-radius-card)] border border-[var(--tf-border)]">
          <Link to={detailPath} className="ct-btn ct-btn-secondary">Cancelar</Link>
          <Button variant="primary" type="submit" busy={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button>
        </div>
      </form>
    </div>
  )
}

export function RepairEditPage() {
  const { orderNumber } = useParams()
  const { profile, user } = useAuth()
  const { data: repair, loading, error, endpoint, reload } = useRepair(orderNumber)
  const canManage = MANAGE_ROLES.includes(profile?.role)
  const canEdit = canManage || (profile?.role === 'TECNICO' && repair?.technician_id === (profile?.id ?? user?.id))
  if (loading && !repair) return <div className="mx-auto max-w-5xl"><Alert tone="info">Cargando la orden…</Alert></div>
  if (error || !repair) return <div className="mx-auto max-w-5xl space-y-4"><Link to="/reparaciones" className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />Reparaciones</Link><ErrorAlert error={error ?? { status: 404 }} action="cargar la orden" onRetry={reload} /></div>
  if (!canEdit) return <div className="mx-auto max-w-5xl"><Alert tone="warning" action={<Link to={`/reparaciones/${encodeURIComponent(orderNumber)}`} className="ct-btn ct-btn-secondary ct-btn-sm">Ver la orden</Link>}>Solo el responsable asignado o el mostrador pueden editar esta orden.</Alert></div>
  return <RepairEditForm key={repair.id} repair={repair} endpoint={endpoint} canManage={canManage} />
}

