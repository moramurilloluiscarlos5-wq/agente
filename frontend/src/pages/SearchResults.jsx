import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ClipboardList, FileText, Search, Smartphone, UserRound } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { Badge, Card, EmptyState, ErrorAlert, Skeleton } from '../components/ui/DesignSystem.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { api } from '../services/api.js'
import { QUOTE_STATUSES } from '../utils/constants.js'
import { formatCurrency } from '../utils/formatters.js'

const emptyData = { repairs: [], customers: [], devices: [], quotes: [] }
const fullName = (person) => [person?.first_name, person?.last_name].filter(Boolean).join(' ')

function ResultCard({ icon: Icon, title, items, children }) {
  if (!items.length) return null
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Icon size={16} className="text-[var(--tf-text-subtle)]" aria-hidden="true" />{title}</span>} actions={<span className="tf-num text-xs text-[var(--tf-text-subtle)]">{items.length} resultado{items.length === 1 ? '' : 's'}</span>} bodyClassName={null}>
      <ul className="tf-list">{children}</ul>
    </Card>
  )
}

function Row({ to, primary, secondary, aside }) {
  const body = <><span className="min-w-0"><span className={`block truncate text-sm font-medium ${to ? 'text-[var(--tf-link)]' : 'text-[var(--tf-text)]'}`}>{primary}</span>{secondary && <span className="block truncate text-sm text-[var(--tf-text-muted)]">{secondary}</span>}</span>{aside && <span className="shrink-0">{aside}</span>}</>
  return <li>{to ? <Link to={to} className="tf-list-row hover:bg-[rgba(148,163,184,.05)]">{body}</Link> : <div className="tf-list-row">{body}</div>}</li>
}

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim()
  return <SearchResultsContent key={query} query={query} />
}

function SearchResultsContent({ query }) {
  const { hasPermission } = useAuth()
  const [state, setState] = useState({ data: emptyData, error: null, done: !query })
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!query) return undefined
    let active = true
    api.get(`/search?q=${encodeURIComponent(query)}`)
      .then((response) => { if (active) setState({ data: { ...emptyData, ...(response.data ?? {}) }, error: null, done: true }) })
      .catch((error) => { if (active) setState({ data: emptyData, error, done: true }) })
    return () => { active = false }
  }, [query, revision])

  const { data, error, done } = state
  const total = Object.values(data).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0)
  const focusSearch = () => document.querySelector('header [role="search"] input')?.focus()

  return (
    <div className="space-y-6">
      <PageHeader title={query ? `Resultados para “${query}”` : 'Buscar en el taller'} description={query && done && !error ? `${total} coincidencia${total === 1 ? '' : 's'} en clientes, órdenes, equipos y cotizaciones.` : 'Clientes, órdenes, equipos y cotizaciones a los que tienes acceso.'} />
      {!query ? <section className="tf-card"><EmptyState icon={Search} title="Escribe qué buscas" description="Busca por nombre del cliente, número de orden, modelo o IMEI desde la barra superior." action={<button type="button" className="ct-btn ct-btn-primary" onClick={focusSearch}>Ir a la búsqueda</button>} /></section>
        : !done ? <div className="grid gap-6 xl:grid-cols-2" role="status" aria-label="Buscando">{[0, 1].map((key) => <div key={key} className="tf-card space-y-4 p-6"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>)}</div>
          : error ? <ErrorAlert error={error} action="buscar" onRetry={() => { setState((current) => ({ ...current, done: false })); setRevision((value) => value + 1) }} />
            : total === 0 ? <section className="tf-card"><EmptyState icon={Search} title="Sin coincidencias" description="Revisa la ortografía o busca con menos palabras, por ejemplo solo el apellido o los últimos dígitos del IMEI." action={<button type="button" className="ct-btn ct-btn-secondary" onClick={focusSearch}>Buscar otra cosa</button>} /></section>
              : <div className="grid items-start gap-6 xl:grid-cols-2">
                <ResultCard icon={ClipboardList} title="Reparaciones" items={data.repairs}>
                  {data.repairs.map((item) => <Row key={item.id} to={`/reparaciones/${encodeURIComponent(item.order_number)}`} primary={item.order_number}
                    secondary={[[item.brand || item.device?.brand, item.model || item.device?.model].filter(Boolean).join(' '), item.reported_problem].filter(Boolean).join(': ')} aside={<StatusBadge status={item.status} />} />)}
                </ResultCard>
                <ResultCard icon={UserRound} title="Clientes" items={data.customers}>
                  {data.customers.map((item) => <Row key={item.id} to={`/clientes/${encodeURIComponent(item.id)}`} primary={fullName(item) || 'Cliente'} secondary={item.phone || item.email || 'Sin contacto'} />)}
                </ResultCard>
                <ResultCard icon={Smartphone} title="Dispositivos" items={data.devices}>
                  {data.devices.map((item) => <Row key={item.id} to={`/dispositivos/${encodeURIComponent(item.id)}`} primary={[item.brand, item.model].filter(Boolean).join(' ') || 'Equipo'}
                    secondary={[item.imei ? `IMEI ${item.imei}` : null, item.customer ? fullName(item.customer) : null].filter(Boolean).join(', ') || 'Sin IMEI'} />)}
                </ResultCard>
                <ResultCard icon={FileText} title="Cotizaciones" items={data.quotes}>
                  {data.quotes.map((item) => <Row key={item.id} to={hasPermission('quotes.update') ? `/cotizaciones/${item.id}/editar` : null} primary={item.quote_number}
                    secondary={`Total ${formatCurrency(item.total)}`} aside={QUOTE_STATUSES[item.status] && <Badge tone={QUOTE_STATUSES[item.status].tone}>{QUOTE_STATUSES[item.status].label}</Badge>} />)}
                </ResultCard>
              </div>}
    </div>
  )
}
