import { Fragment, useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import BrandLogo from '../branding/BrandLogo.jsx'
import ThemeMenu from '../theme/ThemeMenu.jsx'
import './auth.css'

// Las etapas reales de una orden en TallerFlow, con su color de sello.
const STAGES = [
  { key: 'received', label: 'Recibido' },
  { key: 'diagnosis', label: 'Diagnóstico' },
  { key: 'repair', label: 'En reparación' },
  { key: 'ready', label: 'Listo para entregar' },
]

// Código QR decorativo (21×21) con sus tres cuadros de posición; siempre el mismo dibujo.
const QR_SIZE = 21
const QR_CELLS = (() => {
  const cells = []
  const finder = (x, y) => [[0, 0], [14, 0], [0, 14]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7)
  const finderOn = (x, y) => {
    const [fx, fy] = [[0, 0], [14, 0], [0, 14]].find(([ox, oy]) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7)
    const dx = x - fx
    const dy = y - fy
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
  }
  let seed = 142
  for (let y = 0; y < QR_SIZE; y += 1) {
    for (let x = 0; x < QR_SIZE; x += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      const on = finder(x, y) ? finderOn(x, y) : seed % 7 < 3
      if (on) cells.push([x, y])
    }
  }
  return cells
})()

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Mismo tiempo que la animación de impresión del CSS (retraso + duración).
const PRINT_MS = 3100

// La impresora saca la orden y, ya impresa, el sello recorre las etapas una sola vez y se
// queda en "Listo para entregar". -1 = todavía imprimiendo. Con "reducir movimiento" aparece terminada.
function usePrint() {
  const [stage, setStage] = useState(() => (prefersReducedMotion() ? STAGES.length - 1 : -1))
  useEffect(() => {
    if (stage >= STAGES.length - 1) return undefined
    const timer = setTimeout(() => setStage((current) => current + 1), stage === -1 ? PRINT_MS : 1700)
    return () => clearTimeout(timer)
  }, [stage])
  return stage
}

// Con mouse, el tapete se desplaza apenas en sentido contrario, una luz sigue al cursor y la orden
// se inclina hacia él, como un papel sobre el banco. Todo se maneja con variables CSS del panel;
// con pantalla táctil o "reducir movimiento" no se activa.
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
        const x = (event.clientX - box.left) / box.width - 0.5
        const y = (event.clientY - box.top) / box.height - 0.5
        set('--mx', `${event.clientX - box.left}px`)
        set('--my', `${event.clientY - box.top}px`)
        set('--px', x.toFixed(3))
        set('--py', y.toFixed(3))
        set('--tilt-x', `${(-y * 6).toFixed(2)}deg`)
        set('--tilt-y', `${(x * 9).toFixed(2)}deg`)
      })
    }
    const onLeave = () => {
      cancelAnimationFrame(frame)
      for (const name of ['--px', '--py']) set(name, '0')
      for (const name of ['--tilt-x', '--tilt-y']) set(name, '0deg')
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

// Orden de servicio saliendo de la impresora: lo primero que ve un taller es su propio mostrador.
function OrderTicket() {
  const stage = usePrint()
  const current = STAGES[Math.max(stage, 0)]
  return (
    <figure className="ct-ticket" aria-label={`Ejemplo de orden de servicio: iPhone 13, estado ${current.label}`}>
      <div className="ct-ticket-tilt">
        <div className="ct-ticket-printer" aria-hidden="true"><span /></div>
        <div className="ct-ticket-feed">
          <div className="ct-ticket-paper">
            <header className="ct-ticket-head">
              <strong>Orden TF-0142</strong>
              <span>20 oct 2026, 10:42</span>
            </header>
            <dl className="ct-ticket-lines">
              <div><dt>Cliente</dt><dd>María Torres</dd></div>
              <div><dt>Equipo</dt><dd>iPhone 13, 128 GB</dd></div>
              <div><dt>Falla</dt><dd>Pantalla estrellada, no responde al tacto</dd></div>
              <div><dt>Técnico</dt><dd>Luis R.</dd></div>
            </dl>
            <ol className="ct-ticket-track" aria-hidden="true">
              {STAGES.map((item, index) => <li key={item.key} className={index <= stage ? 'is-done' : undefined} data-stage={item.key}><span />{item.label}</li>)}
            </ol>
            <div className="ct-ticket-totals">
              <div><span>Anticipo</span><span>$500.00</span></div>
              <div className="is-total"><span>Total</span><span>$1,850.00</span></div>
            </div>
            <footer className="ct-ticket-foot">
              <svg viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} className="ct-ticket-qr" aria-hidden="true" shapeRendering="crispEdges">
                {QR_CELLS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)}
              </svg>
              <p>Escanea para ver el avance de tu reparación, sin llamar al taller.</p>
            </footer>
            {stage >= 0 && <span key={current.key} className="ct-ticket-stamp" data-stage={current.key} aria-hidden="true">{current.label}</span>}
          </div>
        </div>
      </div>
    </figure>
  )
}

const HEADLINE = 'Del mostrador a la entrega, cada equipo con su orden.'

export default function AuthLayout({ children, variant = 'login' }) {
  const scene = usePointerScene()
  return (
    <div className={`ct-auth-shell ct-auth-shell--${variant}`}>
      <a className="ct-auth-skip" href="#auth-content">Ir al formulario</a>

      <aside ref={scene} className="ct-auth-aside" aria-label="Sobre TallerFlow">
        <BrandLogo className="ct-auth-aside-brand" />
        <div className="ct-auth-pitch">
          <h2 className="ct-auth-headline">
            {HEADLINE.split(' ').map((word, index) => (
              <Fragment key={index}>{index > 0 ? ' ' : null}<span className="ct-word" style={{ '--i': index }}><span>{word}</span></span></Fragment>
            ))}
          </h2>
          <p className="ct-auth-lede">Recibe, diagnostica, cobra y entrega sin perder ningún teléfono de vista. Tu cliente sigue su reparación desde su celular.</p>
        </div>
        <OrderTicket />
        <p className="ct-auth-aside-footer">Para talleres de reparación de celulares y electrónica.</p>
      </aside>

      <div className="ct-auth-form-side">
        <div className="ct-auth-theme"><ThemeMenu /></div>
        <div className="ct-auth-mobile-brand"><BrandLogo /></div>
        <main id="auth-content" className="ct-auth-content" tabIndex={-1}>{children}</main>
        <footer className="ct-auth-footer"><ShieldCheck size={14} aria-hidden="true" /><span>Conexión cifrada. Cada taller ve solo su información.</span></footer>
      </div>
    </div>
  )
}
