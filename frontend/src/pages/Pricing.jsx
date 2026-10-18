import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import BrandLogo from '../components/branding/BrandLogo.jsx'
import PlanCards from '../components/billing/PlanCards.jsx'
import { goToStripe } from '../utils/billing.js'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

export default function Pricing() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [trialDays, setTrialDays] = useState(0)
  const [error, setError] = useState('')
  const [busyCode, setBusyCode] = useState(null)

  useEffect(() => {
    api.get('/billing/plans').then((response) => { setPlans(response.data); setTrialDays(response.trial_days ?? 0) }).catch((err) => setError(err.message))
  }, [])

  async function buy(plan) {
    // Sin sesión se crea primero la cuenta; el pago se hace ya con un taller.
    if (status !== 'authenticated') return navigate('/registro')
    setBusyCode(plan.code); setError('')
    try { await goToStripe('/billing/checkout', { plan: plan.code }) } catch (err) { setError(err.message); setBusyCode(null) }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between"><Link to="/" aria-label="Ir al inicio"><BrandLogo /></Link><Link to={status === 'authenticated' ? '/' : '/login'} className="text-sm text-slate-400 hover:text-slate-200">{status === 'authenticated' ? 'Volver al panel' : 'Iniciar sesión'}</Link></header>
        <div className="mt-12 text-center"><h1 className="text-3xl font-semibold">Precios simples para tu taller</h1><p className="mt-3 text-sm text-slate-400">Un solo plan con todo incluido. Cancela cuando quieras.</p></div>
        {params.get('checkout') === 'cancelled' && <p role="status" className="mt-6 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-center text-sm text-amber-200">El pago se canceló. No se realizó ningún cobro.</p>}
        {error && <p role="alert" className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-center text-sm text-red-200">{error}</p>}
        <div className="mt-10">{plans.length > 0 ? <PlanCards plans={plans} onBuy={buy} busyCode={busyCode} trialDays={trialDays} /> : !error && <p role="status" className="text-center text-sm text-slate-400">Cargando planes…</p>}</div>
      </div>
    </main>
  )
}
