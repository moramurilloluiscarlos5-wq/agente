import { useEffect, useState } from 'react'
import { KeyRound, Save } from 'lucide-react'
import { api } from '../services/api.js'

export default function Roles() {
  const [data, setData] = useState({ roles: [], permissions: [], rolePermissions: [] })
  const [selected, setSelected] = useState('ADMINISTRADOR')
  const [draft, setDraft] = useState(null)
  const checked = draft ?? new Set(data.rolePermissions.filter((item) => item.role_code === selected).map((item) => item.permission_code))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/security/roles').then((response) => setData({ roles: [], permissions: [], rolePermissions: [], ...(response.data && !Array.isArray(response.data) ? response.data : {}) })).catch((err) => setError(err.message)).finally(() => setLoading(false))
  }, [])


  async function save() {
    setSaving(true); setError(''); setMessage('')
    try {
      const response = await api.patch(`/security/roles/${encodeURIComponent(selected)}/permissions`, { permission_codes: [...checked] })
      setData((current) => ({ ...current, rolePermissions: [...current.rolePermissions.filter((item) => item.role_code !== selected), ...response.data.permission_codes.map((permission_code) => ({ role_code: selected, permission_code }))] }))
      setDraft(null)
      setMessage('Permisos guardados correctamente.')
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  const grouped = data.permissions.reduce((groups, permission) => ({ ...groups, [permission.module]: [...(groups[permission.module] || []), permission] }), {})
  return <div className="space-y-6"><header><h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--tf-text)]"><KeyRound className="text-[var(--tf-link)]" /> Roles y permisos</h1><p className="mt-1 text-sm text-[var(--tf-text-muted)]">Configura permisos almacenados en la base de datos. El backend valida cada acción.</p></header>{error && <p role="alert" className="rounded-lg border border-[rgba(248,113,113,.32)] bg-[var(--tf-danger-soft)] p-4 text-sm text-[#fca5a5]">{error}</p>}{message && <p role="status" className="rounded-lg border border-[rgba(74,222,128,.3)] bg-[var(--tf-success-soft)] p-4 text-sm text-[#86efac]">{message}</p>}{loading ? <p className="text-sm text-[var(--tf-text-muted)]">Cargando permisos…</p> : <div className="grid gap-6 lg:grid-cols-[240px_1fr]"><aside className="space-y-2 rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-3">{data.roles.map((role) => <button key={role.code} type="button" disabled={saving} onClick={() => { setSelected(role.code); setDraft(null); setMessage('') }} className={`w-full rounded-lg px-3 py-3 text-left text-sm ${selected === role.code ? 'bg-[var(--tf-accent-soft)] text-[var(--tf-link)]' : 'text-[var(--tf-text-muted)] hover:bg-[rgba(148,163,184,.08)]'}`}><p className="font-medium">{role.name}</p><p className="mt-1 text-xs text-[var(--tf-text-subtle)]">{role.code}</p></button>)}</aside><main className="rounded-[var(--tf-radius-card)] border border-[var(--tf-border)] bg-[var(--tf-surface)] p-5"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-[var(--tf-text)]">Permisos de {selected}</h2><p className="mt-1 text-xs text-[var(--tf-text-subtle)]">Marca solo lo que este rol debe poder ejecutar.</p></div><button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--tf-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} />{saving ? 'Guardando…' : 'Guardar'}</button></div><div className="grid gap-4 md:grid-cols-2">{Object.entries(grouped).map(([module, permissions]) => <section key={module} className="rounded-lg border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] p-4"><h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-text-subtle)]">{module}</h3><div className="space-y-2">{permissions.map((permission) => <label key={permission.code} className="flex items-start gap-3 text-sm text-[var(--tf-text-muted)]"><input type="checkbox" checked={checked.has(permission.code)} onChange={(event) => setDraft(() => { const next = new Set(checked); if (event.target.checked) next.add(permission.code); else next.delete(permission.code); return next })} disabled={saving || selected === 'ADMINISTRADOR'} className="mt-0.5 h-4 w-4 accent-[var(--tf-primary)]" /><span><span className="block">{permission.name}</span><span className="text-xs text-[var(--tf-text-subtle)]">{permission.code}</span></span></label>)}</div></section>)}</div></main></div>}</div>
}
