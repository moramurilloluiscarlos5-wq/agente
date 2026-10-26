import { Link } from 'react-router-dom'
import { formatDate } from '../../utils/formatters.js'

function getInitials(name) {
  const parts = String(name ?? '').trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

export default function RecentCustomers({ customers }) {
  if (!customers?.length) {
    return (
      <div className="ct-empty">
        Aún no se han registrado clientes.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-[var(--tf-border)]">
      {customers.map((customer) => (
        <li key={customer.id} className="flex items-center gap-3 px-3 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--tf-avatar-bg)] text-xs font-semibold text-[var(--tf-avatar-ink)]">
            {getInitials(customer.name)}
          </span>
          <div className="min-w-0 flex-1">
            <Link to={`/clientes?id=${customer.id}`} className="truncate text-sm font-medium text-[var(--tf-text)] hover:text-[var(--tf-link)]">
              {customer.name}
            </Link>
            <p className="truncate text-xs text-[var(--tf-text-subtle)]">{customer.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--tf-text-subtle)]">Registrado</p>
            <p className="text-xs text-[var(--tf-text-muted)]">{formatDate(customer.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
