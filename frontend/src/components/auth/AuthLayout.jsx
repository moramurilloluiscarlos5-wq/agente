import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import BrandLogo from '../branding/BrandLogo.jsx'
import './auth.css'

// Recorrido del video (HyperFrames, media/hyperframes/control-en-movimiento): cada capítulo dice, como lo
// vive el taller, lo que muestra su escena. Los tiempos son segundos dentro de auth-hero.mp4.
const CHAPTERS = [
  { label: 'Panel del taller', text: 'Cada equipo con su orden, estado e historial desde que entra hasta que se entrega.', start: 0, end: 4.4, poster: '/branding/auth-hero-panel.jpg' },
  { label: 'Seguimiento de cada reparación', text: 'El cliente consulta el avance con su enlace o QR, sin llamar al mostrador.', start: 4.4, end: 8.6, poster: '/branding/auth-hero-seguimiento.jpg' },
  { label: 'Todo el taller conectado', text: 'Cobros, inventario y garantías del mismo taller, en el mismo lugar.', start: 8.6, end: 13, poster: '/branding/auth-hero-conectado.jpg' },
]

// El video solo se descarga donde el panel se ve con espacio y sin "reducir movimiento";
// en los demás casos el recorrido usa una imagen fija por capítulo.
const PLAY_QUERY = '(min-width: 1024px) and (min-height: 561px) and (prefers-reduced-motion: no-preference)'

function usePlayHero() {
  const [play, setPlay] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(PLAY_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia?.(PLAY_QUERY)
    if (!query) return undefined
    const update = () => setPlay(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return play
}

function chapterAt(time) {
  const index = CHAPTERS.findIndex((chapter) => time < chapter.end)
  return index === -1 ? CHAPTERS.length - 1 : index
}

function HeroTour() {
  const play = usePlayHero()
  const video = useRef(null)
  const [time, setTime] = useState(0)
  const [picked, setPicked] = useState(0)
  const active = play ? chapterAt(time) : picked

  // Con video, cada barra se llena con su escena; con imagen fija, solo el capítulo elegido queda lleno.
  const progress = (index) => {
    if (!play) return index === active ? 1 : 0
    const { start, end } = CHAPTERS[index]
    return Math.min(1, Math.max(0, (time - start) / (end - start)))
  }

  const showChapter = (index) => {
    if (play && video.current) {
      video.current.currentTime = CHAPTERS[index].start + 0.01
      setTime(CHAPTERS[index].start)
    } else {
      setPicked(index)
    }
  }

  return (
    <>
      <div className="ct-auth-stage" aria-hidden="true">
        {play
          ? <video ref={video} className="ct-auth-stage-media" src="/branding/auth-hero.mp4" poster={CHAPTERS[0].poster} autoPlay muted loop playsInline preload="auto"
              onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} />
          : <img className="ct-auth-stage-media" src={CHAPTERS[active].poster} alt="" loading="lazy" decoding="async" />}
      </div>
      <div className="ct-auth-tour">
        {/* Atajos solo con mouse: el teclado va directo al formulario y el lector de pantalla lee la lista de abajo. */}
        <ol className="ct-auth-chapters" aria-hidden="true">
          {CHAPTERS.map((chapter, index) => (
            <li key={chapter.label} className={index === active ? 'is-active' : undefined}>
              <button type="button" tabIndex={-1} onClick={() => showChapter(index)}>
                <span className="ct-auth-chapter-track"><span style={{ transform: `scaleX(${progress(index)})` }} /></span>
                <span className="ct-auth-chapter-label">{chapter.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <ul className="ct-auth-chapter-copy">
          {CHAPTERS.map((chapter, index) => <li key={chapter.label} className={index === active ? 'is-active' : undefined}>{chapter.text}</li>)}
        </ul>
      </div>
    </>
  )
}

export default function AuthLayout({ children, variant = 'login' }) {
  return (
    <div className={`ct-auth-shell ct-auth-shell--${variant}`}>
      <a className="ct-auth-skip" href="#auth-content">Ir al formulario</a>

      <aside className="ct-auth-aside" aria-label="Sobre TallerFlow">
        <BrandLogo className="ct-auth-aside-brand" />
        <h2 className="ct-auth-headline">Cada equipo en su lugar, de la recepción a la entrega.</h2>
        <HeroTour />
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
