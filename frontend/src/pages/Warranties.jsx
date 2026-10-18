import { useState } from 'react'
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import RecordPicker from '../components/ui/RecordPicker.jsx'
import { Alert, Badge, Button, ConfirmDialog, DataCard, Dialog, EmptyState, Input, Pagination, SearchField, Select, TableSkeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
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

function WarrantyForm({ initial, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const [form, setForm] = useState(() => ({
    repair: null,
    service_description: initial?.service_description ?? '', duration_days: String(initial?.duration_days ?? 90),
    conditions: initial?.conditions ?? '', status: initial?.status ?? 'activa',
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const set = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setErrors((current) => ({ ...current, [key]: null })) }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!editing && !form.repair) next.repair = 'Elige la orden de reparación cubierta.'
    const days = Number(form.duration_days)
    if (!Number.isInteger(days) || days < 1) next.duration_days = 'Escribe los días de garantía.'
    if (Object.keys(next).length) { setErrors(next); return }
    const body = { duration_days: days, service_description: form.service_description.trim() || null, conditions: form.conditions.trim() || null }
    if (!editing) {
      body.repair_order_id = form.repair.id
      body.customer_id = form.repair.customer_id ?? form.repair.customer?.id
      if (form.repair.device_id) body.device_id = form.repair.device_id
    } else body.status = form.status
    setSaving(true); setFormError('')
    try {
      if (editing) await api.patch(`/warranties/${initial.id}`, body)
      else await api.post('/warranties', body)
      toast.success(editing ? 'Garantía actualizada.' : 'Garantía registrada.')
      onSaved()
    } catch (error) {
      setFormError(friendlyError(error, 'guardar la garantía'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open wide onClose={saving ? undefined : onClose} title={editing ? 'Editar garantía' : 'Registrar garantía'} description="La vigencia empieza el día del servicio."
      footer={<><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="warranty-form" busy={saving}>{editing ? 'Guardar cambios' : 'Registrar garantía'}</Button></>}>
      <form id="warranty-form" onSubmit={submit} noValidate className="tf-form-grid">
        {!editing && <div className="tf-span-2">
          <RecordPicker label="Orden de reparación" required value={form.repair} error={errors.repair}
            onChange={(repair) => { setForm((current) => ({ ...current, repair, service_description: current.service_description || repair?.reported_problem || '' })); setErrors((current) => ({ ...current, repair: null })) }}
            path={(q) => `/repairs?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            renderLabel={(repair) => `${repair.order_number}, ${[repair.brand, repair.model].filter(Boolean).join(' ')}`}
            renderMeta={(repair) => customerName(repair.customer)} placeholder="Número de orden, marca o modelo" />
        </div>}
        <Input fieldClassName="tf-span-2" label="Servicio cubierto" value={form.service_description} onChange={set('service_description')} maxLength={2000} placeholder="Cambio de pantalla" />
        <div>
          <Input label="Días de garantía" required type="number" inputMode="numeric" min="1" step="1" list="warranty-durations" value={form.duration_days} onChange={set('duration_days')} error={errors.duration_days} />
          <datalist id="warranty-durations">{DURATIONS.map((days) => <option key={days} value={days} />)}</datalist>
        </div>
        {editing ? <Select label="Estado" value={form.status} onChange={set('status')}>
          {Object.entries(WARRANTY_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </Select> : <div />}
        <Textarea fieldClassName="tf-span-2" label="Condiciones" value={form.conditions} onChange={set('conditions')} maxLength={2000} placeholder="No cubre golpes, humedad ni equipos abiertos por terceros." className="min-h-[4.5rem]" />
        {formError && <div className="tf-span-2"><Alert tone="error">{formError}</Alert></div>}
      </form>
    </Dialog>
  )
}

export default function Warranties() {
  const { profile, hasPermission } = useAuth()
  const toast = useToast()
  const [status, setStatus] = useState('')
  const list = usePagedResource('/warranties', { filters: { status } })
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const writer = WRITE_ROLES.warranties.includes(profile?.role)
  const canCreate = writer && hasPermission('warranties.create')
  const canEdit = writer && hasPermission('warranties.update')
  const canDelete = WRITE_ROLES.admin.includes(profile?.role) && hasPermission('warranties.update')
  const filtered = Boolean(list.query || status)

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.delete(`/warranties/${removing.id}`)
      toast.success('Garantía eliminada.')
      setRemoving(null)
      list.reload()
    } catch (error) {
      toast.error(friendlyError(error, 'eliminar la garantía'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Garantías" description="Coberturas de los servicios entregados y cuánto les queda."
        actions={canCreate && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Registrar garantía</Button>} />

      <DataCard
        toolbar={<>
          <SearchField label="Buscar garantías" value={list.query} onChange={list.setQuery} placeholder="Servicio o condición" />
          <select aria-label="Filtrar por estado" className="ct-select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(WARRANTY_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="garantías" />}>
        {list.error ? <div className="p-4"><Alert tone="error" action={<Button size="sm" onClick={list.reload}>Reintentar</Button>}>{friendlyError(list.error, 'cargar las garantías')}</Alert></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={5} />
            : !list.rows.length ? <EmptyState icon={ShieldCheck} title={filtered ? 'No hay garantías con esos filtros' : 'Aún no hay garantías'}
                description={filtered ? 'Prueba con otro texto o cambia el estado.' : 'Registra la garantía al entregar un equipo para atender reclamos con certeza.'}
                action={!filtered && canCreate && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Registrar garantía</Button>} />
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
                                {canEdit && <button type="button" className="tf-icon-btn" onClick={() => setEditing(warranty)} aria-label={`Editar garantía de ${customerName(warranty.customer)}`} title="Editar"><Pencil size={15} /></button>}
                                {canDelete && <button type="button" className="tf-icon-btn" onClick={() => setRemoving(warranty)} aria-label={`Eliminar garantía de ${customerName(warranty.customer)}`} title="Eliminar"><Trash2 size={15} /></button>}
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

      {editing && <WarrantyForm initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload() }} />}
      <ConfirmDialog open={Boolean(removing)} title="¿Eliminar esta garantía?" busy={deleting} confirmLabel="Eliminar garantía"
        description={removing ? `La garantía de ${customerName(removing.customer)} dejará de aparecer. Si solo ya no aplica, mejor cámbiala a “Invalidada”.` : ''}
        onConfirm={confirmDelete} onCancel={() => setRemoving(null)} />
    </div>
  )
}
