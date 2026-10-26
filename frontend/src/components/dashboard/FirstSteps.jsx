import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { Card, IconButton } from '../ui/DesignSystem.jsx'
import { api } from '../../services/api.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useTour } from '../../hooks/useTour.js'
import { tourDoneKey } from '../../utils/tour.js'

const OWNER_ROLES = ['OWNER', 'ADMINISTRADOR']

const hiddenKey = (workshopId) => `tf-first-steps-hidden:${workshopId ?? 'anon'}`
function readFlag(key) {
  try { return window.localStorage.getItem(key) === '1' } catch { return false }
}

// Lista de arranque para un taller nuevo: cada paso se marca solo con los datos reales
// del taller y la tarjeta desaparece cuando todo está hecho o el dueño la oculta.
export default function FirstSteps({ data }) {
  const { profile, hasPermission } = useAuth()
  const { start: startTour } = useTour()
  const canSeeStaff = hasPermission('users.view')
  const [staffCount, setStaffCount] = useState(null)
  const [hidden, setHidden] = useState(() => readFlag(hiddenKey(profile?.workshop_id)))
  const enabled = OWNER_ROLES.includes(profile?.role) && !hidden

  useEffect(() => {
    if (!enabled || !canSeeStaff) return undefined
    let active = true
    api.get('/auth/users').then(({ data: users }) => { if (active) setStaffCount(users?.length ?? 0) }).catch(() => {})
    return () => { active = false }
  }, [enabled, canSeeStaff])

  if (!enabled) return null

  const stats = data.stats ?? {}
  const steps = [
    {
      key: 'tour', done: readFlag(tourDoneKey(profile?.id)),
      title: 'Conoce el sistema en 2 minutos',
      hint: 'Un recorrido rápido por cada opción del menú.',
      action: <button type="button" onClick={startTour} className="tf-link">Iniciar recorrido</button>,
    },
    {
      key: 'repair', done: Boolean(data.recentRepairs?.length),
      title: 'Registra tu primera reparación',
      hint: 'Captura al cliente, su equipo y la falla. Se genera un número de orden.',
      action: <Link to="/reparaciones/nueva" className="tf-link">Registrar reparación</Link>,
    },
    canSeeStaff && {
      key: 'staff', done: staffCount > 1,
      title: 'Agrega a tu equipo',
      hint: 'Da acceso a tus técnicos y a recepción, cada quien con su propio usuario.',
      action: <Link to="/personal" className="tf-link">Agregar personal</Link>,
    },
    {
      key: 'deliver', done: (stats.delivered ?? stats.deliveredLast30Days ?? 0) > 0,
      title: 'Entrega tu primer equipo',
      hint: 'Comparte el QR de la orden para que tu cliente siga su reparación desde el celular.',
      action: <Link to="/reparaciones" className="tf-link">Ver reparaciones</Link>,
    },
  ].filter(Boolean)

  const completed = steps.filter((step) => step.done).length
  if (completed === steps.length) return null

  const hide = () => {
    try { window.localStorage.setItem(hiddenKey(profile?.workshop_id), '1') } catch { /* Preferencia opcional. */ }
    setHidden(true)
  }

  return (
    <Card title="Primeros pasos" description={`Llevas ${completed} de ${steps.length}. Deja tu taller listo para trabajar.`}
      actions={<IconButton label="Ocultar primeros pasos" icon={X} onClick={hide} />} bodyClassName={null} data-testid="first-steps">
      <div className="tf-steps-progress" role="progressbar" aria-label="Avance de primeros pasos" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completed}>
        <span style={{ width: `${(completed / steps.length) * 100}%` }} />
      </div>
      <ol className="tf-list">
        {steps.map((step) => (
          <li key={step.key} className={`tf-list-row tf-step ${step.done ? 'is-done' : ''}`}>
            <div className="flex min-w-0 items-start gap-3">
              {step.done
                ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[rgb(var(--tf-success-rgb))]" aria-label="Hecho" />
                : <Circle size={18} className="mt-0.5 shrink-0 text-[var(--tf-text-subtle)]" aria-label="Pendiente" />}
              <div className="min-w-0">
                <p className="tf-step-title text-sm font-medium text-[var(--tf-text)]">{step.title}</p>
                <p className="text-xs text-[var(--tf-text-subtle)]">{step.hint}</p>
              </div>
            </div>
            {!step.done && <span className="shrink-0 text-sm">{step.action}</span>}
          </li>
        ))}
      </ol>
    </Card>
  )
}
