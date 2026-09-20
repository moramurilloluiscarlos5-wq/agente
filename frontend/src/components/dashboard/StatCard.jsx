export default function StatCard({ icon: Icon, label, value, hint, accent = 'blue' }) {
  return (
    <div className="ct-kpi">
      <div className="flex items-center justify-between">
        <span className="ct-kpi-label">{label}</span>
        {Icon && (
          <Icon size={17} strokeWidth={1.8} className={accent === 'red' ? 'text-red-300' : 'text-slate-500'} />
        )}
      </div>
      <p className="ct-kpi-value">{value}</p>
      {hint && <p className="ct-kpi-hint">{hint}</p>}
    </div>
  )
}
