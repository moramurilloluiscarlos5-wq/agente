import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Button, DataCard, EmptyState, ErrorAlert, FilterSelect, Pagination, SearchField, TableSkeleton } from '../components/ui/DesignSystem.jsx'
import { usePagedResource } from '../hooks/usePagedResource.js'
import { formatDateTime } from '../utils/formatters.js'

// Nombres legibles para las acciones que registra el backend.
const ACTIONS = {
  LOGIN_SUCCESS: 'Inicio de sesión',
  USER_CREATED: 'Cuenta creada',
  ROLE_CHANGED: 'Rol cambiado',
  ROLE_PERMISSIONS_UPDATED: 'Permisos de rol',
  CLIENT_CREATED: 'Cliente registrado',
  CLIENT_UPDATED: 'Cliente actualizado',
  DEVICE_CREATED: 'Equipo registrado',
  REPAIR_CREATED: 'Orden creada',
  REPAIR_STATUS_CHANGED: 'Estado de reparación',
  TRACKING_REGENERATED: 'Enlace regenerado',
  PDF_GENERATED: 'Comprobante generado',
  DEVICE_AGENT_PAIRED: 'Agente vinculado',
  DEVICE_TOOL_COMMAND: 'Comando ADB',
  DEVICE_DIAGNOSTIC_SAVED: 'Diagnóstico guardado',
  CHECKOUT_STARTED: 'Pago de suscripción',
  SUBSCRIPTION_STATUS_CHANGED: 'Suscripción',
  WORKSHOP_REGISTERED: 'Taller registrado',
}
const ENTITIES = { repair_orders: 'Reparación', customers: 'Cliente', devices: 'Equipo', profiles: 'Cuenta', roles: 'Rol', workshops: 'Taller', subscriptions: 'Suscripción' }

export default function Audit() {
  const [action, setAction] = useState('')
  const list = usePagedResource('/security/audit', { filters: { action }, limit: 25 })
  const filtered = Boolean(list.query || action)
  const clearFilters = () => { list.setQuery(''); setAction('') }

  return (
    <div className="space-y-6">
      <PageHeader title="Auditoría" description="Registro de acciones sensibles del taller. Los eventos no se pueden editar ni borrar." />
      <DataCard
        toolbar={<>
          <SearchField label="Buscar en la auditoría" value={list.query} onChange={list.setQuery} placeholder="Rol cambiado a Técnico" />
          <FilterSelect label="Acción" ariaLabel="Filtrar por acción" value={action} onChange={setAction}>
            <option value="">Todas</option>
            {Object.entries(ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </FilterSelect>
          {filtered && <Button variant="ghost" onClick={clearFilters}>Quitar filtros</Button>}
        </>}
        footer={!list.loading && !list.error && <Pagination page={list.page} limit={list.limit} count={list.count} onPage={list.setPage} label="eventos" />}>
        {list.error ? <div className="p-4"><ErrorAlert error={list.error} action="cargar la auditoría" onRetry={list.reload} /></div>
          : list.loading && !list.rows.length ? <TableSkeleton columns={5} rows={8} />
            : !list.rows.length ? (filtered
              ? <EmptyState icon={ClipboardList} title="No hay eventos con esos filtros" description="Prueba con otro texto o elige otra acción." action={<Button onClick={clearFilters}>Quitar filtros</Button>} />
              : <EmptyState icon={ClipboardList} title="Sin eventos registrados" description="Los inicios de sesión, cambios de rol y de estado aparecerán aquí automáticamente." />)
              : (
                <div className="ct-table-shell" aria-busy={list.loading}>
                  <table className="ct-table min-w-[52rem]">
                    <thead><tr><th scope="col">Fecha</th><th scope="col">Persona</th><th scope="col">Acción</th><th scope="col">Detalle</th><th scope="col">IP</th></tr></thead>
                    <tbody>
                      {list.rows.map((log) => (
                        <tr key={log.id}>
                          <td className="whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                          <td className="tf-cell-strong">{log.user?.full_name || 'Sistema'}</td>
                          <td className="whitespace-nowrap font-medium text-[var(--tf-text)]">{ACTIONS[log.action] ?? log.action}</td>
                          <td className="max-w-[28rem]"><p className="text-[var(--tf-text)]">{log.description}</p>{log.entity && <p className="text-xs text-[var(--tf-text-subtle)]">{ENTITIES[log.entity] ?? log.entity}</p>}</td>
                          <td className="tf-num whitespace-nowrap text-[var(--tf-text-subtle)]">{log.ip_address || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
      </DataCard>
    </div>
  )
}
