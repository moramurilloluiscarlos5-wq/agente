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
          <article key={plan.code} className={`tf-card flex flex-col p-6 ${yearly ? 'border-[var(--tf-border-strong)]' : ''}`} aria-label={plan.name}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-[var(--tf-text)]">{plan.name}</h3>
              {saving > 0 && <span className="text-sm font-medium text-[var(--tf-success)]">Ahorra {saving}%</span>}
            </div>
            <p className="tf-num mt-4 text-3xl font-semibold tracking-tight text-[var(--tf-text)]">{formatPrice(plan.price_cents, plan.currency)}<span className="ml-1 text-sm font-normal text-[var(--tf-text-muted)]">/ {yearly ? 'año' : 'mes'}</span></p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-[var(--tf-text-muted)]">
              {FEATURES.map((feature) => <li key={feature} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[var(--tf-accent)]" aria-hidden="true" />{feature}</li>)}
            </ul>
            {trialDays > 0 && <p className="mt-4 text-xs text-[var(--tf-text-subtle)]">{trialDays} días de prueba al registrar tu taller, sin tarjeta.</p>}
            <button type="button" className={`ct-btn mt-6 justify-center ${yearly ? 'ct-btn-primary' : 'ct-btn-secondary'}`} disabled={busyCode !== null} aria-busy={busyCode === plan.code || undefined} onClick={() => onBuy(plan)}>
              {busyCode === plan.code ? 'Abriendo pago seguro…' : `${buyLabel} ${yearly ? 'plan anual' : 'plan mensual'}`}
            </button>
          </article>
        )
      })}
    </div>
  )
}
