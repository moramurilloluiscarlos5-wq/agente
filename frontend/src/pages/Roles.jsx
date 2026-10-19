import { useEffect, useState } from 'react'
import { KeyRound, Save } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Button, Card, EmptyState, ErrorAlert, Skeleton } from '../components/ui/DesignSystem.jsx'
import { useToast } from '../hooks/useToast.js'
import { api } from '../services/api.js'

const LOCKED_ROLE = 'ADMINISTRADOR'

export default function Roles() {
  const toast = useToast()
  const [state, setState] = useState({ key: -1, data: { roles: [], permissions: [], rolePermissions: [] }, error: null })
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState(LOCKED_ROLE)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const loading = state.key !== revision
  const { data } = state
  const saved = new Set(data.rolePermissions.filter((item) => item.role_code === selected).map((item) => item.permission_code))
  const checked = draft ?? saved
  const dirty = Boolean(draft) && (draft.size !== saved.size || [...draft].some((code) => !saved.has(code)))
  const role = data.roles.find((item) => item.code === selected)

  useEffect(() => {
    let active = true
    api.get('/security/roles')
      .then((response) => { if (active) setState({ key: revision, data: { roles: [], permissions: [], rolePermissions: [], ...(response.data && !Array.isArray(response.data) ? response.data : {}) }, error: null }) })
      .catch((error) => { if (active) setState((current) => ({ ...current, key: revision, error })) })
    return () => { active = false }
  }, [revision])

  async function save() {
    setSaving(true); setSaveError(null)
    try {
      const response = await api.patch(`/security/roles/${encodeURIComponent(selected)}/permissions`, { permission_codes: [...checked] })
      setState((current) => ({ ...current, data: { ...current.data, rolePermissions: [...current.data.rolePermissions.filter((item) => item.role_code !== selected), ...response.data.permission_codes.map((permission_code) => ({ role_code: selected, permission_code }))] } }))
      setDraft(null)
      toast.success(`Permisos de ${role?.name ?? selected} guardados.`)
    } catch (error) { setSaveError(error) } finally { setSaving(false) }
  }

  function toggle(code, on) {
    setDraft(() => { const next = new Set(checked); if (on) next.add(code); else next.delete(code); return next })
  }

  const grouped = data.permissions.reduce((groups, permission) => ({ ...groups, [permission.module]: [...(groups[permission.module] || []), permission] }), {})

  return (
    <div className="space-y-6">
      <PageHeader title="Roles y permisos" description="Qué puede hacer cada rol en todos los talleres. El servidor valida cada acción con estos permisos." />
      {state.error ? <ErrorAlert error={state.error} action="cargar los roles" onRetry={() => setRevision((value) => value + 1)} />
        : loading ? <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]"><div className="tf-card space-y-3 p-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-9 w-full" />)}</div><div className="tf-card space-y-4 p-6">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-4 w-full" />)}</div></div>
          : !data.roles.length ? <section className="tf-card"><EmptyState icon={KeyRound} title="No hay roles configurados" description="Ejecuta las migraciones de seguridad de la base de datos para crear los roles base." /></section>
            : <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
              <nav aria-label="Roles" className="tf-card p-2">
                <ul className="space-y-1">{data.roles.map((item) => (
                  <li key={item.code}><button type="button" aria-pressed={selected === item.code} disabled={saving}
                    onClick={() => { setSelected(item.code); setDraft(null); setSaveError(null) }}
                    className={`tf-nav-link w-full ${selected === item.code ? 'is-active' : ''}`}>
                    <span className="min-w-0 text-left"><span className="block truncate">{item.name}</span></span>
                  </button></li>))}</ul>
              </nav>
              <Card title={`Permisos de ${role?.name ?? selected}`} description={selected === LOCKED_ROLE ? 'Este rol tiene todos los permisos y no se puede limitar.' : 'Marca solo lo que este rol necesita para su trabajo.'}
                actions={selected !== LOCKED_ROLE && <Button variant="primary" icon={Save} busy={saving} disabled={!dirty} onClick={save}>{saving ? 'Guardando…' : 'Guardar permisos'}</Button>}>
                <div className="space-y-6">
                  {saveError && <ErrorAlert error={saveError} action="guardar los permisos" />}
                  {dirty && <Alert tone="info">Tienes cambios sin guardar en este rol.</Alert>}
                  <div className="grid gap-6 md:grid-cols-2">
                    {Object.entries(grouped).map(([module, permissions]) => (
                      <fieldset key={module} className="min-w-0 rounded-[var(--tf-radius-control)] border border-[var(--tf-border)] p-4">
                        <legend className="px-1 text-sm font-medium text-[var(--tf-text)]">{module}</legend>
                        <div className="mt-2 space-y-3">
                          {permissions.map((permission) => (
                            <label key={permission.code} className="flex items-start gap-3 text-sm text-[var(--tf-text-muted)]">
                              <input type="checkbox" checked={checked.has(permission.code)} onChange={(event) => toggle(permission.code, event.target.checked)} disabled={saving || selected === LOCKED_ROLE} className="mt-0.5 h-4 w-4 accent-[var(--tf-primary)]" />
                              <span className="min-w-0"><span className="block text-[var(--tf-text)]">{permission.name}</span><span className="block break-all text-xs text-[var(--tf-text-subtle)]">{permission.code}</span></span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </div>
              </Card>
            </div>}
    </div>
  )
}
