import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, ShieldAlert, Users } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Badge, Button, ConfirmDialog, DataCard, EmptyState, ErrorAlert, FilterSelect, FormPage, Input, SearchField, Select, TableSkeleton } from '../components/ui/DesignSystem.jsx'
import { useToast } from '../hooks/useToast.js'
import { friendlyError } from '../utils/errors.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { formatRelative, getInitials } from '../utils/formatters.js'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'

const ROLES = { ADMINISTRADOR: 'Administrador', TECNICO: 'Técnico', RECEPCION: 'Recepción', CAJERO: 'Cajero' }
const ROLE_HINTS = {
  ADMINISTRADOR: 'Administra todo el taller, excepto la suscripción.',
  TECNICO: 'Ve y trabaja las reparaciones que tiene asignadas.',
  RECEPCION: 'Registra clientes, equipos y nuevas órdenes.',
  CAJERO: 'Registra pagos y consulta las órdenes.',
}
const MANAGER_ROLES = ['OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN']

function NotAllowed() {
  return (
    <section className="tf-card mx-auto mt-8 max-w-xl">
      <EmptyState icon={ShieldAlert} title="El personal lo administra el dueño" description="Pide al dueño del taller o a un administrador que agregue o cambie cuentas del equipo."
        action={<Link to="/" className="ct-btn ct-btn-secondary">Volver al panel</Link>} />
    </section>
  )
}

/* ---------- Crear cuenta (página) ---------- */
export function StaffFormPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '', role: 'RECEPCION' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [requestError, setRequestError] = useState(null)
  const set = (key) => (event) => { const { value } = event.target; setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: null })) }
  if (!MANAGER_ROLES.includes(profile?.role)) return <NotAllowed />

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!form.full_name.trim()) next.full_name = 'Escribe el nombre de la persona.'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Escribe un correo como nombre@taller.com.'
    if (form.password.length < 8) next.password = 'Usa al menos 8 caracteres.'
    if (Object.keys(next).length) { setErrors(next); focusFirstInvalid('staff-form'); return }
    setSaving(true); setRequestError(null)
    try {
      const { data } = await api.post('/auth/users', { ...form, full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone.trim() })
      toast.success(`${data.full_name} ya puede iniciar sesión con el correo y la contraseña que definiste.`)
      navigate('/personal')
    } catch (error) {
      setRequestError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage backTo="/personal" backLabel="Personal" title="Crear cuenta" description="La persona entra con este correo y contraseña. Pídele que la cambie en su primer ingreso."
      footer={<><Button onClick={() => navigate('/personal')} disabled={saving}>Cancelar</Button><Button variant="primary" type="submit" form="staff-form" busy={saving}>{saving ? 'Creando…' : 'Crear cuenta'}</Button></>}>
      <form id="staff-form" onSubmit={submit} noValidate className="tf-form-grid">
        <Input label="Nombre completo" required maxLength={150} autoComplete="off" value={form.full_name} onChange={set('full_name')} error={errors.full_name} placeholder="Ana López" />
        <Input label="Correo electrónico" type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={set('email')} error={errors.email} placeholder="ana@tutaller.com" />
        <Input label="Contraseña inicial" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="Al menos 8 caracteres." />
        <Input label="Teléfono (opcional)" type="tel" maxLength={40} autoComplete="off" value={form.phone} onChange={set('phone')} placeholder="612 123 4567" />
        <Select fieldClassName="tf-span-2" label="Rol" value={form.role} onChange={set('role')} hint={ROLE_HINTS[form.role]}>
          {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        {requestError && <div className="tf-span-2"><ErrorAlert error={requestError} action="crear la cuenta" /></div>}
      </form>
    </FormPage>
  )
}

