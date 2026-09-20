import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'

export default function RequirePermission({ permission, children }) {
  const { hasPermission } = useAuth()
  if (hasPermission(permission)) return children

  return <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center text-center"><div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl shadow-black/20"><ShieldAlert size={34} className="mx-auto text-amber-300" /><p className="mt-4 text-2xl font-semibold text-white">Acceso restringido</p><p className="mt-2 text-sm text-slate-400">No tienes permisos para acceder a esta sección.</p><Link to="/" className="mt-6 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Volver al Dashboard</Link></div></div>
}
