// Símbolo de ServiTrack: una "S" blanca sobre la placa verde que termina en un punto dorado,
// como el recorrido de cada equipo desde el mostrador hasta la entrega.
export default function BrandMark({ className = '', title }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect x="1" y="1" width="98" height="98" rx="24" fill="#0b5a47" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="2" />
      <path d="M67 33C59 25 35 25 34 38C33 50 67 47 66 61C65 75 41 76 32 67" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="73" cy="72" r="7" fill="#e6b62e" />
    </svg>
  )
}
