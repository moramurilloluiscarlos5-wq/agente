import { useEffect, useState } from 'react'
import { Plus, Search, Users, UserCheck, Wrench, X } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

const ROLES = { ADMINISTRADOR: 'Administrador', TECNICO: 'Técnico', RECEPCION: 'Recepción', CAJERO: 'Cajero' }
const EMPTY = { full_name: '', email: '', password: '', phone: '', role: 'RECEPCION' }
const fieldClass = 'ct-input'

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
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
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

  if (!allowed) return <p role="alert" className="text-sm text-slate-400">Solo un administrador puede gestionar el personal.</p>

  const filteredUsers = users.filter((user) => {
    const text = `${user.full_name ?? ''} ${user.email ?? ''} ${user.phone ?? ''} ${ROLES[user.role] ?? user.role}`.toLocaleLowerCase('es')
    return text.includes(query.trim().toLocaleLowerCase('es')) && (statusFilter === 'all' || (statusFilter === 'active' ? user.is_active : !user.is_active))
  })
  const summaries = [
    { label: 'Personas en tu equipo', value: users.length, icon: Users, tone: 'blue' },
    { label: 'Accesos activos', value: users.filter((user) => user.is_active).length, icon: UserCheck, tone: 'mint' },
    { label: 'Técnicos', value: users.filter((user) => user.role === 'TECNICO').length, icon: Wrench, tone: 'purple' },
  ]

  return <div className="ct-page space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="tf-eyebrow mb-2">EL EQUIPO DETRÁS DE CADA REPARACIÓN</p><h1 className="ct-page-title">Personal</h1><p className="ct-page-description">Un gran taller empieza con un gran equipo. Gestiona sus cuentas y permisos.</p></div>
      <button disabled={Boolean(busy)} onClick={() => setShowForm(!showForm)} aria-expanded={showForm} aria-controls="staff-form" className="ct-btn ct-btn-primary">{showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? 'Cerrar formulario' : 'Nuevo usuario'}</button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}<button onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1) }} disabled={Boolean(busy)} className="ml-3 underline">Actualizar lista</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</p>}
    <div className="tf-staff-summary">{summaries.map(({ label, value, icon: Icon, tone }) => <article className={`ct-surface tf-staff-stat tf-tone-${tone}`} key={label}><span className="tf-kpi-icon"><Icon size={20} /></span><div><p>{label}</p><strong>{loading ? '—' : value}</strong></div></article>)}</div>
    {showForm && <form id="staff-form" onSubmit={createUser} className="ct-surface-raised tf-popover space-y-4 p-6">
      <h2 className="text-sm font-semibold text-slate-100">Crear cuenta del personal</h2>
      <fieldset disabled={Boolean(busy)} className="grid gap-4 sm:grid-cols-2">
        {[
          ['full_name', 'Nombre completo', 'text', 150], ['email', 'Correo electrónico', 'email', 254],
          ['password', 'Contraseña inicial', 'password', 128], ['phone', 'Teléfono (opcional)', 'tel', 40],
        ].map(([name, label, type, maxLength]) => <label key={name} className="space-y-1 text-sm text-slate-300"><span>{label}</span><input name={name} type={type} value={form[name]} required={name !== 'phone'} minLength={name === 'password' ? 8 : undefined} maxLength={maxLength} autoComplete={name === 'password' ? 'new-password' : 'off'} onChange={(event) => setForm({ ...form, [name]: event.target.value })} className={fieldClass} /></label>)}
        <label className="space-y-1 text-sm text-slate-300"><span>Rol</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className={fieldClass}>{Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </fieldset>
      <p className="text-xs text-slate-400">La contraseña debe tener al menos 8 caracteres. El correo quedará confirmado al crear esta cuenta interna.</p>
      <button disabled={Boolean(busy)} type="submit" className="ct-btn ct-btn-primary">{busy === 'create' ? 'Creando…' : 'Crear usuario'}</button>
    </form>}
    <section className="ct-surface overflow-hidden">
      <div className="tf-staff-toolbar"><div><h2>Miembros del equipo</h2><p>{filteredUsers.length} de {users.length} personas</p></div><div className="flex flex-wrap gap-3"><label className="tf-search flex items-center gap-2"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Buscar personal" placeholder="Buscar por nombre o rol…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filtrar por estado" className="ct-select w-auto" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></div></div>
    {loading ? <p role="status" className="p-8 text-slate-400">Cargando personal…</p> : <div className="overflow-x-auto">
      <table className="ct-table w-full min-w-[780px] text-left text-sm"><thead className="ct-table-head"><tr><th className="p-4">Nombre</th><th className="p-4">Rol</th><th className="p-4">Estado</th><th className="p-4">Último acceso</th><th className="p-4">Acceso</th></tr></thead><tbody className="ct-table-tbody">
        {filteredUsers.map((user) => <tr key={user.id}><td className="p-4"><div className="flex items-center gap-3"><span className="tf-avatar" aria-hidden="true">{user.full_name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('') || '?'}</span><div><p className="font-medium text-slate-100">{user.full_name}{user.id === profile.id ? ' (tú)' : ''}</p><p className="mt-1 text-xs text-slate-400">{user.email || user.phone || 'Sin teléfono'}</p></div></div></td><td className="p-4"><div className="flex items-center gap-2"><select aria-label={`Rol de ${user.full_name}`} disabled={Boolean(busy) || user.id === profile.id || user.role === 'OWNER'} className={fieldClass} value={draftRoles[user.id] ?? user.role} onChange={(event) => setDraftRoles({ ...draftRoles, [user.id]: event.target.value })}>{user.role === 'OWNER' && <option value="OWNER">Propietario</option>}{Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{draftRoles[user.id] && draftRoles[user.id] !== user.role && <button disabled={Boolean(busy)} onClick={() => updateUser(user, 'role', { role: draftRoles[user.id] })} className="ct-link disabled:opacity-50">Guardar</button>}</div></td><td className="p-4"><span className={`ct-status ${user.is_active ? 'ct-status-success' : 'ct-status-neutral'}`}><span className="tf-status-dot" />{user.is_active ? 'Activo' : 'Inactivo'}</span></td><td className="p-4 text-xs text-slate-400">{user.last_login_at ? new Date(user.last_login_at).toLocaleString('es-MX') : 'Sin accesos aún'}</td><td className="p-4"><button disabled={Boolean(busy) || user.id === profile.id || user.role === 'OWNER'} onClick={() => updateUser(user, 'status', { is_active: !user.is_active })} className="ct-btn ct-btn-ghost disabled:opacity-40">{busy === user.id ? 'Guardando…' : user.is_active ? 'Desactivar' : 'Activar'}</button></td></tr>)}
      </tbody></table>
      {!filteredUsers.length && <div className="ct-empty"><Users size={32} /><h2>{users.length ? 'No encontramos coincidencias' : 'Tu equipo empieza aquí'}</h2><p>{users.length ? 'Prueba con otro nombre o cambia el filtro de estado.' : 'Crea la primera cuenta para empezar a trabajar juntos.'}</p></div>}
    </div>}
    </section>
  </div>
}
