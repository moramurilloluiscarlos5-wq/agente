import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Cualquier 402 LICENSE_REQUIRED del API lleva a /facturacion con un mensaje claro.
export default function LicenseRedirect() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    const onRequired = (event) => {
      if (location.pathname === '/facturacion' || location.pathname === '/precios') return
      navigate('/facturacion', { replace: true, state: { licenseMessage: event.detail?.message ?? 'Tu licencia no está activa.' } })
    }
    window.addEventListener('license-required', onRequired)
    return () => window.removeEventListener('license-required', onRequired)
  }, [navigate, location.pathname])
  return null
}
