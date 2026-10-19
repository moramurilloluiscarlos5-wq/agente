import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { EmptyState } from '../components/ui/DesignSystem.jsx'
import { useAuth } from '../hooks/useAuth.js'

export default function RequirePermission({ permission, children }) {
  const { hasPermission } = useAuth()
  if (hasPermission(permission)) return children
  return (
    <section className="tf-card mx-auto mt-8 max-w-xl">
      <EmptyState icon={ShieldAlert} title="Esta sección no está en tu rol"
        description="Pide al dueño del taller que agregue este permiso a tu rol si lo necesitas para tu trabajo."
        action={<Link to="/" className="ct-btn ct-btn-primary">Volver al panel</Link>} />
    </section>
  )
}
