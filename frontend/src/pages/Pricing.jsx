import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LockKeyhole, RefreshCcw, ShieldCheck } from 'lucide-react'
import BrandLogo from '../components/branding/BrandLogo.jsx'
import BuySteps from '../components/auth/BuySteps.jsx'
import PlanCards from '../components/billing/PlanCards.jsx'
import LegalLinks from '../components/legal/LegalLinks.jsx'
import { TIER_NAMES } from '../utils/billing.js'
import { Alert, ErrorAlert, Skeleton } from '../components/ui/DesignSystem.jsx'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

const TRUST = [
  { icon: LockKeyhole, text: 'Pago seguro procesado por Mercado Pago' },
  { icon: ShieldCheck, text: 'Cada taller ve solo su información' },
  { icon: RefreshCcw, text: 'Renovación mensual; cancela cuando quieras' },
]

export default function Pricing() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [trialDays, setTrialDays] = useState(0)
  const [comingSoon, setComingSoon] = useState([])
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)
  // Licencias apagadas en el servidor: no hay nada que comprar y el registro es libre.
  const [disabled, setDisabled] = useState(false)
  const authenticated = status === 'authenticated'

  useEffect(() => {
    api.get('/billing/plans').then((response) => { setPlans(response.data); setTrialDays(response.trial_days ?? 0); setComingSoon(response.coming_soon ?? []); setDisabled(Boolean(response.disabled)) }).catch((err) => setError({ err, action: 'cargar los planes' })).finally(() => setLoaded(true))
  }, [])

  // Sin sesión: se crea el taller con el plan elegido y después se paga. Con sesión: el pago se confirma en Facturación.
  const actionFor = (plan) => ({
    label: `Comprar ${TIER_NAMES[plan.tier] ?? plan.name}`,
    onClick: () => navigate(authenticated ? `/facturacion?plan=${encodeURIComponent(plan.code)}` : `/registro?plan=${encodeURIComponent(plan.code)}`),
  })

  return (
    <main className="min-h-screen bg-[var(--tf-bg)] px-4 py-8 text-[var(--tf-text)] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between"><Link to="/" aria-label="Ir al inicio"><BrandLogo /></Link><Link to={authenticated ? '/' : '/login'} className="ct-btn ct-btn-secondary">{authenticated ? 'Volver al panel' : 'Iniciar sesión'}</Link></header>
        <div className="mt-12 flex flex-col items-center text-center">
          {!authenticated && <BuySteps current={0} />}
          <h1 className="ct-page-title">Licencia de activación</h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-[var(--tf-text-muted)]">Todos los planes incluyen reparaciones, clientes, inventario, cotizaciones, pagos y garantías. Elige el tuyo y activa tu taller hoy.</p>
        </div>
        {params.get('checkout') === 'cancelled' && <Alert tone="info" className="mx-auto mt-6 max-w-3xl">Cancelaste el pago. No se hizo ningún cobro.</Alert>}
        {error && <ErrorAlert error={error.err} action={error.action} className="mx-auto mt-6 max-w-3xl" />}
        <div className="mt-10">{plans.length > 0 ? <PlanCards plans={plans} actionFor={actionFor} trialDays={trialDays} comingSoon={comingSoon} /> : !error && loaded ? <div role="status" className="tf-card mx-auto max-w-3xl p-6 text-center text-sm text-[var(--tf-text-muted)]"><p>{disabled && !authenticated ? 'Por ahora el registro es gratis: crea tu taller y empieza a usarlo hoy.' : 'Los planes de pago aún no están disponibles. Vuelve a revisar pronto.'}</p>{disabled && !authenticated && <Link to="/registro" className="ct-auth-primary mx-auto mt-4 inline-flex">Crear mi taller</Link>}</div> : !error && <div role="status" aria-label="Cargando planes" className="tf-plan-grid">{[0, 1, 2].map((key) => <div key={key} className="tf-card space-y-4 p-6"><Skeleton className="h-5 w-24" /><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>)}</div>}</div>
        <ul className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-x-8 gap-y-3" aria-label="Por qué es seguro">
          {TRUST.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-sm font-medium text-[var(--tf-text-muted)]"><Icon size={16} className="text-[var(--tf-primary)]" aria-hidden="true" />{text}</li>
          ))}
        </ul>
        <footer className="mt-12 border-t border-[var(--tf-border)] pt-6"><LegalLinks /></footer>
      </div>
    </main>
  )
}
