import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '../components/ui/DesignSystem.jsx'

export default function NotFound() {
  return (
    <section className="tf-card mx-auto mt-8 max-w-xl">
      <EmptyState icon={Compass} title="No encontramos esta página" description="El enlace puede estar incompleto o la página cambió de lugar. Vuelve al panel o usa la búsqueda superior."
        action={<Link to="/" className="ct-btn ct-btn-primary">Volver al panel</Link>} />
    </section>
  )
}
