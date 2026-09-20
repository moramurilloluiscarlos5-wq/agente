import { useId, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { useDebouncedValue, useDirectoryRecords } from '../../hooks/useDirectoryRecords.js'
import { DirectoryLoading, DirectoryMessage, DirectoryPagination, directoryInputClass } from './DirectoryUi.jsx'

export default function DirectoryCustomerPicker({ value, selectedCustomer, onChange, disabled = false, label = 'Cliente *' }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(query)
  const id = useId()
  const { payload, error, loading, reload } = useDirectoryRecords(`/customers?${new URLSearchParams({ q: debounced, page: String(page), limit: '6' })}`)
  return (
    <section className="space-y-2 rounded-xl border border-slate-700 p-3" aria-label={label}>
      <label htmlFor={id} className="block text-sm text-slate-300">{label}</label>
      {selectedCustomer && <p className="flex items-center gap-2 text-sm text-cyan-300"><Check size={16} />Seleccionado: {selectedCustomer.first_name} {selectedCustomer.last_name} · {selectedCustomer.phone}</p>}
      <div className="relative"><Search size={17} className="pointer-events-none absolute left-3 top-3 text-slate-500" /><input id={id} type="search" value={query} disabled={disabled} maxLength={100} placeholder="Buscar cliente por nombre o teléfono" onChange={(event) => { setQuery(event.target.value); setPage(1) }} className={`${directoryInputClass} pl-9`} /></div>
      {loading ? <DirectoryLoading /> : error ? <><DirectoryMessage error>{error}</DirectoryMessage><button type="button" onClick={reload} className="text-sm text-cyan-300">Reintentar</button></> : <>
        <ul className="grid gap-2 sm:grid-cols-2">{(payload?.data ?? []).map((customer) => <li key={customer.id}><button type="button" disabled={disabled} aria-pressed={value === customer.id} onClick={() => onChange(customer)} className={`h-full w-full rounded-lg border p-2.5 text-left text-sm hover:border-cyan-400 disabled:opacity-50 ${value === customer.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 bg-slate-950'}`}><span className="block text-slate-200">{customer.first_name} {customer.last_name}</span><span className="text-xs text-slate-400">{customer.phone}</span></button></li>)}</ul>
        {!payload?.data?.length && <p className="py-3 text-sm text-slate-400">No se encontraron clientes. Puedes registrarlos en Clientes.</p>}
        <DirectoryPagination page={page} limit={6} count={payload?.count ?? 0} onPage={setPage} disabled={disabled} />
      </>}
    </section>
  )
}
