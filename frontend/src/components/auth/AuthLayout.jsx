import { Fragment, useEffect, useRef } from 'react'
import { LockKeyhole, RefreshCcw, ShieldCheck } from 'lucide-react'
import BrandLogo from '../branding/BrandLogo.jsx'
import ThemeMenu from '../theme/ThemeMenu.jsx'
import './auth.css'

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Con mouse, el video se desplaza apenas en sentido contrario y una luz dorada sigue al cursor.
// Todo se maneja con variables CSS del panel; con pantalla táctil o "reducir movimiento" no se activa.
function usePointerScene() {
  const ref = useRef(null)
  useEffect(() => {
    const aside = ref.current
    if (!aside || prefersReducedMotion() || !window.matchMedia?.('(hover: hover)').matches) return undefined
    let frame = 0
    const set = (name, value) => aside.style.setProperty(name, value)
    const onMove = (event) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = aside.getBoundingClientRect()
        set('--mx', `${event.clientX - box.left}px`)
        set('--my', `${event.clientY - box.top}px`)
        set('--px', ((event.clientX - box.left) / box.width - 0.5).toFixed(3))
        set('--py', ((event.clientY - box.top) / box.height - 0.5).toFixed(3))
      })
    }
    const onLeave = () => {
      cancelAnimationFrame(frame)
      set('--px', '0')
      set('--py', '0')
    }
    aside.addEventListener('pointermove', onMove)
    aside.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      aside.removeEventListener('pointermove', onMove)
      aside.removeEventListener('pointerleave', onLeave)
    }
  }, [])
  return ref
}

// Lo que da confianza antes de pagar, en palabras concretas y verdaderas del producto.
const TRUST = [
  { icon: LockKeyhole, title: 'Pago seguro', text: 'Procesado por Mercado Pago' },
  { icon: ShieldCheck, title: 'Datos protegidos', text: 'Cada taller ve solo lo suyo' },
  { icon: RefreshCcw, title: 'Sin plazos forzosos', text: 'Cancela cuando quieras' },
]

const HEADLINE = 'Del mostrador a la entrega, cada equipo con su orden.'

export default function AuthLayout({ children, variant = 'login' }) {
  const scene = usePointerScene()
  const still = prefersReducedMotion()
  return (
    <div className={`ct-auth-shell ct-auth-shell--${variant}`}>
      <a className="ct-auth-skip" href="#auth-content">Ir al formulario</a>

      <aside ref={scene} className="ct-auth-aside" aria-label="Sobre TallerFlow">
        {/* Hero hecho con HyperFrames (media/hyperframes/hero-licencia): panel en vivo, aviso al cliente y licencia activada. */}
        <video className="ct-auth-hero" src="/branding/hero-licencia.mp4" poster="/branding/hero-licencia.jpg"
          autoPlay={!still} loop muted playsInline preload="auto" aria-hidden="true" />
        <BrandLogo className="ct-auth-aside-brand" />
        <div className="ct-auth-pitch">
          <h2 className="ct-auth-headline">
            {HEADLINE.split(' ').map((word, index) => (
              <Fragment key={index}>{index > 0 ? ' ' : null}<span className="ct-word" style={{ '--i': index }}><span>{word}</span></span></Fragment>
            ))}
          </h2>
          <p className="ct-auth-lede">Recibe, diagnostica, cobra y entrega sin perder ningún equipo de vista. Tu cliente sigue su reparación desde su celular.</p>
          <ul className="ct-auth-trust" aria-label="Por qué es seguro">
            {TRUST.map(({ icon: Icon, title, text }, index) => (
              <li key={title} style={{ '--i': index }}>
                <span className="ct-auth-trust-icon" aria-hidden="true"><Icon size={18} strokeWidth={2.2} /></span>
                <span><strong>{title}</strong>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="ct-auth-aside-footer">Para talleres de reparación de celulares y electrónica.</p>
      </aside>

      <div className="ct-auth-form-side">
        <div className="ct-auth-theme"><ThemeMenu /></div>
        <div className="ct-auth-mobile-brand"><BrandLogo /></div>
        <main id="auth-content" className="ct-auth-content" tabIndex={-1}>{children}</main>
        <footer className="ct-auth-footer"><ShieldCheck size={14} aria-hidden="true" /><span>Conexión cifrada. Pagos procesados por Mercado Pago.</span></footer>
      </div>
    </div>
  )
}
