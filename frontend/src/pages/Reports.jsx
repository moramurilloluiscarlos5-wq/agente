import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, PackageCheck, RefreshCw } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Button, Card, EmptyState, Skeleton } from '../components/ui/DesignSystem.jsx'
import { api } from '../services/api.js'
import { REPAIR_STATUSES } from '../utils/constants.js'
import { friendlyError } from '../utils/errors.js'
import { formatCurrency } from '../utils/formatters.js'

function Breakdown({ rows, labelOf, empty }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.count) || 0))
  if (!rows.length) return <p className="text-sm text-[var(--tf-text-muted)]">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={labelOf(row, true)}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-[var(--tf-text-muted)]">{labelOf(row)}</span>
            <span className="tf-num font-semibold text-[var(--tf-text)]">{row.count}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--tf-surface-sunken)]" aria-hidden="true">
            <div className="h-full rounded-full bg-[var(--tf-primary)]" style={{ width: `${Math.max(2, (Number(row.count) / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function Reports() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    api.get('/reports')
      .then((result) => { if (active) { setData(result.data); setError('') } })
      .catch((err) => { if (active) setError(friendlyError(err, 'cargar los reportes')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])

  const refresh = () => { setLoading(true); setRevision((value) => value + 1) }
  const totals = data?.totals ?? {}
  const byStatus = [...(data?.byStatus ?? [])].sort((a, b) => b.count - a.count)
  const byBrand = [...(data?.byBrand ?? [])].sort((a, b) => b.count - a.count)
  const lowStock = data?.lowStock ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Reportes" description="Totales históricos del taller, calculados con tus registros."
        actions={<Button icon={RefreshCw} busy={loading} onClick={refresh}>Actualizar</Button>} />

      {error && <Alert tone="error" action={<Button size="sm" onClick={refresh}>Reintentar</Button>}>{error}</Alert>}

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((key) => <div key={key} className="ct-kpi"><Skeleton className="h-3 w-32" /><Skeleton className="mt-3 h-7 w-24" /></div>)}</div>
      ) : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="ct-kpi">
              <p className="ct-kpi-label">Reparaciones registradas</p>
              <p className="ct-kpi-value">{Number(totals.repairs ?? 0).toLocaleString('es-MX')}</p>
            </article>
            {totals.payments != null && <article className="ct-kpi">
              <p className="ct-kpi-label">Cobrado</p>
              <p className="ct-kpi-value">{formatCurrency(totals.payments)}</p>
              {totals.pending > 0 && <p className="ct-kpi-hint text-[var(--tf-warning)]">Pendiente de cobro: {formatCurrency(totals.pending)}</p>}
            </article>}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Reparaciones por estado">
              <Breakdown rows={byStatus} labelOf={(row, key) => key ? row.status : REPAIR_STATUSES[row.status]?.label ?? row.status} empty="Aún no hay reparaciones." />
            </Card>
            <Card title="Marcas atendidas">
              <Breakdown rows={byBrand} labelOf={(row) => row.brand || 'Sin marca'} empty="Aún no hay equipos registrados." />
            </Card>
          </div>

          <Card title="Stock bajo" description="Artículos en o por debajo de su mínimo." actions={<Link to="/inventario" className="tf-link text-sm">Ver inventario</Link>} bodyClassName={lowStock.length ? null : 'tf-card-body'}>
            {lowStock.length ? (
              <ul className="tf-list">
                {lowStock.map((row) => (
                  <li key={row.id} className="tf-list-row">
                    <span className="min-w-0 truncate">{row.name}</span>
                    <span className="tf-num shrink-0 text-sm text-[var(--tf-warning)]">{row.quantity} en stock · mínimo {row.min_stock}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={PackageCheck} title="Inventario en orden" description="Ningún artículo está por debajo de su mínimo." />}
          </Card>
        </>
      )}
      {!loading && !data && !error && <EmptyState icon={BarChart3} title="Sin datos" description="No hay información para mostrar todavía." />}
    </div>
  )
}
