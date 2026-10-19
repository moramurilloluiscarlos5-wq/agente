import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader.jsx'
import LicenseCard from '../components/billing/LicenseCard.jsx'
import PlanCards from '../components/billing/PlanCards.jsx'
import { Alert, ErrorAlert } from '../components/ui/DesignSystem.jsx'
import { goToStripe } from '../utils/billing.js'
import { api } from '../services/api.js'

export default function Billing() {
  const location = useLocation()
  const [params] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [error, setError] = useState(null)
  const [busyCode, setBusyCode] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const message = location.state?.licenseMessage

  useEffect(() => { api.get('/billing/plans').then((response) => setPlans(response.data)).catch((err) => setError({ err, action: 'cargar los planes' })) }, [])

  // Tras volver de Stripe el webhook puede tardar unos segundos en activar la licencia.
  const success = params.get('checkout') === 'success'
  const pending = success && subscription?.status !== 'active'
  useEffect(() => {
    if (!pending) return undefined
    const timer = setTimeout(() => setReloadKey((key) => key + 1), 3000)
    return () => clearTimeout(timer)
  }, [pending, reloadKey])

  async function buy(plan) {
    setBusyCode(plan.code); setError(null)
    try { await goToStripe('/billing/checkout', { plan: plan.code }) } catch (err) { setError({ err, action: 'abrir el pago' }); setBusyCode(null) }
  }

  const disabled = subscription?.disabled === true
  const needsPlan = !disabled && (!subscription || subscription.status !== 'active' || subscription.license?.allowed === false)
  return (
    <div className="space-y-6">
      <PageHeader title="Facturación" description="Licencia, plan y método de pago de tu taller." />
      {message && <div role="alert" className="tf-alert tf-alert-warning max-w-3xl">{message}</div>}
      {success && <Alert tone={pending ? 'info' : 'success'} className="max-w-3xl">{pending ? 'Pago recibido. Estamos activando tu licencia…' : 'Listo, tu licencia está activa.'}</Alert>}
      {error && <ErrorAlert error={error.err} action={error.action} className="max-w-3xl" />}
      <LicenseCard key={reloadKey} onLoaded={setSubscription} />
      {disabled && <section aria-label="Licencias desactivadas" className="tf-card max-w-3xl p-6"><h2 className="text-base font-semibold text-[var(--tf-text)]">Licencias desactivadas</h2><p className="mt-2 text-sm text-[var(--tf-text-muted)]">El cobro por suscripción todavía no está activado. Tu taller tiene acceso completo y no necesitas pagar nada.</p></section>}
      {needsPlan && plans.length > 0 && <section aria-label="Planes disponibles" className="max-w-3xl space-y-4"><h2 className="text-lg font-semibold text-[var(--tf-text)]">Elige tu plan</h2><PlanCards plans={plans} onBuy={buy} busyCode={busyCode} /></section>}
    </div>
  )
}
