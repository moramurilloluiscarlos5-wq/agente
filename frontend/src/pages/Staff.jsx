import { useEffect, useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

const ROLES = { ADMINISTRADOR: 'Administrador', TECNICO: 'Técnico', RECEPCION: 'Recepción', CAJERO: 'Cajero' }
const EMPTY = { full_name: '', email: '', password: '', phone: '', role: 'RECEPCION' }
const fieldClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none'

export default function Staff() {
  const { profile } = useAuth()
  const allowed = ['OWNER', 'ADMINISTRADOR'].includes(profile?.role)
  const [users, setUsers] = useState([])
  const [draftRoles, setDraftRoles] = useState({})
  const [form, setForm] = useState(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    api.get('/auth/users').then(({ data }) => {
      if (!cancelled) { setUsers(data); setDraftRoles({}) }
    }).catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [allowed, revision])

  async function createUser(event) {
    event.preventDefault()
    if (busy) return
    setBusy('create'); setError(''); setMessage('')
    try {
      const { data } = await api.post('/auth/users', form)
      setUsers((previous) => [data, ...previous])
      setForm(EMPTY); setShowForm(false)
      setMessage('Usuario creado. Ya puede iniciar sesión con el correo y la contraseña indicados.')
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  async function updateUser(user, action, body) {
    if (busy) return
    if (action === 'status' && !body.is_active && !window.confirm(`¿Desactivar el acceso de ${user.full_name}?`)) return
    setBusy(user.id); setError(''); setMessage('')
    try {
      const { data } = await api.patch(`/auth/users/${user.id}/${action}`, body)
      setUsers((previous) => previous.map((row) => row.id === data.id ? data : row))
      setDraftRoles((previous) => ({ ...previous, [data.id]: data.role }))
      setMessage('Permisos del usuario actualizados.')
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  if (!allowed) return <p role="alert" className="rounded-xl border border-slate-800 p-6 text-slate-300">Solo un administrador puede gestionar el personal.</p>

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Users size={25} /> Personal</h1><p className="mt-1 text-sm text-slate-400">Cuentas del equipo y permisos de acceso.</p></div>
      <button disabled={Boolean(busy)} onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={17} /> {showForm ? 'Cerrar formulario' : 'Nuevo usuario'}</button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}<button onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1) }} disabled={Boolean(busy)} className="ml-3 underline">Actualizar lista</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</p>}
    {showForm && <form onSubmit={createUser} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="font-semibold text-white">Crear cuenta del personal</h2>
      <fieldset disabled={Boolean(busy)} className="grid gap-4 sm:grid-cols-2">
        {[
          ['full_name', 'Nombre completo', 'text', 150], ['email', 'Correo electrónico', 'email', 254],
          ['password', 'Contraseña inicial', 'password', 128], ['phone', 'Teléfono (opcional)', 'tel', 40],
        ].map(([name, label, type, maxLength]) => <label key={name} className="space-y-1 text-sm text-slate-300"><span>{label}</span><input name={name} type={type} value={form[name]} required={name !== 'phone'} minLength={name === 'password' ? 8 : undefined} maxLength={maxLength} autoComplete={name === 'password' ? 'new-password' : 'off'} onChange={(event) => setForm({ ...form, [name]: event.target.value })} className={fieldClass} /></label>)}
        <label className="space-y-1 text-sm text-slate-300"><span>Rol</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className={fieldClass}>{Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </fieldset>
      <p className="text-xs text-slate-400">La contraseña debe tener al menos 8 caracteres. El correo quedará confirmado al crear esta cuenta interna.</p>
      <button disabled={Boolean(busy)} type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'create' ? 'Creando…' : 'Crear usuario'}</button>
    </form>}
    {loading ? <p role="status" className="text-slate-400">Cargando personal…</p> : <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-900 text-slate-400"><tr><th className="p-4">Nombre</th><th className="p-4">Rol</th><th className="p-4">Estado</th><th className="p-4">Último acceso</th><th className="p-4">Acceso</th></tr></thead><tbody className="divide-y divide-slate-800">
        {users.map((user) => <tr key={user.id} className="bg-slate-900/40"><td className="p-4"><p className="text-slate-100">{user.full_name}{user.id === profile.id ? ' (tú)' : ''}</p><p className="text-xs text-slate-400">{user.phone || 'Sin teléfono'}</p></td><td className="p-4"><div className="flex items-center gap-2"><select aria-label={`Rol de ${user.full_name}`} disabled={Boolean(busy) || user.id === profile.id} className={fieldClass} value={draftRoles[user.id] ?? user.role} onChange={(event) => setDraftRoles({ ...draftRoles, [user.id]: event.target.value })}>{Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{draftRoles[user.id] && draftRoles[user.id] !== user.role && <button disabled={Boolean(busy)} onClick={() => updateUser(user, 'role', { role: draftRoles[user.id] })} className="text-cyan-300 disabled:opacity-50">Guardar</button>}</div></td><td className={`p-4 ${user.is_active ? 'text-emerald-300' : 'text-slate-500'}`}>{user.is_active ? 'Activo' : 'Inactivo'}</td><td className="p-4 text-xs text-slate-400">{user.last_login_at ? new Date(user.last_login_at).toLocaleString('es-MX') : 'Nunca'}</td><td className="p-4"><button disabled={Boolean(busy) || user.id === profile.id} onClick={() => updateUser(user, 'status', { is_active: !user.is_active })} className="text-cyan-300 disabled:opacity-40">{busy === user.id ? 'Guardando…' : user.is_active ? 'Desactivar' : 'Activar'}</button></td></tr>)}
      </tbody></table>
      {!users.length && <p className="p-6 text-center text-slate-400">No hay personal registrado.</p>}
    </div>}
  </div>
}
