import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, Menu, Search } from 'lucide-react'
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

  useEffect(() => { if (!profileId) return; api.get('/notifications').then((response) => setNotifications(response.data ?? [])).catch(() => {}) }, [profileId])

  const currentPage = NAV_ITEMS.find((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
  )
  const pageLabel = location.pathname === '/dashboard' ? 'Dashboard' : currentPage?.label ?? 'CARLOSTECH AI'

  const handleSearch = (event) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/buscar?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <header className="flex h-[4.5rem] shrink-0 items-center gap-3 border-b border-slate-800/80 bg-[#0d1727] px-4 md:px-8">
      <button
        type="button"
        onClick={openMobile}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-400 md:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={18} />
      </button>

      <div className="hidden min-w-0 flex-col md:flex">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Espacio de trabajo</p>
        <h1 className="mt-0.5 truncate text-sm font-semibold text-slate-100">{pageLabel}</h1>
      </div>

      <form onSubmit={handleSearch} className="ml-auto flex max-w-md flex-1 items-center">
        <div className="flex w-full items-center gap-2 rounded-md border border-slate-800 bg-slate-900/55 px-3 py-2 focus-within:border-cyan-500/55">
          <Search size={16} className="shrink-0 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente, orden, IMEI, modelo..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
      </form>

      {profile?.workshop?.name && <span className="hidden max-w-44 truncate text-xs text-slate-500 xl:block" title={profile.workshop.name}>{profile.workshop.name}</span>}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setNotificationsOpen((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-400"
          aria-label="Notificaciones"
        >
          <Bell size={18} />
        </button>

        {notificationsOpen && (
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-700/80 bg-[#162235] p-3 shadow-xl shadow-black/30">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notificaciones
            </p>
            {notifications.length ? <div className="space-y-2">{notifications.map((notification) => <article key={notification.id} className="rounded-lg bg-slate-800/50 px-3 py-2"><p className="text-sm text-slate-200">{notification.title}</p><p className="mt-1 text-xs text-slate-400">{notification.message}</p></article>)}</div> : <p className="rounded-lg bg-slate-800/50 px-3 py-4 text-center text-sm text-slate-400">No hay notificaciones nuevas.</p>}
          </div>
        )}
      </div>
    </header>
  )
}
