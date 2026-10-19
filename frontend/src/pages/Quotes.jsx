import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { LoaderCircle, MessageCircle, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import RecordPicker from '../components/ui/RecordPicker.jsx'
import { Alert, Badge, Button, ConfirmDialog, DataCard, DraftNotice, EmptyState, ErrorAlert, FilterSelect, FormPage, IconButton, Input, Pagination, SearchField, Select, TableSkeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { useDraft } from '../hooks/useDraft.js'
import { useRecord } from '../hooks/useRecord.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'
import { QUOTE_STATUSES, WRITE_ROLES } from '../utils/constants.js'
import { friendlyError } from '../utils/errors.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import { customerName } from '../components/repairs/repairForm.js'

const toMoney = (value) => Math.round(Number(value || 0) * 100) / 100

function QuoteForm({ initial, onDone }) {
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const [form, setForm, draft] = useDraft(editing ? null : 'quote-new', {
    customer: initial?.customer ? { id: initial.customer_id, ...initial.customer } : null,
    repair: null,
    labor_cost: initial?.labor_cost ?? '', discount: initial?.discount || '', tax_rate: initial?.tax_rate ?? '0', deposit: initial?.deposit || '',
    valid_until: initial?.valid_until?.slice(0, 10) ?? '', notes: initial?.notes ?? '', status: initial?.status ?? 'pendiente',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const set = (key) => (event) => { const { value } = event.target; setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: null })) }

  const subtotal = Math.max(0, toMoney(form.labor_cost) - toMoney(form.discount))
  const total = subtotal + subtotal * (Number(form.tax_rate || 0) / 100)
  const balance = Math.max(0, total - toMoney(form.deposit))

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!form.customer) next.customer = 'Elige al cliente de la cotización.'
    if (form.labor_cost === '' || !(Number(form.labor_cost) >= 0)) next.labor_cost = 'Escribe el costo del servicio, por ejemplo 850.'
    if (toMoney(form.discount) > toMoney(form.labor_cost)) next.discount = 'Usa un descuento igual o menor al costo del servicio.'
    const tax = Number(form.tax_rate || 0)
    if (!(tax >= 0 && tax <= 100)) next.tax_rate = 'Usa un porcentaje entre 0 y 100.'
    if (Object.keys(next).length) { setErrors(next); focusFirstInvalid('quote-form'); return }
    const body = { labor_cost: toMoney(form.labor_cost), discount: toMoney(form.discount), tax_rate: tax, deposit: toMoney(form.deposit), notes: form.notes.trim() || null }
    if (!editing) body.customer_id = form.customer.id
    if (form.repair) body.repair_order_id = form.repair.id
    if (form.valid_until) body.valid_until = form.valid_until
    if (editing) body.status = form.status
    setSaving(true); setFormError(null)
    try {
      if (editing) await api.patch(`/quotes/${initial.id}`, body)
      else await api.post('/quotes', body)
      draft.clear()
      toast.success(editing ? 'Cotización actualizada.' : 'Cotización creada.')
      onDone()
    } catch (error) {
      setFormError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage backTo="/cotizaciones" backLabel="Cotizaciones" title={editing ? `Editar ${initial.quote_number ?? 'cotización'}` : 'Crear cotización'} description="El total se calcula con el costo, el descuento y el impuesto."
      notice={draft.restored && <DraftNotice onDiscard={draft.discard} />}
      footer={<><Button onClick={onDone} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="quote-form" busy={saving}>{editing ? 'Guardar cambios' : 'Crear cotización'}</Button></>}>
      <form id="quote-form" onSubmit={submit} noValidate className="tf-form-grid">
        <div className="tf-span-2">
          <RecordPicker label="Cliente" required value={form.customer} error={errors.customer} disabled={editing}
            onChange={(customer) => { setForm((current) => ({ ...current, customer, repair: null })); setErrors((current) => ({ ...current, customer: null })) }}
            path={(q) => `/customers?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            renderLabel={customerName} renderMeta={(customer) => customer.phone || ''} placeholder="María López o 612 123 4567" />
        </div>
        {!editing && form.customer && <div className="tf-span-2">
          <RecordPicker label="Orden de reparación (opcional)" value={form.repair} onChange={(repair) => setForm((current) => ({ ...current, repair }))}
            path={(q) => `/repairs?limit=6&customer_id=${form.customer.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            renderLabel={(repair) => `${repair.order_number}, ${[repair.brand, repair.model].filter(Boolean).join(' ')}`} renderMeta={(repair) => repair.reported_problem}
            placeholder="ORD-0012 o iPhone 13" emptyText="Este cliente no tiene órdenes que coincidan." />
        </div>}
        <Input label="Costo del servicio (MXN)" required type="number" inputMode="decimal" min="0" step="0.01" value={form.labor_cost} onChange={set('labor_cost')} error={errors.labor_cost} placeholder="850.00" />
        <Input label="Descuento (MXN, opcional)" type="number" inputMode="decimal" min="0" step="0.01" value={form.discount} onChange={set('discount')} error={errors.discount} />
        <Input label="Impuesto (%)" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.tax_rate} onChange={set('tax_rate')} error={errors.tax_rate} hint="Escribe 16 para aplicar IVA." />
        <Input label="Anticipo (MXN, opcional)" type="number" inputMode="decimal" min="0" step="0.01" value={form.deposit} onChange={set('deposit')} />
        <Input label="Válida hasta (opcional)" type="date" value={form.valid_until} onChange={set('valid_until')} />
        {editing && <Select label="Estado" value={form.status} onChange={set('status')}>
          {Object.entries(QUOTE_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </Select>}
        <Textarea fieldClassName="tf-span-2" label="Notas para el cliente (opcional)" value={form.notes} onChange={set('notes')} maxLength={5000} placeholder="Incluye pantalla original y 90 días de garantía." className="min-h-[5rem]" hint="Qué incluye, garantía y tiempo estimado." />
        <dl className="tf-span-2 grid grid-cols-3 gap-4 rounded-[var(--tf-radius-control)] border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] p-4 text-sm">
          <div><dt className="text-[var(--tf-text-subtle)]">Subtotal</dt><dd className="tf-num mt-1 text-[var(--tf-text)]">{formatCurrency(subtotal)}</dd></div>
          <div><dt className="text-[var(--tf-text-subtle)]">Total</dt><dd className="tf-num mt-1 font-semibold text-[var(--tf-text)]">{formatCurrency(total)}</dd></div>
          <div><dt className="text-[var(--tf-text-subtle)]">Saldo</dt><dd className="tf-num mt-1 text-[var(--tf-text)]">{formatCurrency(balance)}</dd></div>
        </dl>
        {formError && <div className="tf-span-2"><ErrorAlert error={formError} action="guardar la cotización" /></div>}
      </form>
    </FormPage>
  )
}

export function QuoteFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { record, loading, error, reload } = useRecord(id ? `/quotes/${id}` : null, location.state?.record ?? null)
  const done = () => navigate('/cotizaciones')
  if (id && loading) return <div className="tf-form-page"><Alert tone="info">Cargando la cotización…</Alert></div>
  if (id && (error || !record?.id)) return <div className="tf-form-page space-y-4"><Link to="/cotizaciones" className="tf-form-page-back">Volver a Cotizaciones</Link><ErrorAlert error={error ?? { status: 404 }} action="cargar la cotización" onRetry={reload} /></div>
  return <QuoteForm key={record?.id ?? 'new'} initial={id ? record : null} onDone={done} />
}

export default function Quotes() {
  const { profile, hasPermission } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const list = usePagedResource('/quotes', { filters: { status } })
  const [removing, setRemoving] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [sending, setSending] = useState('')
  const writer = WRITE_ROLES.quotes.includes(profile?.role)
  const canCreate = writer && hasPermission('quotes.create')
  const canEdit = writer && hasPermission('quotes.update')
  const canDelete = WRITE_ROLES.admin.includes(profile?.role) && hasPermission('quotes.delete')
  const canSend = hasPermission('whatsapp.send')
  const filtered = Boolean(list.query || status)
  const clearFilters = () => { list.setQuery(''); setStatus('') }

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
      toast.success(`${removing.quote_number ?? 'Cotización'} eliminada.`)
      setRemoving(null)
      list.reload()
    } catch (error) {
      toast.error(friendlyError(error, 'eliminar la cotización'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Cotizaciones" description="Presupuestos para tus clientes antes de reparar."
        actions={canCreate && <Link to="/cotizaciones/nueva" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Crear cotización</Link>} />

      <DataCard
        toolbar={<>
          <SearchField label="Buscar cotizaciones" value={list.query} onChange={list.setQuery} placeholder="COT-0004 o nota" />
          <FilterSelect label="Estado" ariaLabel="Filtrar por estado" value={status} onChange={setStatus}>
            <option value="">Todos</option>
            {Object.entries(QUOTE_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </FilterSelect>
          {filtered && <Button variant="ghost" onClick={clearFilters}>Quitar filtros</Button>}
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="cotizaciones" />}>
        {list.error ? <div className="p-4"><ErrorAlert error={list.error} action="cargar las cotizaciones" onRetry={list.reload} /></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={6} />
            : !list.rows.length ? (filtered
              ? <EmptyState icon={Receipt} title="No hay cotizaciones con esos filtros" description="Prueba con otro número o cambia el estado." action={<Button onClick={clearFilters}>Quitar filtros</Button>} />
              : <EmptyState icon={Receipt} title="Aún no hay cotizaciones" description="Crea una cotización para que el cliente apruebe el costo antes de reparar."
                action={canCreate && <Link to="/cotizaciones/nueva" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Crear cotización</Link>} />)
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
                                {canSend && <IconButton label={`Enviar ${quote.quote_number ?? 'cotización'} por WhatsApp`} icon={sending === quote.id ? LoaderCircle : MessageCircle} className={sending === quote.id ? '[&_svg]:animate-spin' : ''} aria-busy={sending === quote.id || undefined} onClick={() => send(quote)} disabled={Boolean(sending)} />}
                                {canEdit && <IconButton label={`Editar ${quote.quote_number ?? 'cotización'}`} icon={Pencil} onClick={() => navigate(`/cotizaciones/${quote.id}/editar`, { state: { record: quote } })} />}
                                {canDelete && <IconButton label={`Eliminar ${quote.quote_number ?? 'cotización'}`} icon={Trash2} tone="danger" onClick={() => setRemoving(quote)} />}
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

      <ConfirmDialog open={Boolean(removing)} title={removing ? `¿Eliminar ${removing.quote_number ?? 'la cotización'} de ${customerName(removing.customer)}?` : ''} busy={deleting} confirmLabel="Eliminar cotización"
        description="Dejará de aparecer en la lista y en el historial del cliente. No se puede deshacer desde la aplicación."
        onConfirm={confirmDelete} onCancel={() => setRemoving(null)} />
    </div>
  )
}
