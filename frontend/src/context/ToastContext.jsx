import { useCallback, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { ToastContext } from './toast.js'

const ICONS = { success: CheckCircle2, error: CircleAlert, info: Info }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counter = useRef(0)
  const dismiss = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])
  const push = useCallback((tone, message) => {
    const id = ++counter.current
    setToasts((current) => [...current.slice(-2), { id, tone, message }])
    setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
  }, [dismiss])
  const api = useMemo(() => ({
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="tf-toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map(({ id, tone, message }) => {
          const Icon = ICONS[tone] ?? Info
          return (
            <div key={id} className={`tf-toast tf-toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
              <Icon size={16} aria-hidden="true" />
              <p className="min-w-0 flex-1">{message}</p>
              <button type="button" className="-m-1 rounded p-1 text-[var(--tf-text-subtle)] hover:text-[var(--tf-text)]" onClick={() => dismiss(id)} aria-label="Cerrar aviso"><X size={14} /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
