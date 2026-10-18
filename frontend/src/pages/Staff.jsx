import { useEffect, useState } from 'react'
import { Plus, Users, X } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Badge, Button, ConfirmDialog, DataCard, EmptyState, Input, SearchField, Select, TableSkeleton } from '../components/ui/DesignSystem.jsx'
import { useToast } from '../hooks/useToast.js'
import { friendlyError } from '../utils/errors.js'
import { formatRelative, getInitials } from '../utils/formatters.js'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

const ROLES = { ADMINISTRADOR: 'Administrador', TECNICO: 'Técnico', RECEPCION: 'Recepción', CAJERO: 'Cajero' }
const EMPTY = { full_name: '', email: '', password: '', phone: '', role: 'RECEPCION' }
const fieldClass = 'ct-select'

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
  const [confirmUser, setConfirmUser] = useState(null)
  const toast = useToast()
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
    setBusy('create'); setError('')
    try {
      const { data } = await api.post('/auth/users', form)
      setUsers((previous) => [data, ...previous])
      setForm(EMPTY); setShowForm(false)
      toast.success(`${data.full_name} ya puede iniciar sesión con el correo y la contraseña que definiste.`)
    } catch (err) { setError(friendlyError(err, 'crear la cuenta')) }
    finally { setBusy('') }
  }

  async function updateUser(user, action, body) {
    if (busy) return
    if (action === 'status' && !body.is_active && confirmUser?.id !== user.id) { setConfirmUser(user); return }
    setBusy(user.id); setError('')
    try {
      const { data } = await api.patch(`/auth/users/${user.id}/${action}`, body)
      setUsers((previous) => previous.map((row) => row.id === data.id ? data : row))
      setDraftRoles((previous) => ({ ...previous, [data.id]: data.role }))
      toast.success(action === 'role' ? `${data.full_name} ahora es ${ROLES[data.role] ?? data.role}.` : data.is_active ? `${data.full_name} puede volver a entrar.` : `${data.full_name} ya no puede entrar.`)
    } catch (err) { toast.error(friendlyError(err, 'actualizar el usuario')) }
    finally { setBusy(''); setConfirmUser(null) }
  }

  if (!allowed) return <Alert tone="warning">Solo el dueño o un administrador puede gestionar al personal.</Alert>

  const filteredUsers = users.filter((user) => {
    const text = `${user.full_name ?? ''} ${user.email ?? ''} ${user.phone ?? ''} ${ROLES[user.role] ?? user.role}`.toLocaleLowerCase('es')
    return text.includes(query.trim().toLocaleLowerCase('es')) && (statusFilter === 'all' || (statusFilter === 'active' ? user.is_active : !user.is_active))
  })
  const summaries = [
    { label: 'Personas en el equipo', value: users.length },
    { label: 'Con acceso activo', value: users.filter((user) => user.is_active).length },
    { label: 'Técnicos', value: users.filter((user) => user.role === 'TECNICO').length },
  ]

  return <div className="space-y-5">
    <PageHeader title="Personal" description="Cuentas de tu equipo, su rol y si pueden entrar al sistema."
      actions={<Button variant="primary" icon={showForm ? X : Plus} disabled={Boolean(busy)} onClick={() => setShowForm(!showForm)} aria-expanded={showForm} aria-controls="staff-form">{showForm ? 'Cerrar formulario' : 'Nuevo usuario'}</Button>} />
    {error && <Alert tone="error" action={<Button size="sm" disabled={Boolean(busy)} onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1) }}>Actualizar lista</Button>}>{error}</Alert>}
    <div className="grid grid-cols-3 gap-3">{summaries.map(({ label, value }) => <article className="ct-kpi" key={label}><p className="ct-kpi-label">{label}</p><p className="ct-kpi-value">{loading ? '—' : value}</p></article>)}</div>
    {showForm && <form id="staff-form" onSubmit={createUser} className="tf-card space-y-4 p-5" style={{ animation: 'tf-pop .18s var(--tf-ease) both' }}>
      <div><h2 className="text-[0.9375rem] font-semibold">Crear cuenta</h2><p className="mt-1 text-[0.8125rem] text-[var(--tf-text-muted)]">La persona entra con este correo y contraseña. Pídele que la cambie al primer ingreso.</p></div>
      <fieldset disabled={Boolean(busy)} className="tf-form-grid">
        <Input label="Nombre completo" name="full_name" required maxLength={150} autoComplete="off" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
        <Input label="Correo electrónico" name="email" type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <Input label="Contraseña inicial" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" hint="Al menos 8 caracteres." value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <Input label="Teléfono (opcional)" name="phone" type="tel" maxLength={40} autoComplete="off" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <Select label="Rol" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} hint="Define qué puede ver y hacer.">{Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      </fieldset>
      <div className="flex justify-end gap-2"><Button onClick={() => setShowForm(false)} disabled={Boolean(busy)}>Cancelar</Button><Button variant="primary" type="submit" busy={busy === 'create'}>{busy === 'create' ? 'Creando…' : 'Crear usuario'}</Button></div>
    </form>}
    <DataCard toolbar={<>
      <SearchField label="Buscar personal" value={query} onChange={setQuery} placeholder="Nombre, correo o rol" />
      <select aria-label="Filtrar por estado" className="ct-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
      <span className="tf-num ml-auto text-xs text-[var(--tf-text-subtle)]">{filteredUsers.length} de {users.length} personas</span>
    </>}>
    {loading ? <TableSkeleton columns={5} rows={3} /> : !filteredUsers.length ? <EmptyState icon={Users} title={users.length ? 'No encontramos coincidencias' : 'Tu equipo empieza aquí'} description={users.length ? 'Prueba con otro nombre o cambia el filtro de estado.' : 'Crea la primera cuenta para empezar a trabajar juntos.'} /> : <div className="ct-table-shell">
      <table className="ct-table min-w-[46rem]"><thead><tr><th scope="col">Nombre</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Último acceso</th><th scope="col"><span className="sr-only">Acceso</span></th></tr></thead><tbody>
        {filteredUsers.map((user) => {
          const locked = Boolean(busy) || user.id === profile.id || user.role === 'OWNER'
          return <tr key={user.id}>
            <td><div className="flex items-center gap-3"><span className="tf-avatar" aria-hidden="true">{getInitials(user.full_name)}</span><div className="min-w-0"><p className="font-medium text-[var(--tf-text)]">{user.full_name}{user.id === profile.id ? ' (tú)' : ''}</p><p className="truncate text-xs text-[var(--tf-text-subtle)]">{user.email || user.phone || 'Sin contacto'}</p></div></div></td>
            <td><div className="flex items-center gap-2"><select aria-label={`Rol de ${user.full_name}`} disabled={locked} className={`${fieldClass} min-w-[10rem]`} value={draftRoles[user.id] ?? user.role} onChange={(event) => setDraftRoles({ ...draftRoles, [user.id]: event.target.value })}>{user.role === 'OWNER' && <option value="OWNER">Dueño del taller</option>}{Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{draftRoles[user.id] && draftRoles[user.id] !== user.role && <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => updateUser(user, 'role', { role: draftRoles[user.id] })}>Guardar</Button>}</div></td>
            <td><Badge tone={user.is_active ? 'success' : 'neutral'}>{user.is_active ? 'Activo' : 'Inactivo'}</Badge></td>
            <td className="whitespace-nowrap text-xs">{user.last_login_at ? formatRelative(user.last_login_at) : 'Sin accesos aún'}</td>
            <td className="text-right">{!locked || busy === user.id ? <Button size="sm" variant={user.is_active ? 'ghost' : 'secondary'} busy={busy === user.id} disabled={Boolean(busy)} onClick={() => updateUser(user, 'status', { is_active: !user.is_active })}>{user.is_active ? 'Quitar acceso' : 'Dar acceso'}</Button> : null}</td>
          </tr>
        })}
      </tbody></table>
    </div>}
    </DataCard>
    <ConfirmDialog open={Boolean(confirmUser)} title={`¿Quitar el acceso a ${confirmUser?.full_name ?? 'esta persona'}?`} busy={busy === confirmUser?.id} confirmLabel="Quitar acceso"
      description="No podrá iniciar sesión hasta que le vuelvas a dar acceso. Sus órdenes y su historial se conservan."
      onConfirm={() => updateUser(confirmUser, 'status', { is_active: false })} onCancel={() => setConfirmUser(null)} />
  </div>
}
