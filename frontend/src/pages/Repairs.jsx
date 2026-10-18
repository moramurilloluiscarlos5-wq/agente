import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, Wrench } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { REPAIR_STATUSES } from '../utils/constants.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { customerName, deviceName, repairButtonClass, repairInputClass, repairSecondaryClass } from '../components/repairs/repairForm.js'

function pageList(current, total, size = 5) {
  let start = Math.max(1, current - Math.floor(size / 2))
  const end = Math.min(total, start + size - 1)
  start = Math.max(1, end - size + 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export default function Repairs() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [result, setResult] = useState({ data: [], count: 0, key: '', error: '' })
  const [revision, setRevision] = useState(0)
  const [openMenu, setOpenMenu] = useState(null)
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
  const from = result.count === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, result.count)
  return (
    <div className="ct-page space-y-5">
      <header className="ct-page-header">
        <div>
          <h1 className="ct-page-title">Reparaciones</h1>
          <p className="ct-page-description">{profile?.role === 'TECNICO' ? 'Órdenes asignadas a ti y su avance en el taller.' : 'Recepción, seguimiento y entrega de los equipos del taller.'}</p>
        </div>
        {canCreate && <Link className={repairButtonClass} to="/reparaciones/nueva"><Plus size={16} />Nueva reparación</Link>}
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-4">
        <label className="relative min-w-52 flex-1 sm:max-w-sm"><span className="sr-only">Buscar reparaciones</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input className={`${repairInputClass} pl-9`} placeholder="Buscar orden, cliente, equipo o problema…" value={query} onChange={(event) => updateFilter('q', event.target.value)} /></label>
        <label className="w-44"><span className="sr-only">Filtrar por estado</span><select className={repairInputClass} value={status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">Todos los estados</option>{Object.entries(REPAIR_STATUSES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
        {(params.get('customer_id') || params.get('device_id')) && <button className={repairSecondaryClass} onClick={() => setParams({})}>Quitar filtros</button>}
      </div>

      <div aria-live="polite">
        {loading ? <p className="py-12 text-center text-sm text-slate-500">Cargando reparaciones…</p>
          : error ? <div role="alert" className="space-y-3 py-8 text-center"><p className="text-sm text-red-300">{error}</p><button className={repairSecondaryClass} onClick={() => setRevision((value) => value + 1)}>Reintentar</button></div>
          : result.data.length === 0 ? (
            <div className="ct-empty">
              <Wrench size={20} strokeWidth={1.75} />
              <h2>No hay reparaciones todavía</h2>
              <p>{filters ? 'Prueba con otra búsqueda o cambia los filtros.' : 'Cuando recibas un equipo, aparecerá aquí.'}</p>
              {!filters && canCreate && <Link className="ct-btn ct-btn-primary" to="/reparaciones/nueva"><Plus size={16} />Registrar primera reparación</Link>}
            </div>
          )
          : (
            <div className="ct-table-shell">
              <table className="ct-table min-w-[900px]">
                <thead><tr>{['Orden', 'Cliente', 'Equipo', 'Estado', 'Responsable', 'Entrega', ''].map((title, index) => <th key={index} className={index === 6 ? 'w-12' : undefined}>{title}</th>)}</tr></thead>
                <tbody>
                  {result.data.map((repair) => (
                    <tr key={repair.id}>
                      <td><Link className="font-medium text-slate-100 hover:text-blue-300" to={`/reparaciones/${encodeURIComponent(repair.order_number)}`}>{repair.order_number}</Link><p className="mt-0.5 text-xs text-slate-500">{formatDate(repair.received_at)}</p></td>
                      <td><p className="text-slate-200">{customerName(repair.customer)}</p><p className="mt-0.5 text-xs text-slate-500">{repair.customer?.phone}</p></td>
                      <td className="max-w-60"><p className="text-slate-200">{deviceName(repair.device ?? repair)}</p><p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{repair.reported_problem}</p></td>
                      <td><StatusBadge status={repair.status} /></td>
                      <td>{repair.technician?.full_name || 'Sin asignar'}</td>
                      <td><p className="text-slate-200">{formatCurrency(repair.estimated_cost)}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(repair.estimated_delivery_at)}</p></td>
                      <td className="relative text-right">
                        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-200" aria-label="Acciones" aria-expanded={openMenu === repair.id} onClick={() => setOpenMenu(openMenu === repair.id ? null : repair.id)}><MoreHorizontal size={16} /></button>
                        {openMenu === repair.id && (
                          <>
                            <button type="button" className="fixed inset-0 z-10 cursor-default" aria-hidden="true" onClick={() => setOpenMenu(null)} />
                            <div className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-slate-700/80 bg-[var(--ct-surface-raised)] py-1 text-left shadow-xl shadow-black/40">
                              <Link className="block px-3 py-1.5 text-[13px] text-slate-300 hover:bg-slate-800/60 hover:text-slate-100" to={`/reparaciones/${encodeURIComponent(repair.order_number)}`} onClick={() => setOpenMenu(null)}>Ver detalles</Link>
                              <button type="button" className="block w-full px-3 py-1.5 text-left text-[13px] text-slate-300 hover:bg-slate-800/60 hover:text-slate-100" onClick={() => { setOpenMenu(null); window.print() }}>Imprimir</button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {!error && result.data.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-slate-500">
          <span>{from}–{to} de {result.count} órdenes</span>
          <div className="flex items-center gap-1">
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200 disabled:opacity-40" disabled={loading || page <= 1} onClick={() => updateFilter('page', String(page - 1))} aria-label="Página anterior"><ChevronLeft size={15} /></button>
            {pageList(page, pages).map((value) => <button key={value} type="button" className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1 text-[13px] transition-colors ${value === page ? 'bg-slate-800 font-medium text-slate-100' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`} onClick={() => updateFilter('page', String(value))}>{value}</button>)}
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200 disabled:opacity-40" disabled={loading || page >= pages} onClick={() => updateFilter('page', String(page + 1))} aria-label="Página siguiente"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
