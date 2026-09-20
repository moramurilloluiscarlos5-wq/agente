import { LoaderCircle } from 'lucide-react'

const BUTTON_VARIANTS = {
  primary: 'ct-btn ct-btn-primary',
  secondary: 'ct-btn ct-btn-secondary',
  ghost: 'ct-btn ct-btn-ghost',
  danger: 'ct-btn ct-btn-danger',
}

export function Button({ variant = 'secondary', className = '', busy = false, disabled = false, children, ...props }) {
  return <button className={`${BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary} ${className}`} disabled={busy || disabled} {...props}>{busy && <LoaderCircle size={15} className="animate-spin" />}{children}</button>
}

export function Input({ label, hint, error, id, className = '', ...props }) {
  return <label htmlFor={id} className="block text-sm text-slate-300">{label && <span className="mb-1.5 block">{label}</span>}<input id={id} className={`ct-input ${className}`} {...props} />{error ? <span className="mt-1.5 block text-xs text-red-300">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-slate-500">{hint}</span> : null}</label>
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="ct-empty">{Icon && <Icon size={22} />}{title && <h2>{title}</h2>}{description && <p>{description}</p>}{action && <div className="mt-4">{action}</div>}</div>
}

export function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-slate-800/80 ${className}`} />
}
