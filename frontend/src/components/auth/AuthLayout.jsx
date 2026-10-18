import { ClipboardList, UsersRound, Wrench, ShieldCheck, ArrowUpRight } from 'lucide-react'
import BrandLogo from '../branding/BrandLogo.jsx'
import './auth.css'

const benefits = [
  { icon: ClipboardList, title: 'Control de reparaciones', detail: 'De la recepción a la entrega.' },
  { icon: UsersRound, title: 'Clientes y equipos', detail: 'El historial, siempre a la mano.' },
  { icon: Wrench, title: 'Herramientas para técnicos', detail: 'Todo listo para el trabajo diario.' },
]

function WorkspacePreview() {
  return (
    <figure className="ct-auth-preview" aria-label="Ejemplo del seguimiento de reparaciones">
      <figcaption>
        <span>Un vistazo a tu espacio de trabajo</span>
        <span className="ct-auth-preview-example">Vista de ejemplo</span>
      </figcaption>
      <div className="ct-auth-preview-surface">
        <div className="ct-auth-preview-title">
          <span><ClipboardList size={15} aria-hidden="true" /> Reparaciones</span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </div>
        <table>
          <caption className="sr-only">Órdenes y estados ilustrativos</caption>
          <thead><tr><th scope="col">Equipo / servicio</th><th scope="col">Estado</th></tr></thead>
          <tbody>
            <tr><td><strong>iPhone 13</strong><span>Cambio de pantalla</span></td><td><span className="ct-auth-preview-status ct-auth-preview-status--blue">En reparación</span></td></tr>
            <tr><td><strong>Samsung Galaxy A54</strong><span>Revisión de carga</span></td><td><span className="ct-auth-preview-status ct-auth-preview-status--amber">Diagnóstico</span></td></tr>
            <tr><td><strong>Motorola Edge 40</strong><span>Cambio de batería</span></td><td><span className="ct-auth-preview-status ct-auth-preview-status--green">Listo para entregar</span></td></tr>
          </tbody>
        </table>
      </div>
    </figure>
  )
}

export default function AuthLayout({ children, variant = 'login' }) {
  return (
    <div className={`ct-auth-shell ct-auth-shell--${variant}`}>
      <a className="ct-auth-skip" href="#auth-content">Ir al formulario</a>
      <aside className="ct-auth-aside" aria-label="Taller Flow, gestión inteligente para talleres técnicos">
        <div className="ct-auth-brand">
          <BrandLogo variant="symbol" size="md" priority />
          <div><span className="ct-auth-brand-name">Taller <span className="ct-auth-brand-flow">Flow</span></span><small className="ct-auth-brand-tag">Gestión inteligente para talleres</small></div>
        </div>
        <div className="ct-auth-story">
          <p className="ct-auth-eyebrow"><span /> Tu taller, conectado</p>
          <h2>Menos pendientes.<br />Más control. Más Flow.</h2>
          <p className="ct-auth-description">Clientes, reparaciones, inventario, pagos y herramientas técnicas en una sola plataforma.</p>
          <ul className="ct-auth-benefits">
            {benefits.map(({ icon: Icon, title, detail }) => (
              <li key={title}><Icon size={18} strokeWidth={1.6} aria-hidden="true" /><div><strong>{title}</strong><span>{detail}</span></div></li>
            ))}
          </ul>
          <WorkspacePreview />
          <ul className="ct-auth-stack" aria-label="Plataforma completa">
            {['Panel web', 'API segura', 'Base de datos en la nube', 'Agente ADB / Fastboot'].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p className="ct-auth-aside-footer">Taller Flow · Tu trabajo, conectado.</p>
      </aside>
      <div className="ct-auth-form-side">
        <main id="auth-content" className="ct-auth-content" tabIndex={-1}>{children}</main>
        <footer className="ct-auth-footer"><ShieldCheck size={15} aria-hidden="true" /><span>Acceso seguro <span aria-hidden="true">·</span> Uso interno del taller</span></footer>
      </div>
    </div>
  )
}
