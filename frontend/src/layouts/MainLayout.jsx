import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/sidebar/Sidebar.jsx'
import Navbar from '../components/navbar/Navbar.jsx'
import ConnectionBanner from '../components/ConnectionBanner.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import { startApiMonitor } from '../services/connection.js'
import { sectionTitle } from '../utils/constants.js'

export default function MainLayout() {
  const { pathname } = useLocation()
  const mainRef = useRef(null)

  // Monitor global del API: detecta caídas reales del backend, reintenta con
  // backoff y alimenta el banner de estado.
  useEffect(() => {
    startApiMonitor()
  }, [])

  useEffect(() => {
    document.title = `${sectionTitle(pathname)} | TallerFlow`
    mainRef.current?.scrollTo?.({ top: 0 })
  }, [pathname])

  return (
    <div className="ct-app-shell relative flex w-full overflow-hidden">
      <a href="#main-content" className="tf-skip-link">Ir al contenido</a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner />
        <Navbar />
        <main ref={mainRef} id="main-content" tabIndex={-1} className="tf-main flex-1 overflow-y-auto px-4 py-6 outline-none md:px-7 md:py-7">
          <div key={pathname} className="ct-page tf-page-enter"><ErrorBoundary><Outlet /></ErrorBoundary></div>
        </main>
      </div>
    </div>
  )
}
