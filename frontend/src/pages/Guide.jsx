import { Link } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { Compass } from 'lucide-react'
import { Button, Card } from '../components/ui/DesignSystem.jsx'
import { useTour } from '../hooks/useTour.js'
import { NAV_ITEMS, NAV_SECTIONS, REPAIR_STATUSES } from '../utils/constants.js'
import { JOURNEY, MODULE_HELP, SECTION_INFO } from '../utils/help.js'
import { useAuth } from '../hooks/useAuth.js'
import { FEATURE_BY_PATH, FEATURE_MIN_TIER, TIER_NAMES } from '../utils/billing.js'

// Paso del recorrido con las opciones del menú que lo atienden (solo las que el rol puede abrir).
function JourneyStep({ step, index, items }) {
  return (
    <li className={`tf-journey-step tf-tone-${step.tone}`} style={{ '--tf-order': index }}>
      <span className="tf-journey-dot" aria-hidden="true">{index + 1}</span>
      <div className="min-w-0">
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        {items.length
          ? <ul className="tf-journey-links" aria-label={`Opciones del paso ${step.title}`}>
            {items.map(({ path, label, icon: Icon }) => <li key={path}><Link to={path} className="tf-chip"><Icon size={14} strokeWidth={1.9} aria-hidden="true" />{label}</Link></li>)}
          </ul>
          : <p className="tf-journey-note">Este paso lo atiende otro rol del taller.</p>}
      </div>
    </li>
  )
}

export default function Guide() {
  const { profile, hasPermission } = useAuth()
  const { start: startTour } = useTour()
  const visible = NAV_ITEMS.filter((item) => (!item.roles || item.roles.includes(profile?.role)) && (!item.permission || hasPermission(item.permission)))
  const byPath = new Map(visible.map((item) => [item.path, item]))
  const groups = NAV_SECTIONS.map((section) => [section, visible.filter((item) => item.section === section)]).filter(([, items]) => items.length)

  return (
    <div className="space-y-6">
      <PageHeader title="Guía del sistema" description="Qué hace cada opción del menú y en qué momento usarla. Para encontrar un cliente, una orden o un IMEI desde cualquier página, usa la búsqueda de arriba (en computadora, Ctrl K)."
        actions={<Button variant="primary" icon={Compass} onClick={startTour}>Iniciar recorrido guiado</Button>} />

      <section className="tf-card tf-journey" aria-labelledby="journey-title">
        <header className="tf-journey-header">
          <h2 id="journey-title">El recorrido de un equipo</h2>
          <p>Así avanza un teléfono por tu taller, y la opción del menú que usas en cada paso.</p>
        </header>
        <ol className="tf-journey-steps">
          {JOURNEY.map((step, index) => <JourneyStep key={step.title} step={step} index={index} items={step.paths.map((path) => byPath.get(path)).filter(Boolean)} />)}
        </ol>
      </section>

      <div className="tf-guide-layout">
        <div className="min-w-0 space-y-6">
          {groups.map(([section, items]) => (
            <Card key={section} title={section} description={SECTION_INFO[section]} bodyClassName={null}>
              <ul className="tf-guide-list">
                {items.map(({ path, label, title, icon: Icon }) => {
                  const help = MODULE_HELP[path]
                  return (
                    <li key={path} className="tf-guide-item">
                      <span className="tf-guide-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
                      <div className="min-w-0">
                        <h3 className="flex flex-wrap items-center gap-2">{title ?? label}{FEATURE_BY_PATH[path] && <span className="ct-status ct-status-accent">Desde el plan {TIER_NAMES[FEATURE_MIN_TIER[FEATURE_BY_PATH[path]]]}</span>}</h3>
                        {help && <p>{help.description}</p>}
                        {help && <p className="tf-guide-when"><strong>Cuándo usarla:</strong> {help.when}</p>}
                      </div>
                      <Link to={path} className="ct-btn ct-btn-secondary ct-btn-sm" aria-label={`Abrir ${label}`}>Abrir</Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Recorrido en video" description="Lo principal de TallerFlow en unos segundos.">
            <video className="tf-guide-video" src="/branding/auth-hero.mp4" poster="/branding/auth-hero-panel.jpg" controls muted playsInline preload="none" aria-describedby="guide-video-text" />
            <p id="guide-video-text" className="mt-3 text-sm leading-relaxed text-[var(--tf-text-muted)]">El panel del taller, el enlace de seguimiento que recibe tu cliente y cómo se conectan cobros, inventario y garantías.</p>
          </Card>
          <Card title="Qué significa cada estado" description="Por estos estados pasa una reparación." bodyClassName={null}>
            <dl className="tf-status-glossary">
              {Object.entries(REPAIR_STATUSES).map(([key, status]) => (
                <div key={key}><dt><StatusBadge status={key} /></dt><dd>{status.hint}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}
