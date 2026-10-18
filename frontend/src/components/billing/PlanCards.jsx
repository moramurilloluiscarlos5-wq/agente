import { Check } from 'lucide-react'

import { formatPrice } from '../../utils/billing.js'

const FEATURES = ['Reparaciones, clientes y dispositivos ilimitados', 'Inventario, cotizaciones y pagos', 'Usuarios y roles por taller', 'Seguimiento público para tus clientes']

export default function PlanCards({ plans, onBuy, busyCode = null, buyLabel = 'Comprar', trialDays = 0 }) {
  const monthly = plans.find((plan) => plan.interval === 'month')
  return (
    <div className="grid gap-5 md:grid-cols-2" data-testid="plan-cards">
      {plans.map((plan) => {
        const yearly = plan.interval === 'year'
        const saving = yearly && monthly ? Math.round((1 - plan.price_cents / (monthly.price_cents * 12)) * 100) : 0
        return (
          <article key={plan.code} className="ct-surface-raised flex flex-col p-6" aria-label={plan.name}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-100">{plan.name}</h3>
              {saving > 0 && <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">Ahorra {saving}%</span>}
            </div>
            <p className="mt-4 text-3xl font-semibold text-slate-50">{formatPrice(plan.price_cents, plan.currency)}<span className="ml-1 text-sm font-normal text-slate-400">/ {yearly ? 'año' : 'mes'}</span></p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-300">
              {FEATURES.map((feature) => <li key={feature} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-sky-300" />{feature}</li>)}
            </ul>
            {trialDays > 0 && <p className="mt-4 text-xs text-slate-500">{trialDays} días de prueba al registrar tu taller, sin tarjeta.</p>}
            <button type="button" className="ct-btn ct-btn-primary mt-5 justify-center" disabled={busyCode !== null} onClick={() => onBuy(plan)}>
              {busyCode === plan.code ? 'Redirigiendo a Stripe…' : buyLabel}
            </button>
          </article>
        )
      })}
    </div>
  )
}
