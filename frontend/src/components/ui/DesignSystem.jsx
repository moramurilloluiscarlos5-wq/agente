import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Info, LoaderCircle, Search, X } from 'lucide-react'

const BUTTON_VARIANTS = {
  primary: 'ct-btn ct-btn-primary',
  secondary: 'ct-btn ct-btn-secondary',
  ghost: 'ct-btn ct-btn-ghost',
  danger: 'ct-btn ct-btn-danger',
  'danger-solid': 'ct-btn ct-btn-danger-solid',
}

export function Button({ variant = 'secondary', size, className = '', busy = false, disabled = false, icon: Icon, children, type = 'button', ...props }) {
  const sizeClass = size === 'sm' ? 'ct-btn-sm' : size === 'lg' ? 'ct-btn-lg' : ''
  return (
    <button type={type} className={`${BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary} ${sizeClass} ${className}`} disabled={busy || disabled} aria-busy={busy || undefined} {...props}>
      {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : Icon ? <Icon size={15} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

function FieldShell({ id, label, hint, error, required, children, className = '' }) {
  return (
    <div className={`tf-field ${className}`}>
      {label && <label htmlFor={id} className="tf-label">{label}{required && <span className="tf-required"> (obligatorio)</span>}</label>}
      {children}
      {error ? <p id={`${id}-error`} className="tf-error" role="alert">{error}</p> : hint ? <p id={`${id}-hint`} className="tf-hint">{hint}</p> : null}
    </div>
  )
}

function describedBy(id, hint, error) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined
}

export function Input({ label, hint, error, id: givenId, className = '', fieldClassName = '', required, ...props }) {
  const autoId = useId()
  const id = givenId || autoId
  return <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
    <input id={id} className={`ct-input ${className}`} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props} />
  </FieldShell>
}

export function Select({ label, hint, error, id: givenId, className = '', fieldClassName = '', required, children, ...props }) {
  const autoId = useId()
  const id = givenId || autoId
  return <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
    <select id={id} className={`ct-select ${className}`} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props}>{children}</select>
  </FieldShell>
}

export function Textarea({ label, hint, error, id: givenId, className = '', fieldClassName = '', required, ...props }) {
  const autoId = useId()
  const id = givenId || autoId
  return <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
    <textarea id={id} className={`ct-textarea ${className}`} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props} />
  </FieldShell>
}

export function SearchField({ label, value, onChange, placeholder, className = '' }) {
  return (
    <label className={`tf-search ${className}`}>
      <Search size={15} aria-hidden="true" className="shrink-0" />
      <input type="search" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

export function Card({ title, description, actions, children, className = '', bodyClassName = 'tf-card-body', as: Tag = 'section', ...props }) {
  return (
    <Tag className={`tf-card ${className}`} {...props}>
      {(title || actions) && <header className="tf-card-header">
        <div className="min-w-0">{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>}
      {bodyClassName === null ? children : <div className={bodyClassName}>{children}</div>}
    </Tag>
  )
}

const ALERT_ICONS = { error: CircleAlert, warning: AlertTriangle, info: Info, success: CheckCircle2 }

export function Alert({ tone = 'info', title, children, action, className = '' }) {
  const Icon = ALERT_ICONS[tone] ?? Info
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`tf-alert tf-alert-${tone} ${className}`}>
      <Icon size={16} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`ct-empty ${className}`}>
      {Icon && <span className="tf-empty-icon"><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></span>}
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '', style }) {
  return <span aria-hidden="true" className={`tf-skeleton ${className}`} style={style} />
}

export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div role="status" aria-label="Cargando información" className="space-y-3 p-4">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: columns }, (_, column) => <Skeleton key={column} className="h-4 flex-1" style={{ maxWidth: column === 0 ? '9rem' : undefined }} />)}
        </div>
      ))}
    </div>
  )
}

export function Pagination({ page, limit, count, onPage, label = 'registros' }) {
  const total = Number(count) || 0
  const pages = Math.max(1, Math.ceil(total / limit))
  if (total <= limit) return total ? <div className="tf-pagination"><span className="tf-num">{total} {label}</span></div> : null
  const from = (page - 1) * limit + 1
  const to = Math.min(total, page * limit)
  return (
    <nav className="tf-pagination" aria-label="Paginación">
      <span className="tf-num">{from}–{to} de {total} {label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className="ct-btn ct-btn-secondary ct-btn-sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior"><ChevronLeft size={14} /></button>
        <span className="tf-num px-1.5">Página {page} de {pages}</span>
        <button type="button" className="ct-btn ct-btn-secondary ct-btn-sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Página siguiente"><ChevronRight size={14} /></button>
      </div>
    </nav>
  )
}

export function Dialog({ open, title, description, onClose, children, footer, wide = false, labelledBy }) {
  const panelRef = useRef(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const focusable = () => panelRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []
    const first = [...focusable()].find((element) => !element.disabled && element.dataset.autofocus !== undefined) ?? [...focusable()].find((element) => !element.disabled && element.tagName !== 'BUTTON') ?? focusable()[0]
    first?.focus()
    function onKey(event) {
      if (event.key === 'Escape') { event.stopPropagation(); onClose?.() }
      if (event.key === 'Tab') {
        const items = [...focusable()].filter((element) => !element.disabled)
        if (!items.length) return
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); items[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus?.() }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="tf-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy || titleId} className={`tf-dialog ${wide ? 'tf-dialog-wide' : ''}`}>
        <div className="tf-dialog-header">
          <div className="min-w-0"><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
          <button type="button" className="tf-icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
        </div>
        <div className="tf-dialog-body">{children}</div>
        {footer && <div className="tf-dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'danger', busy = false, onConfirm, onCancel }) {
  return (
    <Dialog open={open} title={title} onClose={busy ? undefined : onCancel}
      footer={<>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger-solid' : 'primary'} onClick={onConfirm} busy={busy} data-autofocus>{confirmLabel}</Button>
      </>}>
      <p className="text-sm leading-relaxed text-[var(--tf-text-muted)]">{description}</p>
    </Dialog>
  )
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`ct-status ct-status-${tone}`}>{children}</span>
}

// Encabezado de tabla + barra de herramientas dentro de una tarjeta.
export function DataCard({ toolbar, children, footer }) {
  return (
    <section className="tf-card overflow-hidden">
      {toolbar && <div className="tf-toolbar">{toolbar}</div>}
      {children}
      {footer}
    </section>
  )
}
