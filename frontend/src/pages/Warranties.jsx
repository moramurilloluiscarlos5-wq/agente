import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import RecordPicker from '../components/ui/RecordPicker.jsx'
import { Alert, Badge, Button, ConfirmDialog, DataCard, DraftNotice, EmptyState, ErrorAlert, FilterSelect, FormPage, IconButton, Input, Pagination, SearchField, Select, TableSkeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { useDraft } from '../hooks/useDraft.js'
import { useRecord } from '../hooks/useRecord.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'
import { WARRANTY_STATUSES, WRITE_ROLES } from '../utils/constants.js'
import { friendlyError } from '../utils/errors.js'
import { formatDate } from '../utils/formatters.js'
import { customerName } from '../components/repairs/repairForm.js'

const DURATIONS = [30, 60, 90, 180, 365]

function daysLeft(expiresAt) {
  if (!expiresAt) return null
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
}

function WarrantyForm({ initial, onDone }) {
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const [form, setForm, draft] = useDraft(editing ? null : 'warranty-new', {
    repair: null,
    service_description: initial?.service_description ?? '', duration_days: String(initial?.duration_days ?? 90),
    conditions: initial?.conditions ?? '', status: initial?.status ?? 'activa',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const set = (key) => (event) => { const { value } = event.target; setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: null })) }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!editing && !form.repair) next.repair = 'Elige la orden de reparación que cubre esta garantía.'
    const days = Number(form.duration_days)
    if (!Number.isInteger(days) || days < 1) next.duration_days = 'Escribe los días de garantía, por ejemplo 90.'
    if (Object.keys(next).length) { setErrors(next); focusFirstInvalid('warranty-form'); return }
    const body = { duration_days: days, service_description: form.service_description.trim() || null, conditions: form.conditions.trim() || null }
    if (!editing) {
      body.repair_order_id = form.repair.id
      body.customer_id = form.repair.customer_id ?? form.repair.customer?.id
      if (form.repair.device_id) body.device_id = form.repair.device_id
    } else body.status = form.status
    setSaving(true); setFormError(null)
    try {
      if (editing) await api.patch(`/warranties/${initial.id}`, body)
      else await api.post('/warranties', body)
      draft.clear()
      toast.success(editing ? 'Garantía actualizada.' : 'Garantía registrada.')
      onDone()
    } catch (error) {
      setFormError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage backTo="/garantias" backLabel="Garantías" title={editing ? 'Editar garantía' : 'Registrar garantía'} description="La vigencia empieza el día del servicio."
      notice={draft.restored && <DraftNotice onDiscard={draft.discard} />}
      footer={<><Button onClick={onDone} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="warranty-form" busy={saving}>{editing ? 'Guardar cambios' : 'Registrar garantía'}</Button></>}>
      <form id="warranty-form" onSubmit={submit} noValidate className="tf-form-grid">
        {!editing && <div className="tf-span-2">
          <RecordPicker label="Orden de reparación" required value={form.repair} error={errors.repair}
            onChange={(repair) => { setForm((current) => ({ ...current, repair, service_description: current.service_description || repair?.reported_problem || '' })); setErrors((current) => ({ ...current, repair: null })) }}
            path={(q) => `/repairs?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            renderLabel={(repair) => `${repair.order_number}, ${[repair.brand, repair.model].filter(Boolean).join(' ')}`}
            renderMeta={(repair) => customerName(repair.customer)} placeholder="ORD-0012 o iPhone 13" />
        </div>}
        <Input fieldClassName="tf-span-2" label="Servicio cubierto (opcional)" value={form.service_description} onChange={set('service_description')} maxLength={2000} placeholder="Cambio de pantalla" />
        <div>
          <Input label="Días de garantía" required type="number" inputMode="numeric" min="1" step="1" list="warranty-durations" value={form.duration_days} onChange={set('duration_days')} error={errors.duration_days} hint="Lo más común: 30, 90 o 180 días." />
          <datalist id="warranty-durations">{DURATIONS.map((days) => <option key={days} value={days} />)}</datalist>
        </div>
        {editing ? <Select label="Estado" value={form.status} onChange={set('status')}>
          {Object.entries(WARRANTY_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </Select> : <div />}
        <Textarea fieldClassName="tf-span-2" label="Condiciones (opcional)" value={form.conditions} onChange={set('conditions')} maxLength={2000} placeholder="No cubre golpes, humedad ni equipos abiertos por terceros." className="min-h-[5rem]" />
        {formError && <div className="tf-span-2"><ErrorAlert error={formError} action="guardar la garantía" /></div>}
      </form>
    </FormPage>
  )
}

export function WarrantyFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { record, loading, error, reload } = useRecord(id ? `/warranties/${id}` : null, location.state?.record ?? null)
  const done = () => navigate('/garantias')
  if (id && loading) return <div className="tf-form-page"><Alert tone="info">Cargando la garantía…</Alert></div>
  if (id && (error || !record?.id)) return <div className="tf-form-page space-y-4"><Link to="/garantias" className="tf-form-page-back">Volver a Garantías</Link><ErrorAlert error={error ?? { status: 404 }} action="cargar la garantía" onRetry={reload} /></div>
  return <WarrantyForm key={record?.id ?? 'new'} initial={id ? record : null} onDone={done} />
}

export default function Warranties() {
  const { profile, hasPermission } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const list = usePagedResource('/warranties', { filters: { status } })
  const [removing, setRemoving] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const writer = WRITE_ROLES.warranties.includes(profile?.role)
  const canCreate = writer && hasPermission('warranties.create')
  const canEdit = writer && hasPermission('warranties.update')
  const canDelete = WRITE_ROLES.admin.includes(profile?.role) && hasPermission('warranties.update')
  const filtered = Boolean(list.query || status)
  const clearFilters = () => { list.setQuery(''); setStatus('') }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.delete(`/warranties/${removing.id}`)
      toast.success(`Garantía de ${customerName(removing.customer)} eliminada.`)
      setRemoving(null)
      list.reload()
    } catch (error) {
      toast.error(friendlyError(error, 'eliminar la garantía'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Garantías" description="Coberturas de los servicios entregados y cuánto les queda."
        actions={canCreate && <Link to="/garantias/nueva" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar garantía</Link>} />

      <DataCard
        toolbar={<>
          <SearchField label="Buscar garantías" value={list.query} onChange={list.setQuery} placeholder="Servicio o condición" />
          <FilterSelect label="Estado" ariaLabel="Filtrar por estado" value={status} onChange={setStatus}>
            <option value="">Todos</option>
            {Object.entries(WARRANTY_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </FilterSelect>
          {filtered && <Button variant="ghost" onClick={clearFilters}>Quitar filtros</Button>}
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="garantías" />}>
        {list.error ? <div className="p-4"><ErrorAlert error={list.error} action="cargar las garantías" onRetry={list.reload} /></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={5} />
            : !list.rows.length ? (filtered
              ? <EmptyState icon={ShieldCheck} title="No hay garantías con esos filtros" description="Prueba con otro texto o cambia el estado." action={<Button onClick={clearFilters}>Quitar filtros</Button>} />
              : <EmptyState icon={ShieldCheck} title="Aún no hay garantías" description="Registra la garantía al entregar un equipo para atender cualquier reclamo con fechas claras."
                action={canCreate && <Link to="/garantias/nueva" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar garantía</Link>} />)
              : (
                <div className="ct-table-shell" aria-busy={list.loading}>
                  <table className="ct-table min-w-[44rem]">
                    <thead><tr><th scope="col">Cliente</th><th scope="col">Servicio</th><th scope="col">Estado</th><th scope="col">Vence</th>{(canEdit || canDelete) && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
                    <tbody>
                      {list.rows.map((warranty) => {
                        const meta = WARRANTY_STATUSES[warranty.status]
                        const left = daysLeft(warranty.expires_at)
                        return (
                          <tr key={warranty.id}>
                            <td className="tf-cell-strong">{customerName(warranty.customer)}</td>
                            <td className="max-w-[18rem]"><p className="truncate">{warranty.service_description || 'Servicio de reparación'}</p><p className="text-xs text-[var(--tf-text-subtle)]">{warranty.duration_days} días</p></td>
                            <td><Badge tone={meta?.tone}>{meta?.label ?? warranty.status}</Badge></td>
                            <td className="whitespace-nowrap">
                              {formatDate(warranty.expires_at)}
                              {warranty.status === 'activa' && left != null && <p className={`text-xs ${left <= 7 ? 'text-[var(--tf-warning)]' : 'text-[var(--tf-text-subtle)]'}`}>{left > 0 ? `Quedan ${left} días` : 'Venció'}</p>}
                            </td>
                            {(canEdit || canDelete) && <td className="text-right">
                              <div className="inline-flex gap-1">
                                {canEdit && <IconButton label={`Editar garantía de ${customerName(warranty.customer)}`} icon={Pencil} onClick={() => navigate(`/garantias/${warranty.id}/editar`, { state: { record: warranty } })} />}
                                {canDelete && <IconButton label={`Eliminar garantía de ${customerName(warranty.customer)}`} icon={Trash2} tone="danger" onClick={() => setRemoving(warranty)} />}
                              </div>
                            </td>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
      </DataCard>

      <ConfirmDialog open={Boolean(removing)} title={removing ? `¿Eliminar la garantía de ${customerName(removing.customer)}?` : ''} busy={deleting} confirmLabel="Eliminar garantía"
        description={removing ? `La garantía de ${customerName(removing.customer)} dejará de aparecer. Si solo ya no aplica, mejor cámbiala a “Invalidada”.` : ''}
        onConfirm={confirmDelete} onCancel={() => setRemoving(null)} />
    </div>
  )
}
