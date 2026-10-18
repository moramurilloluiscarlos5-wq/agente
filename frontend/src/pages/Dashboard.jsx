import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowUpRight, CheckCircle2, Clock3, PackageSearch, Plus, RefreshCw, Wrench } from 'lucide-react'
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
    { label: 'Pendientes', value: data.stats.pending, icon: Clock3, hint: 'Por recibir diagnóstico', tone: 'amber' },
    { label: 'En reparación', value: data.stats.inRepair, icon: Wrench, hint: 'Trabajo en curso', tone: 'blue' },
    { label: 'Esperando refacción', value: data.stats.waitingParts, icon: PackageSearch, hint: 'Requieren seguimiento', tone: 'purple' },
    { label: 'Listos para entregar', value: data.stats.ready, icon: CheckCircle2, hint: 'Próxima entrega', tone: 'mint' },
  ] : []

  const welcome = profile?.role === 'SUPER_ADMIN'
    ? 'Administración de la plataforma'
    : profile?.role === 'TECNICO'
      ? 'Resumen de tus reparaciones asignadas'
      : `Resumen de ${profile?.workshop?.name ?? 'tu taller'}`

  return (
    <div className="ct-page space-y-6">
      <PageHeader
        title="Panel de control"
        description={welcome}
        actions={<>
          <button type="button" onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1) }} disabled={loading} className="ct-btn ct-btn-secondary"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Actualizar</button>
          {canCreateRoles.includes(profile?.role) && <Link to="/reparaciones/nueva" className="ct-btn ct-btn-primary"><Plus size={16} />Nueva reparación</Link>}
        </>}
      />

      <section className="tf-dashboard-hero">
        <div className="tf-hero-copy"><p className="tf-eyebrow"><span /> TU TALLER, EN MOVIMIENTO</p><h2>Todo listo para<br /><span>un gran día de trabajo.</span></h2><p>Hola, {profile?.full_name?.trim().split(/\s+/)[0] || 'equipo'}. Cada reparación cuenta. Aquí tienes el pulso de tu taller.</p><Link to="/reparaciones" className="tf-hero-link">Ver reparaciones <ArrowUpRight size={17} /></Link></div>
        <div className="tf-flow-art" aria-hidden="true"><div className="tf-flow-orbit" /><div className="tf-flow-orbit tf-flow-orbit-inner" /><div className="tf-flow-core"><Wrench size={34} strokeWidth={1.4} /></div><span className="tf-flow-tag tf-flow-tag-top"><Activity size={16} /> Diagnóstico</span><span className="tf-flow-tag tf-flow-tag-bottom"><CheckCircle2 size={16} /> Entrega</span><span className="tf-flow-dot" /></div>
      </section>

      {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"><p>No pudimos cargar el resumen del taller.</p><p className="mt-1 text-xs text-red-200/70">{error}</p><button type="button" onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1) }} className="mt-3 ct-btn ct-btn-secondary">Reintentar</button></div>}
      {loading && !data && <div role="status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-[6.75rem] animate-pulse rounded-lg border border-slate-800/70 bg-slate-900/50" />)}</div>}
      {!loading && !error && data && <>
        <div className="ct-kpi-grid">{stats.map(({ label, value, icon: Icon, hint, tone }, index) => <article key={label} className={`ct-kpi tf-kpi tf-tone-${tone}`} style={{ '--tf-order': index }}><div className="flex items-start justify-between gap-3"><p className="ct-kpi-label">{label}</p><span className="tf-kpi-icon"><Icon size={18} strokeWidth={1.8} /></span></div><p className="ct-kpi-value">{value}</p><p className="ct-kpi-hint"><span className="tf-status-dot" />{hint}</p></article>)}</div>
        <div className="ct-dashboard-grid">
          <section className="ct-surface-raised p-5"><div className="ct-section-heading"><h2>Entregas programadas</h2><Activity size={17} className="text-slate-500" /></div><div className="pt-4"><UpcomingDeliveries deliveries={data.upcomingDeliveries} /></div></section>
          <section className="ct-surface-raised p-5"><div className="ct-section-heading"><h2>Clientes recientes</h2><Link to="/clientes">Ver clientes</Link></div><div className="pt-4"><RecentCustomers customers={data.recentCustomers} /></div></section>
        </div>
        <section className="ct-surface-raised p-5"><div className="ct-section-heading"><h2>Reparaciones recientes</h2><Link to="/reparaciones">Ver todas</Link></div><div className="pt-4"><RecentRepairsTable repairs={data.recentRepairs} /></div></section>
      </>}
    </div>
  )
}
