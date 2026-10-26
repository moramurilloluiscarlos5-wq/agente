import { Check } from 'lucide-react'
import './auth.css'

const STEPS = ['Elige tu plan', 'Crea tu taller', 'Paga con Mercado Pago']

// Los tres pasos de la compra de la licencia de activación; `current` va de 0 a 2.
export default function BuySteps({ current, className = '' }) {
  return (
    <ol className={`ct-buy-steps ${className}`} aria-label="Pasos para activar tu taller">
      {STEPS.map((label, index) => (
        <li key={label} className={index < current ? 'is-done' : index === current ? 'is-current' : ''} aria-current={index === current ? 'step' : undefined}>
          <span className="ct-buy-dot" aria-hidden="true">{index < current ? <Check size={12} strokeWidth={3.5} /> : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  )
}
