import { Link } from 'react-router-dom'
import { Check, CircleHelp, Lightbulb, X } from 'lucide-react'
import { IconButton } from './DesignSystem.jsx'

// Botón del encabezado que abre o cierra la ayuda de la sección.
export function SectionHelpButton({ help, open, setOpen, buttonRef, panelId }) {
  if (!help) return null
  return (
    <button ref={buttonRef} type="button" className="ct-btn ct-btn-ghost" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(!open)}>
      <CircleHelp size={16} aria-hidden="true" />Cómo funciona
    </button>
  )
}

// Para qué sirve la sección, qué se puede hacer y cuándo usarla, en palabras del taller.
export function SectionHelpPanel({ help, open, setOpen, buttonRef, panelId }) {
  if (!help || !open) return null
  const close = () => { setOpen(false); buttonRef.current?.focus() }
  return (
    <section id={panelId} className="tf-help" aria-labelledby={`${panelId}-title`}>
      <span className="tf-help-icon" aria-hidden="true"><Lightbulb size={18} /></span>
      <div className="min-w-0">
        <h2 id={`${panelId}-title`} className="tf-help-title">Para qué sirve</h2>
        <p className="tf-help-text">{help.description}</p>
        <ul className="tf-help-tasks" aria-label="Lo que puedes hacer aquí">
          {help.tasks.map((task) => <li key={task}><Check size={14} strokeWidth={2.4} aria-hidden="true" />{task}</li>)}
        </ul>
        <div className="tf-help-footer">
          <p><strong>Cuándo usarla:</strong> {help.when}</p>
          <Link to="/guia" className="tf-link">Ver la guía completa</Link>
        </div>
      </div>
      <IconButton label="Ocultar ayuda" icon={X} className="tf-help-close" onClick={close} />
    </section>
  )
}
