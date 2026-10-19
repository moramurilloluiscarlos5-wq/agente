import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import BrandLogo from '../components/branding/BrandLogo.jsx'
import PlanCards from '../components/billing/PlanCards.jsx'
import { goToStripe } from '../utils/billing.js'
import { Alert, ErrorAlert, Skeleton } from '../components/ui/DesignSystem.jsx'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

export default function Pricing() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [trialDays, setTrialDays] = useState(0)
  const [error, setError] = useState(null)
  const [busyCode, setBusyCode] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.get('/billing/plans').then((response) => { setPlans(response.data); setTrialDays(response.trial_days ?? 0) }).catch((err) => setError({ err, action: 'cargar los planes' })).finally(() => setLoaded(true))
  }, [])

  async function buy(plan) {
    // Sin sesión se crea primero la cuenta; el pago se hace ya con un taller.
    if (status !== 'authenticated') return navigate('/registro')
    setBusyCode(plan.code); setError(null)
    try { await goToStripe('/billing/checkout', { plan: plan.code }) } catch (err) { setError({ err, action: 'abrir el pago' }); setBusyCode(null) }
  }

  return (
    <main className="min-h-screen bg-[var(--tf-bg)] px-4 py-8 text-[var(--tf-text)] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between"><Link to="/" aria-label="Ir al inicio"><BrandLogo /></Link><Link to={status === 'authenticated' ? '/' : '/login'} className="text-sm text-[var(--tf-text-muted)] hover:text-[var(--tf-text)]">{status === 'authenticated' ? 'Volver al panel' : 'Iniciar sesión'}</Link></header>
        <div className="mt-12 text-center"><h1 className="text-3xl font-semibold tracking-tight">Precios simples para tu taller</h1><p className="mx-auto mt-3 max-w-md text-base text-[var(--tf-text-muted)]">Un solo plan con todo incluido. Pagas mes a mes o ahorras con el anual, y cancelas cuando quieras.</p></div>
        {params.get('checkout') === 'cancelled' && <Alert tone="info" className="mx-auto mt-6 max-w-3xl">Cancelaste el pago. No se hizo ningún cobro.</Alert>}
        {error && <ErrorAlert error={error.err} action={error.action} className="mx-auto mt-6 max-w-3xl" />}
        <div className="mx-auto mt-10 max-w-3xl">{plans.length > 0 ? <PlanCards plans={plans} onBuy={buy} busyCode={busyCode} trialDays={trialDays} /> : !error && loaded ? <p role="status" className="tf-card p-6 text-center text-sm text-[var(--tf-text-muted)]">Los planes de pago aún no están disponibles. Vuelve a revisar pronto.</p> : !error && <div role="status" aria-label="Cargando planes" className="grid gap-6 md:grid-cols-2">{[0, 1].map((key) => <div key={key} className="tf-card space-y-4 p-6"><Skeleton className="h-5 w-32" /><Skeleton className="h-8 w-24" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>)}</div>}</div>
      </div>
    </main>
  )
}
