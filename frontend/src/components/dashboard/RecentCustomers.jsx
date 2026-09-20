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
    <ul className="divide-y divide-slate-800/80">
      {customers.map((customer) => (
        <li key={customer.id} className="flex items-center gap-3 px-3 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700/70 text-xs font-semibold text-slate-200">
            {getInitials(customer.name)}
          </span>
          <div className="min-w-0 flex-1">
            <Link to={`/clientes?id=${customer.id}`} className="truncate text-sm font-medium text-slate-100 hover:text-white">
              {customer.name}
            </Link>
            <p className="truncate text-xs text-slate-500">{customer.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Registrado</p>
            <p className="text-xs text-slate-400">{formatDate(customer.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
