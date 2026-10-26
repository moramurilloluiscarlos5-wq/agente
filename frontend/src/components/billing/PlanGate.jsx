import { Link, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import PageHeader from '../ui/PageHeader.jsx'
import { EmptyState } from '../ui/DesignSystem.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { sectionTitle } from '../../utils/constants.js'
import { FEATURE_LABELS, FEATURE_MIN_TIER, TIER_NAMES, planIncludes } from '../../utils/billing.js'

// Muestra la sección solo si el plan del taller la incluye; si no, explica en qué plan está.
// El servidor aplica el mismo límite: esto evita que la persona llegue a un error.
export default function PlanGate({ feature, children }) {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  if (planIncludes(profile, feature)) return children

  const tier = TIER_NAMES[FEATURE_MIN_TIER[feature]] ?? 'superior'
  const canManage = ['OWNER', 'ADMINISTRADOR'].includes(profile?.role)
  return (
    <div className="space-y-6">
      <PageHeader title={sectionTitle(pathname)} />
      <section className="tf-card">
        <EmptyState icon={Lock} title={`Disponible desde el plan ${tier}`}
          description={`Tu plan ${profile.entitlements.name} no incluye esta sección (${FEATURE_LABELS[feature]}). ${canManage ? `Cambia a ${tier} en Facturación para usarla.` : `Pide al dueño del taller que cambie al plan ${tier}.`}`}
          action={canManage && <Link to="/facturacion" className="ct-btn ct-btn-primary">Ver planes</Link>} />
      </section>
    </div>
  )
}
