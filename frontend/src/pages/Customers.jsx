import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ArrowLeft, MessageCircle, Pencil, Plus, Smartphone, Users, Wrench } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { Alert, Badge, Button, Card, ConfirmDialog, DataCard, DraftNotice, EmptyState, ErrorAlert, FormPage, IconButton, Input, Pagination, SearchField, Skeleton, TableSkeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { useDirectoryRecords } from '../hooks/useDirectoryRecords.js'
import { useDraft } from '../hooks/useDraft.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'
import { friendlyError } from '../utils/errors.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { formatDate } from '../utils/formatters.js'

const WHATSAPP_STATUS = { queued: 'En cola', sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'No se entregó', simulated: 'Simulado' }
const EMPTY_CUSTOMER = { first_name: '', last_name: '', phone: '', whatsapp: '', whatsapp_opt_in: false, email: '', notes: '' }
const EDIT_ROLES = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN']
const ADMIN_ROLES = ['OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN']
const fullName = (customer) => [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Cliente'
const digits = (value) => String(value ?? '').replace(/\D/g, '')

/* ---------- Formulario (página) ---------- */
function CustomerForm({ initial }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toRepair = params.get('volver') === 'reparacion'
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const start = Object.fromEntries(Object.keys(EMPTY_CUSTOMER).map((key) => [key, initial?.[key] ?? EMPTY_CUSTOMER[key]]))
  const [form, setForm, draft] = useDraft(editing ? null : 'customer-new', start)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const set = (key) => (event) => { const { value } = event.target; setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: null })) }
  const back = editing ? `/clientes/${initial.id}` : toRepair ? '/reparaciones/nueva' : '/clientes'

  async function submit(event) {
    event.preventDefault()
    const body = Object.fromEntries(Object.entries(form).filter(([key]) => key !== 'whatsapp_opt_in').map(([key, value]) => [key, typeof value === 'string' ? (value.trim() || null) : value]))
    const next = {}
    if (!body.first_name) next.first_name = 'Escribe el nombre del cliente.'
    if (!body.last_name) next.last_name = 'Escribe al menos un apellido.'
    if (!body.phone) next.phone = 'Escribe un teléfono de contacto.'
    else if (digits(body.phone).length < 7) next.phone = 'Usa al menos 7 dígitos, por ejemplo 612 123 4567.'
    if (body.whatsapp && digits(body.whatsapp).length < 7) next.whatsapp = 'Usa al menos 7 dígitos o deja el campo vacío.'
    if (Object.keys(next).length) { setErrors(next); focusFirstInvalid('customer-form'); return }
    setSaving(true); setFormError(null)
    try {
      const response = editing ? await api.patch(`/customers/${initial.id}`, body) : await api.post('/customers', body)
      await api.patch(`/whatsapp/customers/${response.data.id}/consent`, { whatsapp_opt_in: Boolean(form.whatsapp_opt_in), whatsapp: body.whatsapp, phone: body.phone, source: 'customer_editor' })
      draft.clear()
      toast.success(editing ? 'Datos del cliente actualizados.' : `${fullName(response.data)} quedó registrado.`)
      navigate(toRepair ? `/reparaciones/nueva?customer_id=${response.data.id}` : `/clientes/${response.data.id}`, { replace: true })
    } catch (error) {
      setFormError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage backTo={back} backLabel={editing ? fullName(initial) : toRepair ? 'Registrar reparación' : 'Clientes'} title={editing ? 'Editar cliente' : 'Registrar cliente'} description="Con estos datos avisamos al cliente del avance de su reparación."
      notice={draft.restored && <DraftNotice onDiscard={draft.discard} />}
      footer={<><Button onClick={() => navigate(back)} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="customer-form" busy={saving}>Guardar cliente</Button></>}>
      <form id="customer-form" onSubmit={submit} noValidate className="tf-form-grid">
        <Input label="Nombre" required value={form.first_name} onChange={set('first_name')} error={errors.first_name} maxLength={100} autoComplete="given-name" placeholder="María" />
        <Input label="Apellidos" required value={form.last_name} onChange={set('last_name')} error={errors.last_name} maxLength={100} autoComplete="family-name" placeholder="López García" />
        <Input label="Teléfono" required type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={30} autoComplete="tel" placeholder="612 123 4567" />
        <Input label="WhatsApp (opcional)" type="tel" value={form.whatsapp} onChange={set('whatsapp')} error={errors.whatsapp} maxLength={30} placeholder="612 123 4567" hint="Déjalo vacío si es el mismo teléfono." />
        <label className="tf-span-2 flex items-start gap-3 rounded-[var(--tf-radius-control)] border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] p-4 text-sm text-[var(--tf-text-muted)]">
          <input type="checkbox" checked={Boolean(form.whatsapp_opt_in)} onChange={(event) => { const { checked } = event.target; setForm((current) => ({ ...current, whatsapp_opt_in: checked })) }} className="mt-0.5 h-4 w-4 accent-[var(--tf-primary)]" />
          <span>El cliente acepta recibir avisos de su reparación por WhatsApp.</span>
        </label>
        <Input fieldClassName="tf-span-2" label="Correo electrónico (opcional)" type="email" value={form.email} onChange={set('email')} maxLength={254} autoComplete="email" placeholder="nombre@correo.com" />
        <Textarea fieldClassName="tf-span-2" label="Notas (opcional)" value={form.notes} onChange={set('notes')} maxLength={5000} placeholder="Prefiere que le llamen después de las 4 p. m." />
        {formError && <div className="tf-span-2"><ErrorAlert error={formError} action="guardar el cliente" /></div>}
      </form>
    </FormPage>
  )
}

