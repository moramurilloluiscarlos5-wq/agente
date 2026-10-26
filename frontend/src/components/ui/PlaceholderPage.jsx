export default function PlaceholderPage({ icon: Icon, title, description, phase }) {
  return (
    <div className="ct-empty flex min-h-[20rem] flex-col items-center justify-center px-6">
      {Icon && (
        <span className="mb-4 text-[var(--tf-text-subtle)]">
          <Icon size={20} strokeWidth={1.8} />
        </span>
      )}
      <h2 className="text-base font-semibold text-[var(--tf-text)]">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-[var(--tf-text-muted)]">{description}</p>
      {phase && (
        <span className="mt-4 rounded-full bg-[var(--tf-primary-soft)] px-2.5 py-1 text-xs font-medium text-[var(--tf-primary-ink)]">
          Disponible en la {phase}
        </span>
      )}
    </div>
  )
}
