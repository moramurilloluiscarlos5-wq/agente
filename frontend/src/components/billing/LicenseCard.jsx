import { useCallback, useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { api } from '../../services/api.js'
import { goToStripe } from '../../utils/billing.js'
import { useAuth } from '../../hooks/useAuth.js'

const STATUS_LABELS = {
  trialing: 'Periodo de prueba', active: 'Activa', past_due: 'Pago pendiente', canceled: 'Cancelada', unpaid: 'Impaga', incomplete: 'Pago incompleto',
}
const TONES = {
  trialing: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  active: 'border-[rgba(74,222,128,.3)] bg-[var(--tf-success-soft)] text-[#86efac]',
  past_due: 'border-[rgba(251,191,36,.3)] bg-[var(--tf-warning-soft)] text-[#fcd34d]',
}
const date = (value) => (value ? new Date(value).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

export default function LicenseCard({ onLoaded }) {
  const { profile } = useAuth()
  const [subscription, setSubscription] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isOwner = profile?.role === 'OWNER'

  const load = useCallback(() => {
    api.get('/billing/subscription').then((response) => { setSubscription(response.data); onLoaded?.(response.data) }).catch((err) => setError(err.message))
  }, [onLoaded])
  useEffect(() => { load() }, [load])

  async function manage() {
    setBusy(true); setError('')
    try { await goToStripe('/billing/portal', {}) } catch (err) { setError(err.message); setBusy(false) }
  }

  if (subscription?.disabled) return null
  const license = subscription?.license
  const tone = TONES[subscription?.status] ?? 'border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] text-[#fca5a5]'
  const nextLabel = subscription?.status === 'trialing' ? 'Fin de la prueba' : subscription?.cancel_at_period_end ? 'Acceso hasta' : 'Próximo cobro'
  const nextDate = subscription?.status === 'trialing' ? subscription.trial_end : subscription?.current_period_end

  return (
    <section className="ct-surface-raised max-w-2xl p-6" aria-label="Estado de la licencia">
      <div className="flex items-center gap-3 border-b border-[var(--tf-border)] pb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300"><CreditCard size={18} /></span>
        <div><h2 className="font-semibold text-[var(--tf-text)]">Licencia y facturación</h2><p className="mt-0.5 text-xs text-[var(--tf-text-subtle)]">Suscripción de tu taller</p></div>
      </div>
      {error && <p role="alert" className="mt-5 rounded-lg border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-3 text-sm text-[#fca5a5]">{error}</p>}
      {!subscription && !error && <p role="status" className="mt-5 text-sm text-[var(--tf-text-muted)]">Cargando licencia…</p>}
      {subscription && <>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-[var(--tf-text-subtle)]">Plan</dt><dd className="mt-1 text-[var(--tf-text)]" data-testid="license-plan">{subscription.plan?.name ?? (subscription.status === 'trialing' ? 'Prueba gratuita' : 'Sin plan')}</dd></div>
          <div><dt className="text-xs text-[var(--tf-text-subtle)]">Estado</dt><dd className="mt-1"><span data-testid="license-status" className={`rounded-full border px-2.5 py-1 text-xs ${tone}`}>{STATUS_LABELS[subscription.status] ?? 'Sin licencia'}</span></dd></div>
          <div><dt className="text-xs text-[var(--tf-text-subtle)]">{nextLabel}</dt><dd className="mt-1 text-[var(--tf-text)]" data-testid="license-next">{date(nextDate)}</dd></div>
        </dl>
        {license?.grace && <p className="mt-4 rounded-lg border border-[rgba(251,191,36,.3)] bg-[var(--tf-warning-soft)] p-3 text-sm text-[#fcd34d]">No pudimos cobrar tu suscripción. Actualiza tu método de pago antes del {date(license.grace_until)} para no perder el acceso.</p>}
        {license && !license.allowed && <p className="mt-4 rounded-lg border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-3 text-sm text-[#fca5a5]">Tu licencia no está activa. Elige un plan para continuar.</p>}
        {subscription.cancel_at_period_end && <p className="mt-4 text-sm text-[var(--tf-text-muted)]">La suscripción se cancelará al final del periodo actual.</p>}
        {subscription.has_billing_account && (isOwner
          ? <button type="button" className="ct-btn ct-btn-primary mt-5" disabled={busy} onClick={manage}><CreditCard size={16} />{busy ? 'Abriendo…' : 'Gestionar pago'}</button>
          : <p className="mt-5 text-xs text-[var(--tf-text-subtle)]">Solo el propietario puede gestionar el método de pago.</p>)}
      </>}
    </section>
  )
}
