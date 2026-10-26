import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Plus, RefreshCw, UserPlus, Wrench } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { Button, Card, ErrorAlert, EmptyState, Skeleton } from '../components/ui/DesignSystem.jsx'
import CountUp from '../components/ui/CountUp.jsx'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatCurrency, formatDate, formatRelative } from '../utils/formatters.js'

const CAN_CREATE = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN']

// Etapas del flujo de una reparación, en el orden en que avanza un equipo.
function flowSteps(stats) {
  return [
    { key: 'received', label: 'Recibidos', status: 'recibido', count: stats.received ?? 0, tone: 'received', hint: 'Esperan diagnóstico' },
    { key: 'diagnosis', label: 'Diagnóstico', status: 'diagnostico', count: (stats.diagnostics ?? 0) + (stats.awaitingApproval ?? 0), tone: 'diagnosis', hint: stats.awaitingApproval ? `${stats.awaitingApproval} esperan autorización` : 'En revisión' },
    { key: 'repair', label: 'En reparación', status: 'en_reparacion', count: (stats.inRepair ?? 0) + (stats.testing ?? 0), tone: 'repair', hint: stats.testing ? `${stats.testing} en pruebas` : 'Trabajo en curso' },
    { key: 'parts', label: 'Esperando refacción', status: 'esperando_refaccion', count: stats.waitingParts ?? 0, tone: 'parts', hint: 'Pendientes de pieza' },
    { key: 'ready', label: 'Listos', status: 'listo_para_entregar', count: stats.ready ?? 0, tone: 'ready', hint: 'Avisar al cliente' },
    { key: 'delivered', label: 'Entregados', status: 'entregado', count: stats.deliveredLast30Days ?? stats.delivered ?? 0, tone: 'delivered', hint: stats.deliveredLast30Days == null ? 'En total' : 'Últimos 30 días' },
  ]
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
}

function WorkshopFlow({ stats }) {
  const steps = flowSteps(stats)
  const active = steps.slice(0, 5)
  const activeTotal = active.reduce((total, step) => total + step.count, 0)
  return (
    <Card title="Flujo del taller" description="Dónde están hoy los equipos que recibiste. Toca una etapa para ver sus órdenes." bodyClassName={null}>
      <div className="tf-flow" style={{ '--tf-flow-steps': steps.length }}>
        {steps.map((step) => (
          <Link key={step.key} to={`/reparaciones?status=${step.status}`} className={`tf-flow-step tf-tone-${step.tone} ${step.count ? '' : 'is-zero'}`} aria-label={`${step.label}: ${step.count}. ${step.hint}`}>
            <span className="tf-flow-step-label"><span className="tf-swatch" aria-hidden="true" />{step.label}</span>
            <span className="tf-flow-step-count" aria-hidden="true"><CountUp value={step.count} /></span>
            <span className="tf-flow-step-hint">{step.hint}</span>
          </Link>
        ))}
      </div>
      {activeTotal > 0 && (
        <div className="tf-flow-bar" role="img" aria-label={`Distribución de ${activeTotal} órdenes activas por etapa`}>
          {active.filter((step) => step.count).map((step) => <span key={step.key} className={`tf-tone-${step.tone}`} style={{ flexGrow: step.count, background: 'var(--tone)' }} />)}
        </div>
      )}
    </Card>
  )
}

function Kpi({ label, value, hint, tone }) {
  return (
    <article className="ct-kpi">
      <p className="ct-kpi-label flex items-center gap-2">{tone === 'warning' && <AlertTriangle size={14} className="text-[var(--tf-warning)]" aria-hidden="true" />}{label}</p>
      <p className="ct-kpi-value">{typeof value === 'number' ? <CountUp value={value} /> : value}</p>
      {hint && <p className="ct-kpi-hint">{hint}</p>}
    </article>
  )
}

