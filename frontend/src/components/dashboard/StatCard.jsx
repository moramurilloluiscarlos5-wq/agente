export default function StatCard({ icon: Icon, label, value, hint, accent = 'blue' }) {
  return (
    <div className="ct-kpi">
      <div className="flex items-center justify-between">
        <span className="ct-kpi-label">{label}</span>
        {Icon && (
          <Icon size={17} strokeWidth={1.8} className={accent === 'red' ? 'text-[var(--tf-danger-ink)]' : 'text-[var(--tf-text-subtle)]'} />
        )}
      </div>
      <p className="ct-kpi-value">{value}</p>
      {hint && <p className="ct-kpi-hint">{hint}</p>}
    </div>
  )
}
