import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import { licenseNotice } from '../../utils/billing.js'

// Aviso fino sobre la barra superior para quien puede pagar: días de prueba, cobro rechazado o
// plan cancelado. En Facturación no se muestra: ahí está el detalle completo.
export default function LicenseBanner() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const notice = licenseNotice(profile)
  if (!notice || pathname === '/facturacion') return null
  const Icon = notice.tone === 'warning' ? AlertTriangle : Sparkles
  return (
    <div role="status" className={`tf-license-banner is-${notice.tone}`}>
      <Icon size={15} className="tf-license-banner-icon" aria-hidden="true" />
      <p>
        {notice.text}{notice.detail && <span className="hidden sm:inline"> {notice.detail}</span>}{' '}
        <Link to="/facturacion" className="tf-license-banner-link">{notice.action}</Link>
      </p>
    </div>
  )
}
