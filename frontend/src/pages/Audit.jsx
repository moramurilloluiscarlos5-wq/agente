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
    api.get(`/security/audit?${params}`).then((response) => {
      if (active) setLogs(response.data ?? [])
    }).catch((err) => {
      if (active) setError(err.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [query, action])

  return <div className="space-y-6"><header><h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--tf-text)]"><ClipboardList className="text-[var(--tf-link)]" /> Auditoría</h1><p className="mt-1 text-sm text-[var(--tf-text-muted)]">Actividad sensible registrada por el backend. Los eventos son inmutables.</p></header><div className="grid gap-3 md:grid-cols-[1fr_220px]"><label className="relative block"><Search size={16} className="absolute left-3 top-3 text-[var(--tf-text-subtle)]" /><input value={query} onChange={(event) => { setQuery(event.target.value); setLoading(true); setError('') }} placeholder="Buscar descripción…" className="w-full rounded-lg border border-[var(--tf-border)] bg-[var(--tf-surface)] px-3 py-2.5 pl-9 text-sm text-[var(--tf-text)] outline-none focus:border-[var(--tf-accent)]" /></label><select value={action} onChange={(event) => { setAction(event.target.value); setLoading(true); setError('') }} className="rounded-lg border border-[var(--tf-border)] bg-[var(--tf-surface)] px-3 py-2.5 text-sm text-[var(--tf-text)] outline-none"><option value="">Todas las acciones</option><option value="LOGIN_SUCCESS">Inicio de sesión</option><option value="USER_CREATED">Usuario creado</option><option value="ROLE_CHANGED">Rol cambiado</option><option value="REPAIR_STATUS_CHANGED">Estado de reparación</option></select></div>{error && <p role="alert" className="rounded-lg border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-4 text-sm text-[#fca5a5]">{error}</p>}{loading ? <p className="text-sm text-[var(--tf-text-muted)]">Cargando auditoría…</p> : <div className="overflow-x-auto rounded-[var(--tf-radius-card)] border border-[var(--tf-border)]"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-[var(--tf-surface)] text-xs text-[var(--tf-text-subtle)]"><tr><th className="p-4">Fecha</th><th className="p-4">Usuario</th><th className="p-4">Acción</th><th className="p-4">Entidad</th><th className="p-4">Descripción</th><th className="p-4">IP</th></tr></thead><tbody className="divide-y divide-[var(--tf-border)]">{logs.map((log) => <tr key={log.id} className="bg-[var(--tf-surface-sunken)]"><td className="p-4 text-[var(--tf-text-muted)]">{formatDateTime(log.created_at)}</td><td className="p-4 text-[var(--tf-text)]">{log.user?.full_name || 'Sistema'}</td><td className="p-4 font-medium text-[var(--tf-link)]">{log.action}</td><td className="p-4 text-[var(--tf-text-muted)]">{log.entity || '—'}</td><td className="p-4 text-[var(--tf-text-muted)]">{log.description}</td><td className="p-4 text-[var(--tf-text-subtle)]">{log.ip_address || '—'}</td></tr>)}</tbody></table>{!logs.length && <p className="p-8 text-center text-sm text-[var(--tf-text-subtle)]">No hay eventos para este filtro.</p>}</div>}</div>
}
