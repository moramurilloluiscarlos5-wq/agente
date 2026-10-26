import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CheckCircle2 } from 'lucide-react'
import { Button, Dialog } from '../ui/DesignSystem.jsx'
import { api } from '../../services/api.js'
import { useAuth } from '../../hooks/useAuth.js'

const OWNER_ROLES = ['OWNER', 'ADMINISTRADOR']
const seenKey = (userId) => `tf-welcome-done:${userId ?? 'anon'}`
function readSeen(userId) {
  try { return window.localStorage.getItem(seenKey(userId)) === '1' } catch { return false }
}

// Cómo avanza un equipo por el taller, en los tonos del flujo del panel.
const JOURNEY = [
  { label: 'Recibes', tone: 'received' },
  { label: 'Reparas', tone: 'repair' },
  { label: 'Avisas', tone: 'ready' },
  { label: 'Entregas', tone: 'delivered' },
]

// Ventana de bienvenida para el dueño de un taller nuevo: pasos numerados arriba y, en cada
// uno, qué hacer y el botón que lo lleva ahí. Los pasos se marcan con los datos reales del
// taller; se muestra una sola vez por persona y no vuelve si ya está todo hecho.
export default function WelcomeSteps({ data }) {
  const { profile, hasPermission } = useAuth()
  const canSeeStaff = hasPermission('users.view')
  // Solo en el primer inicio de sesión (el servidor aún no registra uno anterior) y una vez por persona.
  const [open, setOpen] = useState(() => OWNER_ROLES.includes(profile?.role) && profile?.last_login_at === null && !readSeen(profile?.id))
  const [index, setIndex] = useState(0)
  const [staffCount, setStaffCount] = useState(null)

  useEffect(() => {
    if (!open || !canSeeStaff) return undefined
    let active = true
    api.get('/auth/users').then(({ data: users }) => { if (active) setStaffCount(users?.length ?? 0) }).catch(() => {})
    return () => { active = false }
  }, [open, canSeeStaff])

  const stats = data.stats ?? {}
  const steps = [
    {
      key: 'welcome', short: 'Bienvenida', done: true,
      title: 'Te damos la bienvenida a TallerFlow',
      body: 'Así trabaja tu taller aquí: recibes el equipo, lo reparas, avisas al cliente y se lo entregas. En unos pasos lo dejas listo.',
    },
    {
      key: 'repair', short: 'Primera orden', done: Boolean(data.recentRepairs?.length),
      title: 'Registra tu primera reparación',
      body: 'Captura al cliente, su equipo y la falla que reporta. Cada equipo recibe un número de orden y un enlace para que el cliente vea el avance.',
      action: { to: '/reparaciones/nueva', label: 'Registrar reparación' },
    },
    canSeeStaff && {
      key: 'staff', short: 'Tu equipo', done: staffCount > 1,
      title: 'Agrega a tu equipo',
      body: 'Crea una cuenta para cada técnico y para recepción. Cada quien entra con su usuario y ve lo que le toca.',
      action: { to: '/personal', label: 'Agregar personal' },
    },
    {
      key: 'deliver', short: 'Entrega', done: (stats.delivered ?? stats.deliveredLast30Days ?? 0) > 0,
      title: 'Entrega y comparte el seguimiento',
      body: 'Cuando el equipo esté listo, márcalo como entregado. Con el QR de la orden tu cliente sigue su reparación desde el celular, sin llamar al taller.',
      action: { to: '/reparaciones', label: 'Ver reparaciones' },
    },
  ].filter(Boolean)

  if (!open) return null
  // Un taller que ya hizo todo no necesita la bienvenida.
  if (steps.every((step) => step.done)) return null

  const step = steps[index]
  const last = index === steps.length - 1
  const close = () => {
    try { window.localStorage.setItem(seenKey(profile?.id), '1') } catch { /* Preferencia opcional. */ }
    setOpen(false)
  }

  const stepper = (
    <ol className="tf-stepper" aria-label="Pasos para empezar">
      {steps.map((item, position) => {
        const state = position === index ? 'is-current' : position < index || (item.done && item.key !== 'welcome') ? 'is-done' : ''
        return (
          <li key={item.key} className={`tf-stepper-step ${state}`} aria-current={position === index ? 'step' : undefined}>
            <button type="button" className="tf-stepper-button" onClick={() => setIndex(position)} aria-label={`Paso ${position + 1}: ${item.short}${item.done && item.key !== 'welcome' ? ', hecho' : ''}`}>
              <span className="tf-stepper-dot" aria-hidden="true">{state === 'is-done' ? <Check size={14} strokeWidth={3} /> : position + 1}</span>
              <span className="tf-stepper-label"><span>Paso {position + 1}</span>{item.short}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )

  return (
    <Dialog open title={step.title} onClose={close} top={stepper} wide
      footer={<>
        <Button variant="ghost" onClick={close} className="mr-auto">{last ? 'Cerrar' : 'Saltar'}</Button>
        {index > 0 && <Button onClick={() => setIndex(index - 1)}>Anterior</Button>}
        <Button variant="primary" data-autofocus onClick={() => (last ? close() : setIndex(index + 1))}>{last ? 'Terminar' : 'Siguiente'}</Button>
      </>}>
      <div data-testid="welcome-steps">
        <p className="tf-welcome-body">{step.body}</p>
        {step.key === 'welcome' && (
          <ol className="tf-welcome-journey" aria-label="Cómo avanza un equipo">
            {JOURNEY.map((item) => <li key={item.label} className={`tf-tone-${item.tone}`}><span className="tf-swatch" aria-hidden="true" />{item.label}</li>)}
          </ol>
        )}
        {step.action && (step.done
          ? <p className="tf-welcome-done"><CheckCircle2 size={18} aria-hidden="true" />Este paso ya está hecho.</p>
          : <Link to={step.action.to} onClick={close} className="ct-btn ct-btn-secondary mt-5">{step.action.label}</Link>)}
      </div>
    </Dialog>
  )
}
