import { useState } from 'react'
import { LogOut, RefreshCw, ShieldAlert } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.js'

// Qué pasó, dicho para quien no paga el plan (los mensajes del servidor le hablan al dueño).
const REASONS = {
  trial_expired: 'El periodo de prueba del taller terminó.',
  past_due_expired: 'Mercado Pago no pudo cobrar el plan del taller.',
  unpaid: 'Mercado Pago no pudo cobrar el plan del taller.',
  incomplete: 'El pago del plan del taller aún no se completa.',
}

// Licencia vencida para técnicos, recepción y caja: no pueden pagar, así que se les explica
// a quién pedirlo. Si el dueño ya pagó, "Ya se renovó" vuelve a revisar sin cerrar sesión.
export default function LicenseExpired() {
  const { profile, refreshProfile, logout } = useAuth()
  const [checking, setChecking] = useState(false)
  const [stillBlocked, setStillBlocked] = useState(false)
  const workshop = profile?.workshop?.name ?? 'tu taller'

  async function retry() {
    setChecking(true)
    setStillBlocked(false)
    const fresh = await refreshProfile().catch(() => null)
    setChecking(false)
    // Con la licencia vigente, RequireAuth lleva al panel.
    if (fresh?.license?.allowed !== true) setStillBlocked(true)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--tf-bg)] px-4 py-10 text-[var(--tf-text)]">
      <section className="tf-card w-full max-w-lg p-8 text-center">
        <span className="tf-empty-icon mx-auto"><ShieldAlert size={18} aria-hidden="true" /></span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">La licencia de {workshop} no está activa</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--tf-text-muted)]">
          {REASONS[profile?.license?.reason] ?? 'El plan del taller terminó.'} Pide al dueño del taller que elija un plan en Mi plan. Toda la información del taller se conserva.
        </p>
        {stillBlocked && <p role="status" className="mt-4 text-sm text-[var(--tf-text-subtle)]">La licencia sigue sin renovarse. Vuelve a intentarlo cuando el dueño complete el pago.</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={retry} disabled={checking} className="ct-btn ct-btn-primary"><RefreshCw size={16} aria-hidden="true" className={checking ? 'animate-spin' : undefined} />Ya se renovó</button>
          <button type="button" onClick={logout} className="ct-btn ct-btn-secondary"><LogOut size={16} aria-hidden="true" />Cerrar sesión</button>
        </div>
      </section>
    </main>
  )
}
