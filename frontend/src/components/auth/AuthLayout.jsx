import { ShieldCheck } from 'lucide-react'
import BrandLogo from '../branding/BrandLogo.jsx'
import './auth.css'

// Lo que hace el producto, dicho como lo vive el taller. Sin cifras inventadas.
const POINTS = [
  'Cada equipo con su orden, estado e historial desde que entra hasta que se entrega.',
  'El cliente consulta el avance con su enlace o QR, sin llamar al mostrador.',
  'Cobros, inventario y garantías del mismo taller, en el mismo lugar.',
]

export default function AuthLayout({ children, variant = 'login' }) {
  return (
    <div className={`ct-auth-shell ct-auth-shell--${variant}`}>
      <a className="ct-auth-skip" href="#auth-content">Ir al formulario</a>

      <aside className="ct-auth-aside" aria-label="Sobre TallerFlow">
        <BrandLogo className="ct-auth-aside-brand" />
        <div className="ct-auth-story">
          <h2>El control de tu taller, de la recepción a la entrega.</h2>
          <ul>
            {POINTS.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </div>
        <p className="ct-auth-aside-footer">TallerFlow para talleres de reparación de celulares y electrónica.</p>
      </aside>

      <div className="ct-auth-form-side">
        <div className="ct-auth-mobile-brand"><BrandLogo /></div>
        <main id="auth-content" className="ct-auth-content" tabIndex={-1}>{children}</main>
        <footer className="ct-auth-footer"><ShieldCheck size={14} aria-hidden="true" /><span>Conexión cifrada. Cada taller ve solo su información.</span></footer>
      </div>
    </div>
  )
}
