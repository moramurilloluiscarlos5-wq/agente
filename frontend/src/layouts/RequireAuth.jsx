import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { workspaceDestination } from '../utils/workspace.js'

export default function RequireAuth() {
  const { status, profile } = useAuth()
  const { pathname } = useLocation()
  if (status === 'loading') return <div role="status" className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">Cargando sesión…</div>
  if (status !== 'authenticated') return <Navigate to="/login" replace />
  const destination = workspaceDestination(profile)
  // El contenido protegido nunca se monta antes de resolver el taller.
  if (destination !== '/' && pathname !== destination) return <Navigate to={destination} replace />
  if (destination === '/' && pathname === '/taller-suspendido') return <Navigate to="/" replace />
  return <Outlet />
}

