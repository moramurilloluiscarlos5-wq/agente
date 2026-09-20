import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { api } from '../../services/api.js'
import { repairInputClass, repairSecondaryClass } from './repairForm.js'

export default function RepairRecordPicker({ endpoint, label, selected, onSelect, describe, disabled = false }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ data: [], count: 0, key: '', error: '' })
  const [revision, setRevision] = useState(0)
  const limit = 5
  const requestKey = JSON.stringify([endpoint, query, page, revision])
  const loading = result.key !== requestKey
  const error = loading ? '' : result.error

  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      try {
        const separator = endpoint.includes('?') ? '&' : '?'
        const params = new URLSearchParams({ q: query.trim(), page: String(page), limit: String(limit) })
        const response = await api.get(`${endpoint}${separator}${params}`)
        if (active) setResult({ ...response, key: requestKey, error: '' })
      } catch (err) {
        if (active) setResult({ data: [], count: 0, key: requestKey, error: err.message })
      }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [endpoint, query, page, requestKey])

  const pages = Math.max(1, Math.ceil(result.count / limit))
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <label className="relative block">
        <span className="sr-only">Buscar {label}</span>
        <Search size={16} className="absolute left-3 top-3 text-slate-500" />
        <input className={`${repairInputClass} pl-9`} placeholder={`Buscar ${label}…`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} />
      </label>
      {selected && <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">Seleccionado: {describe(selected)}</p>}
      <div aria-live="polite" className="space-y-2">
        {loading ? <p className="py-4 text-sm text-slate-400">Buscando {label}…</p>
          : error ? <div role="alert" className="space-y-2 text-sm text-red-300"><p>{error}</p><button type="button" className={repairSecondaryClass} onClick={() => setRevision((value) => value + 1)}>Reintentar</button></div>
          : result.data.length === 0 ? <p className="py-4 text-sm text-slate-500">No se encontraron resultados.</p>
          : result.data.map((record) => <button type="button" key={record.id} aria-pressed={selected?.id === record.id} onClick={() => onSelect(record)} className={`block w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${selected?.id === record.id ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200' : 'border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-800/50'}`}>{describe(record)}</button>)}
      </div>
      {!error && <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>{result.count} resultado{result.count === 1 ? '' : 's'} · {page} / {pages}</span>
        <div className="flex gap-2"><button type="button" aria-label={`Página anterior de ${label}`} className={repairSecondaryClass} disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><button type="button" aria-label={`Página siguiente de ${label}`} className={repairSecondaryClass} disabled={loading || page >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div>
      </div>}
    </fieldset>
  )
}
