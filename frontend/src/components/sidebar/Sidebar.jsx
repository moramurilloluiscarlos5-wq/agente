import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_ITEMS, NAV_SECTIONS } from '../../utils/constants.js'
import { useSidebar } from '../../hooks/useSidebar.js'
import { useAuth } from '../../hooks/useAuth.js'
import BrandLogo from '../branding/BrandLogo.jsx'
import { getInitials } from '../../utils/formatters.js'

export default function Sidebar() {
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar()
  const { profile, roleLabel, hasPermission, logout } = useAuth()
  const navigate = useNavigate()
  const displayName = profile?.full_name?.trim() || 'Usuario'
  const handleLogout = async () => {
    closeMobile()
    await logout()
    navigate('/login', { replace: true })
  }

  const workshopName = profile?.workshop?.name || profile?.workshop_name || (profile?.role === 'SUPER_ADMIN' ? 'Plataforma' : 'Mi taller')
  const visibleItems = NAV_ITEMS.filter((item) => (!item.roles || item.roles.includes(profile?.role)) && (!item.permission || hasPermission(item.permission)))
  const groups = NAV_SECTIONS.map((section) => [section, visibleItems.filter((item) => item.section === section)]).filter(([, items]) => items.length)
  const compact = collapsed && !mobileOpen

  return (
    <>
      {mobileOpen && <button type="button" aria-label="Cerrar menú" onClick={closeMobile} className="fixed inset-0 z-30 bg-black/60 md:hidden" style={{ animation: 'tf-fade .16s ease both' }} />}

      <aside
        aria-label="Menú lateral"
        className={`tf-sidebar fixed inset-y-0 left-0 z-40 flex h-full shrink-0 flex-col md:static ${compact ? 'md:w-[4.5rem]' : 'md:w-60'} ${mobileOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full md:translate-x-0'}`}
      >
        <div className={`flex h-[3.75rem] shrink-0 items-center border-b border-[var(--tf-border)] ${compact ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <BrandLogo variant={compact ? 'symbol' : 'full'} />
          {!compact && <button type="button" onClick={mobileOpen ? closeMobile : toggleCollapsed} className="tf-icon-btn -mr-1.5" aria-label={mobileOpen ? 'Cerrar menú' : 'Colapsar menú'}>
            {mobileOpen ? <X size={17} /> : <PanelLeftClose size={17} />}
          </button>}
        </div>

        {!compact && <div className="px-3 pt-3">
          <div className="tf-workspace" title={workshopName}>
            <span className="tf-workspace-icon" aria-hidden="true">{workshopName.trim()[0]?.toUpperCase() ?? 'T'}</span>
            <div className="min-w-0">
              <p className="truncate text-[0.8125rem] font-medium text-[var(--tf-text)]">{workshopName}</p>
              <p className="text-xs text-[var(--tf-text-subtle)]">{profile?.role === 'SUPER_ADMIN' ? 'Administración' : 'Taller activo'}</p>
            </div>
          </div>
        </div>}

        <nav aria-label="Navegación principal" className={`flex-1 overflow-y-auto py-4 ${compact ? 'px-2' : 'px-3'}`}>
          {groups.map(([section, items]) => (
            <div key={section} className="tf-nav-group">
              {compact ? <div className="mx-2 mb-2 border-t border-[var(--tf-border)] first:hidden" aria-hidden="true" /> : <p className="tf-nav-heading">{section}</p>}
              <ul className="space-y-0.5">
                {items.map(({ label, path, icon: Icon }) => (
                  <li key={path}>
                    <NavLink to={path} end={path === '/'} onClick={closeMobile} title={compact ? label : undefined} aria-label={compact ? label : undefined}
                      className={({ isActive }) => `tf-nav-link ${isActive ? 'is-active' : ''} ${compact ? 'is-compact' : ''}`}>
                      <Icon size={17} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                      {!compact && <span className="truncate">{label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={`border-t border-[var(--tf-border)] ${compact ? 'flex flex-col items-center gap-1 p-2' : 'p-2'}`}>
          {compact ? <>
            <button type="button" onClick={toggleCollapsed} className="tf-icon-btn" aria-label="Expandir menú"><PanelLeftOpen size={17} /></button>
            <button type="button" onClick={handleLogout} className="tf-icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={16} /></button>
          </> : <div className="flex items-center gap-1">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1">
              <span className="tf-avatar">{getInitials(displayName)}</span>
              <div className="min-w-0">
                <p className="truncate text-[0.8125rem] font-medium text-[var(--tf-text)]">{displayName}</p>
                <p className="truncate text-xs text-[var(--tf-text-subtle)]">{roleLabel}</p>
              </div>
            </div>
            <button type="button" onClick={handleLogout} className="tf-icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={16} /></button>
          </div>}
        </div>
      </aside>
    </>
  )
}
