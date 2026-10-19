import { useEffect, useState } from 'react'

const PREFIX = 'tallerflow-draft:'

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Los borradores vencen a los 7 días para no revivir datos viejos.
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > 7 * 86400000) return null
    return parsed.value
  } catch { return null }
}

// Guarda el formulario en este navegador mientras se captura.
// `key` en null desactiva el borrador (por ejemplo al editar un registro existente).
export function useDraft(key, initial) {
  const [initialValue] = useState(initial)
  const [state, setState] = useState(() => {
    const saved = key ? read(key) : null
    return { value: saved ? { ...initial, ...saved } : initial, restored: Boolean(saved) }
  })
  const pristine = JSON.stringify(state.value) === JSON.stringify(initialValue)

  useEffect(() => {
    if (!key) return undefined
    const timer = setTimeout(() => {
      try {
        if (pristine) localStorage.removeItem(PREFIX + key)
        else localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), value: state.value }))
      } catch { /* almacenamiento no disponible: el formulario sigue funcionando */ }
    }, 250)
    return () => clearTimeout(timer)
  }, [key, state.value, pristine])

  const setValue = (next) => setState((current) => ({ ...current, value: typeof next === 'function' ? next(current.value) : next }))
  const clear = () => { try { if (key) localStorage.removeItem(PREFIX + key) } catch { /* sin almacenamiento */ } }
  const discard = () => { clear(); setState({ value: initialValue, restored: false }) }
  return [state.value, setValue, { restored: state.restored, discard, clear }]
}
