import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { workspaceDestination } from '../utils/workspace.js'

export default function RequireAuth() {
  const { status, profile, error, retryConnection } = useAuth()
  const { pathname } = useLocation()
  if (status === 'loading') return <div role="status" className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">Cargando sesión…</div>
  // API inalcanzable pero con sesión preservada: NO redirigir a /login.
  // Mostrar el fallo real (servidor de Taller Flow) y permitir reintentar.
  if (status === 'offline') {
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-slate-200">
        <CloudOff size={36} className="text-amber-300" />
        <h1 className="text-xl font-semibold">Taller Flow no pudo conectarse con el servidor.</h1>
        <p className="max-w-md text-sm leading-6 text-slate-400">
          Tu sesión está a salvo. Revisa tu conexión; en cuanto el servidor responda podrás continuar.
        </p>
        <button type="button" onClick={retryConnection} className="ct-btn ct-btn-primary">
          <RefreshCw size={15} /> Reintentar
        </button>
        {error && <p className="max-w-md text-xs text-slate-500">{error}</p>}
      </div>
    )
  }
  if (status !== 'authenticated') return <Navigate to="/login" replace />
  const destination = workspaceDestination(profile)
  // El contenido protegido nunca se monta antes de resolver el taller.
  if (destination !== '/' && pathname !== destination) return <Navigate to={destination} replace />
  if (destination === '/' && pathname === '/taller-suspendido') return <Navigate to="/" replace />
  return <Outlet />
}
