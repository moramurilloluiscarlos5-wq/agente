import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Copy, Info, LoaderCircle, RotateCcw, Search, X } from 'lucide-react'
import { useToast } from '../../hooks/useToast.js'
import { friendlyError } from '../../utils/errors.js'

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
      {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

/* ---------- Tooltip (hover con mouse y foco con teclado) ---------- */
function TooltipBubble({ rect, label, shortcut, id }) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ top: rect.bottom + 8, left: rect.left, ready: false })
  useLayoutEffect(() => {
    const width = ref.current?.offsetWidth ?? 0
    const height = ref.current?.offsetHeight ?? 0
    const gutter = 8
    const centered = rect.left + rect.width / 2 - width / 2
    const left = Math.min(Math.max(gutter, centered), window.innerWidth - width - gutter)
    const below = rect.bottom + 8
    const top = below + height > window.innerHeight - gutter ? rect.top - height - 8 : below
    setPosition({ top, left, ready: true })
  }, [rect])
  return createPortal(
    <span ref={ref} id={id} role="tooltip" className="tf-tooltip" style={{ top: position.top, left: position.left, visibility: position.ready ? 'visible' : 'hidden' }}>
      {label}{shortcut && <kbd className="tf-kbd">{shortcut}</kbd>}
    </span>,
    document.body,
  )
}

export function Tooltip({ label, shortcut, children, className = 'inline-flex' }) {
  const ref = useRef(null)
  const id = useId()
  const [rect, setRect] = useState(null)
  const show = () => setRect(ref.current?.getBoundingClientRect() ?? null)
  const hide = () => setRect(null)
  useEffect(() => {
    if (!rect) return undefined
    const close = () => setRect(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [rect])
  return (
    <span ref={ref} className={className}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') show() }} onPointerLeave={hide}
      onFocus={(event) => { if (event.target.matches?.(':focus-visible')) show() }} onBlur={hide}
      onKeyDown={(event) => { if (event.key === 'Escape') hide() }} onClick={hide}>
      {children}
      {rect && <TooltipBubble rect={rect} label={label} shortcut={shortcut} id={id} />}
    </span>
  )
}

// Botón cuadrado de solo ícono: nombre accesible + tooltip con la misma etiqueta.
export function IconButton({ label, icon: Icon, shortcut, iconSize = 16, className = '', tone, ...props }) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button type="button" aria-label={label} className={`tf-icon-btn ${tone === 'danger' ? 'hover:!text-[var(--tf-danger)]' : ''} ${className}`} {...props}>
        <Icon size={iconSize} aria-hidden="true" />
      </button>
    </Tooltip>
  )
}

/* ---------- Campos con validación al salir del campo ---------- */
function validityMessage(element) {
  const v = element.validity
  if (v.valueMissing) return element.tagName === 'SELECT' ? 'Elige una opción.' : 'Completa este dato para continuar.'
  if (v.typeMismatch && element.type === 'email') return 'Escribe un correo como nombre@taller.com.'
  if (v.typeMismatch) return 'Revisa el formato de este dato.'
  if (v.badInput) return 'Escribe solo números.'
  if (v.tooShort) return `Usa al menos ${element.minLength} caracteres.`
  if (v.rangeUnderflow) return `Escribe un valor de ${element.min} o más.`
  if (v.rangeOverflow) return `Escribe un valor de ${element.max} o menos.`
  if (v.stepMismatch) return element.step === '1' ? 'Escribe un número entero.' : 'Usa como máximo dos decimales.'
  if (v.patternMismatch) return element.title || 'Revisa el formato de este dato.'
  return element.validationMessage
}

