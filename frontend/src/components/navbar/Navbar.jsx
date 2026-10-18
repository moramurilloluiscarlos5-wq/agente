import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, Menu, Search, Store } from 'lucide-react'
import { NAV_ITEMS } from '../../utils/constants.js'
import { useSidebar } from '../../hooks/useSidebar.js'
import { useAuth } from '../../hooks/useAuth.js'
import { api } from '../../services/api.js'

export default function Navbar() {
  const { openMobile } = useSidebar()
  const { profile } = useAuth()
  const profileId = profile?.id
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const searchRef = useRef(null)
  const notificationsRef = useRef(null)

  useEffect(() => {
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (event.key === 'Escape') setNotificationsOpen(false)
    }
    function onPointer(event) {
      if (!notificationsRef.current?.contains(event.target)) setNotificationsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer) }
  }, [])

  useEffect(() => { if (!profileId) return; api.get('/notifications').then((response) => setNotifications(response.data ?? [])).catch(() => {}) }, [profileId])

  const currentPage = NAV_ITEMS.find((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
  )
  const pageLabel = location.pathname === '/dashboard' ? 'Dashboard' : currentPage?.label ?? 'Taller Flow'

  const handleSearch = (event) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/buscar?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <header className="tf-navbar flex shrink-0 items-center gap-3 border-b border-slate-800/80 px-4 md:px-8">
      <button
        type="button"
        onClick={openMobile}
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 md:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={18} />
      </button>

      <nav aria-label="Contexto" className="hidden min-w-0 items-center gap-3 md:flex">
        <span className="hidden text-xs text-slate-500 lg:inline">Mi espacio</span><ChevronRight size={13} className="hidden text-slate-600 lg:block" />
        <span className="truncate text-sm font-medium text-slate-300">{pageLabel}</span>
      </nav>

      <form onSubmit={handleSearch} className="ml-auto flex w-full max-w-[380px] items-center">
        <div className="tf-search flex w-full items-center gap-2">
          <Search size={15} className="shrink-0 text-slate-500" />
          <input
            type="search"
            ref={searchRef}
            aria-label="Buscar cliente, orden o IMEI"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente, orden, IMEI…"
            className="w-full bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="hidden shrink-0 text-[10px] text-slate-500 sm:block">Ctrl K</kbd>
        </div>
      </form>

      {profile?.workshop?.name && (
        <span className="hidden shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-slate-400 xl:flex" title={profile.workshop.name}>
          <Store size={14} />
          <span className="max-w-36 truncate">{profile.workshop.name}</span>
        </span>
      )}

      <div ref={notificationsRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setNotificationsOpen((prev) => !prev)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
          aria-label="Notificaciones"
          aria-expanded={notificationsOpen}
          aria-controls="notifications-panel"
        >
          <Bell size={17} />
        </button>

        {notificationsOpen && (
          <div id="notifications-panel" className="tf-popover absolute right-0 z-20 mt-3 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-700/80 bg-[var(--ct-surface-raised)] p-4 shadow-xl shadow-black/40">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notificaciones
            </p>
            {notifications.length ? <div className="space-y-2">{notifications.map((notification) => <article key={notification.id} className="rounded-md bg-slate-800/50 px-3 py-2"><p className="text-sm text-slate-200">{notification.title}</p><p className="mt-1 text-xs text-slate-400">{notification.message}</p></article>)}</div> : <p className="rounded-md bg-slate-800/50 px-3 py-4 text-center text-sm text-slate-400">No hay notificaciones nuevas.</p>}
          </div>
        )}
      </div>
    </header>
  )
}
