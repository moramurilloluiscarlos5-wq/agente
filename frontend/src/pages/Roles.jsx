import { useEffect, useState } from 'react'
import { KeyRound, Save } from 'lucide-react'
import { api } from '../services/api.js'

export default function Roles() {
  const [data, setData] = useState({ roles: [], permissions: [], rolePermissions: [] })
  const [selected, setSelected] = useState('ADMINISTRADOR')
  const [checked, setChecked] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/security/roles').then((response) => setData(response.data)).catch((err) => setError(err.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setChecked(new Set(data.rolePermissions.filter((item) => item.role_code === selected).map((item) => item.permission_code)))
  }, [data.rolePermissions, selected])

  async function save() {
    setSaving(true); setError(''); setMessage('')
    try {
      const response = await api.patch(`/security/roles/${encodeURIComponent(selected)}/permissions`, { permission_codes: [...checked] })
      setData((current) => ({ ...current, rolePermissions: [...current.rolePermissions.filter((item) => item.role_code !== selected), ...response.data.permission_codes.map((permission_code) => ({ role_code: selected, permission_code }))] }))
      setMessage('Permisos guardados correctamente.')
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  const grouped = data.permissions.reduce((groups, permission) => ({ ...groups, [permission.module]: [...(groups[permission.module] || []), permission] }), {})
  return <div className="space-y-6"><header><h1 className="flex items-center gap-2 text-2xl font-bold text-white"><KeyRound className="text-cyan-400" /> Roles y permisos</h1><p className="mt-1 text-sm text-slate-400">Configura permisos almacenados en la base de datos. El backend valida cada acción.</p></header>{error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}{message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">{message}</p>}{loading ? <p className="text-sm text-slate-400">Cargando permisos…</p> : <div className="grid gap-6 lg:grid-cols-[240px_1fr]"><aside className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">{data.roles.map((role) => <button key={role.code} type="button" onClick={() => setSelected(role.code)} className={`w-full rounded-lg px-3 py-3 text-left text-sm ${selected === role.code ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-400 hover:bg-slate-800'}`}><p className="font-medium">{role.name}</p><p className="mt-1 text-xs text-slate-500">{role.code}</p></button>)}</aside><main className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-white">Permisos de {selected}</h2><p className="mt-1 text-xs text-slate-500">Marca solo lo que este rol debe poder ejecutar.</p></div><button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"><Save size={15} />{saving ? 'Guardando…' : 'Guardar'}</button></div><div className="grid gap-4 md:grid-cols-2">{Object.entries(grouped).map(([module, permissions]) => <section key={module} className="rounded-lg border border-slate-800 bg-slate-950/30 p-4"><h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{module}</h3><div className="space-y-2">{permissions.map((permission) => <label key={permission.code} className="flex items-start gap-3 text-sm text-slate-300"><input type="checkbox" checked={checked.has(permission.code)} onChange={(event) => setChecked((current) => { const next = new Set(current); if (event.target.checked) next.add(permission.code); else next.delete(permission.code); return next })} disabled={selected === 'ADMINISTRADOR'} className="mt-0.5 h-4 w-4 accent-cyan-500" /><span><span className="block">{permission.name}</span><span className="text-xs text-slate-600">{permission.code}</span></span></label>)}</div></section>)}</div></main></div>}</div>
}
