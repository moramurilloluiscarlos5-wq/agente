import logoSource from '../../assets/branding/carlostech-logo.png'
import compactLogoSource from '../../assets/branding/carlostech-logo-compact.png'
import symbolSource from '../../assets/branding/carlostech-symbol.png'

const sizeClasses = {
  full: {
    sm: 'w-[220px]',
    md: 'w-[280px]',
    lg: 'w-[340px]',
    xl: 'w-[420px]',
  },
  compact: {
    sm: 'w-[140px] h-10',
    md: 'w-[185px] h-12',
    lg: 'w-[225px] h-14',
    xl: 'w-[280px] h-16',
  },
  symbol: {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  },
}

export default function BrandLogo({ variant = 'full', size = 'md', className = '', priority = false }) {
  const variantClass = variant === 'full'
    ? `${sizeClasses.full[size]} h-auto`
    : variant === 'compact'
      ? `${sizeClasses.compact[size]} overflow-hidden`
      : `${sizeClasses.symbol[size]} overflow-hidden`

  const source = variant === 'compact' ? compactLogoSource : variant === 'symbol' ? symbolSource : logoSource

  return (
    <span className={`ct-brand-logo ct-brand-logo-${variant} ${variantClass} ${className}`}>
      <img
        src={source}
        alt="CARLOSTECH AI"
        className="ct-brand-logo-image"
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </span>
  )
}
