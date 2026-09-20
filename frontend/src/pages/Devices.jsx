import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Archive, Filter, Pencil, Plus, Search, Smartphone, X } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { useDebouncedValue, useDirectoryRecords } from '../hooks/useDirectoryRecords.js'
import { formatDate } from '../utils/formatters.js'
import DirectoryCustomerPicker from '../components/ui/DirectoryCustomerPicker.jsx'
import {
  DirectoryFacts, DirectoryField, DirectoryLoading, DirectoryMessage, DirectoryModal,
  DirectoryPagination, DirectoryRepairHistory, directoryButtonClass, directoryInputClass, directoryPrimaryClass,
} from '../components/ui/DirectoryUi.jsx'

const EMPTY_DEVICE = { customer_id: '', brand: '', model: '', color: '', imei: '', serial_number: '', os: '', physical_condition: '', accessories_received: '', notes: '' }
const PAGE_SIZE = 12

export default function Devices() {
  const { profile } = useAuth()
  const canEdit = ['OWNER', 'ADMINISTRADOR', 'RECEPCION'].includes(profile?.role)
  const isAdmin = ['OWNER', 'ADMINISTRADOR'].includes(profile?.role)
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const filterId = params.get('customer_id') || ''
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [showFilter, setShowFilter] = useState(false)
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY_DEVICE)
  const [chosenCustomer, setChosenCustomer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const mutationLock = useRef(false)
  const debouncedQuery = useDebouncedValue(query)
  const listing = useDirectoryRecords(`/devices?${new URLSearchParams({ q: debouncedQuery, page: String(page), limit: String(PAGE_SIZE), ...(filterId ? { customer_id: filterId } : {}) })}`)
  const detail = useDirectoryRecords(selectedId ? `/devices/${encodeURIComponent(selectedId)}` : null)
  const linkedCustomer = useDirectoryRecords(filterId ? `/customers/${encodeURIComponent(filterId)}` : null)
  const device = detail.payload?.data
  const creatingFromLink = canEdit && (params.get('new') === '1' || params.get('nuevo') === '1')
  const editing = editor !== null || creatingFromLink
  const selectedCustomerId = form.customer_id || (creatingFromLink ? filterId : '')
  const selectedCustomer = chosenCustomer?.id === selectedCustomerId ? chosenCustomer : linkedCustomer.payload?.data?.id === selectedCustomerId ? linkedCustomer.payload.data : null

  function changeField(name, value) { setForm((previous) => ({ ...previous, [name]: value })) }

  function closePanel() {
    if (mutationLock.current) return
    setEditor(null)
    setForm(EMPTY_DEVICE)
    setChosenCustomer(null)
    setFormError('')
    setParams(filterId ? { customer_id: filterId } : {}, { replace: true })
  }

  function openEditor(record = null) {
    setNotice('')
    setFormError('')
    setEditor(record || {})
    setForm(Object.fromEntries(Object.keys(EMPTY_DEVICE).map((key) => [key, record?.[key] ?? (key === 'customer_id' ? filterId : '')])))
    setChosenCustomer(record?.customer || linkedCustomer.payload?.data || null)
  }

  async function saveDevice(event) {
    event.preventDefault()
    if (mutationLock.current || !canEdit) return
    const body = Object.fromEntries(Object.entries({ ...form, customer_id: selectedCustomerId }).map(([key, value]) => [key, value.trim() || null]))
    if (!body.customer_id || !body.brand || !body.model) {
      setFormError('Selecciona un cliente y completa la marca y el modelo del equipo.')
      return
    }
    mutationLock.current = true
    setSaving(true)
    setFormError('')
    try {
      const response = editor?.id ? await api.patch(`/devices/${editor.id}`, body) : await api.post('/devices', body)
      setNotice(editor?.id ? 'Datos del equipo actualizados.' : 'Equipo registrado correctamente.')
      setEditor(null)
      setForm(EMPTY_DEVICE)
      setChosenCustomer(null)
      setParams({ ...(filterId ? { customer_id: filterId } : {}), id: response.data.id }, { replace: true })
      listing.reload()
      detail.reload()
    } catch (error) {
      setFormError(error.message)
    } finally {
      mutationLock.current = false
      setSaving(false)
    }
  }

  async function archiveDevice() {
    if (mutationLock.current || !isAdmin || !device) return
    if (!window.confirm(`¿Archivar el equipo ${device.brand} ${device.model}? Dejará de aparecer en el listado de equipos activos. Su historial se conservará.`)) return
    mutationLock.current = true
    setSaving(true)
    setFormError('')
    try {
      await api.delete(`/devices/${device.id}`)
      setNotice('Equipo archivado correctamente.')
      setParams(filterId ? { customer_id: filterId } : {}, { replace: true })
      setPage(1)
      listing.reload()
    } catch (error) {
      setFormError(error.message)
    } finally {
      mutationLock.current = false
      setSaving(false)
    }
  }

  return (
    <div className="ct-page space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Smartphone className="text-cyan-400" />Dispositivos</h1><p className="mt-1 text-sm text-slate-400">Equipos de tus clientes y su historial de reparaciones.</p></div>{canEdit && <button type="button" onClick={() => openEditor()} className={directoryPrimaryClass}><Plus size={18} />Nuevo equipo</button>}</div>
      <DirectoryMessage>{notice}</DirectoryMessage>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="space-y-3 border-b border-slate-800 p-4">
          <div className="flex flex-col gap-3 sm:flex-row"><div className="relative grow"><label htmlFor="device-search" className="sr-only">Buscar dispositivos</label><Search size={18} className="pointer-events-none absolute left-3 top-3 text-slate-500" /><input id="device-search" type="search" maxLength={100} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Buscar marca, modelo, IMEI o serie…" className={`${directoryInputClass} pl-10`} /></div><button type="button" aria-expanded={showFilter} aria-controls="device-customer-filter" onClick={() => setShowFilter((value) => !value)} className={directoryButtonClass}><Filter size={16} />Filtrar por cliente</button></div>
          {filterId && <div className="flex items-center gap-2 text-sm text-cyan-300"><span>{linkedCustomer.payload?.data ? `${linkedCustomer.payload.data.first_name} ${linkedCustomer.payload.data.last_name}` : 'Filtro de cliente activo'}</span><button type="button" aria-label="Quitar filtro de cliente" onClick={() => { setParams({}); setPage(1) }} className="rounded p-1 hover:bg-slate-800"><X size={16} /></button></div>}
          {showFilter && <div id="device-customer-filter"><DirectoryCustomerPicker label="Filtrar equipos por cliente" value={filterId} selectedCustomer={linkedCustomer.payload?.data} onChange={(record) => { setParams({ customer_id: record.id }); setPage(1); setShowFilter(false) }} /></div>}
          <DirectoryMessage error>{linkedCustomer.error}</DirectoryMessage>
        </div>
        {listing.loading ? <DirectoryLoading /> : listing.error ? <div className="space-y-3 p-4"><DirectoryMessage error>{listing.error}</DirectoryMessage><button type="button" onClick={listing.reload} className={directoryButtonClass}>Reintentar</button></div> : !listing.payload?.data?.length ? <div className="p-10 text-center"><Smartphone size={32} className="mx-auto mb-3 text-slate-600" /><p className="font-medium text-slate-300">{query || filterId ? 'No se encontraron equipos' : 'Todavía no hay equipos'}</p><p className="mt-1 text-sm text-slate-500">{query || filterId ? 'Prueba otra búsqueda o cambia el filtro de cliente.' : 'Registra un equipo y asígnalo a su cliente.'}</p></div> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{listing.payload.data.map((record) => <article key={record.id} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <button type="button" onClick={() => { setNotice(''); setFormError(''); setParams({ ...(filterId ? { customer_id: filterId } : {}), id: record.id }) }} className="text-left font-semibold text-white hover:text-cyan-300">{record.brand} {record.model}</button>
          <p className="mt-2 truncate text-sm text-slate-300">{record.customer ? `${record.customer.first_name} ${record.customer.last_name}` : 'Cliente registrado'}</p><p className="mt-1 break-all text-xs text-slate-500">{record.imei ? `IMEI: ${record.imei}` : record.serial_number ? `Serie: ${record.serial_number}` : 'Sin IMEI ni serie registrados'}</p>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { setNotice(''); setFormError(''); setParams({ ...(filterId ? { customer_id: filterId } : {}), id: record.id }) }} className={directoryButtonClass}>Ver historial</button>{canEdit && <button type="button" onClick={() => openEditor(record)} className={directoryButtonClass}><Pencil size={14} />Editar</button>}</div>
        </article>)}</div>}
        {!listing.error && <DirectoryPagination page={page} limit={PAGE_SIZE} count={listing.payload?.count ?? 0} onPage={setPage} disabled={listing.loading} />}
      </div>

      {editing ? <DirectoryModal title={editor?.id ? 'Editar equipo' : 'Nuevo equipo'} onClose={closePanel} busy={saving}>
        <form onSubmit={saveDevice} className="space-y-5"><p className="text-xs text-slate-400">Los campos con * son obligatorios.</p><DirectoryMessage error>{formError || (creatingFromLink ? linkedCustomer.error : '')}</DirectoryMessage>
          <DirectoryCustomerPicker value={selectedCustomerId} selectedCustomer={selectedCustomer} disabled={saving} onChange={(record) => { changeField('customer_id', record.id); setChosenCustomer(record) }} />
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
            <DirectoryField label="Marca" name="brand" value={form.brand} onChange={changeField} required maxLength={100} placeholder="Ej. Samsung" />
            <DirectoryField label="Modelo" name="model" value={form.model} onChange={changeField} required maxLength={150} placeholder="Ej. Galaxy A54" />
            <DirectoryField label="Color" name="color" value={form.color} onChange={changeField} maxLength={100} />
            <DirectoryField label="IMEI" name="imei" value={form.imei} onChange={changeField} maxLength={30} inputMode="numeric" />
            <DirectoryField label="Número de serie" name="serial_number" value={form.serial_number} onChange={changeField} maxLength={100} />
            <DirectoryField label="Sistema operativo" name="os" value={form.os} onChange={changeField} maxLength={100} placeholder="Ej. Android 14" />
            <DirectoryField label="Estado físico" name="physical_condition" value={form.physical_condition} onChange={changeField} textarea maxLength={5000} placeholder="Pantalla, carcasa, golpes o rayones visibles…" />
            <DirectoryField label="Accesorios recibidos" name="accessories_received" value={form.accessories_received} onChange={changeField} textarea maxLength={2000} placeholder="Cargador, funda, tarjeta SIM…" />
            <DirectoryField label="Notas" name="notes" value={form.notes} onChange={changeField} textarea maxLength={5000} />
          </fieldset>
          <div className="flex justify-end gap-3"><button type="button" onClick={closePanel} disabled={saving} className={directoryButtonClass}>Cancelar</button><button type="submit" disabled={saving} className={directoryPrimaryClass}>{saving ? 'Guardando…' : 'Guardar equipo'}</button></div>
        </form>
      </DirectoryModal> : selectedId && <DirectoryModal title={device ? `${device.brand} ${device.model}` : 'Detalle del equipo'} onClose={closePanel} busy={saving}>
        <DirectoryMessage>{notice}</DirectoryMessage><DirectoryMessage error>{formError || detail.error}</DirectoryMessage>
        {detail.loading ? <DirectoryLoading /> : device ? <>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Cliente</p><Link to={`/clientes?id=${device.customer_id}`} className="mt-1 inline-block text-sm text-cyan-300 hover:underline">{device.customer ? `${device.customer.first_name} ${device.customer.last_name}` : 'Ver cliente'}</Link>{device.customer?.phone && <p className="mt-1 text-sm text-slate-400">{device.customer.phone}</p>}</div>
          <DirectoryFacts items={[[ 'Color', device.color ], [ 'IMEI', device.imei ], [ 'Número de serie', device.serial_number ], [ 'Sistema operativo', device.os ], [ 'Estado físico', device.physical_condition ], [ 'Accesorios recibidos', device.accessories_received ], [ 'Notas', device.notes ], [ 'Fecha de registro', formatDate(device.created_at) ]]} />
          {canEdit && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openEditor(device)} disabled={saving} className={directoryButtonClass}><Pencil size={16} />Editar</button><Link to={`/reparaciones/nueva?customer_id=${device.customer_id}&device_id=${device.id}`} className={directoryPrimaryClass}><Plus size={16} />Nueva reparación</Link>{isAdmin && <button type="button" onClick={archiveDevice} disabled={saving} className={`${directoryButtonClass} text-red-300`}><Archive size={16} />{saving ? 'Archivando…' : 'Archivar'}</button>}</div>}
          <DirectoryRepairHistory repairs={detail.payload.repairs} />
        </> : detail.error && <button type="button" onClick={detail.reload} className={directoryButtonClass}>Reintentar</button>}
      </DirectoryModal>}
    </div>
  )
}
