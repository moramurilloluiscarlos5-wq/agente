import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ArrowLeft, Pencil, Plus, Smartphone, Wrench } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import RecordPicker from '../components/ui/RecordPicker.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { Alert, Button, Card, ConfirmDialog, DataCard, DraftNotice, EmptyState, ErrorAlert, FormPage, IconButton, Input, Pagination, SearchField, Skeleton, TableSkeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { useDirectoryRecords } from '../hooks/useDirectoryRecords.js'
import { useDraft } from '../hooks/useDraft.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'
import { friendlyError } from '../utils/errors.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { formatDate } from '../utils/formatters.js'

const FIELDS = ['brand', 'model', 'color', 'imei', 'serial_number', 'os', 'physical_condition', 'accessories_received', 'notes']
const EDIT_ROLES = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN']
const ADMIN_ROLES = ['OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN']
const deviceName = (device) => [device?.brand, device?.model].filter(Boolean).join(' ') || 'Equipo'
const customerLabel = (customer) => [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Cliente'

/* ---------- Formulario (página) ---------- */
function DeviceForm({ initial, presetCustomer }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toRepair = params.get('volver') === 'reparacion'
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const start = {
    customer: initial?.customer ? { id: initial.customer_id, ...initial.customer } : presetCustomer ?? null,
    ...Object.fromEntries(FIELDS.map((key) => [key, initial?.[key] ?? ''])),
  }
  const [form, setForm, draft] = useDraft(editing || presetCustomer ? null : 'device-new', start)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const set = (key) => (event) => { const { value } = event.target; setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: null })) }
  const back = editing ? `/dispositivos/${initial.id}` : toRepair && presetCustomer ? `/reparaciones/nueva?customer_id=${presetCustomer.id}` : presetCustomer ? `/clientes/${presetCustomer.id}` : '/dispositivos'

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!form.customer) next.customer = 'Elige al cliente dueño del equipo.'
    if (!form.brand.trim()) next.brand = 'Escribe la marca, por ejemplo Samsung.'
    if (!form.model.trim()) next.model = 'Escribe el modelo, por ejemplo Galaxy A54.'
    if (Object.keys(next).length) { setErrors(next); focusFirstInvalid('device-form'); return }
    const body = { customer_id: form.customer.id, ...Object.fromEntries(FIELDS.map((key) => [key, String(form[key] ?? '').trim() || null])) }
    setSaving(true); setFormError(null)
    try {
      const response = editing ? await api.patch(`/devices/${initial.id}`, body) : await api.post('/devices', body)
      draft.clear()
      toast.success(editing ? 'Datos del equipo actualizados.' : `${deviceName(body)} quedó registrado.`)
      navigate(toRepair ? `/reparaciones/nueva?customer_id=${body.customer_id}&device_id=${response.data.id}` : `/dispositivos/${response.data.id}`, { replace: true })
    } catch (error) {
      setFormError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage backTo={back} backLabel={editing ? deviceName(initial) : toRepair ? 'Registrar reparación' : presetCustomer ? customerLabel(presetCustomer) : 'Dispositivos'} title={editing ? 'Editar equipo' : 'Registrar equipo'} description="El estado físico y los accesorios protegen al taller ante cualquier reclamo."
      notice={draft.restored && <DraftNotice onDiscard={draft.discard} />}
      footer={<><Button onClick={() => navigate(back)} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="device-form" busy={saving}>Guardar equipo</Button></>}>
      <form id="device-form" onSubmit={submit} noValidate className="tf-form-grid">
        <div className="tf-span-2">
          <RecordPicker label="Cliente" required value={form.customer} error={errors.customer}
            onChange={(customer) => { setForm((current) => ({ ...current, customer })); setErrors((current) => ({ ...current, customer: null })) }}
            path={(q) => `/customers?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            renderLabel={customerLabel} renderMeta={(customer) => customer.phone || ''} placeholder="María López o 612 123 4567"
            emptyText="No hay clientes con ese nombre. Regístralo primero en Clientes." />
        </div>
        <Input label="Marca" required value={form.brand} onChange={set('brand')} error={errors.brand} maxLength={100} placeholder="Samsung" />
        <Input label="Modelo" required value={form.model} onChange={set('model')} error={errors.model} maxLength={150} placeholder="Galaxy A54" />
        <Input label="Color (opcional)" value={form.color} onChange={set('color')} maxLength={100} placeholder="Negro" />
        <Input label="Sistema operativo (opcional)" value={form.os} onChange={set('os')} maxLength={100} placeholder="Android 14" />
        <Input label="IMEI (opcional)" value={form.imei} onChange={set('imei')} maxLength={30} inputMode="numeric" placeholder="356938035643809" hint="Marca *#06# en el teléfono para verlo." />
        <Input label="Número de serie (opcional)" value={form.serial_number} onChange={set('serial_number')} maxLength={100} placeholder="R58N12ABCDE" />
        <Textarea fieldClassName="tf-span-2" label="Estado físico (opcional)" value={form.physical_condition} onChange={set('physical_condition')} maxLength={5000} placeholder="Pantalla estrellada en la esquina superior, carcasa sin golpes." />
        <Textarea fieldClassName="tf-span-2" label="Accesorios recibidos (opcional)" value={form.accessories_received} onChange={set('accessories_received')} maxLength={2000} placeholder="Funda y tarjeta SIM." />
        <Textarea fieldClassName="tf-span-2" label="Notas (opcional)" value={form.notes} onChange={set('notes')} maxLength={5000} placeholder="Tiene patrón de desbloqueo en forma de L." />
        {formError && <div className="tf-span-2"><ErrorAlert error={formError} action="guardar el equipo" /></div>}
      </form>
    </FormPage>
  )
}

export function DeviceFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const presetId = id ? null : params.get('customer_id')
  const detail = useDirectoryRecords(id ? `/devices/${encodeURIComponent(id)}` : null)
  const preset = useDirectoryRecords(presetId ? `/customers/${encodeURIComponent(presetId)}` : null)
  const state = id ? detail : preset
  if (!id && !presetId) return <DeviceForm />
  if (state.loading) return <div className="tf-form-page"><Alert tone="info">Cargando…</Alert></div>
  if (state.error || !state.payload?.data) return <div className="tf-form-page space-y-4"><Link to="/dispositivos" className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />Dispositivos</Link><Alert tone="error" action={<Button size="sm" onClick={state.reload}>Reintentar</Button>}>{state.error || 'No encontramos este registro. Es posible que se haya archivado.'}</Alert></div>
  return id ? <DeviceForm key={id} initial={detail.payload.data} /> : <DeviceForm key={presetId} presetCustomer={preset.payload.data} />
}

/* ---------- Detalle ---------- */
export function DeviceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const canEdit = EDIT_ROLES.includes(profile?.role)
  const isAdmin = ADMIN_ROLES.includes(profile?.role)
  const detail = useDirectoryRecords(`/devices/${encodeURIComponent(id)}`)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const device = detail.payload?.data
  const repairs = detail.payload?.repairs ?? []

  async function archive() {
    setArchiving(true)
    try {
      await api.delete(`/devices/${device.id}`)
      toast.success(`${deviceName(device)} se archivó. Su historial se conserva.`)
      navigate('/dispositivos', { replace: true })
    } catch (error) {
      setConfirmArchive(false)
      toast.error(friendlyError(error, 'archivar el equipo'))
    } finally {
      setArchiving(false)
    }
  }

  if (detail.loading) return <div className="space-y-6" role="status" aria-label="Cargando equipo"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-64" /><div className="tf-card space-y-4 p-6">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-4 w-full max-w-md" />)}</div></div>
  if (detail.error || !device) return (
    <div className="space-y-4">
      <Link to="/dispositivos" className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />Dispositivos</Link>
      <Alert tone="error" action={<Button size="sm" onClick={detail.reload}>Reintentar</Button>}>{detail.error || 'No encontramos este equipo. Es posible que se haya archivado.'}</Alert>
    </div>
  )

  const facts = [
    ['Color', device.color], ['Sistema operativo', device.os], ['IMEI', device.imei], ['Número de serie', device.serial_number],
    ['Estado físico', device.physical_condition], ['Accesorios recibidos', device.accessories_received], ['Notas', device.notes], ['Registrado', formatDate(device.created_at)],
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dispositivos" className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />Dispositivos</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="ct-page-title">{deviceName(device)}</h1>
            <p className="ct-page-description">De <Link to={`/clientes/${device.customer_id}`} className="tf-link">{device.customer ? customerLabel(device.customer) : 'ver cliente'}</Link>{device.customer?.phone ? <span className="tf-num">, {device.customer.phone}</span> : null}</p>
          </div>
          {canEdit && <div className="flex flex-wrap gap-2">
            {isAdmin && <Button variant="ghost" icon={Archive} onClick={() => setConfirmArchive(true)}>Archivar equipo</Button>}
            <Link to={`/dispositivos/${device.id}/editar`} className="ct-btn ct-btn-secondary"><Pencil size={16} aria-hidden="true" />Editar datos</Link>
            <Link to={`/reparaciones/nueva?customer_id=${device.customer_id}&device_id=${device.id}`} className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar reparación</Link>
          </div>}
        </div>
      </div>

      <Card title="Ficha del equipo">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--tf-text-subtle)]">{label}</dt><dd className={`mt-1 whitespace-pre-wrap break-words text-sm ${value ? 'text-[var(--tf-text)]' : 'text-[var(--tf-text-subtle)]'}`}>{value || 'Sin registrar'}</dd></div>)}
        </dl>
      </Card>

      <Card title="Historial de reparaciones" bodyClassName={null}>
        {!repairs.length ? <EmptyState icon={Wrench} title="Sin reparaciones todavía" description="Cuando este equipo entre al taller, aquí verás cada orden y su estado."
          action={canEdit && <Link to={`/reparaciones/nueva?customer_id=${device.customer_id}&device_id=${device.id}`} className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar reparación</Link>} className="!py-8" />
          : <div className="ct-table-shell"><table className="ct-table min-w-[32rem]">
            <thead><tr><th scope="col">Orden</th><th scope="col">Recibido</th><th scope="col">Estado</th></tr></thead>
            <tbody>{repairs.map((repair) => (
              <tr key={repair.id}>
                <td><Link to={`/reparaciones/${encodeURIComponent(repair.order_number)}`} className="tf-link tf-num font-medium">{repair.order_number}</Link></td>
                <td className="whitespace-nowrap">{formatDate(repair.received_at || repair.created_at)}</td>
                <td><StatusBadge status={repair.status} /></td>
              </tr>))}</tbody>
          </table></div>}
      </Card>

      <ConfirmDialog open={confirmArchive} busy={archiving} confirmLabel="Archivar equipo"
        title={`¿Archivar ${deviceName(device)} de ${customerLabel(device.customer)}?`}
        description="Dejará de aparecer en la lista de equipos activos. Su historial de reparaciones se conserva."
        onConfirm={archive} onCancel={() => setConfirmArchive(false)} />
    </div>
  )
}

/* ---------- Lista ---------- */
export default function Devices() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canEdit = EDIT_ROLES.includes(profile?.role)
  const [params, setParams] = useSearchParams()
  const customerId = params.get('customer_id') || ''
  const linked = useDirectoryRecords(customerId ? `/customers/${encodeURIComponent(customerId)}` : null)
  const list = usePagedResource('/devices', { limit: 12, filters: { customer_id: customerId } })
  const customer = linked.payload?.data ?? null
  const filtered = Boolean(list.query || customerId)
  const clearFilters = () => { list.setQuery(''); setParams({}) }

  // Enlaces antiguos: /dispositivos?id=… y /dispositivos?new=1
  if (params.get('id')) return <Navigate to={`/dispositivos/${encodeURIComponent(params.get('id'))}`} replace />
  if (canEdit && (params.get('new') === '1' || params.get('nuevo') === '1')) return <Navigate to={`/dispositivos/nuevo${customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ''}`} replace />

  const newLink = `/dispositivos/nuevo${customerId ? `?customer_id=${encodeURIComponent(customerId)}` : ''}`

  return (
    <div className="space-y-6">
      <PageHeader title="Dispositivos" description="Equipos de tus clientes y su historial de reparaciones."
        actions={canEdit && <Link to={newLink} className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar equipo</Link>} />
      <DataCard
        toolbar={<>
          <SearchField label="Buscar dispositivos" value={list.query} onChange={list.setQuery} placeholder="Samsung, A54 o IMEI" />
          <div className="min-w-[14rem] flex-1 sm:max-w-[20rem]">
            <RecordPicker label="Cliente" value={customer && customer.id === customerId ? customer : null}
              onChange={(record) => setParams(record ? { customer_id: record.id } : {})}
              path={(q) => `/customers?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              renderLabel={customerLabel} renderMeta={(record) => record.phone || ''} placeholder="Todos los clientes" />
          </div>
          {filtered && <Button variant="ghost" onClick={clearFilters}>Quitar filtros</Button>}
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="equipos" />}>
        {list.error ? <div className="p-4"><ErrorAlert error={list.error} action="cargar los equipos" onRetry={list.reload} /></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={4} rows={6} />
            : !list.rows.length ? (filtered
              ? <EmptyState icon={Smartphone} title="No encontramos equipos" description="Prueba otra búsqueda o quita el filtro de cliente." action={<Button onClick={clearFilters}>Quitar filtros</Button>} />
              : <EmptyState icon={Smartphone} title="Todavía no hay equipos" description="Registra un equipo y asígnalo a su cliente. También se registran al crear una reparación."
                action={canEdit && <Link to={newLink} className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar equipo</Link>} />)
              : (
                <div className="ct-table-shell" aria-busy={list.loading}>
                  <table className="ct-table min-w-[40rem]">
                    <thead><tr><th scope="col">Equipo</th><th scope="col">Cliente</th><th scope="col">IMEI o serie</th><th scope="col">Registrado</th>{canEdit && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
                    <tbody>
                      {list.rows.map((record) => (
                        <tr key={record.id}>
                          <td><Link to={`/dispositivos/${record.id}`} className="tf-link font-medium">{deviceName(record)}</Link>{record.color && <p className="text-xs text-[var(--tf-text-subtle)]">{record.color}</p>}</td>
                          <td>{record.customer ? customerLabel(record.customer) : '—'}</td>
                          <td className="tf-num break-all">{record.imei || record.serial_number || <span className="text-[var(--tf-text-subtle)]">Sin registrar</span>}</td>
                          <td className="whitespace-nowrap">{formatDate(record.created_at)}</td>
                          {canEdit && <td className="text-right"><IconButton label={`Editar ${deviceName(record)}`} icon={Pencil} onClick={() => navigate(`/dispositivos/${record.id}/editar`)} /></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
      </DataCard>
    </div>
  )
}
