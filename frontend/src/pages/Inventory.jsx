import { useEffect, useState } from 'react'
import { Package, TriangleAlert } from 'lucide-react'
import { api } from '../services/api.js'
import { formatCurrency } from '../utils/formatters.js'

export default function Inventory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/inventory?page=1&limit=20').then((response) => {
      if (active) { setItems(response.data ?? []); setError('') }
    }).catch((err) => {
      if (active) setError(err.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="ct-page space-y-6">
      <header className="ct-page-header">
        <div><p className="ct-eyebrow">Taller</p><h1 className="ct-page-title">Inventario</h1><p className="ct-page-description">Disponibilidad, costo sugerido y alertas de stock bajo por refacción.</p></div>
        <div className="ct-status ct-status-warning inline-flex items-center gap-2"><Package size={15} />{items.length} artículos</div>
      </header>
      {loading ? <div className="ct-surface p-8 text-center text-sm text-slate-400">Cargando inventario…</div> : error ? <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-5 text-sm text-red-200">No pudimos cargar el inventario. {error}</div> : <div className="ct-table-shell"><table className="ct-table min-w-[950px]"><thead><tr><th>Artículo</th><th>Categoría</th><th>SKU</th><th>Stock</th><th>Costo</th><th>Precio sugerido</th></tr></thead><tbody>
        {items.map((item) => {
          const lowStock = Number(item.quantity ?? 0) <= Number(item.min_stock ?? 0)
          return <tr key={item.id}><td><div className="font-semibold text-slate-100">{item.name}</div><div className="mt-1 text-xs text-slate-500">{item.brand || 'Sin marca'} · {item.compatible_model || 'General'}</div></td><td>{item.category}</td><td>{item.sku}</td><td><span className={`ct-status inline-flex items-center gap-2 ${lowStock ? 'ct-status-warning' : 'ct-status-success'}`}>{lowStock && <TriangleAlert size={12} />}{item.quantity ?? 0} uds</span></td><td>{formatCurrency(item.cost)}</td><td>{formatCurrency(item.suggested_price)}</td></tr>
        })}
      </tbody></table>{!items.length && <div className="ct-empty border-0 border-t rounded-none">No hay artículos registrados.</div>}</div>}
    </div>
  )
}