export function CustomerFormPage() {
  const { id } = useParams()
  const detail = useDirectoryRecords(id ? `/customers/${encodeURIComponent(id)}` : null)
  if (!id) return <CustomerForm />
  if (detail.loading) return <div className="tf-form-page"><Alert tone="info">Cargando el cliente…</Alert></div>
  if (detail.error || !detail.payload?.data) return <div className="tf-form-page space-y-4"><Link to="/clientes" className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />Clientes</Link><Alert tone="error" action={<Button size="sm" onClick={detail.reload}>Reintentar</Button>}>{detail.error || 'No encontramos a este cliente. Es posible que se haya archivado.'}</Alert></div>
  return <CustomerForm key={id} initial={detail.payload.data} />
}

/* ---------- Detalle ---------- */
export function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const canEdit = EDIT_ROLES.includes(profile?.role)
  const isAdmin = ADMIN_ROLES.includes(profile?.role)
  const detail = useDirectoryRecords(`/customers/${encodeURIComponent(id)}`)
  const messages = useDirectoryRecords(`/whatsapp/messages?customer_id=${encodeURIComponent(id)}`)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const customer = detail.payload?.data
  const devices = detail.payload?.devices ?? []
  const repairs = detail.payload?.repairs ?? []

  async function archive() {
    setArchiving(true)
    try {
      await api.delete(`/customers/${customer.id}`)
      toast.success(`${fullName(customer)} se archivó. Su historial se conserva.`)
      navigate('/clientes', { replace: true })
    } catch (error) {
      setConfirmArchive(false)
      toast.error(friendlyError(error, 'archivar al cliente'))
    } finally {
      setArchiving(false)
    }
  }

  if (detail.loading) return <div className="space-y-6" role="status" aria-label="Cargando cliente"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-64" /><div className="tf-card space-y-4 p-6">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-4 w-full max-w-md" />)}</div></div>
  if (detail.error || !customer) return (
    <div className="space-y-4">
      <Link to="/clientes" className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />Clientes</Link>
      <Alert tone="error" action={<Button size="sm" onClick={detail.reload}>Reintentar</Button>}>{detail.error || 'No encontramos a este cliente. Es posible que se haya archivado.'}</Alert>
    </div>
  )

  const facts = [
    ['Teléfono', customer.phone], ['WhatsApp', customer.whatsapp_e164 || customer.whatsapp],
    ['Avisos por WhatsApp', customer.whatsapp_opt_in ? 'Autorizados' : 'Sin autorizar'], ['Correo electrónico', customer.email],
    ['Cliente desde', formatDate(customer.created_at)], ['Notas', customer.notes],
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link to="/clientes" className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />Clientes</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="ct-page-title">{fullName(customer)}</h1>
            <p className="ct-page-description tf-num">{customer.phone}{customer.email ? `, ${customer.email}` : ''}</p>
          </div>
          {canEdit && <div className="flex flex-wrap gap-2">
            {isAdmin && <Button variant="ghost" icon={Archive} onClick={() => setConfirmArchive(true)}>Archivar cliente</Button>}
            <Link to={`/clientes/${customer.id}/editar`} className="ct-btn ct-btn-secondary"><Pencil size={16} aria-hidden="true" />Editar datos</Link>
            <Link to={`/reparaciones/nueva?customer_id=${customer.id}`} className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar reparación</Link>
          </div>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Datos de contacto">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {facts.map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--tf-text-subtle)]">{label}</dt><dd className={`mt-1 whitespace-pre-wrap break-words text-sm ${value ? 'text-[var(--tf-text)]' : 'text-[var(--tf-text-subtle)]'}`}>{value || 'Sin registrar'}</dd></div>)}
          </dl>
        </Card>

        <Card title="Equipos" description={`${devices.length} registrado${devices.length === 1 ? '' : 's'}`} bodyClassName={null}
          actions={canEdit && <Link to={`/dispositivos/nuevo?customer_id=${customer.id}`} className="ct-btn ct-btn-secondary ct-btn-sm"><Plus size={16} aria-hidden="true" />Registrar equipo</Link>}>
          {!devices.length ? <EmptyState icon={Smartphone} title="Sin equipos registrados" description="Registra el teléfono o tableta del cliente para ligarlo a sus reparaciones." className="!py-8" />
            : <ul className="tf-list">{devices.map((device) => (
              <li key={device.id}><Link to={`/dispositivos/${device.id}`} className="tf-list-row hover:bg-[rgba(148,163,184,.05)]">
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-[var(--tf-text)]">{[device.brand, device.model].filter(Boolean).join(' ') || 'Equipo'}</span>
                  <span className="tf-num block truncate text-xs text-[var(--tf-text-subtle)]">{device.imei ? `IMEI ${device.imei}` : device.serial_number ? `Serie ${device.serial_number}` : 'Sin identificador'}</span></span>
                <span className="tf-link shrink-0 text-sm">Ver equipo</span>
              </Link></li>))}</ul>}
        </Card>
      </div>

      <Card title="Historial de reparaciones" bodyClassName={null}>
        {!repairs.length ? <EmptyState icon={Wrench} title="Sin reparaciones todavía" description="Cuando recibas un equipo de este cliente, aparecerá aquí con su estado."
          action={canEdit && <Link to={`/reparaciones/nueva?customer_id=${customer.id}`} className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar reparación</Link>} className="!py-8" />
          : <div className="ct-table-shell"><table className="ct-table min-w-[36rem]">
            <thead><tr><th scope="col">Orden</th><th scope="col">Equipo</th><th scope="col">Recibido</th><th scope="col">Estado</th></tr></thead>
            <tbody>{repairs.map((repair) => (
              <tr key={repair.id}>
                <td><Link to={`/reparaciones/${encodeURIComponent(repair.order_number)}`} className="tf-link tf-num font-medium">{repair.order_number}</Link></td>
                <td>{[repair.brand, repair.model].filter(Boolean).join(' ') || 'Equipo registrado'}</td>
                <td className="whitespace-nowrap">{formatDate(repair.received_at || repair.created_at)}</td>
                <td><StatusBadge status={repair.status} /></td>
              </tr>))}</tbody>
          </table></div>}
      </Card>

      <Card title="Mensajes de WhatsApp" bodyClassName={null}>
        {messages.loading ? <TableSkeleton rows={2} columns={3} />
          : messages.error ? <div className="p-4"><Alert tone="error" action={<Button size="sm" onClick={messages.reload}>Reintentar</Button>}>{messages.error}</Alert></div>
            : !messages.payload?.data?.length ? <EmptyState icon={MessageCircle} title="Sin mensajes enviados" description="Los avisos de reparación y cotizaciones enviados a este cliente aparecerán aquí." className="!py-8" />
              : <ul className="tf-list">{messages.payload.data.map((message) => (
                <li key={message.id} className="tf-list-row !items-start">
                  <p className="min-w-0 text-sm text-[var(--tf-text-muted)]">{message.message}</p>
                  <span className="flex shrink-0 flex-col items-end gap-1"><Badge tone={message.status === 'failed' ? 'danger' : message.status === 'read' || message.status === 'delivered' ? 'success' : 'neutral'}>{WHATSAPP_STATUS[message.status] ?? message.status}</Badge><span className="text-xs text-[var(--tf-text-subtle)]">{formatDate(message.created_at)}</span></span>
                </li>))}</ul>}
      </Card>

      <ConfirmDialog open={confirmArchive} busy={archiving} confirmLabel="Archivar cliente"
        title={`¿Archivar a ${fullName(customer)}?`}
        description="Dejará de aparecer en la lista de clientes activos. Sus equipos y su historial de reparaciones se conservan."
        onConfirm={archive} onCancel={() => setConfirmArchive(false)} />
    </div>
  )
}

