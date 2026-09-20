import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/sidebar/Sidebar.jsx'
import Navbar from '../components/navbar/Navbar.jsx'

export default function MainLayout() {
  const { pathname } = useLocation()

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
    document.title = `${section} | CARLOSTECH AI`
  }, [pathname])

  return (
    <div className="ct-app-shell relative flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-7">
          <div className="ct-page"><Outlet /></div>
        </main>
      </div>
    </div>
  )
}
