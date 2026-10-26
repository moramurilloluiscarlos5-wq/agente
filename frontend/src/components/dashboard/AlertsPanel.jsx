import { AlertTriangle, Clock, PackageX, ShieldAlert } from 'lucide-react'

const ICONS = {
  stock: PackageX,
  warranty: ShieldAlert,
  overdue: Clock,
  generic: AlertTriangle,
}

export default function AlertsPanel({ alerts }) {
  if (!alerts?.length) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--tf-border-strong)] bg-[var(--tf-surface-sunken)] px-4 py-8 text-center text-sm text-[var(--tf-text-subtle)]">
        No hay alertas activas por el momento.
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {alerts.map((alert) => {
        const Icon = ICONS[alert.type] ?? ICONS.generic
        return (
          <li
            key={alert.id}
            className="flex items-start gap-3 rounded-xl border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] p-3"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--tf-warning-soft)] text-[var(--tf-warning-ink)]">
              <Icon size={16} />
            </span>
            <div>
              <p className="text-sm font-medium text-[var(--tf-text)]">{alert.title}</p>
              <p className="text-xs text-[var(--tf-text-subtle)]">{alert.description}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
