import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { workspaceDestination } from '../utils/workspace.js'

export default function RequireAuth() {
  const { status, profile, error, retryConnection } = useAuth()
  const { pathname } = useLocation()
  if (status === 'loading') return <div role="status" className="flex min-h-screen items-center justify-center bg-[var(--tf-surface-sunken)] text-[var(--tf-text-muted)]">Cargando sesión…</div>
  // API inalcanzable pero con sesión preservada: NO redirigir a /login.
  // Mostrar el fallo real (servidor de TallerFlow) y permitir reintentar.
  if (status === 'offline') {
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--tf-surface-sunken)] px-6 text-center text-[var(--tf-text)]">
        <CloudOff size={36} className="text-[#fcd34d]" />
        <h1 className="text-xl font-semibold">TallerFlow no pudo conectarse con el servidor.</h1>
        <p className="max-w-md text-sm leading-6 text-[var(--tf-text-muted)]">
          Tu sesión está a salvo. Revisa tu conexión; en cuanto el servidor responda podrás continuar.
        </p>
        <button type="button" onClick={retryConnection} className="ct-btn ct-btn-primary">
          <RefreshCw size={15} /> Reintentar
        </button>
        {error && <p className="max-w-md text-xs text-[var(--tf-text-subtle)]">{error}</p>}
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
