import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Menu, Plus, Search, WalletCards } from 'lucide-react'
import { sectionTitle } from '../../utils/constants.js'
import { useSidebar } from '../../hooks/useSidebar.js'
import { useAuth } from '../../hooks/useAuth.js'
import { api } from '../../services/api.js'
import { formatRelative, getInitials } from '../../utils/formatters.js'

const CAN_CREATE_REPAIRS = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN']
const CAN_MANAGE_BILLING = ['OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN']

function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open, setOpen, ref])
}

export default function Navbar() {
  const { openMobile } = useSidebar()
  const { profile, roleLabel, logout } = useAuth()
  const profileId = profile?.id
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const searchRef = useRef(null)
  const notificationsRef = useRef(null)
  const userRef = useRef(null)
  useDismiss(notificationsOpen, setNotificationsOpen, notificationsRef)
  useDismiss(userOpen, setUserOpen, userRef)

  useEffect(() => {
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!profileId) return
    api.get('/notifications').then((response) => setNotifications(response.data ?? [])).catch(() => {})
  }, [profileId])

  const handleSearch = (event) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/buscar?q=${encodeURIComponent(trimmed)}`)
  }

  const handleLogout = async () => {
    setUserOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const displayName = profile?.full_name?.trim() || 'Usuario'
  const unread = notifications.filter((item) => !item.read_at && !item.is_read).length

  return (
    <header className="tf-navbar">
      <button type="button" onClick={openMobile} className="tf-icon-btn -ml-1 md:hidden" aria-label="Abrir menú"><Menu size={19} /></button>

      <p className="tf-navbar-title hidden truncate lg:block">{sectionTitle(location.pathname)}</p>

      <form onSubmit={handleSearch} role="search" className="ml-auto w-full max-w-[22rem]">
        <label className="tf-search">
          <Search size={15} className="shrink-0" aria-hidden="true" />
          <input type="search" ref={searchRef} aria-label="Buscar cliente, orden o IMEI" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, orden o IMEI" />
          <kbd className="tf-kbd hidden shrink-0 lg:block">Ctrl K</kbd>
        </label>
      </form>

      {CAN_CREATE_REPAIRS.includes(profile?.role) && location.pathname !== '/reparaciones/nueva' && (
        <Link to="/reparaciones/nueva" className="ct-btn ct-btn-primary hidden shrink-0 md:inline-flex"><Plus size={15} aria-hidden="true" />Nueva reparación</Link>
      )}

      <div ref={notificationsRef} className="relative shrink-0">
        <button type="button" onClick={() => { setUserOpen(false); setNotificationsOpen((prev) => !prev) }} className="tf-icon-btn" aria-label="Notificaciones" aria-expanded={notificationsOpen} aria-controls="notifications-panel">
          <Bell size={17} />
          {unread > 0 && <span className="tf-dot-badge" aria-hidden="true" />}
        </button>
        {notificationsOpen && (
          <div id="notifications-panel" role="region" aria-label="Notificaciones recientes" className="tf-popover right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)]">
            <p className="border-b border-[var(--tf-border)] px-4 py-3 text-sm font-semibold">Notificaciones</p>
            {notifications.length ? (
              <ul className="max-h-80 overflow-y-auto py-1">
                {notifications.map((notification) => (
                  <li key={notification.id} className="px-4 py-2.5">
                    <p className="text-[0.8125rem] font-medium text-[var(--tf-text)]">{notification.title}</p>
                    {notification.message && <p className="mt-0.5 text-xs leading-relaxed text-[var(--tf-text-muted)]">{notification.message}</p>}
                    {notification.created_at && <p className="mt-1 text-[0.6875rem] text-[var(--tf-text-subtle)]">{formatRelative(notification.created_at)}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-6 text-center text-[0.8125rem] text-[var(--tf-text-muted)]">No tienes notificaciones nuevas.</p>}
          </div>
        )}
      </div>

      <div ref={userRef} className="relative shrink-0">
        <button type="button" onClick={() => { setNotificationsOpen(false); setUserOpen((prev) => !prev) }} className="flex items-center rounded-full" aria-label={`Menú de ${displayName}`} aria-expanded={userOpen} aria-haspopup="menu">
          <span className="tf-avatar">{getInitials(displayName)}</span>
        </button>
        {userOpen && (
          <div role="menu" aria-label="Cuenta" className="tf-popover right-0 mt-2 w-64 p-1.5">
            <div className="flex items-center gap-3 px-2.5 py-2.5">
              <span className="tf-avatar tf-avatar-lg">{getInitials(displayName)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--tf-text)]">{displayName}</p>
                <p className="truncate text-xs text-[var(--tf-text-subtle)]">{roleLabel}{profile?.workshop?.name ? ` en ${profile.workshop.name}` : ''}</p>
              </div>
            </div>
            <div className="my-1 border-t border-[var(--tf-border)]" />
            {CAN_MANAGE_BILLING.includes(profile?.role) && <Link role="menuitem" to="/facturacion" onClick={() => setUserOpen(false)} className="tf-menu-item"><WalletCards size={15} aria-hidden="true" />Facturación</Link>}
            <button role="menuitem" type="button" onClick={handleLogout} className="tf-menu-item is-danger"><LogOut size={15} aria-hidden="true" />Cerrar sesión</button>
          </div>
        )}
      </div>
    </header>
  )
}
