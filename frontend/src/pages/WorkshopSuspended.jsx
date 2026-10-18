import { LogOut, ShieldAlert } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'

export default function WorkshopSuspended() {
  const { profile, logout } = useAuth()
  const inactive = profile?.workspace_access === 'INACTIVE' || profile?.workshop?.status === 'INACTIVE'
  return <main className="flex min-h-screen items-center justify-center bg-[var(--tf-surface-sunken)] px-5 py-10 text-[var(--tf-text)]"><section className="w-full max-w-lg rounded-3xl border border-[rgba(251,191,36,.3)] bg-[var(--tf-surface)] p-8 text-center"><ShieldAlert size={44} className="mx-auto text-[#fcd34d]" /><h1 className="mt-5 text-2xl font-semibold">Taller {inactive ? 'inactivo' : 'temporalmente suspendido'}</h1><p className="mt-3 text-sm leading-6 text-[var(--tf-text-muted)]">El acceso a este espacio de trabajo se encuentra {inactive ? 'inactivo' : 'suspendido'}. La información se conserva. Contacta al administrador de la plataforma para reactivarlo.</p><button type="button" onClick={logout} className="mt-7 inline-flex items-center gap-2 rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] px-5 py-3 text-sm text-[var(--tf-text)] hover:border-[var(--tf-border)]"><LogOut size={16} /> Cerrar sesión</button></section></main>
}