function revenueHint(revenue) {
  if (!revenue) return null
  const { currentMonth, previousMonth, pendingCurrentMonth } = revenue
  const parts = []
  if (previousMonth > 0) {
    const change = Math.round(((currentMonth - previousMonth) / previousMonth) * 100)
    parts.push(`${change >= 0 ? '+' : ''}${change}% frente al mes anterior`)
  } else parts.push('Sin cobros el mes anterior')
  if (pendingCurrentMonth > 0) parts.push(`${formatCurrency(pendingCurrentMonth)} por cobrar`)
  return parts.join('. ')
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Cargando el panel" className="space-y-5">
      <Skeleton className="h-[9.5rem] w-full rounded-xl" />
      <div className="ct-kpi-grid">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-[6.5rem] rounded-xl" />)}</div>
      <div className="ct-dashboard-grid"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
    </div>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.get('/dashboard').then((result) => {
      if (!cancelled) { setData(result.data); setError(null) }
    }).catch((err) => {
      if (!cancelled) setError(err)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [revision])

  const reload = () => { setLoading(true); setError(null); setRevision((value) => value + 1) }
  const firstName = profile?.full_name?.trim().split(/\s+/)[0]
  const isTechnician = profile?.role === 'TECNICO'
  const hello = `${greeting()}${firstName ? `, ${firstName}` : ''}.`
  const description = profile?.role === 'SUPER_ADMIN'
    ? <><span>Administración de la plataforma</span>. {hello}</>
    : isTechnician
      ? <><span>Resumen de tus reparaciones asignadas</span>. {hello}</>
      : <><span>{`Resumen de ${profile?.workshop?.name ?? 'tu taller'}`}</span>. {hello}</>
  const stats = data?.stats

  return (
    <div className="space-y-5">
      <PageHeader
        title="Panel de control"
        description={description}
        actions={<>
          <Button variant="ghost" icon={RefreshCw} onClick={reload} disabled={loading} aria-label="Actualizar panel" className={loading ? '[&_svg]:animate-spin' : ''}>Actualizar</Button>
          {CAN_CREATE.includes(profile?.role) && <Link to="/reparaciones/nueva" className="ct-btn ct-btn-primary md:hidden"><Plus size={16} aria-hidden="true" />Registrar reparación</Link>}
        </>}
      />

      {error && <ErrorAlert error={error} action="cargar el panel" onRetry={reload} />}
      {loading && !data && !error && <DashboardSkeleton />}

      {data && stats && <>
        <WorkshopFlow stats={stats} />

        <div className="ct-kpi-grid">
          <Kpi label="Órdenes activas" value={stats.pending ?? 0} hint="Todo lo que no se ha entregado ni cancelado" />
          <Kpi label="Entregas atrasadas" value={stats.overdue ?? 0} tone={stats.overdue ? 'warning' : undefined} hint={stats.overdue ? 'Pasaron su fecha de entrega' : 'Todo dentro de fecha'} />
          {data.revenue
            ? <Kpi label="Cobrado este mes" value={formatCurrency(data.revenue.currentMonth)} hint={revenueHint(data.revenue)} />
            : <Kpi label="Listos para entregar" value={stats.ready ?? 0} hint="Avisa a estos clientes" />}
          <Kpi label="Entregados en 30 días" value={stats.deliveredLast30Days ?? stats.delivered ?? 0} hint="Equipos devueltos a sus dueños" />
        </div>

        <div className="ct-dashboard-grid">
          <Card title={isTechnician ? 'Tus reparaciones recientes' : 'Reparaciones recientes'} actions={<Link to="/reparaciones" className="tf-link">Ver todas</Link>} bodyClassName={null}>
            {data.recentRepairs?.length ? (
              <div className="ct-table-shell">
                <table className="ct-table min-w-[36rem]">
                  <thead><tr><th scope="col">Orden</th><th scope="col">Cliente</th><th scope="col">Equipo</th><th scope="col">Estado</th><th scope="col">Recibido</th></tr></thead>
                  <tbody>
                    {data.recentRepairs.map((repair) => (
                      <tr key={repair.orderNumber}>
                        <td><Link to={`/reparaciones/${repair.orderNumber}`} className="tf-link tf-num">{repair.orderNumber}</Link></td>
                        <td className="tf-cell-strong">{repair.customer || '—'}</td>
                        <td>{repair.device || '—'}</td>
                        <td><StatusBadge status={repair.status} /></td>
                        <td className="whitespace-nowrap">{formatDate(repair.receivedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Wrench} title="Aún no hay reparaciones" description="Cuando recibas un equipo, regístralo aquí para darle seguimiento hasta la entrega."
                action={CAN_CREATE.includes(profile?.role) && <Link to="/reparaciones/nueva" className="ct-btn ct-btn-primary"><Plus size={15} aria-hidden="true" />Registrar la primera</Link>} />
            )}
          </Card>

          <div className="space-y-4">
            <Card title="Próximas entregas" description="Órdenes activas con fecha prometida" bodyClassName={null}>
              {data.upcomingDeliveries?.length ? (
                <ul className="tf-list">
                  {data.upcomingDeliveries.map((delivery) => {
                    const late = delivery.estDelivery && new Date(delivery.estDelivery) < new Date()
                    return (
                      <li key={delivery.orderNumber} className="tf-list-row">
                        <div className="min-w-0">
                          <Link to={`/reparaciones/${delivery.orderNumber}`} className="tf-link tf-num">{delivery.orderNumber}</Link>
                          <p className="truncate text-xs text-[var(--tf-text-subtle)]">{[delivery.device, delivery.customer].filter(Boolean).join(', ')}</p>
                        </div>
                        <span className={`flex shrink-0 items-center gap-2 text-xs ${late ? 'text-[var(--tf-warning)]' : 'text-[var(--tf-text-muted)]'}`}>
                          <CalendarClock size={13} aria-hidden="true" />{late ? 'Atrasada, ' : ''}{formatDate(delivery.estDelivery)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : <EmptyState icon={CalendarClock} title="Sin entregas programadas" description="Agrega una fecha estimada al crear o editar una orden para verla aquí." className="!py-8" />}
            </Card>

            {!isTechnician && (
              <Card title="Clientes recientes" actions={<Link to="/clientes" className="tf-link">Ver clientes</Link>} bodyClassName={null}>
                {data.recentCustomers?.length ? (
                  <ul className="tf-list">
                    {data.recentCustomers.map((customer) => (
                      <li key={customer.id} className="tf-list-row">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--tf-text)]">{customer.name}</p>
                          <p className="truncate text-xs text-[var(--tf-text-subtle)]">{customer.phone || 'Sin teléfono'}</p>
                        </div>
                        <span className="shrink-0 text-xs text-[var(--tf-text-subtle)]">{formatRelative(customer.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState icon={UserPlus} title="Sin clientes todavía" description="Los clientes se registran al crear su primera orden." className="!py-8" />}
              </Card>
            )}
          </div>
        </div>
      </>}
    </div>
  )
}