/* ---------- Lista ---------- */
export default function Customers() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canEdit = EDIT_ROLES.includes(profile?.role)
  const [params] = useSearchParams()
  const list = usePagedResource('/customers', { limit: 12 })

  // Enlaces antiguos: /clientes?id=… y /clientes?nuevo=1
  if (params.get('id')) return <Navigate to={`/clientes/${encodeURIComponent(params.get('id'))}`} replace />
  if (canEdit && (params.get('new') === '1' || params.get('nuevo') === '1')) return <Navigate to="/clientes/nuevo" replace />

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Contactos, equipos e historial de atención del taller."
        actions={canEdit && <Link to="/clientes/nuevo" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar cliente</Link>} />
      <DataCard
        toolbar={<>
          <SearchField label="Buscar clientes" value={list.query} onChange={list.setQuery} placeholder="María, 612 123 4567 o correo" />
          {list.query && <Button variant="ghost" onClick={() => list.setQuery('')}>Quitar búsqueda</Button>}
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="clientes" />}>
        {list.error ? <div className="p-4"><ErrorAlert error={list.error} action="cargar los clientes" onRetry={list.reload} /></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={4} rows={6} />
            : !list.rows.length ? (list.query
              ? <EmptyState icon={Users} title="No encontramos clientes" description="Prueba con otro nombre, teléfono o correo." action={<Button onClick={() => list.setQuery('')}>Quitar búsqueda</Button>} />
              : <EmptyState icon={Users} title="Todavía no hay clientes" description="Registra a tu primer cliente para ligar sus equipos y reparaciones."
                action={canEdit && <Link to="/clientes/nuevo" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar cliente</Link>} />)
              : (
                <div className="ct-table-shell" aria-busy={list.loading}>
                  <table className="ct-table min-w-[40rem]">
                    <thead><tr><th scope="col">Cliente</th><th scope="col">Teléfono</th><th scope="col">Correo</th><th scope="col">Cliente desde</th>{canEdit && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
                    <tbody>
                      {list.rows.map((record) => (
                        <tr key={record.id}>
                          <td><Link to={`/clientes/${record.id}`} className="tf-link font-medium">{fullName(record)}</Link></td>
                          <td className="tf-num whitespace-nowrap">{record.phone}</td>
                          <td className="max-w-[16rem] truncate">{record.email || <span className="text-[var(--tf-text-subtle)]">Sin correo</span>}</td>
                          <td className="whitespace-nowrap">{formatDate(record.created_at)}</td>
                          {canEdit && <td className="text-right"><IconButton label={`Editar a ${fullName(record)}`} icon={Pencil} onClick={() => navigate(`/clientes/${record.id}/editar`)} /></td>}
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
