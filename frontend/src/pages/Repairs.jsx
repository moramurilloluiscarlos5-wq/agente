import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Search, Wrench } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { REPAIR_STATUSES } from '../utils/constants.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { customerName, deviceName, repairButtonClass, repairInputClass, repairSecondaryClass } from '../components/repairs/repairForm.js'

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
  const canCreate = ['OWNER', 'ADMINISTRADOR', 'RECEPCION'].includes(profile?.role)

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
        if (active) setResult({ data: [], count: 0, key: requestKey, error: err.message })
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

  const pages = Math.max(1, Math.ceil(result.count / limit))
  return (
    <div className="ct-page space-y-6">
      <header className="ct-page-header">
        <div><p className="ct-eyebrow">Operación</p><h1 className="ct-page-title">Reparaciones</h1><p className="ct-page-description">{profile?.role === 'TECNICO' ? 'Órdenes asignadas a ti y su avance en el taller.' : 'Recepción, seguimiento y entrega de los equipos del taller.'}</p></div>
        {canCreate && <Link className={repairButtonClass} to="/reparaciones/nueva"><Plus size={17} />Nueva reparación</Link>}
      </header>
      <div className="ct-surface flex flex-col gap-3 p-4 sm:flex-row">
        <label className="relative flex-1"><span className="sr-only">Buscar reparaciones</span><Search size={17} className="absolute left-3 top-3 text-slate-500" /><input className={`${repairInputClass} pl-10`} placeholder="Buscar orden, cliente, equipo o problema…" value={query} onChange={(event) => updateFilter('q', event.target.value)} /></label>
        <label className="sm:w-64"><span className="sr-only">Filtrar por estado</span><select className={repairInputClass} value={status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">Todos los estados</option>{Object.entries(REPAIR_STATUSES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
        {(params.get('customer_id') || params.get('device_id')) && <button className={repairSecondaryClass} onClick={() => setParams({})}>Quitar filtros</button>}
      </div>
      <div aria-live="polite">
        {loading ? <div className="ct-surface p-12 text-center text-sm text-slate-400">Cargando reparaciones…</div>
          : error ? <div role="alert" className="space-y-4 rounded-lg border border-red-400/30 bg-red-400/10 p-6"><p className="text-sm text-red-200">{error}</p><button className={repairSecondaryClass} onClick={() => setRevision((value) => value + 1)}>Reintentar</button></div>
          : result.data.length === 0 ? <div className="ct-empty"><Wrench size={30} /><h2>No hay reparaciones para mostrar</h2><p>{filters ? 'Prueba otra búsqueda o cambia los filtros.' : 'Las órdenes aparecerán aquí al recibir el primer equipo.'}</p></div>
          : <div className="ct-table-shell"><table className="ct-table min-w-[850px]"><thead><tr>{['Orden / recepción', 'Cliente', 'Equipo', 'Estado', 'Responsable', 'Estimación / entrega'].map((title) => <th key={title}>{title}</th>)}</tr></thead><tbody>
            {result.data.map((repair) => <tr key={repair.id}>
              <td><Link className="font-semibold text-cyan-300 hover:underline" to={`/reparaciones/${encodeURIComponent(repair.order_number)}`}>{repair.order_number}</Link><p className="mt-1 text-xs text-slate-500">{formatDate(repair.received_at)}</p></td>
              <td><p className="text-slate-200">{customerName(repair.customer)}</p><p className="mt-1 text-xs text-slate-500">{repair.customer?.phone}</p></td>
              <td className="max-w-60"><p className="text-slate-200">{deviceName(repair.device ?? repair)}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{repair.reported_problem}</p></td>
              <td><StatusBadge status={repair.status} /></td><td>{repair.technician?.full_name || 'Sin asignar'}</td>
              <td><p className="text-slate-200">{formatCurrency(repair.estimated_cost)}</p><p className="mt-1 text-xs text-slate-500">{formatDate(repair.estimated_delivery_at)}</p></td>
            </tr>)}
          </tbody></table></div>}
      </div>
      {!error && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400"><span>{result.count} orden{result.count === 1 ? '' : 'es'} · Página {page} de {pages}</span><div className="flex gap-2"><button className={repairSecondaryClass} disabled={loading || page <= 1} onClick={() => updateFilter('page', String(page - 1))}><ChevronLeft size={16} />Anterior</button><button className={repairSecondaryClass} disabled={loading || page >= pages} onClick={() => updateFilter('page', String(page + 1))}>Siguiente<ChevronRight size={16} /></button></div></div>}
    </div>
  )
}
