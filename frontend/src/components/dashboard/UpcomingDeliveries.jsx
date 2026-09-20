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
    <ul className="divide-y divide-slate-800/70">
      {deliveries.map((delivery) => (
        <li key={delivery.orderNumber} className="flex items-center justify-between gap-3 px-3 py-3">
          <div className="min-w-0">
            <Link
              to={`/reparaciones/${delivery.orderNumber}`}
              className="text-sm font-semibold text-cyan-300 hover:underline"
            >
              {delivery.orderNumber}
            </Link>
            <p className="truncate text-xs text-slate-400">
              {delivery.device} · {delivery.customer}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={delivery.status} />
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <CalendarClock size={13} />
              {formatDate(delivery.estDelivery)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
