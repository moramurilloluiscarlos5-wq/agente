export default function PageHeader({ title, description, actions }) {
  return (
    <header className="ct-page-header">
      <div className="min-w-0">
        <h1 className="ct-page-title">{title}</h1>
        {description && <p className="ct-page-description">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