/* ---------- Lista ---------- */
export default function Staff() {
  const { profile } = useAuth()
  const toast = useToast()
  const allowed = MANAGER_ROLES.includes(profile?.role)
  const [result, setResult] = useState({ key: -1, users: [], error: null })
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState('')
  const [confirmUser, setConfirmUser] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const loading = result.key !== revision
  const users = result.users

  useEffect(() => {
    if (!allowed) return undefined
    let active = true
    api.get('/auth/users').then(({ data }) => { if (active) setResult({ key: revision, users: data ?? [], error: null }) })
      .catch((error) => { if (active) setResult((current) => ({ ...current, key: revision, error })) })
    return () => { active = false }
  }, [allowed, revision])

  async function updateUser(user, action, body) {
    if (busy) return
    setBusy(user.id)
    try {
      const { data } = await api.patch(`/auth/users/${user.id}/${action}`, body)
      setResult((current) => ({ ...current, users: current.users.map((row) => (row.id === data.id ? data : row)) }))
      toast.success(action === 'role' ? `${data.full_name} ahora es ${ROLES[data.role] ?? data.role}.` : data.is_active ? `${data.full_name} puede volver a entrar.` : `${data.full_name} ya no puede entrar.`)
    } catch (error) {
      toast.error(friendlyError(error, 'actualizar la cuenta'))
    } finally {
      setBusy(''); setConfirmUser(null)
    }
  }

  if (!allowed) return <NotAllowed />

  const term = query.trim().toLowerCase()
  const filteredUsers = users.filter((user) => {
    const matches = !term || [user.full_name, user.email, user.phone, ROLES[user.role]].some((value) => String(value ?? '').toLowerCase().includes(term))
    const status = statusFilter === 'all' || (statusFilter === 'active' ? user.is_active : !user.is_active)
    return matches && status
  })
  const filtered = Boolean(term) || statusFilter !== 'all'
  const clearFilters = () => { setQuery(''); setStatusFilter('all') }
  const activeCount = users.filter((user) => user.is_active).length
  const maxUsers = profile?.entitlements?.max_users ?? null
  const atLimit = !loading && maxUsers != null && activeCount >= maxUsers
  const summaries = [
    { label: 'Personas en el equipo', value: users.length },
    { label: maxUsers != null ? `Con acceso activo (tu plan permite ${maxUsers})` : 'Con acceso activo', value: activeCount },
    { label: 'Técnicos', value: users.filter((user) => user.role === 'TECNICO').length },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Personal" description="Cuentas de tu equipo, su rol y si pueden entrar al sistema."
        actions={<Link to="/personal/nuevo" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Crear cuenta</Link>} />
      {atLimit && <Alert tone="warning" title={`Tu plan ${profile.entitlements.name} ya tiene sus ${maxUsers} usuarios activos`}
        action={['OWNER', 'ADMINISTRADOR'].includes(profile?.role) && <Link to="/facturacion" className="ct-btn ct-btn-secondary ct-btn-sm">Ver planes</Link>}>
        Para dar acceso a alguien más, quita el acceso a una cuenta que ya no se use o cambia a un plan con más usuarios.
      </Alert>}
      <div className="grid gap-4 sm:grid-cols-3">{summaries.map(({ label, value }) => <article className="ct-kpi" key={label}><p className="ct-kpi-label">{label}</p><p className="ct-kpi-value">{loading ? '—' : value}</p></article>)}</div>
      <DataCard toolbar={<>
        <SearchField label="Buscar personal" value={query} onChange={setQuery} placeholder="Ana, correo o rol" />
        <FilterSelect label="Estado" ariaLabel="Filtrar por estado" value={statusFilter} onChange={setStatusFilter}>
          <option value="all">Todos</option><option value="active">Con acceso</option><option value="inactive">Sin acceso</option>
        </FilterSelect>
        {filtered && <Button variant="ghost" onClick={clearFilters}>Quitar filtros</Button>}
        <span className="tf-toolbar-meta tf-num">{filteredUsers.length} de {users.length} personas</span>
      </>}>
        {result.error ? <div className="p-4"><ErrorAlert error={result.error} action="cargar al personal" onRetry={() => setRevision((value) => value + 1)} /></div>
          : loading ? <TableSkeleton columns={5} rows={3} />
            : !filteredUsers.length ? (filtered
              ? <EmptyState icon={Users} title="No encontramos coincidencias" description="Prueba con otro nombre o cambia el estado." action={<Button onClick={clearFilters}>Quitar filtros</Button>} />
              : <EmptyState icon={Users} title="Tu equipo empieza aquí" description="Crea la primera cuenta para repartir el trabajo del taller."
                action={<Link to="/personal/nuevo" className="ct-btn ct-btn-primary"><Plus size={16} aria-hidden="true" />Crear cuenta</Link>} />)
              : <div className="ct-table-shell">
                <table className="ct-table min-w-[46rem]"><thead><tr><th scope="col">Nombre</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Último acceso</th><th scope="col"><span className="sr-only">Acceso</span></th></tr></thead><tbody>
                  {filteredUsers.map((user) => {
                    const locked = user.id === profile.id || user.role === 'OWNER'
                    return <tr key={user.id}>
                      <td><div className="flex items-center gap-3"><span className="tf-avatar" aria-hidden="true">{getInitials(user.full_name)}</span><div className="min-w-0"><p className="font-medium text-[var(--tf-text)]">{user.full_name}{user.id === profile.id ? ' (tú)' : ''}</p><p className="truncate text-xs text-[var(--tf-text-subtle)]">{user.email || user.phone || 'Sin contacto'}</p></div></div></td>
                      <td>
                        <select aria-label={`Rol de ${user.full_name}`} disabled={locked || Boolean(busy)} className="ct-select min-w-[10rem]" value={user.role}
                          onChange={(event) => updateUser(user, 'role', { role: event.target.value })}>
                          {user.role === 'OWNER' && <option value="OWNER">Dueño del taller</option>}
                          {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </td>
                      <td><Badge tone={user.is_active ? 'success' : 'neutral'}>{user.is_active ? 'Con acceso' : 'Sin acceso'}</Badge></td>
                      <td className="whitespace-nowrap text-sm">{user.last_login_at ? formatRelative(user.last_login_at) : <span className="text-[var(--tf-text-subtle)]">Sin accesos aún</span>}</td>
                      <td className="text-right">{!locked && <Button size="sm" variant={user.is_active ? 'ghost' : 'secondary'} busy={busy === user.id} disabled={Boolean(busy)}
                        onClick={() => (user.is_active ? setConfirmUser(user) : updateUser(user, 'status', { is_active: true }))}>{user.is_active ? 'Quitar acceso' : 'Dar acceso'}</Button>}</td>
                    </tr>
                  })}
                </tbody></table>
              </div>}
      </DataCard>
      <ConfirmDialog open={Boolean(confirmUser)} title={`¿Quitar el acceso a ${confirmUser?.full_name ?? 'esta persona'}?`} busy={busy === confirmUser?.id} confirmLabel="Quitar acceso"
        description="No podrá iniciar sesión hasta que le vuelvas a dar acceso. Sus órdenes y su historial se conservan."
        onConfirm={() => updateUser(confirmUser, 'status', { is_active: false })} onCancel={() => setConfirmUser(null)} />
    </div>
  )
}
