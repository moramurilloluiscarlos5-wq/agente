import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../../services/api.js'
import { TIER_NAMES } from '../../utils/billing.js'
import { Alert, Card, ErrorAlert, Skeleton } from '../ui/DesignSystem.jsx'

const STATUS = {
  trialing: ['Periodo de prueba', 'info'], active: ['Activa', 'success'], past_due: ['Pago pendiente', 'warning'],
  canceled: ['Cancelada', 'danger'], unpaid: ['Sin pagar', 'danger'], incomplete: ['Pago incompleto', 'warning'],
}
const date = (value) => (value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

function planName(subscription) {
  if (subscription.status === 'trialing') return 'Prueba gratuita (todo incluido)'
  if (!subscription.plan) return 'Sin plan'
  return `${TIER_NAMES[subscription.plan.tier] ?? subscription.plan.name} ${subscription.plan.interval === 'year' ? 'anual' : 'mensual'}`
}

export default function LicenseCard({ onLoaded }) {
  const { pathname } = useLocation()
  const [subscription, setSubscription] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    api.get('/billing/subscription').then((response) => { setSubscription(response.data); setError(null); onLoaded?.(response.data) }).catch((err) => setError(err))
  }, [onLoaded])
  useEffect(() => { load() }, [load])

  if (subscription?.disabled) return null
  const license = subscription?.license
  const usage = subscription?.usage
  const [statusLabel, tone] = STATUS[subscription?.status] ?? ['Sin licencia', 'danger']
  const nextLabel = subscription?.status === 'trialing' ? 'Fin de la prueba' : subscription?.cancel_at_period_end ? 'Acceso hasta' : 'Próximo cobro'
  const nextDate = subscription?.status === 'trialing' ? subscription.trial_end : subscription?.current_period_end

  return (
    <Card aria-label="Estado de la licencia" title="Licencia del taller" description="Plan, estado y próximo cobro con Mercado Pago" className="max-w-3xl"
      actions={pathname !== '/facturacion' && subscription && <Link to="/facturacion" className="ct-btn ct-btn-secondary ct-btn-sm">Administrar plan</Link>}>
      {error ? <ErrorAlert error={error} action="cargar la licencia" onRetry={load} />
        : !subscription ? <div role="status" aria-label="Cargando licencia" className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((key) => <div key={key} className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-28" /></div>)}</div>
          : <div className="space-y-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Plan</dt><dd className="mt-1 text-[var(--tf-text)]" data-testid="license-plan">{planName(subscription)}</dd></div>
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Estado</dt><dd className="mt-1"><span data-testid="license-status" className={`ct-status ct-status-${tone}`}>{statusLabel}</span></dd></div>
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">{nextLabel}</dt><dd className="mt-1 text-[var(--tf-text)]" data-testid="license-next">{date(nextDate)}</dd></div>
              <div><dt className="text-xs text-[var(--tf-text-subtle)]">Usuarios activos</dt><dd className="mt-1 text-[var(--tf-text)] tf-num" data-testid="license-users">{usage?.active_users ?? '—'}{usage?.max_users != null ? ` de ${usage.max_users}` : ' (sin límite)'}</dd></div>
            </dl>
            {license?.grace && <Alert tone="warning">Mercado Pago no pudo cobrar tu suscripción y lo reintentará en los próximos días. Revisa que tu tarjeta tenga fondos antes del {date(license.grace_until)} para no perder el acceso.</Alert>}
            {license && !license.allowed && <Alert tone="error">La licencia del taller no está activa. Elige un plan para seguir trabajando.</Alert>}
            {subscription.cancel_at_period_end && <p className="text-sm text-[var(--tf-text-muted)]">Cancelaste la suscripción: Mercado Pago ya no hará cobros y el acceso termina el {date(subscription.current_period_end)}.</p>}
          </div>}
    </Card>
  )
}
