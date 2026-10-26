import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react'
import { API_STATUS, retryApiNow, subscribe } from '../services/connection.js'

// Barra discreta global: sólo aparece cuando el API realmente está offline.
// Nunca refleja el estado del Device Agent (ese es local y tiene su propia UI
// en Herramientas de dispositivo) ni de la base de datos (los errores de
// datos se muestran en cada página con su mensaje específico).
export default function ConnectionBanner() {
  const [apiStatus, setApiStatus] = useState(null)
  const [recoveredVisible, setRecoveredVisible] = useState(false)
  const previousRef = useRef(null)
  const recoverTimerRef = useRef(null)

  useEffect(() => subscribe((state) => setApiStatus(state.apiStatus)), [])

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = apiStatus
    if (previous === API_STATUS.OFFLINE && apiStatus === API_STATUS.ONLINE) {
      setRecoveredVisible(true)
      clearTimeout(recoverTimerRef.current)
      recoverTimerRef.current = setTimeout(() => setRecoveredVisible(false), 4000)
    }
    return () => clearTimeout(recoverTimerRef.current)
  }, [apiStatus])

  if (apiStatus === API_STATUS.ONLINE && !recoveredVisible) return null

  const offline = apiStatus === API_STATUS.OFFLINE
  const checking = apiStatus === API_STATUS.CHECKING || apiStatus === null

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm ${
        offline || checking
          ? 'border-b border-[rgb(var(--tf-warning-rgb)/.3)] bg-[var(--tf-warning-soft)] text-[var(--tf-warning-ink)]'
          : 'border-b border-[rgb(var(--tf-success-rgb)/.3)] bg-[var(--tf-success-soft)] text-[var(--tf-success-ink)]'
      }`}
    >
      {offline && <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />}
      {checking && <LoaderCircle size={16} className="shrink-0 animate-spin" aria-hidden="true" />}
      {apiStatus === API_STATUS.ONLINE && <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />}
      <span>
        {offline && 'Sin conexión con el servidor. Tus cambios no se guardarán hasta que vuelva; seguimos reintentando.'}
        {checking && 'Comprobando conexión con TallerFlow…'}
        {apiStatus === API_STATUS.ONLINE && 'Conexión restablecida.'}
      </span>
      {offline && (
        <button
          type="button"
          onClick={retryApiNow}
          className="ct-btn ct-btn-secondary ct-btn-sm"
        >
          <RefreshCw size={16} aria-hidden="true" />Reintentar ahora
        </button>
      )}
    </div>
  )
}
