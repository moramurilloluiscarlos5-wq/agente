import BrandMark from './BrandMark.jsx'

export const BRAND_NAME = 'ServiTrack'

export default function BrandLogo({ variant = 'full', className = '' }) {
  if (variant === 'symbol') return <BrandMark className={`tf-brand-mark ${className}`} title={BRAND_NAME} />
  return (
    <span className={`tf-brand ${className}`}>
      <BrandMark className="tf-brand-mark" />
      <span className="tf-brand-word">{BRAND_NAME}</span>
    </span>
  )
}
