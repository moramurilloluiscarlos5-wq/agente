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
  return <div role={error ? 'alert' : 'status'} className={`tf-alert ${error ? 'tf-alert-error' : 'tf-alert-success'}`}>{children}</div>
}

export function DirectoryLoading() {
  return <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--tf-text-muted)]"><LoaderCircle className="animate-spin" size={16} aria-hidden="true" />Cargando…</div>
}

export function DirectoryPagination({ page, limit, count, onPage, disabled = false }) {
  const pages = Math.max(1, Math.ceil(count / limit))
  return (
    <div className="tf-pagination">
      <span className="tf-num">{count} {count === 1 ? 'registro' : 'registros'}{pages > 1 ? `, página ${page} de ${pages}` : ''}</span>
      {pages > 1 && <div className="flex gap-2">
        <button type="button" aria-label="Página anterior" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} className="ct-btn ct-btn-secondary ct-btn-sm"><ChevronLeft size={14} /></button>
        <button type="button" aria-label="Página siguiente" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)} className="ct-btn ct-btn-secondary ct-btn-sm"><ChevronRight size={14} /></button>
      </div>}
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
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} className="tf-native-dialog fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto p-0">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--tf-border)] bg-[var(--tf-surface-raised)] px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">{title}</h2>
        <button type="button" aria-label="Cerrar ventana" disabled={busy} onClick={onClose} className="tf-icon-btn -mr-2"><X size={17} /></button>
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
      <label htmlFor={id} className="tf-label">{label}{required && <span className="tf-required"> (obligatorio)</span>}</label>
      <Component id={id} name={name} value={value ?? ''} onChange={(event) => onChange(name, event.target.value)} required={required} rows={textarea ? 3 : undefined} className={textarea ? 'ct-textarea' : directoryInputClass} {...props} />
    </div>
  )
}

export function DirectoryFacts({ items }) {
  return <dl className="grid gap-4 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--tf-text-subtle)]">{label}</dt><dd className={`mt-1 whitespace-pre-wrap break-words text-sm ${value ? 'text-[var(--tf-text)]' : 'text-[var(--tf-text-subtle)]'}`}>{value || 'Sin registrar'}</dd></div>)}</dl>
}

export function DirectoryRepairHistory({ repairs = [] }) {
  return (
    <section className="space-y-3 border-t border-[var(--tf-border)] pt-5">
      <h3 className="text-sm font-semibold">Historial de reparaciones</h3>
      {repairs.length === 0 ? <p className="text-sm text-[var(--tf-text-muted)]">Todavía no hay reparaciones registradas.</p> : (
        <ul className="overflow-hidden rounded-[var(--tf-radius-control)] border border-[var(--tf-border)]">{repairs.map((repair) => <li key={repair.id} className="border-t border-[var(--tf-border)] first:border-t-0">
          <Link to={`/reparaciones/${encodeURIComponent(repair.order_number)}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[rgba(148,163,184,.05)]">
            <div className="min-w-0"><p className="tf-num text-sm font-medium text-[var(--tf-link)]">{repair.order_number}</p><p className="text-sm text-[var(--tf-text-muted)]">{[repair.brand, repair.model].filter(Boolean).join(' ') || 'Equipo registrado'}, {formatDate(repair.received_at || repair.created_at)}</p></div>
            <StatusBadge status={repair.status} />
          </Link>
        </li>)}</ul>
      )}
    </section>
  )
}
