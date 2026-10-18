import TallerFlowMark from './TallerFlowMark.jsx'

export const BRAND_NAME = 'TallerFlow'

export default function BrandLogo({ variant = 'full', className = '' }) {
  if (variant === 'symbol') return <TallerFlowMark className={`tf-brand-mark ${className}`} title={BRAND_NAME} />
  return (
    <span className={`tf-brand ${className}`}>
      <TallerFlowMark className="tf-brand-mark" />
      <span className="tf-brand-word">{BRAND_NAME}</span>
    </span>
  )
}
