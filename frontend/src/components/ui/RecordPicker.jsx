import { useEffect, useId, useRef, useState } from 'react'
import { Check, LoaderCircle, Search, X } from 'lucide-react'
import { api } from '../../services/api.js'
import { useDebouncedValue } from '../../hooks/useDirectoryRecords.js'

// Selector con búsqueda contra un endpoint real (clientes, órdenes, artículos).
// `path` recibe el texto buscado y devuelve la URL a consultar.
export default function RecordPicker({ label, value, onChange, path, renderLabel, renderMeta, placeholder = 'Escribe para buscar', required, error, hint, disabled, emptyText = 'Sin resultados.' }) {
  const id = useId()
  const listId = `${id}-list`
  const wrapperRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [response, setResponse] = useState({ url: null, results: [], failed: false })
  const [active, setActive] = useState(0)
  const debounced = useDebouncedValue(text, 250)
  const url = open ? path(debounced.trim()) : null
  const settled = response.url === url
  const loading = Boolean(url) && !settled
  const results = settled ? response.results : []
  const failed = settled && response.failed

  useEffect(() => {
    if (!url) return undefined
    let current = true
    api.get(url).then((payload) => { if (current) { setResponse({ url, results: payload.data ?? [], failed: false }); setActive(0) } })
      .catch(() => { if (current) setResponse({ url, results: [], failed: true }) })
    return () => { current = false }
  }, [url])

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (!wrapperRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const choose = (record) => { onChange(record); setOpen(false); setText('') }
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, results.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter' && open && results[active]) { event.preventDefault(); choose(results[active]) }
    else if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false) }
  }

  return (
    <div className="tf-field" ref={wrapperRef}>
      <label htmlFor={id} className="tf-label">{label}{required && <span className="tf-required"> (obligatorio)</span>}</label>
      {value ? (
        <div className="flex min-h-10 items-center justify-between gap-2 rounded-[var(--tf-radius-control)] border border-[var(--tf-border-strong)] bg-[var(--tf-surface-sunken)] px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--tf-text)]"><Check size={14} className="shrink-0 text-[var(--tf-accent)]" aria-hidden="true" /><span className="truncate">{renderLabel(value)}</span></span>
          {!disabled && <button type="button" className="tf-icon-btn -mr-2 h-7 w-7" onClick={() => onChange(null)} aria-label={`Quitar ${label.toLowerCase()}`}><X size={14} /></button>}
        </div>
      ) : (
        <div className="relative">
          <div className="tf-search min-h-10 bg-[var(--tf-surface-sunken)]" style={{ borderColor: error ? 'rgba(248,113,113,.6)' : undefined }}>
            <Search size={15} className="shrink-0" aria-hidden="true" />
            <input id={id} type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-invalid={error ? true : undefined}
              aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
              value={text} disabled={disabled} placeholder={placeholder} autoComplete="off"
              onFocus={() => setOpen(true)} onChange={(event) => { setText(event.target.value); setOpen(true) }} onKeyDown={onKeyDown} />
            {loading && <LoaderCircle size={14} className="shrink-0 animate-spin" aria-hidden="true" />}
          </div>
          {open && (
            <ul id={listId} role="listbox" className="tf-popover left-0 right-0 mt-1 max-h-60 overflow-y-auto p-1">
              {failed ? <li className="px-3 py-3 text-sm text-[#fca5a5]">No pudimos buscar. Revisa tu conexión.</li>
                : !loading && !results.length ? <li className="px-3 py-3 text-sm text-[var(--tf-text-muted)]">{emptyText}</li>
                  : results.map((record, index) => (
                    <li key={record.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}
                      onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(record)}
                      className={`cursor-pointer rounded-md px-3 py-2 ${index === active ? 'bg-[rgba(148,163,184,.1)]' : ''}`}>
                      <span className="block text-sm text-[var(--tf-text)]">{renderLabel(record)}</span>
                      {renderMeta && <span className="block text-xs text-[var(--tf-text-subtle)]">{renderMeta(record)}</span>}
                    </li>
                  ))}
            </ul>
          )}
        </div>
      )}
      {error ? <p className="tf-error" role="alert">{error}</p> : hint ? <p className="tf-hint">{hint}</p> : null}
    </div>
  )
}
