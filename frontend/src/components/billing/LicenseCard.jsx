import { useCallback, useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { api } from '../../services/api.js'
import { goToStripe } from '../../utils/billing.js'
import { useAuth } from '../../hooks/useAuth.js'
import { Alert, Button, Card, ErrorAlert, Skeleton } from '../ui/DesignSystem.jsx'

const STATUS = {
  trialing: ['Periodo de prueba', 'info'], active: ['Activa', 'success'], past_due: ['Pago pendiente', 'warning'],
  canceled: ['Cancelada', 'danger'], unpaid: ['Sin pagar', 'danger'], incomplete: ['Pago incompleto', 'warning'],
}
const date = (value) => (value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

export default function LicenseCard({ onLoaded }) {
  const { profile } = useAuth()
  const [subscription, setSubscription] = useState(null)
  const [error, setError] = useState(null)
  const [portalError, setPortalError] = useState(null)
  const [busy, setBusy] = useState(false)
  const isOwner = profile?.role === 'OWNER'

  const load = useCallback(() => {
    api.get('/billing/subscription').then((response) => { setSubscription(response.data); setError(null); onLoaded?.(response.data) }).catch((err) => setError(err))
  }, [onLoaded])
  useEffect(() => { load() }, [load])

  async function manage() {
    setBusy(true); setPortalError(null)
    try { await goToStripe('/billing/portal', {}) } catch (err) { setPortalError(err); setBusy(false) }
  }

  if (subscription?.disabled) return null
  const license = subscription?.license
  const [statusLabel, tone] = STATUS[subscription?.status] ?? ['Sin licencia', 'danger']
  const nextLabel = subscription?.status === 'trialing' ? 'Fin de la prueba' : subscription?.cancel_at_period_end ? 'Acceso hasta' : 'Próximo cobro'
  const nextDate = subscription?.status === 'trialing' ? subscription.trial_end : subscription?.current_period_end

  return (
    <Card aria-label="Estado de la licencia" title="Licencia y facturación" description="Suscripción de tu taller" className="max-w-3xl">
      {error ? <ErrorAlert error={error} action="cargar la licencia" onRetry={load} />
        : !subscription ? <div role="status" aria-label="Cargando licencia" className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-28" /></div>)}</div>
          : <div className="space-y-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Plan</dt><dd className="mt-1 text-[var(--tf-text)]" data-testid="license-plan">{subscription.plan?.name ?? (subscription.status === 'trialing' ? 'Prueba gratuita' : 'Sin plan')}</dd></div>
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Estado</dt><dd className="mt-1"><span data-testid="license-status" className={`ct-status ct-status-${tone}`}>{statusLabel}</span></dd></div>
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">{nextLabel}</dt><dd className="mt-1 text-[var(--tf-text)]" data-testid="license-next">{date(nextDate)}</dd></div>
            </dl>
            {license?.grace && <Alert tone="warning">No pudimos cobrar tu suscripción. Actualiza el método de pago antes del {date(license.grace_until)} para no perder el acceso.</Alert>}
            {license && !license.allowed && <Alert tone="error">La licencia del taller no está activa. Elige un plan para seguir trabajando.</Alert>}
            {subscription.cancel_at_period_end && <p className="text-sm text-[var(--tf-text-muted)]">La suscripción termina al final del periodo actual.</p>}
            {portalError && <ErrorAlert error={portalError} action="abrir el portal de pagos" />}
            {subscription.has_billing_account && (isOwner
              ? <Button variant="primary" icon={CreditCard} busy={busy} onClick={manage}>{busy ? 'Abriendo…' : 'Gestionar pago'}</Button>
              : <p className="text-xs text-[var(--tf-text-subtle)]">Solo el dueño del taller puede cambiar el método de pago.</p>)}
          </div>}
    </Card>
  )
}
