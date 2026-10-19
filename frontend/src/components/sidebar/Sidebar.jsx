import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_ITEMS, NAV_SECTIONS } from '../../utils/constants.js'
import { useSidebar } from '../../hooks/useSidebar.js'
import { useAuth } from '../../hooks/useAuth.js'
import BrandLogo from '../branding/BrandLogo.jsx'
import { getInitials } from '../../utils/formatters.js'
import { IconButton, Tooltip } from '../ui/DesignSystem.jsx'

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
      {mobileOpen && <button type="button" aria-label="Cerrar menú" onClick={closeMobile} className="fixed inset-0 z-30 bg-black/60 md:hidden" style={{ animation: 'tf-fade .15s ease-out both' }} />}

      <aside
        aria-label="Menú lateral"
        className={`tf-sidebar fixed inset-y-0 left-0 z-40 flex h-full shrink-0 flex-col md:static ${compact ? 'md:w-[4.5rem]' : 'md:w-60'} ${mobileOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full md:translate-x-0'}`}
      >
        <div className={`flex h-16 shrink-0 items-center border-b border-[var(--tf-border)] ${compact ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <BrandLogo variant={compact ? 'symbol' : 'full'} />
          {!compact && <IconButton className="-mr-2" label={mobileOpen ? 'Cerrar menú' : 'Colapsar menú'} icon={mobileOpen ? X : PanelLeftClose} iconSize={18} onClick={mobileOpen ? closeMobile : toggleCollapsed} />}
        </div>

        {!compact && <div className="px-3 pt-3">
          <div className="tf-workspace">
            <span className="tf-workspace-icon" aria-hidden="true">{workshopName.trim()[0]?.toUpperCase() ?? 'T'}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--tf-text)]">{workshopName}</p>
              <p className="text-xs text-[var(--tf-text-subtle)]">{profile?.role === 'SUPER_ADMIN' ? 'Administración' : 'Taller activo'}</p>
            </div>
          </div>
        </div>}

        <nav aria-label="Navegación principal" className={`flex-1 overflow-y-auto py-4 ${compact ? 'px-2' : 'px-3'}`}>
          {groups.map(([section, items]) => (
            <div key={section} className="tf-nav-group">
              {compact ? <div className="mx-2 mb-2 border-t border-[var(--tf-border)] first:hidden" aria-hidden="true" /> : <p className="tf-nav-heading">{section}</p>}
              <ul className="space-y-1">
                {items.map(({ label, path, icon: Icon }) => (
                  <li key={path}>
                    {compact ? <Tooltip label={label} className="flex">
                      <NavLink to={path} end={path === '/'} onClick={closeMobile} aria-label={label}
                        className={({ isActive }) => `tf-nav-link is-compact w-full ${isActive ? 'is-active' : ''}`}>
                        <Icon size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                      </NavLink>
                    </Tooltip> : <NavLink to={path} end={path === '/'} onClick={closeMobile}
                      className={({ isActive }) => `tf-nav-link ${isActive ? 'is-active' : ''}`}>
                      <Icon size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">{label}</span>
                    </NavLink>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={`border-t border-[var(--tf-border)] ${compact ? 'flex flex-col items-center gap-1 p-2' : 'p-2'}`}>
          {compact ? <>
            <IconButton label="Expandir menú" icon={PanelLeftOpen} iconSize={18} onClick={toggleCollapsed} />
            <IconButton label="Cerrar sesión" icon={LogOut} onClick={handleLogout} />
          </> : <div className="flex items-center gap-1">
            <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1">
              <span className="tf-avatar">{getInitials(displayName)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--tf-text)]">{displayName}</p>
                <p className="truncate text-xs text-[var(--tf-text-subtle)]">{roleLabel}</p>
              </div>
            </div>
            <IconButton label="Cerrar sesión" icon={LogOut} onClick={handleLogout} />
          </div>}
        </div>
      </aside>
    </>
  )
}
