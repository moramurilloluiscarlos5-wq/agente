import { NavLink, useNavigate } from 'react-router-dom'
import { Compass, Lock, LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_ITEMS, NAV_SECTIONS } from '../../utils/constants.js'
import { MODULE_HELP } from '../../utils/help.js'
import { FEATURE_BY_PATH, FEATURE_MIN_TIER, TIER_NAMES, licenseStatus, planIncludes } from '../../utils/billing.js'
import { useSidebar } from '../../hooks/useSidebar.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useTour } from '../../hooks/useTour.js'
import BrandLogo from '../branding/BrandLogo.jsx'
import { getInitials } from '../../utils/formatters.js'
import { IconButton, Tooltip } from '../ui/DesignSystem.jsx'

// Id del texto que explica cada opción; el lector de pantalla lo lee como descripción del enlace.
const helpId = (path) => `nav-help${path.replace(/[^a-z0-9]+/gi, '-')}`

export default function Sidebar() {
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar()
  const { profile, roleLabel, hasPermission, logout } = useAuth()
  const { start: startTour } = useTour()
  const navigate = useNavigate()
  const displayName = profile?.full_name?.trim() || 'Usuario'
  const handleLogout = async () => {
    closeMobile()
    await logout()
    navigate('/login', { replace: true })
  }

  const workshopName = profile?.workshop?.name || profile?.workshop_name || (profile?.role === 'SUPER_ADMIN' ? 'Plataforma' : 'Mi taller')
  const status = licenseStatus(profile)
  const visibleItems = NAV_ITEMS.filter((item) => (!item.roles || item.roles.includes(profile?.role)) && (!item.permission || hasPermission(item.permission)))
  const groups = NAV_SECTIONS.map((section) => [section, visibleItems.filter((item) => item.section === section)]).filter(([, items]) => items.length)
  const compact = collapsed && !mobileOpen

  return (
    <>
      {mobileOpen && <button type="button" aria-label="Cerrar menú" onClick={closeMobile} className="fixed inset-0 z-30 bg-[rgb(var(--tf-scrim-rgb)/.6)] md:hidden" style={{ animation: 'tf-fade .15s ease-out both' }} />}

      <aside
        aria-label="Menú lateral"
        className={`tf-sidebar fixed inset-y-0 left-0 z-40 flex h-full shrink-0 flex-col md:static ${compact ? 'md:w-[4.5rem]' : 'md:w-64'} ${mobileOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full md:translate-x-0'}`}
      >
        <div className={`flex h-16 shrink-0 items-center border-b border-[var(--tf-border)] ${compact ? 'justify-center px-2' : 'justify-between px-4'}`}>
          <BrandLogo variant={compact ? 'symbol' : 'full'} />
          {!compact && <IconButton className="-mr-2" label={mobileOpen ? 'Cerrar menú' : 'Colapsar menú'} icon={mobileOpen ? X : PanelLeftClose} iconSize={18} onClick={mobileOpen ? closeMobile : toggleCollapsed} />}
        </div>

        {!compact && <div className="px-3 pt-4">
          <div className="tf-workspace" data-tour="workspace">
            <span className="tf-workspace-icon" aria-hidden="true">{workshopName.trim()[0]?.toUpperCase() ?? 'T'}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--tf-text)]">{workshopName}</p>
              <p className="tf-workspace-status" data-testid="workspace-status"><span className={`tf-live-dot${status.tone === 'success' ? '' : ` is-${status.tone}`}`} aria-hidden="true" /><span className="min-w-0 truncate">{status.label}</span></p>
            </div>
          </div>
        </div>}

        <nav aria-label="Navegación principal" className={`tf-nav-scroll flex-1 overflow-y-auto py-5 ${compact ? 'px-2' : 'px-3'}`}>
          {groups.map(([section, items]) => (
            <div key={section} className="tf-nav-group">
              {compact ? <div className="mx-2 mb-2 border-t border-[var(--tf-border)] first:hidden" aria-hidden="true" /> : <p className="tf-nav-heading">{section}</p>}
              <ul className="space-y-0.5">
                {items.map(({ label, path, icon: Icon }) => {
                  // Secciones que el plan no incluye: siguen visibles con candado y explican en qué plan están.
                  const feature = FEATURE_BY_PATH[path]
                  const lockedTier = planIncludes(profile, feature) ? null : TIER_NAMES[FEATURE_MIN_TIER[feature]]
                  const description = [MODULE_HELP[path]?.description, lockedTier && `Disponible desde el plan ${lockedTier}.`].filter(Boolean).join(' ')
                  return (
                    <li key={path}>
                      <Tooltip label={label} description={description || undefined} side="right" delay={450} className="flex">
                        <NavLink to={path} end={path === '/'} onClick={closeMobile} data-tour={`nav:${path}`} aria-label={lockedTier ? `${label}, disponible desde el plan ${lockedTier}` : compact ? label : undefined} aria-describedby={MODULE_HELP[path] ? helpId(path) : undefined}
                          className={({ isActive }) => `tf-nav-link w-full ${compact ? 'is-compact' : ''} ${isActive ? 'is-active' : ''} ${lockedTier ? 'is-locked' : ''}`}>
                          <Icon size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                          {!compact && <span className="truncate">{label}</span>}
                          {!compact && lockedTier && <Lock size={13} strokeWidth={2} className="tf-nav-lock" aria-hidden="true" />}
                        </NavLink>
                      </Tooltip>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        {/* Fuera de <nav> para que el texto de ayuda no se confunda con las etiquetas del menú. */}
        <div hidden>{visibleItems.filter((item) => MODULE_HELP[item.path]).map((item) => <span key={item.path} id={helpId(item.path)}>{MODULE_HELP[item.path].description}</span>)}</div>

        <div className={`border-t border-[var(--tf-border)] ${compact ? 'flex flex-col items-center gap-1 p-2' : 'space-y-2 p-3'}`}>
          {compact ? <>
            <Tooltip label="Recorrido guiado" description="Te muestra paso a paso qué hace cada opción del menú." side="right" className="flex">
              <button type="button" onClick={startTour} aria-label="Recorrido guiado" data-tour="tour-launcher" className="tf-nav-link is-compact w-full"><Compass size={18} strokeWidth={1.8} aria-hidden="true" /></button>
            </Tooltip>
            <IconButton label="Expandir menú" icon={PanelLeftOpen} iconSize={18} onClick={toggleCollapsed} />
            <IconButton label="Cerrar sesión" icon={LogOut} onClick={handleLogout} />
          </> : <>
            <button type="button" onClick={startTour} data-tour="tour-launcher" className="tf-guide-link w-full text-left">
              <span className="tf-guide-link-icon" aria-hidden="true"><Compass size={16} strokeWidth={1.9} /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">Recorrido guiado</span>
                <span className="block truncate text-xs text-[var(--tf-text-subtle)]">Conoce cada opción paso a paso</span>
              </span>
            </button>
            <div className="flex items-center gap-1">
              <div className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1">
                <span className="tf-avatar">{getInitials(displayName)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--tf-text)]">{displayName}</p>
                  <p className="truncate text-xs text-[var(--tf-text-subtle)]">{roleLabel}</p>
                </div>
              </div>
              <IconButton label="Cerrar sesión" icon={LogOut} onClick={handleLogout} />
            </div>
          </>}
        </div>
      </aside>
    </>
  )
}
