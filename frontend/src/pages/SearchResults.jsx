import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ClipboardList, FileText, Search, Smartphone, UserRound } from 'lucide-react'
import { api } from '../services/api.js'

const emptyData = { repairs: [], customers: [], devices: [], quotes: [] }

function ResultSection({ icon: Icon, title, count, children }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-100"><Icon size={17} className="text-cyan-300" /> {title}</h2>
        <span className="text-xs text-slate-500">{count} resultado{count === 1 ? '' : 's'}</span>
      </div>
      {children}
    </section>
  )
}

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(Boolean(query))
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!query.trim()) {
      setData(emptyData)
      setLoading(false)
      return () => { active = false }
    }

    setLoading(true)
    setError('')
    api.get(`/search?q=${encodeURIComponent(query)}`).then((response) => {
      if (active) setData(response.data ?? emptyData)
    }).catch((err) => {
      if (active) setError(err.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [query])

  const total = Object.values(data).reduce((sum, items) => sum + items.length, 0)

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-cyan-300"><Search size={18} /><span className="text-sm font-medium">Búsqueda global</span></div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{query ? `Resultados para "${query}"` : 'Buscador global'}</h1>
        <p className="mt-1 text-sm text-slate-400">Clientes, órdenes, equipos y cotizaciones disponibles para tu rol.</p>
      </header>

      {!query && <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">Usa el buscador superior para encontrar registros.</div>}
      {loading && <p role="status" className="rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-400">Buscando registros…</p>}
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}
      {!loading && !error && query && <>
        <p className="text-sm text-slate-400">{total} coincidencia{total === 1 ? '' : 's'} encontradas</p>
        {total === 0 && <div className="rounded-xl border border-slate-800 p-10 text-center text-sm text-slate-400">No se encontraron registros para esta búsqueda.</div>}
        <div className="grid gap-4 xl:grid-cols-2">
          <ResultSection icon={ClipboardList} title="Reparaciones" count={data.repairs.length}>
            <div className="space-y-2">{data.repairs.map((item) => <Link key={item.id} to={`/reparaciones/${encodeURIComponent(item.order_number)}`} className="block rounded-lg border border-slate-800 p-3 transition hover:border-cyan-500/40 hover:bg-slate-800/40"><div className="flex items-center justify-between gap-3"><span className="font-medium text-cyan-300">{item.order_number}</span><span className="text-xs text-slate-500">{item.status}</span></div><p className="mt-1 text-sm text-slate-200">{item.brand || item.device?.brand} {item.model || item.device?.model}</p><p className="mt-1 truncate text-xs text-slate-400">{item.reported_problem}</p></Link>)}</div>
          </ResultSection>
          <ResultSection icon={UserRound} title="Clientes" count={data.customers.length}>
            <div className="space-y-2">{data.customers.map((item) => <Link key={item.id} to={`/clientes?id=${encodeURIComponent(item.id)}`} className="block rounded-lg border border-slate-800 p-3 transition hover:border-cyan-500/40 hover:bg-slate-800/40"><p className="font-medium text-slate-100">{item.first_name} {item.last_name}</p><p className="mt-1 text-sm text-slate-400">{item.phone || item.email || 'Sin contacto'}</p></Link>)}</div>
          </ResultSection>
          <ResultSection icon={Smartphone} title="Dispositivos" count={data.devices.length}>
            <div className="space-y-2">{data.devices.map((item) => <Link key={item.id} to={`/dispositivos?id=${encodeURIComponent(item.id)}`} className="block rounded-lg border border-slate-800 p-3 transition hover:border-cyan-500/40 hover:bg-slate-800/40"><p className="font-medium text-slate-100">{item.brand} {item.model}</p><p className="mt-1 text-sm text-slate-400">IMEI: {item.imei || 'Sin registrar'} · {item.customer ? `${item.customer.first_name} ${item.customer.last_name}` : 'Sin cliente'}</p></Link>)}</div>
          </ResultSection>
          <ResultSection icon={FileText} title="Cotizaciones" count={data.quotes.length}>
            <div className="space-y-2">{data.quotes.map((item) => <Link key={item.id} to={`/cotizaciones?q=${encodeURIComponent(item.quote_number)}`} className="block rounded-lg border border-slate-800 p-3 transition hover:border-cyan-500/40 hover:bg-slate-800/40"><div className="flex items-center justify-between gap-3"><span className="font-medium text-cyan-300">{item.quote_number}</span><span className="text-xs text-slate-500">{item.status}</span></div><p className="mt-1 text-sm text-slate-300">Total: {item.total}</p></Link>)}</div>
          </ResultSection>
        </div>
      </>}
    </div>
  )
}
