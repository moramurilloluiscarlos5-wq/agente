import { REPAIR_STATUSES } from '../../utils/constants.js'

export default function StatusBadge({ status }) {
  const config = REPAIR_STATUSES[status] ?? {
    label: status ?? 'Sin estado',
    badgeClass: 'ct-status ct-status-neutral',
  }

  return (
    <span
      className={`whitespace-nowrap ${config.badgeClass}`}
    >
      {config.label}
    </span>
  )
}
