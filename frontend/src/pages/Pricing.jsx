import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import BrandLogo from '../components/branding/BrandLogo.jsx'
import PlanCards from '../components/billing/PlanCards.jsx'
import { TIER_NAMES } from '../utils/billing.js'
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
  const [loaded, setLoaded] = useState(false)
  const authenticated = status === 'authenticated'

  useEffect(() => {
    api.get('/billing/plans').then((response) => { setPlans(response.data); setTrialDays(response.trial_days ?? 0) }).catch((err) => setError({ err, action: 'cargar los planes' })).finally(() => setLoaded(true))
  }, [])

  // Sin sesión se crea primero la cuenta (con prueba gratis); con sesión el pago se confirma en Facturación.
  const actionFor = (plan) => ({
    label: authenticated ? `Contratar ${TIER_NAMES[plan.tier] ?? plan.name}` : 'Empezar prueba gratis',
    onClick: () => navigate(authenticated ? `/facturacion?plan=${encodeURIComponent(plan.code)}` : '/registro'),
  })

  return (
    <main className="min-h-screen bg-[var(--tf-bg)] px-4 py-8 text-[var(--tf-text)] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between"><Link to="/" aria-label="Ir al inicio"><BrandLogo /></Link><Link to={authenticated ? '/' : '/login'} className="text-sm text-[var(--tf-text-muted)] hover:text-[var(--tf-text)]">{authenticated ? 'Volver al panel' : 'Iniciar sesión'}</Link></header>
        <div className="mt-12 text-center"><h1 className="text-3xl font-semibold tracking-tight">Un plan para cada tamaño de taller</h1><p className="mx-auto mt-3 max-w-xl text-base text-[var(--tf-text-muted)]">Todos incluyen reparaciones, clientes, inventario, cotizaciones, pagos y garantías. Cambia de plan cuando tu taller crezca y cancela cuando quieras.</p></div>
        {params.get('checkout') === 'cancelled' && <Alert tone="info" className="mx-auto mt-6 max-w-3xl">Cancelaste el pago. No se hizo ningún cobro.</Alert>}
        {error && <ErrorAlert error={error.err} action={error.action} className="mx-auto mt-6 max-w-3xl" />}
        <div className="mt-10">{plans.length > 0 ? <PlanCards plans={plans} actionFor={actionFor} trialDays={trialDays} /> : !error && loaded ? <p role="status" className="tf-card mx-auto max-w-3xl p-6 text-center text-sm text-[var(--tf-text-muted)]">Los planes de pago aún no están disponibles. Vuelve a revisar pronto.</p> : !error && <div role="status" aria-label="Cargando planes" className="tf-plan-grid">{[0, 1, 2].map((key) => <div key={key} className="tf-card space-y-4 p-6"><Skeleton className="h-5 w-24" /><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>)}</div>}</div>
      </div>
    </main>
  )
}
