import { useState } from 'react'
import { MessageCircle, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import RecordPicker from '../components/ui/RecordPicker.jsx'
import { Alert, Badge, Button, ConfirmDialog, DataCard, Dialog, EmptyState, Input, Pagination, SearchField, Select, TableSkeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'
import { QUOTE_STATUSES, WRITE_ROLES } from '../utils/constants.js'
import { friendlyError } from '../utils/errors.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import { customerName } from '../components/repairs/repairForm.js'

const toMoney = (value) => Math.round(Number(value || 0) * 100) / 100

function QuoteForm({ initial, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const [form, setForm] = useState(() => ({
    customer: initial?.customer ? { id: initial.customer_id, ...initial.customer } : null,
    repair: null,
    labor_cost: initial?.labor_cost ?? '', discount: initial?.discount || '', tax_rate: initial?.tax_rate ?? '0', deposit: initial?.deposit || '',
    valid_until: initial?.valid_until?.slice(0, 10) ?? '', notes: initial?.notes ?? '', status: initial?.status ?? 'pendiente',
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const set = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setErrors((current) => ({ ...current, [key]: null })) }

  const subtotal = Math.max(0, toMoney(form.labor_cost) - toMoney(form.discount))
  const total = subtotal + subtotal * (Number(form.tax_rate || 0) / 100)
  const balance = Math.max(0, total - toMoney(form.deposit))

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!form.customer) next.customer = 'Elige al cliente de la cotización.'
    if (form.labor_cost === '' || !(Number(form.labor_cost) >= 0)) next.labor_cost = 'Escribe el costo del servicio.'
    if (toMoney(form.discount) > toMoney(form.labor_cost)) next.discount = 'El descuento no puede ser mayor que el costo.'
    const tax = Number(form.tax_rate || 0)
    if (!(tax >= 0 && tax <= 100)) next.tax_rate = 'Usa un porcentaje entre 0 y 100.'
    if (Object.keys(next).length) { setErrors(next); return }
    const body = { labor_cost: toMoney(form.labor_cost), discount: toMoney(form.discount), tax_rate: tax, deposit: toMoney(form.deposit), notes: form.notes.trim() || null }
    if (!editing) body.customer_id = form.customer.id
    if (form.repair) body.repair_order_id = form.repair.id
    if (form.valid_until) body.valid_until = form.valid_until
    if (editing) body.status = form.status
    setSaving(true); setFormError('')
    try {
      if (editing) await api.patch(`/quotes/${initial.id}`, body)
      else await api.post('/quotes', body)
      toast.success(editing ? 'Cotización actualizada.' : 'Cotización creada.')
      onSaved()
    } catch (error) {
      setFormError(friendlyError(error, 'guardar la cotización'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open wide onClose={saving ? undefined : onClose} title={editing ? `Editar ${initial.quote_number ?? 'cotización'}` : 'Nueva cotización'} description="El total se calcula con el costo, el descuento y el impuesto."
      footer={<><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="quote-form" busy={saving}>{editing ? 'Guardar cambios' : 'Crear cotización'}</Button></>}>
      <form id="quote-form" onSubmit={submit} noValidate className="tf-form-grid">
        <div className="tf-span-2">
          <RecordPicker label="Cliente" required value={form.customer} error={errors.customer} disabled={editing}
            onChange={(customer) => { setForm((current) => ({ ...current, customer, repair: null })); setErrors((current) => ({ ...current, customer: null })) }}
            path={(q) => `/customers?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            renderLabel={customerName} renderMeta={(customer) => customer.phone || ''} placeholder="Nombre o teléfono" />
        </div>
        {!editing && form.customer && <div className="tf-span-2">
          <RecordPicker label="Orden de reparación (opcional)" value={form.repair} onChange={(repair) => setForm((current) => ({ ...current, repair }))}
            path={(q) => `/repairs?limit=6&customer_id=${form.customer.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            renderLabel={(repair) => `${repair.order_number}, ${[repair.brand, repair.model].filter(Boolean).join(' ')}`} renderMeta={(repair) => repair.reported_problem}
            placeholder="Número de orden o equipo" emptyText="Este cliente no tiene órdenes que coincidan." />
        </div>}
        <Input label="Costo del servicio (MXN)" required type="number" inputMode="decimal" min="0" step="0.01" value={form.labor_cost} onChange={set('labor_cost')} error={errors.labor_cost} />
        <Input label="Descuento (MXN)" type="number" inputMode="decimal" min="0" step="0.01" value={form.discount} onChange={set('discount')} error={errors.discount} />
        <Input label="Impuesto (%)" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.tax_rate} onChange={set('tax_rate')} error={errors.tax_rate} hint="Escribe 16 para aplicar IVA." />
        <Input label="Anticipo (MXN)" type="number" inputMode="decimal" min="0" step="0.01" value={form.deposit} onChange={set('deposit')} />
        <Input label="Válida hasta" type="date" value={form.valid_until} onChange={set('valid_until')} />
        {editing && <Select label="Estado" value={form.status} onChange={set('status')}>
          {Object.entries(QUOTE_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </Select>}
        <Textarea fieldClassName="tf-span-2" label="Notas para el cliente" value={form.notes} onChange={set('notes')} maxLength={5000} placeholder="Qué incluye, garantía y tiempo estimado" className="min-h-[4.5rem]" />
        <dl className="tf-span-2 grid grid-cols-3 gap-3 rounded-[var(--tf-radius-control)] border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] p-3 text-[0.8125rem]">
          <div><dt className="text-[var(--tf-text-subtle)]">Subtotal</dt><dd className="tf-num mt-0.5 text-[var(--tf-text)]">{formatCurrency(subtotal)}</dd></div>
          <div><dt className="text-[var(--tf-text-subtle)]">Total</dt><dd className="tf-num mt-0.5 font-semibold text-[var(--tf-text)]">{formatCurrency(total)}</dd></div>
          <div><dt className="text-[var(--tf-text-subtle)]">Saldo</dt><dd className="tf-num mt-0.5 text-[var(--tf-text)]">{formatCurrency(balance)}</dd></div>
        </dl>
        {formError && <div className="tf-span-2"><Alert tone="error">{formError}</Alert></div>}
      </form>
    </Dialog>
  )
}

export default function Quotes() {
  const { profile, hasPermission } = useAuth()
  const toast = useToast()
  const [status, setStatus] = useState('')
  const list = usePagedResource('/quotes', { filters: { status } })
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [sending, setSending] = useState('')
  const writer = WRITE_ROLES.quotes.includes(profile?.role)
  const canCreate = writer && hasPermission('quotes.create')
  const canEdit = writer && hasPermission('quotes.update')
  const canDelete = WRITE_ROLES.admin.includes(profile?.role) && hasPermission('quotes.delete')
  const canSend = hasPermission('whatsapp.send')
  const filtered = Boolean(list.query || status)

  async function send(quote) {
    setSending(quote.id)
    try {
      const response = await api.post(`/whatsapp/quotes/${encodeURIComponent(quote.id)}`, {})
      toast.success(response.simulated ? 'Envío simulado: WhatsApp aún no está conectado.' : `Cotización enviada por WhatsApp a ${customerName(quote.customer)}.`)
    } catch (error) {
      toast.error(friendlyError(error, 'enviar la cotización'))
    } finally {
      setSending('')
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.delete(`/quotes/${removing.id}`)
      toast.success('Cotización eliminada.')
      setRemoving(null)
      list.reload()
    } catch (error) {
      toast.error(friendlyError(error, 'eliminar la cotización'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Cotizaciones" description="Presupuestos para tus clientes antes de reparar."
        actions={canCreate && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Nueva cotización</Button>} />

      <DataCard
        toolbar={<>
          <SearchField label="Buscar cotizaciones" value={list.query} onChange={list.setQuery} placeholder="Número o nota" />
          <select aria-label="Filtrar por estado" className="ct-select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(QUOTE_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="cotizaciones" />}>
        {list.error ? <div className="p-4"><Alert tone="error" action={<Button size="sm" onClick={list.reload}>Reintentar</Button>}>{friendlyError(list.error, 'cargar las cotizaciones')}</Alert></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={6} />
            : !list.rows.length ? <EmptyState icon={Receipt} title={filtered ? 'No hay cotizaciones con esos filtros' : 'Aún no hay cotizaciones'}
                description={filtered ? 'Prueba con otro número o cambia el estado.' : 'Crea una cotización para que el cliente apruebe el costo antes de reparar.'}
                action={!filtered && canCreate && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Nueva cotización</Button>} />
              : (
                <div className="ct-table-shell" aria-busy={list.loading}>
                  <table className="ct-table min-w-[46rem]">
                    <thead><tr><th scope="col">Número</th><th scope="col">Cliente</th><th scope="col" className="tf-cell-num">Total</th><th scope="col">Estado</th><th scope="col">Válida hasta</th><th scope="col">Creada</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
                    <tbody>
                      {list.rows.map((quote) => {
                        const meta = QUOTE_STATUSES[quote.status]
                        return (
                          <tr key={quote.id}>
                            <td className="tf-num font-medium text-[var(--tf-text)]">{quote.quote_number ?? '—'}</td>
                            <td>{customerName(quote.customer)}</td>
                            <td className="tf-cell-num text-[var(--tf-text)]">{formatCurrency(quote.total)}</td>
                            <td><Badge tone={meta?.tone}>{meta?.label ?? quote.status}</Badge></td>
                            <td className="whitespace-nowrap">{formatDate(quote.valid_until)}</td>
                            <td className="whitespace-nowrap">{formatDate(quote.created_at)}</td>
                            <td className="text-right">
                              <div className="inline-flex gap-1">
                                {canSend && <button type="button" className="tf-icon-btn" onClick={() => send(quote)} disabled={Boolean(sending)} aria-label={`Enviar ${quote.quote_number ?? 'cotización'} por WhatsApp`} title="Enviar por WhatsApp"><MessageCircle size={15} className={sending === quote.id ? 'animate-pulse' : ''} /></button>}
                                {canEdit && <button type="button" className="tf-icon-btn" onClick={() => setEditing(quote)} aria-label={`Editar ${quote.quote_number ?? 'cotización'}`} title="Editar"><Pencil size={15} /></button>}
                                {canDelete && <button type="button" className="tf-icon-btn" onClick={() => setRemoving(quote)} aria-label={`Eliminar ${quote.quote_number ?? 'cotización'}`} title="Eliminar"><Trash2 size={15} /></button>}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
      </DataCard>

      {editing && <QuoteForm initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload() }} />}
      <ConfirmDialog open={Boolean(removing)} title="¿Eliminar esta cotización?" busy={deleting} confirmLabel="Eliminar cotización"
        description={removing ? `${removing.quote_number ?? 'La cotización'} de ${customerName(removing.customer)} dejará de aparecer en la lista.` : ''}
        onConfirm={confirmDelete} onCancel={() => setRemoving(null)} />
    </div>
  )
}
