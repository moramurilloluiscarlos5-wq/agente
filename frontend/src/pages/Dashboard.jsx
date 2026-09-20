import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, CheckCircle2, Clock3, PackageSearch, Plus, RefreshCw, Wrench } from 'lucide-react'
import RecentRepairsTable from '../components/dashboard/RecentRepairsTable.jsx'
import UpcomingDeliveries from '../components/dashboard/UpcomingDeliveries.jsx'
import RecentCustomers from '../components/dashboard/RecentCustomers.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

const canCreateRoles = ['OWNER', 'ADMINISTRADOR', 'RECEPCION']

export default function Dashboard() {
  const { profile } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get('/dashboard').then((result) => {
      if (!cancelled) { setData(result.data); setError('') }
    }).catch((err) => {
      if (!cancelled) setError(err.message)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [revision])

  const stats = data ? [
    { label: 'Pendientes', value: data.stats.pending, icon: Clock3, hint: 'Por recibir diagnóstico' },
    { label: 'En reparación', value: data.stats.inRepair, icon: Wrench, hint: 'Trabajo en curso' },
    { label: 'Esperando refacción', value: data.stats.waitingParts, icon: PackageSearch, hint: 'Requieren seguimiento' },
    { label: 'Listos para entregar', value: data.stats.ready, icon: CheckCircle2, hint: 'Próxima entrega' },
  ] : []

  const welcome = profile?.role === 'SUPER_ADMIN'
    ? 'Administración de la plataforma'
    : profile?.role === 'TECNICO'
      ? 'Resumen de tus reparaciones asignadas'
      : `Resumen de ${profile?.workshop?.name ?? 'tu taller'}`

  return (
    <div className="ct-page space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Panel de control"
        description={welcome}
        actions={<>
          <button type="button" onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1) }} disabled={loading} className="ct-btn ct-btn-secondary"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Actualizar</button>
          {canCreateRoles.includes(profile?.role) && <Link to="/reparaciones/nueva" className="ct-btn ct-btn-primary"><Plus size={16} />Nueva reparación</Link>}
        </>}
      />

      {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"><p>No pudimos cargar el resumen del taller.</p><p className="mt-1 text-xs text-red-200/70">{error}</p><button type="button" onClick={() => setRevision((value) => value + 1)} className="mt-3 ct-btn ct-btn-secondary">Reintentar</button></div>}
      {loading && !data && <div role="status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-[7.4rem] animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />)}</div>}
      {!loading && !error && data && <>
        <div className="ct-kpi-grid">{stats.map(({ label, value, icon: Icon, hint }) => <article key={label} className="ct-kpi"><div className="flex items-start justify-between gap-3"><p className="ct-kpi-label">{label}</p><Icon size={17} strokeWidth={1.8} className="text-slate-500" /></div><p className="ct-kpi-value">{value}</p><p className="ct-kpi-hint">{hint}</p></article>)}</div>
        <div className="ct-dashboard-grid">
          <section className="ct-surface-raised p-5"><div className="ct-section-heading"><h2>Entregas programadas</h2><Activity size={17} className="text-slate-500" /></div><div className="pt-4"><UpcomingDeliveries deliveries={data.upcomingDeliveries} /></div></section>
          <section className="ct-surface-raised p-5"><div className="ct-section-heading"><h2>Clientes recientes</h2><Link to="/clientes">Ver clientes</Link></div><div className="pt-4"><RecentCustomers customers={data.recentCustomers} /></div></section>
        </div>
        <section className="ct-surface-raised p-5"><div className="ct-section-heading"><h2>Reparaciones recientes</h2><Link to="/reparaciones">Ver todas</Link></div><div className="pt-4"><RecentRepairsTable repairs={data.recentRepairs} /></div></section>
      </>}
    </div>
  )
}
