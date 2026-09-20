import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ClipboardPlus, Plus } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import RepairFields from '../components/repairs/RepairFields.jsx'
import RepairRecordPicker from '../components/repairs/RepairRecordPicker.jsx'
import { customerName, deviceName, repairButtonClass, repairFormPayload, repairFormValues, repairSecondaryClass } from '../components/repairs/repairForm.js'

export default function NewRepair() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialCustomer = params.get('customer_id')
  const initialDevice = params.get('device_id')
  const [customer, setCustomer] = useState(null)
  const [device, setDevice] = useState(null)
  const [form, setForm] = useState(() => repairFormValues())
  const [technicians, setTechnicians] = useState([])
  const [technicianError, setTechnicianError] = useState('')
  const [loading, setLoading] = useState(Boolean(initialCustomer || initialDevice))
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState('')
  const canCreate = ['OWNER', 'ADMINISTRADOR', 'RECEPCION'].includes(profile?.role)

  useEffect(() => {
    if (!canCreate) return
    let active = true
    api.get('/technicians').then((response) => { if (active) setTechnicians(response.data) }).catch((err) => { if (active) setTechnicianError(`No se pudieron cargar los responsables: ${err.message}`) })
    return () => { active = false }
  }, [canCreate])

  useEffect(() => {
    if (!canCreate || (!initialCustomer && !initialDevice)) return
    let active = true
    async function loadSelection() {
      setLoading(true)
      try {
        const deviceResponse = initialDevice ? await api.get(`/devices/${encodeURIComponent(initialDevice)}`) : null
        const customerId = initialCustomer || deviceResponse?.data?.customer_id
        const customerResponse = customerId ? await api.get(`/customers/${encodeURIComponent(customerId)}`) : null
        if (deviceResponse && deviceResponse.data.customer_id !== customerId) throw new Error('El equipo seleccionado no pertenece a este cliente. Selecciona su equipo de nuevo.')
        if (active) {
          setCustomer(customerResponse?.data ?? null)
          setDevice(deviceResponse?.data ?? null)
          if (deviceResponse) setForm((previous) => ({ ...previous, physical_condition: deviceResponse.data.physical_condition ?? '', accessories_received: deviceResponse.data.accessories_received ?? '' }))
        }
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    loadSelection()
    return () => { active = false }
  }, [initialCustomer, initialDevice, canCreate])

  function selectCustomer(record) {
    if (record.id !== customer?.id) {
      setCustomer(record)
      setDevice(null)
      setForm((previous) => ({ ...previous, physical_condition: '', accessories_received: '' }))
    }
  }

  function selectDevice(record) {
    setDevice(record)
    setForm((previous) => ({ ...previous, physical_condition: record.physical_condition ?? '', accessories_received: record.accessories_received ?? '' }))
  }

  async function submit(event) {
    event.preventDefault()
    if (savingRef.current) return
    setError('')
    if (!customer || !device) { setError('Selecciona un cliente y uno de sus equipos para continuar.'); return }
    savingRef.current = true
    setSaving(true)
    try {
      const payload = repairFormPayload(form)
      const response = await api.post('/repairs', { ...payload, customer_id: customer.id, device_id: device.id })
      navigate(`/reparaciones/${encodeURIComponent(response.data.order_number)}`, { replace: true, state: { created: true } })
    } catch (err) {
      setError(err.message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!canCreate) return <div className="rounded-xl border border-slate-800 p-6"><h1 className="text-xl font-semibold">Recepción de equipos</h1><p className="my-3 text-sm text-slate-400">Solo administración y recepción pueden registrar reparaciones.</p><Link className="text-sm text-cyan-300" to="/reparaciones">Volver a mis reparaciones</Link></div>

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header><Link className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300" to="/reparaciones"><ArrowLeft size={16} /> Reparaciones</Link><h1 className="text-2xl font-bold tracking-tight">Nueva reparación</h1><p className="mt-1 text-sm text-slate-400">Registra el equipo recibido. La orden se creará con el estado «Recibido».</p></header>
      <form onSubmit={submit} className="space-y-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="mb-5 font-semibold">Cliente y equipo *</h2>
          {loading ? <p className="py-5 text-sm text-slate-400">Cargando selección…</p> : <div className="grid gap-6 md:grid-cols-2">
            <div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium text-slate-300">1. Selecciona el cliente</h3><Link to="/clientes?new=1" className="inline-flex items-center gap-1 text-xs text-cyan-300"><Plus size={14} /> Registrar cliente</Link></div><RepairRecordPicker endpoint="/customers" label="cliente por nombre o teléfono" selected={customer} onSelect={selectCustomer} describe={(record) => `${customerName(record)} · ${record.phone}`} disabled={saving} /></div>
            <div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium text-slate-300">2. Selecciona el equipo</h3>{customer && <Link to={`/dispositivos?new=1&customer_id=${encodeURIComponent(customer.id)}`} className="inline-flex items-center gap-1 text-xs text-cyan-300"><Plus size={14} /> Registrar equipo</Link>}</div>{customer ? <RepairRecordPicker key={customer.id} endpoint={`/devices?customer_id=${encodeURIComponent(customer.id)}`} label="equipo por marca, modelo o IMEI" selected={device} onSelect={selectDevice} describe={(record) => `${deviceName(record)}${record.imei ? ` · IMEI ${record.imei}` : record.serial_number ? ` · Serie ${record.serial_number}` : ''}`} disabled={saving} /> : <p className="rounded-lg border border-dashed border-slate-800 p-6 text-sm text-slate-500">Primero selecciona un cliente para ver sus equipos.</p>}</div>
          </div>}
        </section>
        <RepairFields form={form} setForm={setForm} technicians={technicians} technicianError={technicianError} disabled={saving || loading} />
        {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3"><Link className={repairSecondaryClass} to="/reparaciones">Cancelar</Link><button className={repairButtonClass} disabled={saving || loading || !customer || !device}><ClipboardPlus size={18} />{saving ? 'Guardando reparación…' : 'Crear orden de reparación'}</button></div>
      </form>
    </div>
  )
}
