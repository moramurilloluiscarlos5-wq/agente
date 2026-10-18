// Símbolo de TallerFlow: una "T" sólida y una "F" en azul que avanza,
// como una orden que fluye por el taller.
export default function TallerFlowMark({ className = '', title }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect x="1" y="1" width="98" height="98" rx="24" fill="#111827" stroke="#1f2a3d" strokeWidth="2" />
      <path d="M19.2 29h57.4L71 41.7H53.5v36.9H39.4V41.7H19.2V29Z" fill="#f8fafc" />
      <path d="M19.2 45.6h14.6v4.5h-7.3l-7.3-4.5Z" fill="#38bdf8" />
      <path d="M60.6 48.2h22.8l-5.6 9.5h-7.7v7.7h8.5l-4.5 10.1H60.6V48.2Z" fill="#2563eb" />
    </svg>
  )
}
