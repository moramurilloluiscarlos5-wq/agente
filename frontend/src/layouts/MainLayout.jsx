import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/sidebar/Sidebar.jsx'
import Navbar from '../components/navbar/Navbar.jsx'
import ConnectionBanner from '../components/ConnectionBanner.jsx'
import { startApiMonitor } from '../services/connection.js'

export default function MainLayout() {
  const { pathname } = useLocation()

  // Monitor global del API: detecta caídas reales del backend de Railway,
  // reintenta con backoff y alimenta el banner de estado. No confunde al
  // Device Agent local con el servidor remoto.
  useEffect(() => {
    startApiMonitor()
  }, [])

  useEffect(() => {
    const section = pathname.startsWith('/reparaciones') ? 'Reparaciones'
      : pathname.startsWith('/clientes') ? 'Clientes'
              : pathname.startsWith('/dispositivos') ? 'Dispositivos'
              : pathname.startsWith('/herramientas-dispositivo') ? 'Herramientas ADB / Fastboot'
          : pathname.startsWith('/diagnostico-ia') ? 'Diagnóstico IA'
            : pathname.startsWith('/cotizaciones') ? 'Cotizaciones'
              : pathname.startsWith('/inventario') ? 'Inventario'
                : pathname.startsWith('/pagos') ? 'Pagos'
                  : pathname.startsWith('/garantias') ? 'Garantías'
                    : pathname.startsWith('/comunicaciones') ? 'Comunicaciones'
                      : pathname.startsWith('/reportes') ? 'Reportes'
                        : pathname.startsWith('/personal') ? 'Personal'
                          : pathname.startsWith('/configuracion') ? 'Configuración'
                            : 'Dashboard'
    document.title = `${section} | Taller Flow`
  }, [pathname])

  return (
    <div className="ct-app-shell relative flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner />
        <Navbar />
        <main id="main-content" className="tf-main flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-8">
          <div key={pathname} className="ct-page tf-page-enter"><Outlet /></div>
        </main>
      </div>
    </div>
  )
}
