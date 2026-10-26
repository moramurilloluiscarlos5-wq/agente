import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { Button } from '../ui/DesignSystem.jsx'

const PAD = 6 // aire alrededor del elemento resaltado
const GAP = 14 // distancia entre el elemento y la tarjeta
const MARGIN = 16 // nunca pegada al borde de la pantalla

// Dónde va la tarjeta: a un lado del elemento sin taparlo y siempre dentro de la pantalla.
// En celular ocupa el ancho y se coloca arriba o abajo, lejos de lo resaltado.
function placeCard(spot, card, area, vw, vh) {
  const clampX = (x) => Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - card.width - MARGIN))
  const clampY = (y) => Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - card.height - MARGIN))
  if (!spot) return { top: clampY((vh - card.height) / 2), left: clampX((vw - card.width) / 2) }
  if (vw < 640) return { top: spot.top + spot.height / 2 < vh / 2 ? clampY(vh - card.height - MARGIN) : MARGIN, left: MARGIN }

  const middleY = spot.top + spot.height / 2 - card.height / 2
  const middleX = spot.left + spot.width / 2 - card.width / 2
  const sides = {
    right: { top: middleY, left: spot.left + spot.width + GAP, fits: spot.left + spot.width + GAP + card.width <= vw - MARGIN },
    left: { top: middleY, left: spot.left - GAP - card.width, fits: spot.left - GAP - card.width >= MARGIN },
    bottom: { top: spot.top + spot.height + GAP, left: middleX, fits: spot.top + spot.height + GAP + card.height <= vh - MARGIN },
    top: { top: spot.top - GAP - card.height, left: middleX, fits: spot.top - GAP - card.height >= MARGIN },
  }
  const order = area === 'sidebar' ? ['right', 'bottom', 'top', 'left'] : ['bottom', 'left', 'top', 'right']
  const side = order.find((name) => sides[name].fits)
  if (!side) return { top: clampY((vh - card.height) / 2), left: clampX((vw - card.width) / 2) }
  return { top: clampY(sides[side].top), left: clampX(sides[side].left) }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Recorrido paso a paso: oscurece la pantalla menos el elemento que se explica y muestra una
// tarjeta con "3 de 20", título, explicación y Omitir / Anterior / Siguiente.
// Teclado: flechas para avanzar o regresar, Escape para salir; el foco no sale de la tarjeta.
export default function ProductTour({ steps, index, onNext, onPrev, onClose }) {
  const step = steps[index]
  const last = index === steps.length - 1
  const cardRef = useRef(null)
  const nextRef = useRef(null)
  const titleId = useId()
  const bodyId = useId()
  const [current, setCurrent] = useState({ spot: null, card: null })
  const lastLayout = useRef('')

  // Mide el elemento resaltado y la tarjeta; solo actualiza si algo se movió.
  const measure = useCallback(() => {
    const box = step.target ? document.querySelector(step.target)?.getBoundingClientRect() : null
    const spot = box ? { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 } : null
    const size = cardRef.current?.getBoundingClientRect()
    if (!size) return
    const card = placeCard(spot, size, step.area, window.innerWidth, window.innerHeight)
    const key = JSON.stringify([spot, card])
    if (key === lastLayout.current) return
    lastLayout.current = key
    setCurrent({ spot, card })
  }, [step])

  // Antes de pintar cada paso, para que la tarjeta nunca aparezca fuera de lugar.
  useLayoutEffect(() => {
    if (step.target) document.querySelector(step.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
    measure()
  }, [step, measure])

  // Después lo sigue cada cuadro: el menú de celular se desliza y la página puede desplazarse.
  useEffect(() => {
    let frame = requestAnimationFrame(function follow() { measure(); frame = requestAnimationFrame(follow) })
    return () => cancelAnimationFrame(frame)
  }, [measure])

  // El foco entra a la tarjeta y vuelve a donde estaba al terminar.
  useEffect(() => {
    const previous = document.activeElement
    return () => previous?.focus?.()
  }, [])
  useEffect(() => { nextRef.current?.focus({ preventScroll: true }) }, [index])

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); onClose('skip') }
      else if (event.key === 'ArrowRight') { event.preventDefault(); onNext() }
      else if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onPrev() }
      else if (event.key === 'Tab') {
        const items = [...(cardRef.current?.querySelectorAll('button:not([disabled])') ?? [])]
        if (!items.length) return
        const first = items[0]
        const end = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); end.focus() }
        else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first.focus() }
        else if (!cardRef.current.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, onClose, onNext, onPrev])

  const progress = `${Math.round(((index + 1) / steps.length) * 100)}%`
  return createPortal(
    <>
      {/* Bloquea clics fuera de la tarjeta para que nada cambie a mitad del recorrido. */}
      <div className={`tf-tour-blocker ${current.spot ? '' : 'is-dim'}`} aria-hidden="true" />
      {current.spot && <div className="tf-tour-spot" aria-hidden="true" style={current.spot} />}
      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} className="tf-tour-card"
        style={current.card ?? { top: MARGIN, left: MARGIN, opacity: 0 }}>
        <div className="tf-tour-progress" aria-hidden="true"><span style={{ width: progress }} /></div>
        <div className="flex items-center justify-between gap-3">
          <span className="tf-tour-count">{index + 1} de {steps.length}</span>
          <button type="button" className="tf-tour-close" aria-label="Cerrar recorrido" onClick={() => onClose('skip')}><X size={18} strokeWidth={2.4} aria-hidden="true" /></button>
        </div>
        <h2 id={titleId} className="tf-tour-title">{step.title}</h2>
        <div id={bodyId}>
          <p className="tf-tour-body">{step.body}</p>
          {step.hint && <p className="tf-tour-hint"><strong>{step.hint.label}</strong> {step.hint.text}</p>}
        </div>
        <div className="tf-tour-footer">
          {last ? <span /> : <Button onClick={() => onClose('skip')}>Omitir</Button>}
          <div className="flex items-center gap-2">
            {index > 0 && <Button icon={ArrowLeft} onClick={onPrev}>Anterior</Button>}
            <Button ref={nextRef} variant="primary" onClick={onNext}>
              {last ? <><Check size={16} aria-hidden="true" />Terminar</> : <>Siguiente<ArrowRight size={16} aria-hidden="true" /></>}
            </Button>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">Paso {index + 1} de {steps.length}: {step.title}</p>
      </div>
    </>,
    document.body,
  )
}
