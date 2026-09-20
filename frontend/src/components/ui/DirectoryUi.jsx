import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react'
import StatusBadge from './StatusBadge.jsx'
import { formatDate } from '../../utils/formatters.js'

export const directoryInputClass = 'ct-input'
export const directoryButtonClass = 'ct-btn ct-btn-secondary'
export const directoryPrimaryClass = 'ct-btn ct-btn-primary'

export function DirectoryMessage({ children, error = false }) {
  if (!children) return null
  return <div role={error ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>{children}</div>
}

export function DirectoryLoading() {
  return <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400"><LoaderCircle className="animate-spin" size={18} />Cargando…</div>
}

export function DirectoryPagination({ page, limit, count, onPage, disabled = false }) {
  const pages = Math.max(1, Math.ceil(count / limit))
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-sm text-slate-400">
      <span>{count} {count === 1 ? 'registro' : 'registros'} · Página {page} de {pages}</span>
      <div className="flex gap-2">
        <button type="button" aria-label="Página anterior" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} className={directoryButtonClass}><ChevronLeft size={16} />Anterior</button>
        <button type="button" aria-label="Página siguiente" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)} className={directoryButtonClass}>Siguiente<ChevronRight size={16} /></button>
      </div>
    </div>
  )
}

export function DirectoryModal({ title, onClose, busy = false, children }) {
  const dialog = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])
  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-[16px] border border-slate-700/80 bg-[#162235] p-0 text-slate-100 shadow-2xl backdrop:bg-black/70">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-700/70 bg-[#162235] px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold">{title}</h2>
        <button type="button" aria-label="Cerrar ventana" disabled={busy} onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"><X size={20} /></button>
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </dialog>
  )
}

export function DirectoryField({ label, name, value, onChange, required = false, textarea = false, ...props }) {
  const id = useId()
  const Component = textarea ? 'textarea' : 'input'
  return (
    <div className={textarea ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="mb-1.5 block text-sm text-slate-300">{label}{required ? ' *' : ''}</label>
      <Component id={id} name={name} value={value ?? ''} onChange={(event) => onChange(name, event.target.value)} required={required} rows={textarea ? 3 : undefined} className={directoryInputClass} {...props} />
    </div>
  )
}

export function DirectoryFacts({ items }) {
  return <dl className="grid gap-4 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">{value || 'Sin registrar'}</dd></div>)}</dl>
}

export function DirectoryRepairHistory({ repairs = [] }) {
  return (
    <section className="space-y-3 border-t border-slate-800 pt-5">
      <h3 className="font-semibold text-white">Historial de reparaciones</h3>
      {repairs.length === 0 ? <p className="text-sm text-slate-400">Todavía no hay reparaciones registradas.</p> : (
        <ul className="space-y-2">{repairs.map((repair) => <li key={repair.id}>
          <Link to={`/reparaciones/${encodeURIComponent(repair.order_number)}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-3 hover:border-cyan-500/50">
            <div className="min-w-0"><p className="font-medium text-cyan-300">{repair.order_number}</p><p className="text-sm text-slate-300">{[repair.brand, repair.model].filter(Boolean).join(' ') || 'Equipo registrado'}</p><p className="mt-1 text-xs text-slate-500">{formatDate(repair.received_at || repair.created_at)}</p></div>
            <StatusBadge status={repair.status} />
          </Link>
        </li>)}</ul>
      )}
    </section>
  )
}
