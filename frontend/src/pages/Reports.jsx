import { BarChart3, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../services/api.js'

export default function Reports() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); setError(''); api.get('/reports').then((result) => setData(result.data)).catch((err) => setError(err.message)).finally(() => setLoading(false)) }
  useEffect(load, [])
  return <div className="space-y-6">
    <header className="flex items-center justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-white"><BarChart3 className="text-cyan-400" /> Reportes</h1><p className="mt-1 text-sm text-slate-400">Indicadores del taller según tus permisos.</p></div><button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Actualizar</button></header>
    {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}
    {loading && <p className="text-sm text-slate-400">Cargando reportes…</p>}
    {data && !loading && <><div className="grid gap-4 md:grid-cols-2"><article className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"><p className="text-sm text-slate-400">Reparaciones registradas</p><p className="mt-2 text-3xl font-bold text-white">{data.totals.repairs}</p></article><article className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"><p className="text-sm text-slate-400">Pagos registrados</p><p className="mt-2 text-3xl font-bold text-cyan-300">${data.totals.payments.toFixed(2)}</p></article></div><div className="grid gap-6 lg:grid-cols-2"><section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"><h2 className="mb-4 font-semibold text-white">Reparaciones por estado</h2><div className="space-y-2">{data.byStatus.map((row) => <div key={row.status} className="flex justify-between text-sm"><span className="text-slate-300">{row.status}</span><span className="font-semibold text-cyan-300">{row.count}</span></div>)}</div></section><section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"><h2 className="mb-4 font-semibold text-white">Marcas atendidas</h2><div className="space-y-2">{data.byBrand.map((row) => <div key={row.brand} className="flex justify-between text-sm"><span className="text-slate-300">{row.brand}</span><span className="font-semibold text-cyan-300">{row.count}</span></div>)}</div></section></div><section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"><h2 className="mb-4 font-semibold text-white">Stock bajo</h2>{data.lowStock.length ? <div className="space-y-2">{data.lowStock.map((row) => <div key={row.id} className="flex justify-between text-sm"><span className="text-slate-300">{row.name}</span><span className="text-amber-300">{row.quantity} / mínimo {row.min_stock}</span></div>)}</div> : <p className="text-sm text-slate-400">No hay artículos bajo el mínimo.</p>}</section></>}
  </div>
}
