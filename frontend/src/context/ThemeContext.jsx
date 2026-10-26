import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { ThemeContext } from './theme.js'
import { ACCENT_KEY, MODE_KEY, applyTheme, prefersReducedMotion, readAccent, readMode, save } from '../utils/theme.js'

// El tema nuevo se revela como una onda que sale de donde se hizo clic (View Transitions API).
// Sin soporte del navegador o con "reducir movimiento", el cambio es inmediato.
function withReveal(update, origin) {
  if (!document.startViewTransition || prefersReducedMotion()) { update(); return }
  const root = document.documentElement
  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 2
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  root.style.setProperty('--vt-r', `${radius}px`)
  const transition = document.startViewTransition(() => { flushSync(update) })
  transition.finished.finally(() => ['--vt-x', '--vt-y', '--vt-r'].forEach((name) => root.style.removeProperty(name)))
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readMode)
  const [accent, setAccentState] = useState(readAccent)

  // Con "Sistema" el tema sigue al del equipo, también cuando cambia con la página abierta.
  useEffect(() => {
    applyTheme(mode, accent)
    if (mode !== 'system') return undefined
    const query = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!query) return undefined
    const onChange = () => applyTheme('system', accent)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [mode, accent])

  const setMode = useCallback((next, origin) => {
    save(MODE_KEY, next)
    withReveal(() => { applyTheme(next, accent); setModeState(next) }, origin)
  }, [accent])

  const setAccent = useCallback((next, origin) => {
    save(ACCENT_KEY, next)
    withReveal(() => { applyTheme(mode, next); setAccentState(next) }, origin)
  }, [mode])

  const value = useMemo(() => ({ mode, accent, setMode, setAccent }), [mode, accent, setMode, setAccent])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
