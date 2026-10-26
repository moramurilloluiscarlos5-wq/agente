import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import StatusBadge from '../ui/StatusBadge.jsx'
import { formatDate } from '../../utils/formatters.js'

export default function UpcomingDeliveries({ deliveries }) {
  if (!deliveries?.length) {
    return (
      <div className="ct-empty">
        No hay entregas programadas por ahora.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-[var(--tf-border)]">
      {deliveries.map((delivery) => (
        <li key={delivery.orderNumber} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
          <div className="min-w-0">
            <Link
              to={`/reparaciones/${delivery.orderNumber}`}
              className="text-sm font-semibold text-[var(--tf-accent-ink)] hover:underline"
            >
              {delivery.orderNumber}
            </Link>
            <p className="truncate text-xs text-[var(--tf-text-muted)]">
              {delivery.device} · {delivery.customer}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={delivery.status} />
            <span className="flex items-center gap-1 text-xs text-[var(--tf-text-subtle)]">
              <CalendarClock size={13} />
              {formatDate(delivery.estDelivery)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
