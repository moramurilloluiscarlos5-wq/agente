import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Wrench } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Button, DataCard, EmptyState, Pagination, SearchField, TableSkeleton } from '../components/ui/DesignSystem.jsx'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { REPAIR_STATUSES } from '../utils/constants.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { customerName, deviceName } from '../components/repairs/repairForm.js'
import { friendlyError } from '../utils/errors.js'

export default function Repairs() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [result, setResult] = useState({ data: [], count: 0, key: '', error: '' })
  const [revision, setRevision] = useState(0)
  const limit = 15
  const filters = params.toString()
  const requestKey = JSON.stringify([filters, page, revision])
  const loading = result.key !== requestKey
  const error = loading ? '' : result.error
  const canCreate = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN'].includes(profile?.role)

  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      try {
        const requestParams = new URLSearchParams(filters)
        requestParams.set('page', String(page))
        requestParams.set('limit', String(limit))
        const response = await api.get(`/repairs?${requestParams}`)
        if (active) setResult({ ...response, key: requestKey, error: '' })
      } catch (err) {
        if (active) setResult({ data: [], count: 0, key: requestKey, error: friendlyError(err, 'cargar las reparaciones') })
      }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [filters, page, requestKey])

  function updateFilter(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: key === 'q' })
  }

  const filtered = Boolean(query || status || params.get('customer_id') || params.get('device_id'))
  const statusLabel = REPAIR_STATUSES[status]?.label
  return (
    <div className="space-y-5">
      <PageHeader title="Reparaciones"
        description={profile?.role === 'TECNICO' ? 'Órdenes asignadas a ti y su avance en el taller.' : 'Recepción, seguimiento y entrega de los equipos del taller.'}
        actions={canCreate && <Link className="ct-btn ct-btn-primary" to="/reparaciones/nueva"><Plus size={15} aria-hidden="true" />Nueva reparación</Link>} />

      <DataCard
        toolbar={<>
          <SearchField label="Buscar reparaciones" value={query} onChange={(value) => updateFilter('q', value)} placeholder="Orden, cliente, equipo o problema" />
          <select aria-label="Filtrar por estado" className="ct-select" value={status} onChange={(event) => updateFilter('status', event.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(REPAIR_STATUSES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
          </select>
          {filtered && <Button variant="ghost" size="sm" onClick={() => setParams({})}>Quitar filtros</Button>}
        </>}
        footer={!loading && !error && <Pagination page={page} limit={limit} count={result.count} onPage={(value) => updateFilter('page', String(value))} label="órdenes" />}>
        <div aria-live="polite">
          {error ? <div className="p-4"><Alert tone="error" action={<Button size="sm" onClick={() => setRevision((value) => value + 1)}>Reintentar</Button>}>{error}</Alert></div>
            : loading && !result.data.length ? <TableSkeleton columns={6} rows={6} />
              : result.data.length === 0 ? (
                <EmptyState icon={Wrench} title={filtered ? (statusLabel ? `No hay órdenes en “${statusLabel}”` : 'Ninguna orden coincide') : 'No hay reparaciones todavía'}
                  description={filtered ? 'Prueba con otra búsqueda o cambia los filtros.' : 'Cuando recibas un equipo, regístralo aquí para darle seguimiento hasta la entrega.'}
                  action={!filtered && canCreate && <Link className="ct-btn ct-btn-primary" to="/reparaciones/nueva"><Plus size={15} aria-hidden="true" />Registrar la primera</Link>} />
              ) : (
                <div className="ct-table-shell" aria-busy={loading}>
                  <table className="ct-table min-w-[54rem]">
                    <thead><tr><th scope="col">Orden</th><th scope="col">Cliente</th><th scope="col">Equipo y problema</th><th scope="col">Estado</th><th scope="col">Responsable</th><th scope="col" className="tf-cell-num">Costo estimado</th><th scope="col">Entrega</th></tr></thead>
                    <tbody>
                      {result.data.map((repair) => {
                        const late = repair.estimated_delivery_at && !['entregado', 'cancelado'].includes(repair.status) && new Date(repair.estimated_delivery_at) < new Date()
                        return (
                          <tr key={repair.id}>
                            <td><Link className="tf-link tf-num" to={`/reparaciones/${encodeURIComponent(repair.order_number)}`}>{repair.order_number}</Link><p className="mt-0.5 text-xs text-[var(--tf-text-subtle)]">{formatDate(repair.received_at)}</p></td>
                            <td><p className="text-[var(--tf-text)]">{customerName(repair.customer)}</p><p className="mt-0.5 text-xs text-[var(--tf-text-subtle)]">{repair.customer?.phone || '—'}</p></td>
                            <td className="max-w-[16rem]"><p className="text-[var(--tf-text)]">{deviceName(repair.device ?? repair)}</p><p className="mt-0.5 truncate text-xs text-[var(--tf-text-subtle)]">{repair.reported_problem}</p></td>
                            <td><StatusBadge status={repair.status} /></td>
                            <td>{repair.technician?.full_name || <span className="text-[var(--tf-text-subtle)]">Sin asignar</span>}</td>
                            <td className="tf-cell-num">{formatCurrency(repair.estimated_cost)}</td>
                            <td className={`whitespace-nowrap ${late ? 'text-[var(--tf-warning)]' : ''}`}>{formatDate(repair.estimated_delivery_at)}{late && <p className="text-xs">Atrasada</p>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
        </div>
      </DataCard>
    </div>
  )
}
