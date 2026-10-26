import { useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { helpFor } from '../utils/help.js'

// Páginas donde la persona ocultó la ayuda. Es una comodidad de este navegador:
// sin almacenamiento disponible la ayuda simplemente vuelve a aparecer abierta.
const STORAGE_KEY = 'tf-help-hidden'

function readHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')) } catch { return new Set() }
}

function writeHidden(paths) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...paths])) } catch { /* sin almacenamiento: se oculta solo en esta visita */ }
}

// Ayuda de la página actual: abierta la primera vez y luego como la dejó la persona.
export function useSectionHelp() {
  const { pathname } = useLocation()
  const help = helpFor(pathname)
  const [hidden, setHidden] = useState(readHidden)
  const buttonRef = useRef(null)
  const panelId = useId()
  const open = Boolean(help) && !hidden.has(help.path)

  const setOpen = (value) => {
    const next = new Set(hidden)
    if (value) next.delete(help.path)
    else next.add(help.path)
    setHidden(next)
    writeHidden(next)
  }

  return { help, open, setOpen, buttonRef, panelId }
}
