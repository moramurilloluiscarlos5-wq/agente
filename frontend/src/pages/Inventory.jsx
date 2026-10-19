import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownUp, Package, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Button, ConfirmDialog, DataCard, DraftNotice, EmptyState, ErrorAlert, FilterSelect, FormPage, IconButton, Input, Pagination, SearchField, Select, TableSkeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { useDraft } from '../hooks/useDraft.js'
import { useRecord } from '../hooks/useRecord.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'
import { INVENTORY_CATEGORIES, WRITE_ROLES } from '../utils/constants.js'
import { friendlyError } from '../utils/errors.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { formatCurrency } from '../utils/formatters.js'

const FIELDS = ['name', 'sku', 'category', 'brand', 'compatible_model', 'supplier', 'location', 'cost', 'suggested_price', 'quantity', 'min_stock']

function money(value) {
  if (value === '' || value == null) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : NaN
}

function ItemForm({ initial, showCost, onDone }) {
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const [form, setForm, draft] = useDraft(editing ? null : 'inventory-new', Object.fromEntries(FIELDS.map((key) => [key, initial?.[key] ?? (key === 'category' ? 'Pantallas' : key === 'quantity' || key === 'min_stock' ? (editing ? '' : '0') : '')])))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const set = (key) => (event) => { const { value } = event.target; setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: null })) }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!String(form.name).trim()) next.name = 'Escribe el nombre de la refacción.'
    if (!String(form.sku).trim()) next.sku = 'Escribe un código interno, por ejemplo PAN-IP13.'
    for (const key of ['cost', 'suggested_price']) if (Number.isNaN(money(form[key]))) next[key] = 'Escribe un importe en pesos, por ejemplo 450.'
    for (const key of editing ? ['min_stock'] : ['quantity', 'min_stock']) {
      if (form[key] !== '' && (!Number.isInteger(Number(form[key])) || Number(form[key]) < 0)) next[key] = 'Escribe un número entero, por ejemplo 5.'
    }
    if (Object.keys(next).length) { setErrors(next); focusFirstInvalid('item-form'); return }
    const body = {}
    for (const key of ['name', 'sku', 'category', 'brand', 'compatible_model', 'supplier', 'location']) {
      const value = String(form[key] ?? '').trim()
      if (value || editing) body[key] = value || null
    }
    if (body.name === null) delete body.name
    if (body.sku === null) delete body.sku
    if (showCost && money(form.cost) !== undefined) body.cost = money(form.cost)
    if (money(form.suggested_price) !== undefined) body.suggested_price = money(form.suggested_price)
    if (!editing && form.quantity !== '') body.quantity = Number(form.quantity)
    if (form.min_stock !== '') body.min_stock = Number(form.min_stock)
    setSaving(true); setFormError(null)
    try {
      if (editing) await api.patch(`/inventory/${initial.id}`, body)
      else await api.post('/inventory', body)
      draft.clear()
      toast.success(editing ? 'Artículo actualizado.' : `${String(form.name).trim()} agregado al inventario.`)
      onDone()
    } catch (error) {
      setFormError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage backTo="/inventario" backLabel="Inventario" title={editing ? `Editar ${initial.name}` : 'Agregar artículo'} description={editing ? 'Para cambiar las existencias usa “Mover stock”, así queda registro.' : 'Refacciones, herramientas o accesorios que maneja el taller.'}
      notice={draft.restored && <DraftNotice onDiscard={draft.discard} />}
      footer={<><Button onClick={onDone} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="item-form" busy={saving}>{editing ? 'Guardar cambios' : 'Agregar artículo'}</Button></>}>
      <form id="item-form" onSubmit={submit} noValidate className="tf-form-grid">
        <Input fieldClassName="tf-span-2" label="Nombre" required value={form.name} onChange={set('name')} error={errors.name} maxLength={200} placeholder="Pantalla iPhone 13 OLED" />
        <Input label="SKU" required value={form.sku} onChange={set('sku')} error={errors.sku} maxLength={50} placeholder="PAN-IP13" />
        <Select label="Categoría" required value={form.category} onChange={set('category')}>
          {Object.entries(INVENTORY_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Input label="Marca (opcional)" value={form.brand} onChange={set('brand')} maxLength={100} placeholder="Apple" />
        <Input label="Modelo compatible (opcional)" value={form.compatible_model} onChange={set('compatible_model')} maxLength={150} placeholder="iPhone 13, 13 Pro" />
        {showCost && <Input label="Costo (MXN)" type="number" inputMode="decimal" min="0" step="0.01" value={form.cost} onChange={set('cost')} error={errors.cost} />}
        <Input label="Precio sugerido (MXN)" type="number" inputMode="decimal" min="0" step="0.01" value={form.suggested_price} onChange={set('suggested_price')} error={errors.suggested_price} />
        {!editing && <Input label="Existencias iniciales" type="number" inputMode="numeric" min="0" step="1" value={form.quantity} onChange={set('quantity')} error={errors.quantity} />}
        <Input label="Stock mínimo" type="number" inputMode="numeric" min="0" step="1" value={form.min_stock} onChange={set('min_stock')} error={errors.min_stock} hint="Te avisamos cuando quede esta cantidad o menos." />
        <Input label="Proveedor (opcional)" value={form.supplier} onChange={set('supplier')} maxLength={150} placeholder="Refacciones del Pacífico" />
        <Input label="Ubicación (opcional)" value={form.location} onChange={set('location')} maxLength={100} placeholder="Cajón A2" />
        {formError && <div className="tf-span-2"><ErrorAlert error={formError} action="guardar el artículo" /></div>}
      </form>
    </FormPage>
  )
}

function StockForm({ item, onDone }) {
  const toast = useToast()
  const [type, setType] = useState('entrada')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [requestError, setRequestError] = useState(null)
  const [saving, setSaving] = useState(false)
  const current = Number(item.quantity ?? 0)
  const amount = Number(quantity)
  const preview = !quantity || !Number.isInteger(amount) ? null : type === 'entrada' ? current + amount : type === 'salida' ? current - amount : amount

  async function submit(event) {
    event.preventDefault()
    if (!Number.isInteger(amount) || amount <= 0) { setError(type === 'ajuste' ? 'Escribe cuántas piezas contaste, por ejemplo 4.' : 'Escribe una cantidad entera mayor a cero.'); focusFirstInvalid('stock-form'); return }
    if (type === 'salida' && amount > current) { setError(`Hay ${current} en existencia; usa una cantidad igual o menor.`); focusFirstInvalid('stock-form'); return }
    setSaving(true); setError(''); setRequestError(null)
    try {
      await api.post(`/inventory/${item.id}/movements`, { movement_type: type, quantity: amount, reason: reason.trim() || null })
      toast.success(`Movimiento registrado: ${item.name}.`)
      onDone()
    } catch (err) {
      setRequestError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage backTo="/inventario" backLabel="Inventario" title={`Mover stock de ${item.name}`} description={`Existencias actuales: ${current}. Cada movimiento queda registrado.`}
      footer={<><Button onClick={onDone} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="stock-form" busy={saving}>Registrar movimiento</Button></>}>
      <form id="stock-form" onSubmit={submit} noValidate className="space-y-6">
        <fieldset>
          <legend className="tf-label">Tipo de movimiento</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {[['entrada', 'Entrada', 'Llegó mercancía'], ['salida', 'Salida', 'Se usó o vendió'], ['ajuste', 'Ajuste', 'Conteo físico']].map(([value, label, hint]) => (
              <label key={value} className={`cursor-pointer rounded-[var(--tf-radius-control)] border px-3 py-3 text-sm ${type === value ? 'border-[var(--tf-accent)] bg-[var(--tf-accent-soft)] text-[var(--tf-text)]' : 'border-[var(--tf-border-strong)] text-[var(--tf-text-muted)] hover:border-[rgba(148,163,184,.36)]'}`}>
                <input type="radio" name="movement" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
                <span className="block font-medium">{label}</span><span className="block text-xs text-[var(--tf-text-subtle)]">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Input label={type === 'ajuste' ? 'Cantidad contada' : 'Cantidad'} required type="number" inputMode="numeric" min="1" step="1" value={quantity} error={error} onChange={(event) => { setQuantity(event.target.value); setError('') }}
          hint={preview == null ? 'Piezas completas.' : `Quedarán ${preview} en existencia.`} />
        <Textarea label="Motivo (opcional)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Usada en la orden CAR-2026-0042" className="min-h-[4rem]" />
        {requestError && <ErrorAlert error={requestError} action="registrar el movimiento" />}
      </form>
    </FormPage>
  )
}

function useItemRoute() {
  const { id } = useParams()
  const location = useLocation()
  return { id, ...useRecord(id ? `/inventory/${id}` : null, location.state?.record ?? null) }
}

function ItemLoadState({ loading, error, reload }) {
  if (loading) return <div className="tf-form-page"><Alert tone="info">Cargando el artículo…</Alert></div>
  if (error) return <div className="tf-form-page space-y-4"><Link to="/inventario" className="tf-form-page-back">Volver a Inventario</Link><ErrorAlert error={error} action="cargar el artículo" onRetry={reload} /></div>
  return null
}

export function ItemFormPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const { id, record, loading, error, reload } = useItemRoute()
  if (id && (loading || error || !record?.id)) return <ItemLoadState loading={loading} error={error ?? (!loading ? { status: 404 } : null)} reload={reload} />
  return <ItemForm key={record?.id ?? 'new'} initial={id ? record : null} showCost={hasPermission('inventory.view_cost')} onDone={() => navigate('/inventario')} />
}

export function StockFormPage() {
  const navigate = useNavigate()
  const { record, loading, error, reload } = useItemRoute()
  if (loading || error || !record?.id) return <ItemLoadState loading={loading} error={error ?? (!loading ? { status: 404 } : null)} reload={reload} />
  return <StockForm key={record.id} item={record} onDone={() => navigate('/inventario')} />
}

export default function Inventory() {
  const { profile, hasPermission } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const list = usePagedResource('/inventory', { filters: { category, low_stock: lowOnly ? 'true' : '' } })
  const [removing, setRemoving] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const writer = WRITE_ROLES.inventory.includes(profile?.role)
  const canCreate = writer && hasPermission('inventory.create')
  const canEdit = writer && hasPermission('inventory.update')
  const canMove = writer && hasPermission('inventory.adjust_stock')
  const canDelete = WRITE_ROLES.admin.includes(profile?.role) && hasPermission('inventory.update')
  const showCost = hasPermission('inventory.view_cost')
  const filtered = Boolean(list.query || category || lowOnly)
  const clearFilters = () => { list.setQuery(''); setCategory(''); setLowOnly(false) }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.delete(`/inventory/${removing.id}`)
      toast.success(`${removing.name} eliminado del inventario.`)
      setRemoving(null)
      list.reload()
    } catch (error) {
      toast.error(friendlyError(error, 'eliminar el artículo'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Inventario" description="Refacciones disponibles, precios y avisos de stock bajo."
        actions={canCreate && <Link to="/inventario/nuevo" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Agregar artículo</Link>} />

      <DataCard
        toolbar={<>
          <SearchField label="Buscar en inventario" value={list.query} onChange={list.setQuery} placeholder="Pantalla, PAN-IP13 o iPhone 13" />
          <FilterSelect label="Categoría" ariaLabel="Filtrar por categoría" value={category} onChange={setCategory}>
            <option value="">Todas</option>
            {Object.entries(INVENTORY_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </FilterSelect>
          <label className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--tf-text-muted)]">
            <input type="checkbox" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} className="h-4 w-4 accent-[var(--tf-primary)]" />Solo stock bajo
          </label>
          {filtered && <Button variant="ghost" onClick={clearFilters}>Quitar filtros</Button>}
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="artículos" />}>
        {list.error ? <div className="p-4"><ErrorAlert error={list.error} action="cargar el inventario" onRetry={list.reload} /></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={6} />
            : !list.rows.length ? (filtered
              ? <EmptyState icon={Package} title="Nada coincide con tu búsqueda" description="Prueba con otro nombre o cambia la categoría." action={<Button onClick={clearFilters}>Quitar filtros</Button>} />
              : <EmptyState icon={Package} title="El inventario está vacío" description="Agrega las refacciones que manejas para saber qué tienes y qué pedir."
                action={canCreate && <Link to="/inventario/nuevo" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Agregar artículo</Link>} />)
              : (
                <div className="ct-table-shell" aria-busy={list.loading}>
                  <table className="ct-table min-w-[48rem]">
                    <thead><tr><th scope="col">Artículo</th><th scope="col">Categoría</th><th scope="col">SKU</th><th scope="col" className="tf-cell-num">Existencias</th>{showCost && <th scope="col" className="tf-cell-num">Costo</th>}<th scope="col" className="tf-cell-num">Precio</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
                    <tbody>
                      {list.rows.map((item) => {
                        const low = Number(item.quantity ?? 0) <= Number(item.min_stock ?? 0)
                        return (
                          <tr key={item.id}>
                            <td><p className="font-medium text-[var(--tf-text)]">{item.name}</p><p className="mt-1 text-xs text-[var(--tf-text-subtle)]">{[item.brand, item.compatible_model].filter(Boolean).join(', ') || 'Uso general'}</p></td>
                            <td>{INVENTORY_CATEGORIES[item.category] ?? item.category}</td>
                            <td className="tf-num">{item.sku}</td>
                            <td className="tf-cell-num">
                              <span className={`inline-flex items-center gap-2 ${low ? 'text-[var(--tf-warning)]' : 'text-[var(--tf-text)]'}`}>
                                {low && <TriangleAlert size={14} aria-hidden="true" />}{item.quantity ?? 0}{low && <span className="sr-only"> (stock bajo)</span>}
                              </span>
                              <span className="block text-xs text-[var(--tf-text-subtle)]">mín. {item.min_stock ?? 0}</span>
                            </td>
                            {showCost && <td className="tf-cell-num">{item.cost == null ? '—' : formatCurrency(item.cost)}</td>}
                            <td className="tf-cell-num">{item.suggested_price == null ? '—' : formatCurrency(item.suggested_price)}</td>
                            <td className="text-right">
                              <div className="inline-flex gap-1">
                                {canMove && <IconButton label={`Mover stock de ${item.name}`} icon={ArrowDownUp} onClick={() => navigate(`/inventario/${item.id}/movimiento`, { state: { record: item } })} />}
                                {canEdit && <IconButton label={`Editar ${item.name}`} icon={Pencil} onClick={() => navigate(`/inventario/${item.id}/editar`, { state: { record: item } })} />}
                                {canDelete && <IconButton label={`Eliminar ${item.name}`} icon={Trash2} tone="danger" onClick={() => setRemoving(item)} />}
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

      <ConfirmDialog open={Boolean(removing)} title={removing ? `¿Eliminar “${removing.name}” del inventario?` : ''} busy={deleting} confirmLabel="Eliminar artículo"
        description="Dejará de aparecer en el inventario. Su historial de movimientos se conserva."
        onConfirm={confirmDelete} onCancel={() => setRemoving(null)} />
    </div>
  )
}
