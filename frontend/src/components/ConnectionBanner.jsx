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
        offline
          ? 'border-b border-[rgba(251,191,36,.3)] bg-[var(--tf-warning-soft)] text-[#fcd34d]'
          : 'border-b border-[rgba(74,222,128,.3)] bg-[var(--tf-success-soft)] text-[#86efac]'
      }`}
    >
      {offline && <AlertTriangle size={15} className="shrink-0 text-[#fcd34d]" />}
      {checking && <LoaderCircle size={15} className="shrink-0 animate-spin text-[#fcd34d]" />}
      {apiStatus === API_STATUS.ONLINE && <CheckCircle2 size={15} className="shrink-0 text-[#86efac]" />}
      <span>
        {offline && 'Problemas de conexión con TallerFlow. Reintentando…'}
        {checking && 'Comprobando conexión con TallerFlow…'}
        {apiStatus === API_STATUS.ONLINE && 'Conexión restablecida.'}
      </span>
      {offline && (
        <button
          type="button"
          onClick={retryApiNow}
          className="ct-btn ct-btn-secondary px-3 py-1 text-xs"
        >
          <RefreshCw size={13} /> Reintentar
        </button>
      )}
    </div>
  )
}
