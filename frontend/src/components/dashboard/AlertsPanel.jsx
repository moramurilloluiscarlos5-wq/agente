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
      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
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
            className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
              <Icon size={16} />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-100">{alert.title}</p>
              <p className="text-xs text-slate-500">{alert.description}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
