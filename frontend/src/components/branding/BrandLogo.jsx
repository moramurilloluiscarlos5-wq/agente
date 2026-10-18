import TallerFlowMark from './TallerFlowMark.jsx'

export default function BrandLogo({ variant = 'full', size = 'md', className = '' }) {
  const sizes = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl', xl: 'text-3xl' }
  return <span className={`tf-brand ${sizes[size]} ${className}`} aria-label="Taller Flow">
    <TallerFlowMark className="tf-brand-mark" />
    {variant !== 'symbol' && <span className="tf-brand-word">Taller<span>Flow</span><small>GESTIÓN INTELIGENTE PARA TALLERES</small></span>}
  </span>
}
