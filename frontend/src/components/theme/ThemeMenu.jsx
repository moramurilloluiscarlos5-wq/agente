import { useEffect, useRef, useState } from 'react'
import { Palette } from 'lucide-react'
import { Tooltip } from '../ui/DesignSystem.jsx'
import ThemeSwitcher from './ThemeSwitcher.jsx'

// Botón de apariencia con su panel. Se usa en la barra superior y en el acceso.
export default function ThemeMenu() {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const button = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <Tooltip label="Apariencia">
        <button ref={button} type="button" className="tf-icon-btn" data-tour="theme" aria-label="Apariencia" aria-expanded={open} aria-controls="theme-panel" onClick={() => setOpen((current) => !current)}>
          <Palette size={18} aria-hidden="true" />
        </button>
      </Tooltip>
      {open && (
        <div id="theme-panel" role="group" aria-label="Apariencia" className="tf-popover tf-theme-panel right-0 mt-2">
          <ThemeSwitcher />
        </div>
      )}
    </div>
  )
}
