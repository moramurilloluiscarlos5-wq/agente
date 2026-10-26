import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { canManageBilling } from '../../utils/billing.js'

// Un 402 LICENSE_REQUIRED con la sesión abierta (la licencia venció mientras se usaba) vuelve a
// leer la sesión y RequireAuth lleva al dueño a Facturación y al resto a su aviso. Como máximo
// una lectura cada 10 s: varias peticiones fallan a la vez.
export default function LicenseRedirect() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, refreshProfile } = useAuth()
  const lastCheck = useRef(0)
  useEffect(() => {
    const onRequired = async (event) => {
      let fresh = null
      if (Date.now() - lastCheck.current > 10_000) {
        lastCheck.current = Date.now()
        fresh = await refreshProfile().catch(() => null)
        if (fresh?.license?.allowed === false) return
      }
      // La sesión todavía no refleja el bloqueo: quien puede pagar va a Facturación con el aviso.
      if (location.pathname === '/facturacion' || location.pathname === '/precios') return
      if (canManageBilling(fresh ?? profile)) navigate('/facturacion', { replace: true, state: { licenseMessage: event.detail?.message ?? 'Tu licencia no está activa.' } })
    }
    window.addEventListener('license-required', onRequired)
    return () => window.removeEventListener('license-required', onRequired)
  }, [navigate, location.pathname, profile, refreshProfile])
  return null
}
