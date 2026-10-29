import { useState } from 'react'
import { Check } from 'lucide-react'

import { BASE_FEATURES, FEATURE_LABELS, TIER_NAMES, formatPrice, usersLabel } from '../../utils/billing.js'

const TAGLINES = {
  plus: 'Para empezar a ordenar tu taller.',
  pro: 'Para talleres con equipo de trabajo.',
  max: 'Todo TallerFlow, sin límites.',
}
const PREVIOUS = { pro: 'plus', max: 'pro' }

// Planes Plus, Pro y Max con cobro mensual o anual. `actionFor(plan)` decide el botón de cada
// tarjeta: { label, onClick, disabled, busy, current }. `comingSoon` lista las funciones que el
// servidor aún no tiene configuradas; se muestran con la etiqueta "Próximamente".
export default function PlanCards({ plans, actionFor, trialDays = 0, initialInterval = 'month', comingSoon = [] }) {
  const intervals = [...new Set(plans.map((plan) => plan.interval))]
  const [cycle, setCycle] = useState(intervals.includes(initialInterval) ? initialInterval : intervals[0])
  const visible = plans.filter((plan) => plan.interval === cycle)
  const monthlyByTier = Object.fromEntries(plans.filter((plan) => plan.interval === 'month').map((plan) => [plan.tier, plan]))

  return (
    <div className="space-y-5" data-testid="plan-cards">
      {intervals.length > 1 && (
        <div className="tf-segmented" role="group" aria-label="Frecuencia de cobro">
          <button type="button" aria-pressed={cycle === 'month'} onClick={() => setCycle('month')}>Mensual</button>
          <button type="button" aria-pressed={cycle === 'year'} onClick={() => setCycle('year')}>Anual<span className="tf-segmented-note">2 meses gratis</span></button>
        </div>
      )}
      <div className="tf-plan-grid">
        {visible.map((plan) => {
          const action = actionFor(plan)
          const yearly = plan.interval === 'year'
          const monthly = monthlyByTier[plan.tier]
          const saving = yearly && monthly ? monthly.price_cents * 12 - plan.price_cents : 0
          const tierName = TIER_NAMES[plan.tier] ?? plan.name
          return (
            <article key={plan.code} className={`tf-plan ${plan.tier === 'pro' ? 'is-featured' : ''} ${action.current ? 'is-current' : ''}`} aria-label={`Plan ${tierName}`}>
              <header className="tf-plan-header">
                <h3>{tierName}</h3>
                {action.current ? <span className="ct-status ct-status-success">Tu plan</span> : plan.tier === 'pro' ? <span className="ct-status ct-status-accent">Recomendado</span> : null}
              </header>
              <p className="tf-plan-tagline">{TAGLINES[plan.tier]}</p>
              <p className="tf-plan-price tf-num">{formatPrice(plan.price_cents, plan.currency)}<span>/ {yearly ? 'año' : 'mes'}</span></p>
              <p className="tf-plan-price-note">{yearly ? `Equivale a ${formatPrice(Math.round(plan.price_cents / 1200) * 100, plan.currency)} al mes${saving > 0 ? `; ahorras ${formatPrice(saving, plan.currency)}` : ''}.` : 'Se cobra cada mes. Cancela cuando quieras.'}</p>
              <p className="tf-plan-users">{usersLabel(plan.max_users)}</p>
              <ul className="tf-plan-features">
                {PREVIOUS[plan.tier] && <li className="tf-plan-includes">Todo lo de {TIER_NAMES[PREVIOUS[plan.tier]]}, más:</li>}
                {(PREVIOUS[plan.tier] ? newFeatures(plans, plan) : BASE_FEATURES).map((feature) => (
                  <li key={feature}><Check size={15} strokeWidth={2.4} aria-hidden="true" /><span>{FEATURE_LABELS[feature] ?? feature}{comingSoon.includes(feature) && <span className="tf-plan-soon">Próximamente</span>}</span></li>
                ))}
              </ul>
              <button type="button" className={`ct-btn ${plan.tier === 'pro' && !action.current ? 'ct-btn-primary' : 'ct-btn-secondary'} w-full justify-center`} disabled={action.disabled} aria-busy={action.busy || undefined} onClick={action.onClick}>
                {action.label}
              </button>
            </article>
          )
        })}
      </div>
      {trialDays > 0 && <p className="text-sm text-[var(--tf-text-subtle)]">Al registrar tu taller tienes {trialDays} días de prueba con todo incluido, sin tarjeta. Los pagos se hacen con Mercado Pago.</p>}
    </div>
  )
}

// Lo que un nivel agrega sobre el anterior: más usuarios y funciones nuevas.
function newFeatures(plans, plan) {
  const previous = plans.find((other) => other.tier === PREVIOUS[plan.tier] && other.interval === plan.interval)
  const before = new Set(previous?.features ?? [])
  return plan.features.filter((feature) => !before.has(feature))
}
