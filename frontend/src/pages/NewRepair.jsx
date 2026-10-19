import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ClipboardPlus, Plus } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { useDraft } from '../hooks/useDraft.js'
import { useToast } from '../hooks/useToast.js'
import RepairFields from '../components/repairs/RepairFields.jsx'
import RecordPicker from '../components/ui/RecordPicker.jsx'
import { Alert, Button, Card, DraftNotice, EmptyState, ErrorAlert } from '../components/ui/DesignSystem.jsx'
import { customerName, deviceName, repairFormPayload, repairFormValues } from '../components/repairs/repairForm.js'
import { focusFirstInvalid } from '../utils/forms.js'
import { ShieldAlert } from 'lucide-react'

const CREATE_ROLES = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'SUPER_ADMIN']

export default function NewRepair() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const initialCustomer = params.get('customer_id')
  const initialDevice = params.get('device_id')
  const fromLink = Boolean(initialCustomer || initialDevice)
  const [draftValue, setDraftValue, draft] = useDraft('repair-new', { customer: null, device: null, ...repairFormValues() })
  const { customer, device, ...form } = draftValue
  const setForm = (update) => setDraftValue((current) => {
    const { customer: c, device: d, ...rest } = current
    return { customer: c, device: d, ...(typeof update === 'function' ? update(rest) : update) }
  })
  const [technicians, setTechnicians] = useState([])
  const [technicianError, setTechnicianError] = useState('')
  const [loading, setLoading] = useState(fromLink)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [errors, setErrors] = useState({})
  const [requestError, setRequestError] = useState(null)
  const [selectionError, setSelectionError] = useState('')
  const canCreate = CREATE_ROLES.includes(profile?.role)

  useEffect(() => {
    if (!canCreate) return undefined
    let active = true
    api.get('/technicians').then((response) => { if (active) setTechnicians(response.data ?? []) })
      .catch(() => { if (active) setTechnicianError('No pudimos cargar la lista de responsables. Puedes asignarlo después desde la orden.') })
    return () => { active = false }
  }, [canCreate])

  // Preselección desde un enlace (?customer_id=…&device_id=…): manda sobre el borrador.
  useEffect(() => {
    if (!canCreate || !fromLink) return undefined
    let active = true
    async function loadSelection() {
      try {
        const deviceResponse = initialDevice ? await api.get(`/devices/${encodeURIComponent(initialDevice)}`) : null
        const customerId = initialCustomer || deviceResponse?.data?.customer_id
        const customerResponse = customerId ? await api.get(`/customers/${encodeURIComponent(customerId)}`) : null
        if (deviceResponse && deviceResponse.data.customer_id !== customerId) throw new Error('mismatch')
        if (!active) return
        setDraftValue((current) => ({
          ...current,
          customer: customerResponse?.data ?? null,
          device: deviceResponse?.data ?? null,
          ...(deviceResponse ? { physical_condition: current.physical_condition || deviceResponse.data.physical_condition || '', accessories_received: current.accessories_received || deviceResponse.data.accessories_received || '' } : {}),
        }))
      } catch (error) {
        if (active) setSelectionError(error.message === 'mismatch' ? 'El equipo del enlace pertenece a otro cliente. Elige el equipo de nuevo.' : 'No pudimos cargar el cliente o el equipo del enlace. Elígelos de nuevo.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadSelection()
    return () => { active = false }
    // setDraftValue es estable para este propósito; solo depende del enlace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCustomer, initialDevice, canCreate, fromLink])

  function selectCustomer(record) {
    setErrors((current) => ({ ...current, customer: null, device: null }))
    setDraftValue((current) => record?.id === current.customer?.id ? current : { ...current, customer: record, device: null, physical_condition: '', accessories_received: '' })
  }

  function selectDevice(record) {
    setErrors((current) => ({ ...current, device: null }))
    setDraftValue((current) => ({ ...current, device: record, ...(record ? { physical_condition: record.physical_condition ?? current.physical_condition, accessories_received: record.accessories_received ?? current.accessories_received } : {}) }))
  }

  async function submit(event) {
    event.preventDefault()
    if (savingRef.current) return
    const next = {}
    if (!customer) next.customer = 'Elige al cliente que deja el equipo.'
    if (customer && !device) next.device = 'Elige el equipo que recibes o regístralo primero.'
    if (!form.reported_problem.trim()) next.reported_problem = 'Describe el problema que reporta el cliente.'
    if (!form.received_at) next.received_at = 'Indica la fecha y hora de recepción.'
    for (const key of ['estimated_cost', 'deposit']) if (form[key] !== '' && !(Number(form[key]) >= 0)) next[key] = 'Escribe un importe en pesos, por ejemplo 950.'
    if (Object.keys(next).length) { setErrors(next); focusFirstInvalid('repair-form'); return }
    savingRef.current = true
    setSaving(true); setRequestError(null)
    try {
      const payload = repairFormPayload({ ...form, estimated_cost: form.estimated_cost === '' ? '0' : form.estimated_cost, deposit: form.deposit === '' ? '0' : form.deposit })
      const response = await api.post('/repairs', { ...payload, customer_id: customer.id, device_id: device.id })
      draft.clear()
      toast.success(`Orden ${response.data.order_number} registrada.`)
      navigate(`/reparaciones/${encodeURIComponent(response.data.order_number)}`, { replace: true, state: { created: true } })
    } catch (error) {
      setRequestError(error)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!canCreate) return (
    <section className="tf-card mx-auto mt-8 max-w-xl">
      <EmptyState icon={ShieldAlert} title="La recepción la registra el mostrador" description="Tu rol puede trabajar las órdenes asignadas, pero no crear nuevas. Pide a recepción o al dueño que registren el equipo."
        action={<Link to="/reparaciones" className="ct-btn ct-btn-secondary">Ver reparaciones</Link>} />
    </section>
  )

  const returnParam = 'volver=reparacion'
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link to="/reparaciones" className="tf-form-page-back"><ArrowLeft size={16} aria-hidden="true" />Reparaciones</Link>
        <h1 className="ct-page-title mt-2">Registrar reparación</h1>
        <p className="ct-page-description">La orden se crea con el estado Recibido y el cliente podrá seguir su avance.</p>
      </div>
      {draft.restored && !fromLink && <DraftNotice onDiscard={draft.discard} />}
      {selectionError && <Alert tone="warning">{selectionError}</Alert>}

      <form id="repair-form" onSubmit={submit} noValidate className="space-y-6">
        <Card title="Cliente y equipo" description="Busca al cliente y elige el equipo que deja en el taller.">
          {loading ? <p role="status" className="text-sm text-[var(--tf-text-muted)]">Cargando cliente y equipo…</p> : <div className="grid gap-6 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <RecordPicker label="Cliente" required value={customer} error={errors.customer} disabled={saving} onChange={selectCustomer}
                path={(q) => `/customers?limit=6${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                renderLabel={customerName} renderMeta={(record) => record.phone || ''} placeholder="María López o 612 123 4567"
                emptyText="No hay clientes con ese dato. Regístralo con el enlace de abajo." />
              <Link to={`/clientes/nuevo?${returnParam}`} className="tf-link inline-flex min-h-8 items-center gap-1 text-sm"><Plus size={16} aria-hidden="true" />Registrar cliente nuevo</Link>
            </div>
            <div className="min-w-0 space-y-2">
              {customer ? <>
                <RecordPicker key={customer.id} label="Equipo" required value={device} error={errors.device} disabled={saving} onChange={selectDevice}
                  path={(q) => `/devices?limit=6&customer_id=${encodeURIComponent(customer.id)}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  renderLabel={deviceName} renderMeta={(record) => record.imei ? `IMEI ${record.imei}` : record.serial_number ? `Serie ${record.serial_number}` : ''}
                  placeholder="Samsung, A54 o IMEI" emptyText="Este cliente no tiene equipos con ese dato." />
                <Link to={`/dispositivos/nuevo?customer_id=${encodeURIComponent(customer.id)}&${returnParam}`} className="tf-link inline-flex min-h-8 items-center gap-1 text-sm"><Plus size={16} aria-hidden="true" />Registrar equipo nuevo</Link>
              </> : <div className="tf-field">
                <span className="tf-label">Equipo</span>
                <p className="rounded-[var(--tf-radius-control)] border border-dashed border-[var(--tf-border-strong)] p-4 text-sm text-[var(--tf-text-subtle)]">Elige primero al cliente para ver sus equipos.</p>
              </div>}
            </div>
          </div>}
        </Card>

        <RepairFields form={form} setForm={setForm} technicians={technicians} technicianError={technicianError} disabled={saving || loading} errors={errors}
          onFieldChange={(key) => setErrors((current) => (current[key] ? { ...current, [key]: null } : current))} />

        {requestError && <ErrorAlert error={requestError} action="registrar la reparación" />}
        <div className="tf-form-page-actions !m-0 rounded-[var(--tf-radius-card)] border border-[var(--tf-border)]">
          <Link className="ct-btn ct-btn-secondary" to="/reparaciones">Cancelar</Link>
          <Button variant="primary" type="submit" icon={ClipboardPlus} busy={saving}>{saving ? 'Registrando…' : 'Registrar reparación'}</Button>
        </div>
      </form>
    </div>
  )
}
