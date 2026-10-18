import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader.jsx'
import LicenseCard from '../components/billing/LicenseCard.jsx'
import PlanCards from '../components/billing/PlanCards.jsx'
import { goToStripe } from '../utils/billing.js'
import { api } from '../services/api.js'

export default function Billing() {
  const location = useLocation()
  const [params] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [error, setError] = useState('')
  const [busyCode, setBusyCode] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const message = location.state?.licenseMessage

  useEffect(() => { api.get('/billing/plans').then((response) => setPlans(response.data)).catch((err) => setError(err.message)) }, [])

  // Tras volver de Stripe el webhook puede tardar unos segundos en activar la licencia.
  const success = params.get('checkout') === 'success'
  const pending = success && subscription?.status !== 'active'
  useEffect(() => {
    if (!pending) return undefined
    const timer = setTimeout(() => setReloadKey((key) => key + 1), 3000)
    return () => clearTimeout(timer)
  }, [pending, reloadKey])

  async function buy(plan) {
    setBusyCode(plan.code); setError('')
    try { await goToStripe('/billing/checkout', { plan: plan.code }) } catch (err) { setError(err.message); setBusyCode(null) }
  }

  const needsPlan = !subscription || subscription.status !== 'active' || subscription.license?.allowed === false
  return (
    <div className="ct-page space-y-6">
      <PageHeader title="Facturación" description="Licencia, plan y método de pago de tu taller." />
      {message && <p role="alert" className="rounded-lg border border-[rgba(251,191,36,.3)] bg-[var(--tf-warning-soft)] p-3 text-sm text-[#fcd34d]">{message}</p>}
      {success && <p role="status" className="rounded-lg border border-[rgba(74,222,128,.3)] bg-[var(--tf-success-soft)] p-3 text-sm text-[#86efac]">{pending ? 'Pago recibido. Estamos activando tu licencia…' : '¡Listo! Tu licencia está activa.'}</p>}
      {error && <p role="alert" className="rounded-lg border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-3 text-sm text-[#fca5a5]">{error}</p>}
      <LicenseCard key={reloadKey} onLoaded={setSubscription} />
      {needsPlan && plans.length > 0 && <section aria-label="Planes disponibles" className="max-w-4xl space-y-4"><h2 className="font-semibold text-[var(--tf-text)]">Elige tu plan</h2><PlanCards plans={plans} onBuy={buy} busyCode={busyCode} /></section>}
    </div>
  )
}
