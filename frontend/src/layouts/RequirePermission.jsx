import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'

export default function RequirePermission({ permission, children }) {
  const { hasPermission } = useAuth()
  if (hasPermission(permission)) return children

  return <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center text-center"><div className="rounded-[var(--tf-radius-dialog)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-8"><ShieldAlert size={34} className="mx-auto text-[#fcd34d]" /><p className="mt-4 text-2xl font-semibold text-[var(--tf-text)]">Acceso restringido</p><p className="mt-2 text-sm text-[var(--tf-text-muted)]">No tienes permisos para acceder a esta sección.</p><Link to="/" className="mt-6 inline-flex rounded-lg bg-[var(--tf-primary)] px-4 py-2 text-sm font-semibold text-white">Volver al Dashboard</Link></div></div>
}
