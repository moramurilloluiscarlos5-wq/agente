import { useState } from 'react'
import { ArrowDownUp, Package, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Button, ConfirmDialog, DataCard, Dialog, EmptyState, Input, Pagination, SearchField, Select, TableSkeleton, Textarea } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'
import { INVENTORY_CATEGORIES, WRITE_ROLES } from '../utils/constants.js'
import { friendlyError } from '../utils/errors.js'
import { formatCurrency } from '../utils/formatters.js'

const FIELDS = ['name', 'sku', 'category', 'brand', 'compatible_model', 'supplier', 'location', 'cost', 'suggested_price', 'quantity', 'min_stock']

function money(value) {
  if (value === '' || value == null) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : NaN
}

function ItemForm({ initial, showCost, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((key) => [key, initial?.[key] ?? (key === 'category' ? 'Pantallas' : key === 'quantity' || key === 'min_stock' ? (editing ? '' : '0') : '')])))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const set = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setErrors((current) => ({ ...current, [key]: null })) }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!String(form.name).trim()) next.name = 'Escribe el nombre de la refacción.'
    if (!String(form.sku).trim()) next.sku = 'Escribe un código interno (SKU).'
    for (const key of ['cost', 'suggested_price']) if (Number.isNaN(money(form[key]))) next[key] = 'Escribe un importe válido.'
    for (const key of editing ? ['min_stock'] : ['quantity', 'min_stock']) {
      if (form[key] !== '' && (!Number.isInteger(Number(form[key])) || Number(form[key]) < 0)) next[key] = 'Escribe un número entero.'
    }
    if (Object.keys(next).length) { setErrors(next); return }
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
    setSaving(true); setFormError('')
    try {
      if (editing) await api.patch(`/inventory/${initial.id}`, body)
      else await api.post('/inventory', body)
      toast.success(editing ? 'Artículo actualizado.' : 'Artículo agregado al inventario.')
      onSaved()
    } catch (error) {
      setFormError(friendlyError(error, 'guardar el artículo'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open wide onClose={saving ? undefined : onClose} title={editing ? 'Editar artículo' : 'Agregar artículo'} description={editing ? 'Para cambiar las existencias usa “Mover stock”, así queda registro.' : 'Refacciones, herramientas o accesorios que maneja el taller.'}
      footer={<><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="item-form" busy={saving}>{editing ? 'Guardar cambios' : 'Agregar artículo'}</Button></>}>
      <form id="item-form" onSubmit={submit} noValidate className="tf-form-grid">
        <Input fieldClassName="tf-span-2" label="Nombre" required value={form.name} onChange={set('name')} error={errors.name} maxLength={200} placeholder="Pantalla iPhone 13 OLED" />
        <Input label="SKU" required value={form.sku} onChange={set('sku')} error={errors.sku} maxLength={50} placeholder="PAN-IP13" />
        <Select label="Categoría" required value={form.category} onChange={set('category')}>
          {Object.entries(INVENTORY_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Input label="Marca" value={form.brand} onChange={set('brand')} maxLength={100} />
        <Input label="Modelo compatible" value={form.compatible_model} onChange={set('compatible_model')} maxLength={150} placeholder="iPhone 13, 13 Pro" />
        {showCost && <Input label="Costo (MXN)" type="number" inputMode="decimal" min="0" step="0.01" value={form.cost} onChange={set('cost')} error={errors.cost} />}
        <Input label="Precio sugerido (MXN)" type="number" inputMode="decimal" min="0" step="0.01" value={form.suggested_price} onChange={set('suggested_price')} error={errors.suggested_price} />
        {!editing && <Input label="Existencias iniciales" type="number" inputMode="numeric" min="0" step="1" value={form.quantity} onChange={set('quantity')} error={errors.quantity} />}
        <Input label="Stock mínimo" type="number" inputMode="numeric" min="0" step="1" value={form.min_stock} onChange={set('min_stock')} error={errors.min_stock} hint="Te avisamos cuando quede esta cantidad o menos." />
        <Input label="Proveedor" value={form.supplier} onChange={set('supplier')} maxLength={150} />
        <Input label="Ubicación" value={form.location} onChange={set('location')} maxLength={100} placeholder="Cajón A2" />
        {formError && <div className="tf-span-2"><Alert tone="error">{formError}</Alert></div>}
      </form>
    </Dialog>
  )
}

function StockForm({ item, onClose, onSaved }) {
  const toast = useToast()
  const [type, setType] = useState('entrada')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const current = Number(item.quantity ?? 0)
  const amount = Number(quantity)
  const preview = !quantity || !Number.isInteger(amount) ? null : type === 'entrada' ? current + amount : type === 'salida' ? current - amount : amount

  async function submit(event) {
    event.preventDefault()
    if (!Number.isInteger(amount) || amount <= 0) { setError(type === 'ajuste' ? 'Escribe el conteo real (mayor a cero).' : 'Escribe una cantidad entera mayor a cero.'); return }
    if (type === 'salida' && amount > current) { setError(`Solo hay ${current} en existencia.`); return }
    setSaving(true); setError('')
    try {
      await api.post(`/inventory/${item.id}/movements`, { movement_type: type, quantity: amount, reason: reason.trim() || null })
      toast.success('Movimiento registrado.')
      onSaved()
    } catch (err) {
      setError(friendlyError(err, 'registrar el movimiento'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} title="Mover stock" description={`${item.name}. Existencias actuales: ${current}.`}
      footer={<><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="stock-form" busy={saving}>Registrar movimiento</Button></>}>
      <form id="stock-form" onSubmit={submit} noValidate className="space-y-4">
        <fieldset>
          <legend className="tf-label">Tipo de movimiento</legend>
          <div className="grid grid-cols-3 gap-2">
            {[['entrada', 'Entrada', 'Llegó mercancía'], ['salida', 'Salida', 'Se usó o vendió'], ['ajuste', 'Ajuste', 'Conteo físico']].map(([value, label, hint]) => (
              <label key={value} className={`cursor-pointer rounded-[var(--tf-radius-control)] border px-3 py-2.5 text-[0.8125rem] transition-colors ${type === value ? 'border-[var(--tf-accent)] bg-[var(--tf-accent-soft)] text-[var(--tf-text)]' : 'border-[var(--tf-border-strong)] text-[var(--tf-text-muted)] hover:border-[rgba(148,163,184,.36)]'}`}>
                <input type="radio" name="movement" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
                <span className="block font-medium">{label}</span><span className="block text-xs text-[var(--tf-text-subtle)]">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Input label={type === 'ajuste' ? 'Cantidad contada' : 'Cantidad'} type="number" inputMode="numeric" min="1" step="1" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError('') }}
          hint={preview == null ? null : `Quedarán ${preview} en existencia.`} />
        <Textarea label="Motivo" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Ej. usada en la orden CAR-2026-0042" className="min-h-[4rem]" />
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Dialog>
  )
}

export default function Inventory() {
  const { profile, hasPermission } = useAuth()
  const toast = useToast()
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const list = usePagedResource('/inventory', { filters: { category, low_stock: lowOnly ? 'true' : '' } })
  const [editing, setEditing] = useState(null)
  const [moving, setMoving] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const writer = WRITE_ROLES.inventory.includes(profile?.role)
  const canCreate = writer && hasPermission('inventory.create')
  const canEdit = writer && hasPermission('inventory.update')
  const canMove = writer && hasPermission('inventory.adjust_stock')
  const canDelete = WRITE_ROLES.admin.includes(profile?.role) && hasPermission('inventory.update')
  const showCost = hasPermission('inventory.view_cost')
  const filtered = Boolean(list.query || category || lowOnly)

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.delete(`/inventory/${removing.id}`)
      toast.success('Artículo eliminado del inventario.')
      setRemoving(null)
      list.reload()
    } catch (error) {
      toast.error(friendlyError(error, 'eliminar el artículo'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Inventario" description="Refacciones disponibles, precios y avisos de stock bajo."
        actions={canCreate && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Agregar artículo</Button>} />

      <DataCard
        toolbar={<>
          <SearchField label="Buscar en inventario" value={list.query} onChange={list.setQuery} placeholder="Nombre, SKU o modelo" />
          <select aria-label="Filtrar por categoría" className="ct-select" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Todas las categorías</option>
            {Object.entries(INVENTORY_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-[0.8125rem] text-[var(--tf-text-muted)]">
            <input type="checkbox" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} className="h-4 w-4 accent-[var(--tf-primary)]" />Solo stock bajo
          </label>
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="artículos" />}>
        {list.error ? <div className="p-4"><Alert tone="error" action={<Button size="sm" onClick={list.reload}>Reintentar</Button>}>{friendlyError(list.error, 'cargar el inventario')}</Alert></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={6} />
            : !list.rows.length ? <EmptyState icon={Package} title={filtered ? 'Nada coincide con tu búsqueda' : 'El inventario está vacío'}
                description={filtered ? 'Prueba con otro nombre o quita los filtros.' : 'Agrega las refacciones que manejas para saber qué tienes y qué pedir.'}
                action={!filtered && canCreate && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Agregar artículo</Button>} />
              : (
                <div className="ct-table-shell" aria-busy={list.loading}>
                  <table className="ct-table min-w-[48rem]">
                    <thead><tr><th scope="col">Artículo</th><th scope="col">Categoría</th><th scope="col">SKU</th><th scope="col" className="tf-cell-num">Existencias</th>{showCost && <th scope="col" className="tf-cell-num">Costo</th>}<th scope="col" className="tf-cell-num">Precio</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
                    <tbody>
                      {list.rows.map((item) => {
                        const low = Number(item.quantity ?? 0) <= Number(item.min_stock ?? 0)
                        return (
                          <tr key={item.id}>
                            <td><p className="font-medium text-[var(--tf-text)]">{item.name}</p><p className="mt-0.5 text-xs text-[var(--tf-text-subtle)]">{[item.brand, item.compatible_model].filter(Boolean).join(', ') || 'Uso general'}</p></td>
                            <td>{INVENTORY_CATEGORIES[item.category] ?? item.category}</td>
                            <td className="tf-num">{item.sku}</td>
                            <td className="tf-cell-num">
                              <span className={`inline-flex items-center gap-1.5 ${low ? 'text-[var(--tf-warning)]' : 'text-[var(--tf-text)]'}`} title={`Mínimo: ${item.min_stock ?? 0}`}>
                                {low && <TriangleAlert size={13} aria-label="Stock bajo" />}{item.quantity ?? 0}
                              </span>
                            </td>
                            {showCost && <td className="tf-cell-num">{item.cost == null ? '—' : formatCurrency(item.cost)}</td>}
                            <td className="tf-cell-num">{item.suggested_price == null ? '—' : formatCurrency(item.suggested_price)}</td>
                            <td className="text-right">
                              <div className="inline-flex gap-1">
                                {canMove && <button type="button" className="tf-icon-btn" onClick={() => setMoving(item)} aria-label={`Mover stock de ${item.name}`} title="Mover stock"><ArrowDownUp size={15} /></button>}
                                {canEdit && <button type="button" className="tf-icon-btn" onClick={() => setEditing(item)} aria-label={`Editar ${item.name}`} title="Editar"><Pencil size={15} /></button>}
                                {canDelete && <button type="button" className="tf-icon-btn" onClick={() => setRemoving(item)} aria-label={`Eliminar ${item.name}`} title="Eliminar"><Trash2 size={15} /></button>}
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

      {editing && <ItemForm initial={editing.id ? editing : null} showCost={showCost} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload() }} />}
      {moving && <StockForm item={moving} onClose={() => setMoving(null)} onSaved={() => { setMoving(null); list.reload() }} />}
      <ConfirmDialog open={Boolean(removing)} title="¿Eliminar este artículo?" busy={deleting} confirmLabel="Eliminar artículo"
        description={removing ? `“${removing.name}” dejará de aparecer en el inventario. Su historial de movimientos se conserva.` : ''}
        onConfirm={confirmDelete} onCancel={() => setRemoving(null)} />
    </div>
  )
}
