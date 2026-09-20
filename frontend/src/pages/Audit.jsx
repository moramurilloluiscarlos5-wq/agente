import { useEffect, useState } from 'react'
import { ClipboardList, Search } from 'lucide-react'
import { api } from '../services/api.js'
import { formatDateTime } from '../utils/formatters.js'

export default function Audit() {
  const [logs, setLogs] = useState([])
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ page: '1', limit: '50' })
    if (query.trim()) params.set('q', query.trim())
    if (action) params.set('action', action)
    setLoading(true)
    api.get(`/security/audit?${params}`).then((response) => {
      if (active) setLogs(response.data ?? [])
    }).catch((err) => {
      if (active) setError(err.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [query, action])

  return <div className="space-y-6"><header><h1 className="flex items-center gap-2 text-2xl font-bold text-white"><ClipboardList className="text-cyan-400" /> Auditoría</h1><p className="mt-1 text-sm text-slate-400">Actividad sensible registrada por el backend. Los eventos son inmutables.</p></header><div className="grid gap-3 md:grid-cols-[1fr_220px]"><label className="relative block"><Search size={16} className="absolute left-3 top-3 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar descripción…" className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 pl-9 text-sm text-slate-100 outline-none focus:border-cyan-500/50" /></label><select value={action} onChange={(event) => setAction(event.target.value)} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200 outline-none"><option value="">Todas las acciones</option><option value="LOGIN_SUCCESS">Inicio de sesión</option><option value="USER_CREATED">Usuario creado</option><option value="ROLE_CHANGED">Rol cambiado</option><option value="REPAIR_STATUS_CHANGED">Estado de reparación</option></select></div>{error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}{loading ? <p className="text-sm text-slate-400">Cargando auditoría…</p> : <div className="overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Fecha</th><th className="p-4">Usuario</th><th className="p-4">Acción</th><th className="p-4">Entidad</th><th className="p-4">Descripción</th><th className="p-4">IP</th></tr></thead><tbody className="divide-y divide-slate-800">{logs.map((log) => <tr key={log.id} className="bg-slate-950/30"><td className="p-4 text-slate-400">{formatDateTime(log.created_at)}</td><td className="p-4 text-slate-200">{log.user?.full_name || 'Sistema'}</td><td className="p-4 font-medium text-cyan-300">{log.action}</td><td className="p-4 text-slate-400">{log.entity || '—'}</td><td className="p-4 text-slate-300">{log.description}</td><td className="p-4 text-slate-500">{log.ip_address || '—'}</td></tr>)}</tbody></table>{!logs.length && <p className="p-8 text-center text-sm text-slate-500">No hay eventos para este filtro.</p>}</div>}</div>
}
