import { Link } from 'react-router-dom'
import StatusBadge from '../ui/StatusBadge.jsx'
import { formatDate } from '../../utils/formatters.js'

export default function RecentRepairsTable({ repairs }) {
  if (!repairs?.length) {
    return (
      <div className="ct-empty">
        Aún no hay reparaciones registradas.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="ct-table min-w-[640px]">
        <thead>
          <tr>
            <th>Orden</th><th>Cliente</th><th>Equipo</th><th>Estado</th><th>Recibido</th>
          </tr>
        </thead>
        <tbody>
          {repairs.map((repair) => (
            <tr key={repair.orderNumber}>
              <td className="font-medium text-cyan-300">
                <Link to={`/reparaciones/${repair.orderNumber}`}>{repair.orderNumber}</Link>
              </td>
              <td>{repair.customer}</td>
              <td>{repair.device}</td>
              <td>
                <StatusBadge status={repair.status} />
              </td>
              <td>{formatDate(repair.receivedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
