import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ProductTour from '../components/tour/ProductTour.jsx'
import { TourContext } from './tour.js'
import { useAuth } from '../hooks/useAuth.js'
import { useSidebar } from '../hooks/useSidebar.js'
import { NAV_ITEMS } from '../utils/constants.js'
import { buildTourSteps, tourDoneKey, visibleSteps } from '../utils/tour.js'

const CAN_CREATE_REPAIRS = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN']
const isMobile = () => window.matchMedia?.('(max-width: 767px)').matches

function readDone(userId) {
  try { return window.localStorage.getItem(tourDoneKey(userId)) === '1' } catch { return false }
}
function saveDone(userId) {
  try { window.localStorage.setItem(tourDoneKey(userId), '1') } catch { /* Preferencia opcional. */ }
}

// Recorrido guiado del sistema. Arranca solo en el primer inicio de sesión del personal
// (el servidor aún no tiene registrado uno anterior) y se repite desde "Recorrido guiado".
export function TourProvider({ children }) {
  const { profile } = useAuth()
  const { openMobile, closeMobile } = useSidebar()
  const { pathname } = useLocation()
  const [tour, setTour] = useState(null) // { steps, index }
  const autoStarted = useRef(false)

  // Un paso por cada opción del menú que está en pantalla: así coincide con el rol y el plan.
  const start = useCallback(() => {
    const steps = visibleSteps(buildTourSteps({ items: NAV_ITEMS, profile, canCreateRepairs: CAN_CREATE_REPAIRS.includes(profile?.role) }))
    setTour({ steps, index: 0 })
  }, [profile])

  const finish = useCallback(() => {
    saveDone(profile?.id)
    setTour(null)
    if (isMobile()) closeMobile()
  }, [profile?.id, closeMobile])

  const next = () => {
    if (!tour) return
    if (tour.index >= tour.steps.length - 1) finish()
    else setTour({ ...tour, index: tour.index + 1 })
  }
  const prev = () => { if (tour?.index > 0) setTour({ ...tour, index: tour.index - 1 }) }

  // Dueños y administradores reciben la bienvenida con pasos del panel; el resto del equipo, el recorrido.
  const firstSession = profile?.last_login_at === null && !['OWNER', 'ADMINISTRADOR'].includes(profile?.role)
  useEffect(() => {
    if (!firstSession || autoStarted.current || !['/', '/dashboard'].includes(pathname) || readDone(profile?.id)) return undefined
    const timer = setTimeout(() => { autoStarted.current = true; start() }, 900)
    return () => clearTimeout(timer)
  }, [firstSession, pathname, profile?.id, start])

  // En celular el menú lateral se abre para mostrar sus opciones y se cierra para la barra superior.
  const area = tour ? tour.steps[tour.index].area : null
  useEffect(() => {
    if (!area || !isMobile()) return
    if (area === 'sidebar') openMobile()
    else closeMobile()
  }, [area, openMobile, closeMobile])

  return (
    <TourContext.Provider value={{ start, active: Boolean(tour) }}>
      {children}
      {tour && <ProductTour steps={tour.steps} index={tour.index} onNext={next} onPrev={prev} onClose={finish} />}
    </TourContext.Provider>
  )
}
