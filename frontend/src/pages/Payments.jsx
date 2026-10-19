import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import RecordPicker from '../components/ui/RecordPicker.jsx'
import { Alert, Badge, Button, ConfirmDialog, DataCard, DraftNotice, EmptyState, ErrorAlert, FilterSelect, FormPage, IconButton, Input, Pagination, SearchField, Select, TableSkeleton } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { useDraft } from '../hooks/useDraft.js'
import { useRecord } from '../hooks/useRecord.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'
import { PAYMENT_METHODS, PAYMENT_STATUSES, WRITE_ROLES } from '../utils/constants.js'
import { friendlyError } from '../utils/errors.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import { customerName } from '../components/repairs/repairForm.js'

function todayInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function emptyPayment() {
  return { customer: null, amount: '', method: 'efectivo', status: 'pagado', reference: '', payment_date: todayInput() }
}

function fromRecord(record) {
  return {
    customer: record.customer ? { id: record.customer_id, ...record.customer } : null,
    amount: String(record.amount ?? ''), method: record.method ?? 'efectivo', status: record.status ?? 'pagado',
    reference: record.reference ?? '', payment_date: record.payment_date?.slice(0, 10) ?? todayInput(),
  }
}

function PaymentForm({ initial, onDone }) {
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const [form, setForm, draft] = useDraft(editing ? null : 'payment-new', editing ? fromRecord(initial) : emptyPayment())
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const set = (key) => (event) => { const { value } = event.target; setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: null })) }

  async function submit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!form.customer) nextErrors.customer = 'Elige al cliente que pagó.'
    const amount = Number(form.amount)
    if (!form.amount || !Number.isFinite(amount) || amount <= 0) nextErrors.amount = 'Escribe un monto mayor a cero, por ejemplo 350.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); focusFirstInvalid('payment-form'); return }
    setSaving(true); setFormError(null)
    const body = { customer_id: form.customer.id, amount: Math.round(amount * 100) / 100, method: form.method, status: form.status, reference: form.reference.trim() || null }
    if (form.payment_date) body.payment_date = new Date(`${form.payment_date}T12:00:00`).toISOString()
    try {
      if (editing) await api.patch(`/payments/${initial.id}`, body)
      else await api.post('/payments', body)
      draft.clear()
      toast.success(editing ? 'Pago actualizado.' : `Pago de ${formatCurrency(body.amount)} registrado.`)
      onDone()
    } catch (error) {
      setFormError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage backTo="/pagos" backLabel="Pagos" title={editing ? 'Editar pago' : 'Registrar pago'} description="Anticipos, pagos parciales o liquidaciones de un cliente."
      notice={draft.restored && <DraftNotice onDiscard={draft.discard} />}
      footer={<><Button onClick={onDone} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="payment-form" busy={saving}>{editing ? 'Guardar cambios' : 'Registrar pago'}</Button></>}>
      <form id="payment-form" onSubmit={submit} noValidate className="tf-form-grid">
        <div className="tf-span-2">
          <RecordPicker label="Cliente" required value={form.customer} error={errors.customer} disabled={editing}
            onChange={(customer) => { setForm((current) => ({ ...current, customer })); setErrors((current) => ({ ...current, customer: null })) }}
            path={(q) => `/customers?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            renderLabel={customerName} renderMeta={(customer) => customer.phone || customer.email || ''} placeholder="María López o 612 123 4567"
            hint={editing ? 'El cliente de un pago registrado no se cambia.' : undefined}
            emptyText="No hay clientes con ese nombre. Regístralo primero en Clientes." />
        </div>
        <Input label="Monto (MXN)" required type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} error={errors.amount} placeholder="350.00" />
        <Input label="Fecha del pago" type="date" value={form.payment_date} onChange={set('payment_date')} />
        <Select label="Método" value={form.method} onChange={set('method')}>
          {Object.entries(PAYMENT_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select label="Estado" value={form.status} onChange={set('status')} hint="Pendiente: el cliente aún no paga.">
          {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Input fieldClassName="tf-span-2" label="Referencia (opcional)" value={form.reference} onChange={set('reference')} maxLength={200} placeholder="Folio 004512" hint="Folio de terminal, número de transferencia o una nota corta." />
        {formError && <div className="tf-span-2"><ErrorAlert error={formError} action="guardar el pago" /></div>}
      </form>
    </FormPage>
  )
}

export function PaymentFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { record, loading, error, reload } = useRecord(id ? `/payments/${id}` : null, location.state?.record ?? null)
  const done = () => navigate('/pagos')
  if (id && loading) return <div className="tf-form-page"><Alert tone="info">Cargando el pago…</Alert></div>
  if (id && (error || !record?.id)) return <div className="tf-form-page space-y-4"><Link to="/pagos" className="tf-form-page-back">Volver a Pagos</Link><ErrorAlert error={error ?? { status: 404 }} action="cargar el pago" onRetry={reload} /></div>
  return <PaymentForm key={record?.id ?? 'new'} initial={id ? record : null} onDone={done} />
}

export default function Payments() {
  const { profile, hasPermission } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const list = usePagedResource('/payments', { filters: { status } })
  const [removing, setRemoving] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const canWrite = WRITE_ROLES.payments.includes(profile?.role) && hasPermission('payments.create')
  const canEdit = WRITE_ROLES.payments.includes(profile?.role) && hasPermission('payments.update')
  const canDelete = WRITE_ROLES.admin.includes(profile?.role) && hasPermission('payments.delete')
  const filtered = Boolean(list.query || status)
  const clearFilters = () => { list.setQuery(''); setStatus('') }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.delete(`/payments/${removing.id}`)
      toast.success(`Pago de ${formatCurrency(removing.amount)} eliminado.`)
      setRemoving(null)
      list.reload()
    } catch (error) {
      toast.error(friendlyError(error, 'eliminar el pago'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Pagos" description="Anticipos, pagos parciales y liquidaciones de tus clientes."
        actions={canWrite && <Link to="/pagos/nuevo" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar pago</Link>} />

      <DataCard
        toolbar={<>
          <SearchField label="Buscar pagos por referencia" value={list.query} onChange={list.setQuery} placeholder="Folio o nota" />
          <FilterSelect label="Estado" ariaLabel="Filtrar por estado" value={status} onChange={setStatus}>
            <option value="">Todos</option>
            {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </FilterSelect>
          {filtered && <Button variant="ghost" onClick={clearFilters}>Quitar filtros</Button>}
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="pagos" />}>
        {list.error ? <div className="p-4"><ErrorAlert error={list.error} action="cargar los pagos" onRetry={list.reload} /></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={6} />
            : !list.rows.length ? (filtered
              ? <EmptyState icon={CreditCard} title="No hay pagos con esos filtros" description="Prueba con otra referencia o cambia el estado." action={<Button onClick={clearFilters}>Quitar filtros</Button>} />
              : <EmptyState icon={CreditCard} title="Aún no hay pagos registrados" description="Registra anticipos y liquidaciones para saber cuánto has cobrado y cuánto falta."
                action={canWrite && <Link to="/pagos/nuevo" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Registrar pago</Link>} />)
              : (
                <div className="ct-table-shell" aria-busy={list.loading}>
                  <table className="ct-table min-w-[44rem]">
                    <thead><tr><th scope="col">Cliente</th><th scope="col" className="tf-cell-num">Monto</th><th scope="col">Método</th><th scope="col">Referencia</th><th scope="col">Estado</th><th scope="col">Fecha</th>{(canEdit || canDelete) && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
                    <tbody>
                      {list.rows.map((payment) => {
                        const meta = PAYMENT_STATUSES[payment.status]
                        const who = customerName(payment.customer)
                        return (
                          <tr key={payment.id}>
                            <td className="tf-cell-strong">{who}</td>
                            <td className="tf-cell-num text-[var(--tf-text)]">{formatCurrency(payment.amount)}</td>
                            <td>{PAYMENT_METHODS[payment.method] ?? payment.method}</td>
                            <td className="max-w-[14rem] truncate">{payment.reference || '—'}</td>
                            <td><Badge tone={meta?.tone}>{meta?.label ?? payment.status}</Badge></td>
                            <td className="whitespace-nowrap">{formatDate(payment.payment_date)}</td>
                            {(canEdit || canDelete) && <td className="text-right">
                              <div className="inline-flex gap-1">
                                {canEdit && <IconButton label={`Editar pago de ${who}`} icon={Pencil} onClick={() => navigate(`/pagos/${payment.id}/editar`, { state: { record: payment } })} />}
                                {canDelete && <IconButton label={`Eliminar pago de ${who}`} icon={Trash2} tone="danger" onClick={() => setRemoving(payment)} />}
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

      <ConfirmDialog open={Boolean(removing)} busy={deleting} confirmLabel="Eliminar pago"
        title={removing ? `¿Eliminar el pago de ${formatCurrency(removing.amount)} de ${customerName(removing.customer)}?` : ''}
        description="Dejará de contar en los cobros y reportes del taller. No se puede deshacer desde la aplicación."
        onConfirm={confirmDelete} onCancel={() => setRemoving(null)} />
    </div>
  )
}