function useBlurValidation({ onBlur, onChange, onFocus }) {
  const [blurError, setBlurError] = useState('')
  return {
    blurError,
    handlers: {
      onBlur: (event) => { if (!event.target.checkValidity()) setBlurError(validityMessage(event.target)); onBlur?.(event) },
      onChange: (event) => { if (blurError) setBlurError(''); onChange?.(event) },
      onFocus: (event) => { onFocus?.(event) },
    },
  }
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

export function Input({ label, hint, error, id: givenId, className = '', fieldClassName = '', required, onBlur, onChange, onFocus, ...props }) {
  const autoId = useId()
  const id = givenId || autoId
  const { blurError, handlers } = useBlurValidation({ onBlur, onChange, onFocus })
  const shown = error || blurError
  return <FieldShell id={id} label={label} hint={hint} error={shown} required={required} className={fieldClassName}>
    <input id={id} className={`ct-input ${className}`} required={required} aria-invalid={shown ? true : undefined} aria-describedby={describedBy(id, hint, shown)} {...handlers} {...props} />
  </FieldShell>
}

export function Select({ label, hint, error, id: givenId, className = '', fieldClassName = '', required, children, onBlur, onChange, onFocus, ...props }) {
  const autoId = useId()
  const id = givenId || autoId
  const { blurError, handlers } = useBlurValidation({ onBlur, onChange, onFocus })
  const shown = error || blurError
  return <FieldShell id={id} label={label} hint={hint} error={shown} required={required} className={fieldClassName}>
    <select id={id} className={`ct-select ${className}`} required={required} aria-invalid={shown ? true : undefined} aria-describedby={describedBy(id, hint, shown)} {...handlers} {...props}>{children}</select>
  </FieldShell>
}

export function Textarea({ label, hint, error, id: givenId, className = '', fieldClassName = '', required, onBlur, onChange, onFocus, ...props }) {
  const autoId = useId()
  const id = givenId || autoId
  const { blurError, handlers } = useBlurValidation({ onBlur, onChange, onFocus })
  const shown = error || blurError
  return <FieldShell id={id} label={label} hint={hint} error={shown} required={required} className={fieldClassName}>
    <textarea id={id} className={`ct-textarea ${className}`} required={required} aria-invalid={shown ? true : undefined} aria-describedby={describedBy(id, hint, shown)} {...handlers} {...props} />
  </FieldShell>
}

/* ---------- Filtros con etiqueta visible ---------- */
export function SearchField({ label, value, onChange, placeholder, className = '', visibleLabel = 'Buscar' }) {
  const id = useId()
  return (
    <div className={`tf-filter tf-filter-grow ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-[var(--tf-text-subtle)]">{visibleLabel}</label>
      <div className="tf-search">
        <Search size={16} aria-hidden="true" className="shrink-0" />
        <input id={id} type="search" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      </div>
    </div>
  )
}

export function FilterSelect({ label, ariaLabel, value, onChange, children, className = '' }) {
  const id = useId()
  return (
    <div className={`tf-filter ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-[var(--tf-text-subtle)]">{label}</label>
      <select id={id} aria-label={ariaLabel} className="ct-select" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </div>
  )
}

/* ---------- Estructura ---------- */
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
      <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-1 opacity-90' : ''}>{children}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}

// Error con recuperación: reintentar y copiar detalles técnicos para soporte.
export function ErrorAlert({ error, action = 'cargar la información', onRetry, className = '' }) {
  const toast = useToast()
  const copy = async () => {
    const details = [
      `Acción: ${action}`,
      `Mensaje: ${error?.message ?? String(error)}`,
      error?.status ? `Estado HTTP: ${error.status}` : null,
      error?.code ? `Código: ${error.code}` : null,
      `Página: ${window.location.pathname}`,
      `Fecha: ${new Date().toISOString()}`,
    ].filter(Boolean).join('\n')
    try { await navigator.clipboard.writeText(details); toast.success('Detalles copiados. Pégalos en tu mensaje a soporte.') }
    catch { toast.error('No se pudieron copiar los detalles. Toma una captura de pantalla de este aviso.') }
  }
  return (
    <Alert tone="error" className={className} action={<>
      {onRetry && <Button size="sm" icon={RotateCcw} onClick={onRetry}>Reintentar</Button>}
      <Button size="sm" variant="ghost" icon={Copy} onClick={copy}>Copiar detalles</Button>
    </>}>{friendlyError(error, action)}</Alert>
  )
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`ct-empty ${className}`}>
      {Icon && <span className="tf-empty-icon"><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></span>}
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '', style }) {
  return <span aria-hidden="true" className={`tf-skeleton ${className}`} style={style} />
}

export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div role="status" aria-label="Cargando información" className="space-y-4 p-4">
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
      <div className="flex items-center gap-2">
        <Button size="sm" icon={ChevronLeft} onClick={() => onPage(page - 1)} disabled={page <= 1}>Anterior</Button>
        <span className="tf-num px-1">Página {page} de {pages}</span>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>Siguiente<ChevronRight size={16} aria-hidden="true" /></Button>
      </div>
    </nav>
  )
}

/* ---------- Superficies superpuestas ---------- */
export function Dialog({ open, title, description, onClose, children, footer, wide = false, sheet = false, labelledBy }) {
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
    <div className={`tf-backdrop ${sheet ? 'is-sheet' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy || titleId} className={sheet ? 'tf-sheet' : `tf-dialog ${wide ? 'tf-dialog-wide' : ''}`}>
        <div className="tf-dialog-header">
          <div className="min-w-0"><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
          <IconButton label="Cerrar" icon={X} iconSize={18} className="-mr-2 -mt-1" onClick={onClose} />
        </div>
        <div className="tf-dialog-body">{children}</div>
        {footer && <div className="tf-dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// Confirmación destructiva: nombra el registro, verbo destructivo y foco inicial en Cancelar.
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'danger', busy = false, onConfirm, onCancel }) {
  return (
    <Dialog open={open} title={title} onClose={busy ? undefined : onCancel}
      footer={<>
        <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger-solid' : 'primary'} onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
      </>}>
      <p className="text-sm leading-relaxed text-[var(--tf-text-muted)]">{description}</p>
    </Dialog>
  )
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`ct-status ct-status-${tone}`}>{children}</span>
}

// Encabezado de tabla + barra de filtros dentro de una tarjeta.
export function DataCard({ toolbar, children, footer }) {
  return (
    <section className="tf-card overflow-hidden">
      {toolbar && <div className="tf-toolbar">{toolbar}</div>}
      {children}
      {footer}
    </section>
  )
}

/* ---------- Página de formulario (patrón Form) ---------- */
export function FormPage({ title, description, backTo, backLabel, children, footer, notice }) {
  return (
    <div className="tf-form-page space-y-6">
      <div>
        <Link to={backTo} className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />{backLabel}</Link>
        <h1 className="ct-page-title mt-2">{title}</h1>
        {description && <p className="ct-page-description">{description}</p>}
      </div>
      {notice}
      <section className="tf-card">
        <div className="tf-card-body">
          {children}
          {footer && <div className="tf-form-page-actions mt-6">{footer}</div>}
        </div>
      </section>
    </div>
  )
}

export function DraftNotice({ onDiscard }) {
  return (
    <Alert tone="info">
      <div className="tf-draft-note"><span>Recuperamos lo que estabas capturando.</span><Button size="sm" variant="ghost" onClick={onDiscard}>Descartar borrador</Button></div>
    </Alert>
  )
}
