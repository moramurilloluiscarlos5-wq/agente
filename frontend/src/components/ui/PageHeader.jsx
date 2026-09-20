export default function PageHeader({ title, description, eyebrow, icon: Icon, actions }) {
  return (
    <header className="ct-page-header">
      <div className="min-w-0">
        {eyebrow && <p className="ct-eyebrow">{eyebrow}</p>}
        <h1 className="ct-page-title flex items-center gap-2">
          {Icon && <Icon size={20} strokeWidth={1.8} className="text-cyan-300" />}
          {title}
        </h1>
        {description && <p className="ct-page-description">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
