import { NavLink, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { NAV_ITEMS } from '../../utils/constants.js'
import { useSidebar } from '../../hooks/useSidebar.js'
import { useAuth } from '../../hooks/useAuth.js'
import BrandLogo from '../branding/BrandLogo.jsx'

function getInitials(name) {
  const parts = String(name ?? '').trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase() || '?'
}

export default function Sidebar() {
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar()
  const { profile, roleLabel, logout, hasPermission } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    closeMobile()
    await logout()
    navigate('/login', { replace: true })
  }

  const displayName = profile?.full_name?.trim() || 'Usuario'
  const workshopName = profile?.workshop?.name || profile?.workshop_name || 'Taller activo'
  const visibleItems = NAV_ITEMS.filter((item) => (!item.roles || item.roles.includes(profile?.role)) && (!item.permission || hasPermission(item.permission)))
  const sections = visibleItems.reduce((groups, item) => {
    const key = item.section || 'Menú'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
    return groups
  }, {})
  const sectionOrder = ['Operación', 'Taller', 'Finanzas', 'Gestión', 'Configuración']

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={closeMobile}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-slate-800/80 bg-[#0d1727] transition-all duration-200 ease-in-out md:static ${
          collapsed ? 'md:w-20' : 'md:w-64'
        } ${mobileOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="flex h-[4.5rem] items-center justify-between border-b border-slate-800/80 px-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <BrandLogo variant={collapsed ? 'symbol' : 'compact'} size={collapsed ? 'md' : 'sm'} priority />
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-800 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-400 md:flex"
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {Object.entries(sections).sort(([a], [b]) => sectionOrder.indexOf(a) - sectionOrder.indexOf(b)).map(([section, items]) => <div key={section}>
            {!collapsed && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{section}</p>}
            <div className="space-y-0.5">{items.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                onClick={closeMobile}
                className={({ isActive }) => `group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-slate-800/80 text-slate-100 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-cyan-400' : 'text-slate-400 hover:bg-slate-800/45 hover:text-slate-200'}`}
                title={collapsed ? label : undefined}
              >
                <Icon size={17} strokeWidth={1.8} className="shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            ))}</div>
          </div>)}
        </nav>

        <div className="border-t border-slate-800/80 px-3">
          {!collapsed && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800/80 bg-slate-900/45 px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700/70 text-xs font-semibold text-slate-200">
                {getInitials(displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">{displayName}</p>
                <p className="truncate text-[11px] text-slate-500">{workshopName} · {roleLabel}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
            title={collapsed ? 'Cerrar sesión' : undefined}
          >
            <LogOut size={19} className="shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
