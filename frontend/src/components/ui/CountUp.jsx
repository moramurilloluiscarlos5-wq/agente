import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../utils/theme.js'

// Cifra que cuenta hasta su valor con salida suave (o desde el valor anterior, si cambia).
// Con "reducir movimiento" o un valor que no es número, muestra el valor tal cual.
export default function CountUp({ value, duration = 600 }) {
  const still = prefersReducedMotion() || !Number.isFinite(value)
  const [shown, setShown] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    if (still) return undefined
    const began = performance.now()
    const start = from.current
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - began) / duration)
      const next = Math.round(start + (value - start) * (1 - (1 - progress) ** 3))
      from.current = next
      setShown(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, duration, still])

  return <>{still ? value : shown}</>
}
