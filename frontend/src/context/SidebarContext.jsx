import { useEffect, useState } from 'react'
import { SidebarContext } from './sidebar.js'

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem('carlostech:sidebar-collapsed') === 'true',
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem('carlostech:sidebar-collapsed', String(collapsed))
  }, [collapsed])

  const value = {
    collapsed,
    toggleCollapsed: () => setCollapsed((prev) => !prev),
    mobileOpen,
    openMobile: () => setMobileOpen(true),
    closeMobile: () => setMobileOpen(false),
  }

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}
