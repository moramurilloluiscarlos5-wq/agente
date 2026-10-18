import { useEffect, useState } from 'react'
import { SidebarContext } from './sidebar.js'

const STORAGE_KEY = 'carlostech:sidebar-collapsed'

function readCollapsed() {
  try { return window.localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
}

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, String(collapsed)) } catch { /* Preferencia opcional. */ }
  }, [collapsed])

  // En móvil el menú bloquea el desplazamiento del fondo y se cierra con Escape.
  useEffect(() => {
    if (!mobileOpen) return undefined
    const onKey = (event) => { if (event.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const value = {
    collapsed,
    toggleCollapsed: () => setCollapsed((prev) => !prev),
    mobileOpen,
    openMobile: () => setMobileOpen(true),
    closeMobile: () => setMobileOpen(false),
  }

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}
