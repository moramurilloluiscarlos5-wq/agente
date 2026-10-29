import { LogOut, ShieldAlert } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'
import { SUPPORT_EMAIL, supportMailto } from '../utils/constants.js'

export default function WorkshopSuspended() {
  const { profile, logout } = useAuth()
  const inactive = profile?.workspace_access === 'INACTIVE' || profile?.workshop?.status === 'INACTIVE'
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--tf-bg)] px-4 py-10 text-[var(--tf-text)]">
      <section className="tf-card w-full max-w-lg p-8 text-center">
        <span className="tf-empty-icon mx-auto"><ShieldAlert size={18} aria-hidden="true" /></span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Taller {inactive ? 'inactivo' : 'temporalmente suspendido'}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--tf-text-muted)]">El acceso a este taller está {inactive ? 'desactivado' : 'en pausa'}. Toda la información se conserva. Escribe a <a href={supportMailto('Reactivar taller')} className="text-[var(--tf-link)] underline">{SUPPORT_EMAIL}</a> para reactivarlo.</p>
        <button type="button" onClick={logout} className="ct-btn ct-btn-secondary mt-6"><LogOut size={16} aria-hidden="true" />Cerrar sesión</button>
      </section>
    </main>
  )
}
