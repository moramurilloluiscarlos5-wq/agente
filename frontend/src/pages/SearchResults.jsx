import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ClipboardList, FileText, Search, Smartphone, UserRound } from 'lucide-react'
import { friendlyError } from '../utils/errors.js'
import { api } from '../services/api.js'

const emptyData = { repairs: [], customers: [], devices: [], quotes: [] }

function ResultSection({ icon: Icon, title, count, children }) {
  return (
    <section className="rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-[var(--tf-text)]"><Icon size={17} className="text-[var(--tf-link)]" /> {title}</h2>
        <span className="text-xs text-[var(--tf-text-subtle)]">{count} resultado{count === 1 ? '' : 's'}</span>
      </div>
      {children}
    </section>
  )
}

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim()
  return <SearchResultsContent key={query} query={query} />
}

function SearchResultsContent({ query }) {
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(Boolean(query))
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!query.trim()) {
      return () => { active = false }
    }

    api.get(`/search?q=${encodeURIComponent(query)}`).then((response) => {
      if (active) setData({ ...emptyData, ...(response.data ?? {}) })
    }).catch((err) => {
      if (active) setError(friendlyError(err, 'buscar'))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [query])

  const total = Object.values(data).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0)

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-[var(--tf-link)]"><Search size={18} /><span className="text-sm font-medium">Búsqueda global</span></div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{query ? `Resultados para "${query}"` : 'Buscador global'}</h1>
        <p className="mt-1 text-sm text-[var(--tf-text-muted)]">Clientes, órdenes, equipos y cotizaciones disponibles para tu rol.</p>
      </header>

      {!query && <div className="rounded-[var(--tf-radius-card)] border border-dashed border-[var(--tf-border)] p-10 text-center text-sm text-[var(--tf-text-muted)]">Usa el buscador superior para encontrar registros.</div>}
      {loading && <p role="status" className="rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] p-8 text-center text-sm text-[var(--tf-text-muted)]">Buscando registros…</p>}
      {error && <p role="alert" className="rounded-[var(--tf-radius-card)] border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-4 text-sm text-[#fca5a5]">{error}</p>}
      {!loading && !error && query && <>
        <p className="text-sm text-[var(--tf-text-muted)]">{total} coincidencia{total === 1 ? '' : 's'} encontradas</p>
        {total === 0 && <div className="rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] p-10 text-center text-sm text-[var(--tf-text-muted)]">No se encontraron registros para esta búsqueda.</div>}
        <div className="grid gap-4 xl:grid-cols-2">
          <ResultSection icon={ClipboardList} title="Reparaciones" count={data.repairs.length}>
            <div className="space-y-2">{data.repairs.map((item) => <Link key={item.id} to={`/reparaciones/${encodeURIComponent(item.order_number)}`} className="block rounded-lg border border-[var(--tf-border)] p-3 transition hover:border-[var(--tf-border-strong)] hover:bg-[rgba(148,163,184,.08)]"><div className="flex items-center justify-between gap-3"><span className="font-medium text-[var(--tf-link)]">{item.order_number}</span><span className="text-xs text-[var(--tf-text-subtle)]">{item.status}</span></div><p className="mt-1 text-sm text-[var(--tf-text)]">{item.brand || item.device?.brand} {item.model || item.device?.model}</p><p className="mt-1 truncate text-xs text-[var(--tf-text-muted)]">{item.reported_problem}</p></Link>)}</div>
          </ResultSection>
          <ResultSection icon={UserRound} title="Clientes" count={data.customers.length}>
            <div className="space-y-2">{data.customers.map((item) => <Link key={item.id} to={`/clientes?id=${encodeURIComponent(item.id)}`} className="block rounded-lg border border-[var(--tf-border)] p-3 transition hover:border-[var(--tf-border-strong)] hover:bg-[rgba(148,163,184,.08)]"><p className="font-medium text-[var(--tf-text)]">{item.first_name} {item.last_name}</p><p className="mt-1 text-sm text-[var(--tf-text-muted)]">{item.phone || item.email || 'Sin contacto'}</p></Link>)}</div>
          </ResultSection>
          <ResultSection icon={Smartphone} title="Dispositivos" count={data.devices.length}>
            <div className="space-y-2">{data.devices.map((item) => <Link key={item.id} to={`/dispositivos?id=${encodeURIComponent(item.id)}`} className="block rounded-lg border border-[var(--tf-border)] p-3 transition hover:border-[var(--tf-border-strong)] hover:bg-[rgba(148,163,184,.08)]"><p className="font-medium text-[var(--tf-text)]">{item.brand} {item.model}</p><p className="mt-1 text-sm text-[var(--tf-text-muted)]">IMEI: {item.imei || 'Sin registrar'} · {item.customer ? `${item.customer.first_name} ${item.customer.last_name}` : 'Sin cliente'}</p></Link>)}</div>
          </ResultSection>
          <ResultSection icon={FileText} title="Cotizaciones" count={data.quotes.length}>
            <div className="space-y-2">{data.quotes.map((item) => <Link key={item.id} to={`/cotizaciones?q=${encodeURIComponent(item.quote_number)}`} className="block rounded-lg border border-[var(--tf-border)] p-3 transition hover:border-[var(--tf-border-strong)] hover:bg-[rgba(148,163,184,.08)]"><div className="flex items-center justify-between gap-3"><span className="font-medium text-[var(--tf-link)]">{item.quote_number}</span><span className="text-xs text-[var(--tf-text-subtle)]">{item.status}</span></div><p className="mt-1 text-sm text-[var(--tf-text-muted)]">Total: {item.total}</p></Link>)}</div>
          </ResultSection>
        </div>
      </>}
    </div>
  )
}
