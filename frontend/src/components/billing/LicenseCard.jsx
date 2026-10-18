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
  active: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  past_due: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
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

  const license = subscription?.license
  const tone = TONES[subscription?.status] ?? 'border-red-400/30 bg-red-400/10 text-red-200'
  const nextLabel = subscription?.status === 'trialing' ? 'Fin de la prueba' : subscription?.cancel_at_period_end ? 'Acceso hasta' : 'Próximo cobro'
  const nextDate = subscription?.status === 'trialing' ? subscription.trial_end : subscription?.current_period_end

  return (
    <section className="ct-surface-raised max-w-2xl p-6" aria-label="Estado de la licencia">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300"><CreditCard size={18} /></span>
        <div><h2 className="font-semibold text-slate-100">Licencia y facturación</h2><p className="mt-0.5 text-xs text-slate-500">Suscripción de tu taller</p></div>
      </div>
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      {!subscription && !error && <p role="status" className="mt-5 text-sm text-slate-400">Cargando licencia…</p>}
      {subscription && <>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Plan</dt><dd className="mt-1 text-slate-100" data-testid="license-plan">{subscription.plan?.name ?? (subscription.status === 'trialing' ? 'Prueba gratuita' : 'Sin plan')}</dd></div>
          <div><dt className="text-xs text-slate-500">Estado</dt><dd className="mt-1"><span data-testid="license-status" className={`rounded-full border px-2.5 py-1 text-xs ${tone}`}>{STATUS_LABELS[subscription.status] ?? 'Sin licencia'}</span></dd></div>
          <div><dt className="text-xs text-slate-500">{nextLabel}</dt><dd className="mt-1 text-slate-100" data-testid="license-next">{date(nextDate)}</dd></div>
        </dl>
        {license?.grace && <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">No pudimos cobrar tu suscripción. Actualiza tu método de pago antes del {date(license.grace_until)} para no perder el acceso.</p>}
        {license && !license.allowed && <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">Tu licencia no está activa. Elige un plan para continuar.</p>}
        {subscription.cancel_at_period_end && <p className="mt-4 text-sm text-slate-400">La suscripción se cancelará al final del periodo actual.</p>}
        {subscription.has_billing_account && (isOwner
          ? <button type="button" className="ct-btn ct-btn-primary mt-5" disabled={busy} onClick={manage}><CreditCard size={16} />{busy ? 'Abriendo…' : 'Gestionar pago'}</button>
          : <p className="mt-5 text-xs text-slate-500">Solo el propietario puede gestionar el método de pago.</p>)}
      </>}
    </section>
  )
}
