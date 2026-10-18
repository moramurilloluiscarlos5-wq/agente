import { useState } from 'react'
import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import RecordPicker from '../components/ui/RecordPicker.jsx'
import { Alert, Badge, Button, ConfirmDialog, DataCard, Dialog, EmptyState, Input, Pagination, SearchField, Select, TableSkeleton } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'
import { PAYMENT_METHODS, PAYMENT_STATUSES, WRITE_ROLES } from '../utils/constants.js'
import { friendlyError } from '../utils/errors.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import { customerName } from '../components/repairs/repairForm.js'

const EMPTY = { customer: null, amount: '', method: 'efectivo', status: 'pagado', reference: '', payment_date: '' }

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function PaymentForm({ open, initial, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const [form, setForm] = useState(() => initial ? {
    customer: initial.customer ? { id: initial.customer_id, ...initial.customer } : null,
    amount: String(initial.amount ?? ''), method: initial.method ?? 'efectivo', status: initial.status ?? 'pagado',
    reference: initial.reference ?? '', payment_date: initial.payment_date?.slice(0, 10) ?? todayInput(),
  } : { ...EMPTY, payment_date: todayInput() })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const set = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setErrors((current) => ({ ...current, [key]: null })) }

  async function submit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.customer) nextErrors.customer = 'Elige al cliente que pagó.'
    const amount = Number(form.amount)
    if (!form.amount || !Number.isFinite(amount) || amount <= 0) nextErrors.amount = 'Escribe un monto mayor a cero.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    setSaving(true); setFormError('')
    const body = { customer_id: form.customer.id, amount: Math.round(amount * 100) / 100, method: form.method, status: form.status, reference: form.reference.trim() || null }
    if (form.payment_date) body.payment_date = new Date(`${form.payment_date}T12:00:00`).toISOString()
    try {
      if (editing) await api.patch(`/payments/${initial.id}`, body)
      else await api.post('/payments', body)
      toast.success(editing ? 'Pago actualizado.' : 'Pago registrado.')
      onSaved()
    } catch (error) {
      setFormError(friendlyError(error, 'guardar el pago'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} title={editing ? 'Editar pago' : 'Registrar pago'} description="Anticipos, pagos parciales o liquidaciones de un cliente."
      footer={<><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="payment-form" busy={saving}>{editing ? 'Guardar cambios' : 'Registrar pago'}</Button></>}>
      <form id="payment-form" onSubmit={submit} noValidate className="tf-form-grid">
        <div className="tf-span-2">
          <RecordPicker label="Cliente" required value={form.customer} error={errors.customer} disabled={editing}
            onChange={(customer) => { setForm((current) => ({ ...current, customer })); setErrors((current) => ({ ...current, customer: null })) }}
            path={(q) => `/customers?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            renderLabel={customerName} renderMeta={(customer) => customer.phone || customer.email || ''} placeholder="Nombre o teléfono" emptyText="No hay clientes con ese nombre. Regístralo primero en Clientes." />
        </div>
        <Input label="Monto (MXN)" required type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} error={errors.amount} placeholder="0.00" />
        <Input label="Fecha" type="date" value={form.payment_date} onChange={set('payment_date')} />
        <Select label="Método" value={form.method} onChange={set('method')}>
          {Object.entries(PAYMENT_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select label="Estado" value={form.status} onChange={set('status')} hint="Pendiente: el cliente aún no paga.">
          {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Input fieldClassName="tf-span-2" label="Referencia" value={form.reference} onChange={set('reference')} maxLength={200} placeholder="Folio de terminal, número de transferencia o nota" />
        {formError && <div className="tf-span-2"><Alert tone="error">{formError}</Alert></div>}
      </form>
    </Dialog>
  )
}

export default function Payments() {
  const { profile, hasPermission } = useAuth()
  const toast = useToast()
  const [status, setStatus] = useState('')
  const list = usePagedResource('/payments', { filters: { status } })
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const canWrite = WRITE_ROLES.payments.includes(profile?.role) && hasPermission('payments.create')
  const canEdit = WRITE_ROLES.payments.includes(profile?.role) && hasPermission('payments.update')
  const canDelete = WRITE_ROLES.admin.includes(profile?.role) && hasPermission('payments.delete')
  const filtered = Boolean(list.query || status)

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.delete(`/payments/${removing.id}`)
      toast.success('Pago eliminado.')
      setRemoving(null)
      list.reload()
    } catch (error) {
      toast.error(friendlyError(error, 'eliminar el pago'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Pagos" description="Anticipos, pagos parciales y liquidaciones de tus clientes."
        actions={canWrite && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Registrar pago</Button>} />

      <DataCard
        toolbar={<>
          <SearchField label="Buscar pagos por referencia" value={list.query} onChange={list.setQuery} placeholder="Buscar por referencia" />
          <select aria-label="Filtrar por estado" className="ct-select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="pagos" />}>
        {list.error ? <div className="p-4"><Alert tone="error" action={<Button size="sm" onClick={list.reload}>Reintentar</Button>}>{friendlyError(list.error, 'cargar los pagos')}</Alert></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={6} />
            : !list.rows.length ? <EmptyState icon={CreditCard} title={filtered ? 'No hay pagos con esos filtros' : 'Aún no hay pagos registrados'}
                description={filtered ? 'Prueba con otra referencia o cambia el estado.' : 'Registra anticipos y liquidaciones para llevar el control de lo cobrado.'}
                action={!filtered && canWrite && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Registrar pago</Button>} />
              : (
                <div className="ct-table-shell" aria-busy={list.loading}>
                  <table className="ct-table min-w-[44rem]">
                    <thead><tr><th scope="col">Cliente</th><th scope="col" className="tf-cell-num">Monto</th><th scope="col">Método</th><th scope="col">Referencia</th><th scope="col">Estado</th><th scope="col">Fecha</th>{(canEdit || canDelete) && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
                    <tbody>
                      {list.rows.map((payment) => {
                        const meta = PAYMENT_STATUSES[payment.status]
                        return (
                          <tr key={payment.id}>
                            <td className="tf-cell-strong">{customerName(payment.customer)}</td>
                            <td className="tf-cell-num text-[var(--tf-text)]">{formatCurrency(payment.amount)}</td>
                            <td>{PAYMENT_METHODS[payment.method] ?? payment.method}</td>
                            <td className="max-w-[14rem] truncate">{payment.reference || '—'}</td>
                            <td><Badge tone={meta?.tone}>{meta?.label ?? payment.status}</Badge></td>
                            <td className="whitespace-nowrap">{formatDate(payment.payment_date)}</td>
                            {(canEdit || canDelete) && <td className="text-right">
                              <div className="inline-flex gap-1">
                                {canEdit && <button type="button" className="tf-icon-btn" onClick={() => setEditing(payment)} aria-label={`Editar pago de ${customerName(payment.customer)}`}><Pencil size={15} /></button>}
                                {canDelete && <button type="button" className="tf-icon-btn" onClick={() => setRemoving(payment)} aria-label={`Eliminar pago de ${customerName(payment.customer)}`}><Trash2 size={15} /></button>}
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

      {editing && <PaymentForm open initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload() }} />}
      <ConfirmDialog open={Boolean(removing)} title="¿Eliminar este pago?" busy={deleting} confirmLabel="Eliminar pago"
        description={removing ? `Se quitará el pago de ${formatCurrency(removing.amount)} de ${customerName(removing.customer)} de los reportes. Esta acción no se puede deshacer desde la aplicación.` : ''}
        onConfirm={confirmDelete} onCancel={() => setRemoving(null)} />
    </div>
  )
}
