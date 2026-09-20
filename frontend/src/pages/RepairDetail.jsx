import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, Pencil, Save, Send, Smartphone, UserRound, Wrench } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { REPAIR_STATUSES } from '../utils/constants.js'
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters.js'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import WhatsAppComposer from '../components/whatsapp/WhatsAppComposer.jsx'
import RepairFields, { RepairField } from '../components/repairs/RepairFields.jsx'
import { customerName, deviceName, repairButtonClass, repairFormPayload, repairFormValues, repairInputClass, repairSecondaryClass } from '../components/repairs/repairForm.js'

function DetailValue({ label, children }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">{children || 'Sin registrar'}</dd></div>
}

function RepairDetailContent({ orderNumber }) {
  const { profile, user } = useAuth()
  const location = useLocation()
  const [result, setResult] = useState({ data: null, history: [], revision: -1, error: '' })
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => repairFormValues())
  const [technicians, setTechnicians] = useState([])
  const [technicianError, setTechnicianError] = useState('')
  const [saving, setSaving] = useState('')
  const savingRef = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(location.state?.created ? 'Orden de reparación creada.' : '')
  const [nextStatus, setNextStatus] = useState('')
  const [note, setNote] = useState('')
  const [whatsappMessages, setWhatsappMessages] = useState([])
  const repair = result.data
  const loading = result.revision !== revision
  const canManage = ['OWNER', 'ADMINISTRADOR', 'RECEPCION'].includes(profile?.role)
  const canEdit = canManage || (profile?.role === 'TECNICO' && repair?.technician_id === (profile?.id ?? user?.id))
  const endpoint = `/repairs/${encodeURIComponent(orderNumber)}`

  useEffect(() => {
    let active = true
    api.get(endpoint).then((response) => {
      if (active) setResult({ ...response, revision, error: '' })
    }).catch((err) => {
      if (active) setResult({ data: null, history: [], revision, error: err.message })
    })
    return () => { active = false }
  }, [endpoint, revision])

  useEffect(() => {
    if (!repair?.id) return undefined
    let active = true
    api.get(`/whatsapp/messages?repair_order_id=${encodeURIComponent(repair.id)}`).then((response) => {
      if (active) setWhatsappMessages(response.data ?? [])
    }).catch(() => {})
    return () => { active = false }
  }, [repair?.id, revision])

  useEffect(() => {
    if (!canManage) return
    let active = true
    api.get('/technicians').then((response) => {
      if (active) setTechnicians(response.data)
    }).catch((err) => {
      if (active) setTechnicianError(`No se pudieron cargar los responsables: ${err.message}`)
    })
    return () => { active = false }
  }, [canManage])

  function beginEdit() {
    setForm(repairFormValues(repair))
    setError('')
    setNotice('')
    setEditing(true)
  }

  async function saveDetails(event) {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving('details')
    setError('')
    setNotice('')
    try {
      const response = await api.patch(endpoint, repairFormPayload(form, !canManage))
      setResult((previous) => ({ ...previous, data: { ...previous.data, ...response.data } }))
      setEditing(false)
      setNotice('Cambios guardados.')
    } catch (err) {
      setError(err.message)
    } finally {
      savingRef.current = false
      setSaving('')
    }
  }

  async function saveHistory(event) {
    event.preventDefault()
    if (savingRef.current) return
    const status = nextStatus || repair.status
    if (status === repair.status && !note.trim()) { setError('Escribe una nota o selecciona un estado diferente.'); return }
    savingRef.current = true
    setSaving('history')
    setError('')
    setNotice('')
    try {
      const response = await api.post(`${endpoint}/history`, { status, note: note.trim() || null })
      setResult((previous) => ({ ...previous, data: { ...previous.data, ...response.data } }))
      setNote('')
      setNextStatus('')
      setNotice('Actualización registrada en la bitácora.')
      try {
        const refreshed = await api.get(endpoint)
        setResult({ ...refreshed, revision, error: '' })
      } catch (refreshError) {
        setError(`El cambio se guardó, pero no se pudo actualizar la bitácora: ${refreshError.message}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      savingRef.current = false
      setSaving('')
    }
  }

  const back = <Link className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300" to="/reparaciones"><ArrowLeft size={16} /> Reparaciones</Link>
  if (loading) return <div className="space-y-6">{back}<p className="rounded-xl border border-slate-800 p-12 text-center text-sm text-slate-400">Cargando orden…</p></div>
  if (result.error || !repair) return <div className="space-y-6">{back}<div role="alert" className="space-y-4 rounded-xl border border-red-500/30 p-6"><p className="text-sm text-red-300">{result.error || 'No se encontró esta reparación.'}</p><button className={repairSecondaryClass} onClick={() => setRevision((value) => value + 1)}>Reintentar</button></div></div>

  return (
    <div className="space-y-6">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold tracking-tight">{repair.order_number}</h1><StatusBadge status={repair.status} /></div><p className="mt-2 text-sm text-slate-400">Recibido el {formatDate(repair.received_at)} · {repair.technician?.full_name || 'Sin responsable asignado'}</p></div><div className="flex flex-wrap gap-2"><WhatsAppComposer repair={repair} customer={repair.customer} onSent={(message) => setWhatsappMessages((previous) => [message, ...previous])} />{canEdit && !editing && <button className={repairSecondaryClass} disabled={Boolean(saving)} onClick={beginEdit}><Pencil size={16} /> {canManage ? 'Editar orden' : 'Editar diagnóstico'}</button>}</div></header>
      {notice && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</p>}
      {error && <div role="alert" className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"><p>{error}</p>{!editing && <button className="text-xs underline" disabled={Boolean(saving)} onClick={() => { setError(''); setRevision((value) => value + 1) }}>Actualizar datos de la orden</button>}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"><h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-400"><UserRound size={17} /> Cliente</h2><Link to={`/clientes?id=${encodeURIComponent(repair.customer_id)}`} className="font-semibold text-cyan-300 hover:underline">{customerName(repair.customer)}</Link><p className="mt-1 text-sm text-slate-400">{repair.customer?.phone || 'Sin teléfono'}</p>{repair.customer?.email && <p className="mt-1 break-all text-sm text-slate-500">{repair.customer.email}</p>}</section>
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"><h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-400"><Smartphone size={17} /> Equipo</h2>{repair.device_id ? <Link to={`/dispositivos?id=${encodeURIComponent(repair.device_id)}`} className="font-semibold text-cyan-300 hover:underline">{deviceName(repair.device ?? repair)}</Link> : <p className="font-semibold">{deviceName(repair)}</p>}<p className="mt-1 text-sm text-slate-400">IMEI: {repair.device?.imei || 'Sin registrar'}</p><p className="mt-1 text-sm text-slate-500">Serie: {repair.device?.serial_number || 'Sin registrar'}{repair.device?.color ? ` · ${repair.device.color}` : ''}</p></section>
      </div>
      {editing ? <form onSubmit={saveDetails} className="space-y-4"><RepairFields form={form} setForm={setForm} technicians={technicians} technicianError={technicianError} technicalOnly={!canManage} disabled={Boolean(saving)} /><div className="flex justify-end gap-3"><button type="button" className={repairSecondaryClass} disabled={Boolean(saving)} onClick={() => { setEditing(false); setError('') }}>Cancelar</button><button className={repairButtonClass} disabled={Boolean(saving)}><Save size={16} />{saving === 'details' ? 'Guardando…' : 'Guardar cambios'}</button></div></form> : <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(290px,0.6fr)]">
        <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/40 p-5"><h2 className="flex items-center gap-2 font-semibold"><Wrench size={18} className="text-cyan-400" /> Recepción y diagnóstico</h2><dl className="grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><DetailValue label="Problema reportado">{repair.reported_problem}</DetailValue></div><DetailValue label="Síntomas">{repair.symptoms}</DetailValue><DetailValue label="Estado físico">{repair.physical_condition}</DetailValue><DetailValue label="Accesorios recibidos">{repair.accessories_received}</DetailValue><DetailValue label="Daño por líquido / golpes">{`${repair.is_water_damaged ? 'Con daño por líquido' : 'Sin daño por líquido reportado'} · ${repair.is_dropped ? 'Con golpes o caída' : 'Sin golpes reportados'}`}</DetailValue>{Object.entries({ powers_on: 'Enciende', charges: 'Carga', displays_image: 'Muestra imagen', touch_works: 'Funciona el táctil' }).map(([key, label]) => <DetailValue key={key} label={label}>{repair[key] == null ? 'Sin revisar' : repair[key] ? 'Sí' : 'No'}</DetailValue>)}<div className="sm:col-span-2"><DetailValue label="Diagnóstico inicial">{repair.initial_diagnosis}</DetailValue></div><div className="sm:col-span-2"><DetailValue label="Notas internas">{repair.internal_notes}</DetailValue></div></dl></section>
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"><h2 className="mb-5 font-semibold">Estimación y seguimiento</h2><dl className="space-y-5"><DetailValue label="Costo estimado"><span className="text-2xl font-semibold text-slate-100">{formatCurrency(repair.estimated_cost)}</span></DetailValue><DetailValue label="Anticipo registrado">{formatCurrency(repair.deposit)}</DetailValue><DetailValue label="Entrega estimada">{formatDateTime(repair.estimated_delivery_at)}</DetailValue><DetailValue label="Responsable">{repair.technician?.full_name || 'Sin asignar'}</DetailValue><DetailValue label="Última actualización">{formatDateTime(repair.updated_at)}</DetailValue></dl></section>
      </div>}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Clock3 size={18} className="text-cyan-400" /> Bitácora de la reparación</h2><button className="text-xs text-slate-400 hover:text-cyan-300 disabled:opacity-50" disabled={Boolean(saving) || editing} onClick={() => setRevision((value) => value + 1)}>Actualizar bitácora</button></div>
        {canEdit && <form onSubmit={saveHistory} className="mb-6 space-y-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4"><fieldset disabled={Boolean(saving) || editing} className="grid gap-4 sm:grid-cols-[240px_minmax(0,1fr)]"><RepairField label="Estado"><select className={repairInputClass} value={nextStatus || repair.status} onChange={(event) => setNextStatus(event.target.value)}>{Object.entries(REPAIR_STATUSES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></RepairField><RepairField label="Nota de seguimiento"><textarea className={repairInputClass} rows={2} maxLength={10000} placeholder="Qué se revisó, trabajo realizado o motivo del cambio…" value={note} onChange={(event) => setNote(event.target.value)} /></RepairField></fieldset><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{editing ? 'Guarda o cancela la edición antes de actualizar el estado.' : 'Puedes agregar una nota conservando el estado actual.'}</p><button className={repairButtonClass} disabled={Boolean(saving) || editing || ((!nextStatus || nextStatus === repair.status) && !note.trim())}><Send size={15} />{saving === 'history' ? 'Registrando…' : 'Registrar actualización'}</button></div></form>}
        {result.history.length === 0 ? <p className="py-4 text-sm text-slate-500">Aún no hay movimientos en la bitácora.</p> : <ol className="space-y-5 border-l border-slate-700 pl-5">{result.history.map((entry) => <li key={entry.id} className="relative"><span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-cyan-400" /><div className="flex flex-wrap items-center gap-2"><StatusBadge status={entry.status} /><time className="text-xs text-slate-500" dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></div>{entry.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-300">{entry.note}</p>}<p className="mt-1 text-xs text-slate-500">{entry.user?.full_name || 'Usuario no disponible'}</p></li>)}</ol>}
      </section>
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-4 font-semibold">Historial de WhatsApp</h2>
        {whatsappMessages.length === 0 ? <p className="text-sm text-slate-500">Aún no hay mensajes asociados a esta orden.</p> : <div className="space-y-3">{whatsappMessages.map((message) => <article key={message.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-400">{formatDateTime(message.created_at)}</span><span className={`text-xs font-medium ${message.status === 'failed' ? 'text-red-300' : message.status === 'read' ? 'text-cyan-300' : 'text-emerald-300'}`}>{message.status === 'failed' ? 'Error' : message.status === 'read' ? 'Leído' : message.status === 'delivered' ? 'Entregado' : message.status === 'sent' ? 'Enviado' : 'Pendiente'}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{message.message}</p>{message.error_message && <p className="mt-2 text-xs text-red-300">{message.error_message}</p>}</article>)}</div>}
      </section>
    </div>
  )
}

export default function RepairDetail() {
  const { orderNumber } = useParams()
  return <RepairDetailContent key={orderNumber} orderNumber={orderNumber} />
}
