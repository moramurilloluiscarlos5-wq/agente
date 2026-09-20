import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Archive, Pencil, Plus, Search, Smartphone, Users } from 'lucide-react'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { useDebouncedValue, useDirectoryRecords } from '../hooks/useDirectoryRecords.js'
import { formatDate } from '../utils/formatters.js'
import {
  DirectoryFacts, DirectoryField, DirectoryLoading, DirectoryMessage, DirectoryModal,
  DirectoryPagination, DirectoryRepairHistory, directoryButtonClass, directoryInputClass, directoryPrimaryClass,
} from '../components/ui/DirectoryUi.jsx'

const EMPTY_CUSTOMER = { first_name: '', last_name: '', phone: '', whatsapp: '', whatsapp_opt_in: false, email: '', notes: '' }
const PAGE_SIZE = 12

export default function Customers() {
  const { profile } = useAuth()
  const canEdit = ['OWNER', 'ADMINISTRADOR', 'RECEPCION'].includes(profile?.role)
  const isAdmin = ['OWNER', 'ADMINISTRADOR'].includes(profile?.role)
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(EMPTY_CUSTOMER)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const mutationLock = useRef(false)
  const debouncedQuery = useDebouncedValue(query)
  const listing = useDirectoryRecords(`/customers?${new URLSearchParams({ q: debouncedQuery, page: String(page), limit: String(PAGE_SIZE) })}`)
  const detail = useDirectoryRecords(selectedId ? `/customers/${encodeURIComponent(selectedId)}` : null)
  const whatsappHistory = useDirectoryRecords(selectedId ? `/whatsapp/messages?customer_id=${encodeURIComponent(selectedId)}` : null)
  const customer = detail.payload?.data
  const creatingFromLink = canEdit && (params.get('new') === '1' || params.get('nuevo') === '1')
  const editing = editor !== null || creatingFromLink

  function changeField(name, value) { setForm((previous) => ({ ...previous, [name]: value })) }

  function closePanel() {
    if (mutationLock.current) return
    setEditor(null)
    setForm(EMPTY_CUSTOMER)
    setFormError('')
    setParams({}, { replace: true })
  }

  function openEditor(record = null) {
    setNotice('')
    setFormError('')
    setEditor(record || {})
    setForm(Object.fromEntries(Object.keys(EMPTY_CUSTOMER).map((key) => [key, record?.[key] ?? ''])))
  }

  async function saveCustomer(event) {
    event.preventDefault()
    if (mutationLock.current || !canEdit) return
    const body = Object.fromEntries(Object.entries(form).filter(([key]) => key !== 'whatsapp_opt_in').map(([key, value]) => [key, typeof value === 'string' ? (value.trim() || null) : value]))
    if (!body.first_name || !body.last_name || !body.phone) {
      setFormError('Completa nombre, apellidos y teléfono.')
      return
    }
    if (body.phone.replace(/\D/g, '').length < 7 || (body.whatsapp && body.whatsapp.replace(/\D/g, '').length < 7)) {
      setFormError('El teléfono y WhatsApp deben contener al menos 7 dígitos.')
      return
    }
    mutationLock.current = true
    setSaving(true)
    setFormError('')
    try {
      const response = editor?.id ? await api.patch(`/customers/${editor.id}`, body) : await api.post('/customers', body)
      await api.patch(`/whatsapp/customers/${response.data.id}/consent`, { whatsapp_opt_in: Boolean(form.whatsapp_opt_in), whatsapp: body.whatsapp, phone: body.phone, source: 'customer_editor' })
      setNotice(editor?.id ? 'Datos del cliente actualizados.' : 'Cliente registrado correctamente.')
      setEditor(null)
      setForm(EMPTY_CUSTOMER)
      setParams({ id: response.data.id }, { replace: true })
      listing.reload()
      detail.reload()
    } catch (error) {
      setFormError(error.message)
    } finally {
      mutationLock.current = false
      setSaving(false)
    }
  }

  async function archiveCustomer() {
    if (mutationLock.current || !isAdmin || !customer) return
    if (!window.confirm(`¿Archivar a ${customer.first_name} ${customer.last_name}? Dejará de aparecer en el listado de clientes activos. Su historial se conservará.`)) return
    mutationLock.current = true
    setSaving(true)
    setFormError('')
    try {
      await api.delete(`/customers/${customer.id}`)
      setNotice('Cliente archivado correctamente.')
      setParams({}, { replace: true })
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
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Users className="text-cyan-400" />Clientes</h1><p className="mt-1 text-sm text-slate-400">Contactos, equipos e historial de atención del taller.</p></div>
        {canEdit && <button type="button" onClick={() => openEditor()} className={directoryPrimaryClass}><Plus size={18} />Nuevo cliente</button>}
      </div>
      <DirectoryMessage>{notice}</DirectoryMessage>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="border-b border-slate-800 p-4"><label htmlFor="customer-search" className="sr-only">Buscar clientes</label><div className="relative"><Search size={18} className="pointer-events-none absolute left-3 top-3 text-slate-500" /><input id="customer-search" type="search" maxLength={100} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Buscar por nombre, teléfono o correo…" className={`${directoryInputClass} pl-10`} /></div></div>
        {listing.loading ? <DirectoryLoading /> : listing.error ? <div className="space-y-3 p-4"><DirectoryMessage error>{listing.error}</DirectoryMessage><button type="button" onClick={listing.reload} className={directoryButtonClass}>Reintentar</button></div> : !listing.payload?.data?.length ? <div className="p-10 text-center"><Users size={32} className="mx-auto mb-3 text-slate-600" /><p className="font-medium text-slate-300">{query ? 'No se encontraron clientes' : 'Todavía no hay clientes'}</p><p className="mt-1 text-sm text-slate-500">{query ? 'Prueba con otro nombre o teléfono.' : 'Registra el primer cliente para asociar sus equipos y reparaciones.'}</p></div> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{listing.payload.data.map((record) => <article key={record.id} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <button type="button" onClick={() => { setNotice(''); setFormError(''); setParams({ id: record.id }) }} className="text-left font-semibold text-white hover:text-cyan-300">{record.first_name} {record.last_name}</button>
          <p className="mt-2 text-sm text-slate-300">{record.phone}</p><p className="mt-1 truncate text-sm text-slate-500">{record.email || 'Sin correo registrado'}</p>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { setNotice(''); setFormError(''); setParams({ id: record.id }) }} className={directoryButtonClass}>Ver historial</button>{canEdit && <button type="button" onClick={() => openEditor(record)} className={directoryButtonClass}><Pencil size={14} />Editar</button>}</div>
        </article>)}</div>}
        {!listing.error && <DirectoryPagination page={page} limit={PAGE_SIZE} count={listing.payload?.count ?? 0} onPage={setPage} disabled={listing.loading} />}
      </div>

      {editing ? <DirectoryModal title={editor?.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={closePanel} busy={saving}>
        <form onSubmit={saveCustomer} className="space-y-5">
          <p className="text-xs text-slate-400">Los campos con * son obligatorios.</p><DirectoryMessage error>{formError}</DirectoryMessage>
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
            <DirectoryField label="Nombre" name="first_name" value={form.first_name} onChange={changeField} required maxLength={100} autoComplete="given-name" />
            <DirectoryField label="Apellidos" name="last_name" value={form.last_name} onChange={changeField} required maxLength={100} autoComplete="family-name" />
            <DirectoryField label="Teléfono" name="phone" value={form.phone} onChange={changeField} required type="tel" maxLength={30} autoComplete="tel" />
            <DirectoryField label="WhatsApp" name="whatsapp" value={form.whatsapp} onChange={changeField} type="tel" maxLength={30} />
            <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-300 sm:col-span-2"><input type="checkbox" checked={Boolean(form.whatsapp_opt_in)} onChange={(event) => changeField('whatsapp_opt_in', event.target.checked)} className="h-4 w-4 accent-cyan-500" />El cliente acepta recibir actualizaciones de su reparación por WhatsApp</label>
            <DirectoryField label="Correo electrónico" name="email" value={form.email} onChange={changeField} type="email" maxLength={254} autoComplete="email" />
            <DirectoryField label="Notas" name="notes" value={form.notes} onChange={changeField} textarea maxLength={5000} />
          </fieldset>
          <div className="flex justify-end gap-3"><button type="button" onClick={closePanel} disabled={saving} className={directoryButtonClass}>Cancelar</button><button type="submit" disabled={saving} className={directoryPrimaryClass}>{saving ? 'Guardando…' : 'Guardar cliente'}</button></div>
        </form>
      </DirectoryModal> : selectedId && <DirectoryModal title={customer ? `${customer.first_name} ${customer.last_name}` : 'Detalle del cliente'} onClose={closePanel} busy={saving}>
        <DirectoryMessage>{notice}</DirectoryMessage><DirectoryMessage error>{formError || detail.error}</DirectoryMessage>
        {detail.loading ? <DirectoryLoading /> : customer ? <>
          <DirectoryFacts items={[[ 'Teléfono', customer.phone ], [ 'WhatsApp', customer.whatsapp_e164 || customer.whatsapp ], [ 'Consentimiento WhatsApp', customer.whatsapp_opt_in ? 'Autorizado' : 'No autorizado' ], [ 'Correo electrónico', customer.email ], [ 'Cliente desde', formatDate(customer.created_at) ], [ 'Notas', customer.notes ]]} />
          {canEdit && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openEditor(customer)} disabled={saving} className={directoryButtonClass}><Pencil size={16} />Editar</button><Link to={`/reparaciones/nueva?customer_id=${customer.id}`} className={directoryPrimaryClass}><Plus size={16} />Nueva reparación</Link>{isAdmin && <button type="button" onClick={archiveCustomer} disabled={saving} className={`${directoryButtonClass} text-red-300`}><Archive size={16} />{saving ? 'Archivando…' : 'Archivar'}</button>}</div>}
          <section className="space-y-3 border-t border-slate-800 pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-white">Equipos del cliente</h3>{canEdit && <Link to={`/dispositivos?customer_id=${customer.id}&new=1`} className="text-sm text-cyan-300 hover:underline">Registrar equipo</Link>}</div>
            {!detail.payload.devices?.length ? <p className="text-sm text-slate-400">Todavía no hay equipos registrados.</p> : <ul className="grid gap-2 sm:grid-cols-2">{detail.payload.devices.map((device) => <li key={device.id}><Link to={`/dispositivos?id=${device.id}`} className="flex h-full items-start gap-3 rounded-xl border border-slate-800 p-3 hover:border-cyan-500/50"><Smartphone size={19} className="mt-0.5 shrink-0 text-cyan-400" /><div><p className="text-sm text-white">{device.brand} {device.model}</p><p className="mt-1 break-all text-xs text-slate-400">{device.imei ? `IMEI: ${device.imei}` : device.serial_number ? `Serie: ${device.serial_number}` : 'Sin identificador'}</p></div></Link></li>)}</ul>}
          </section>
          <section className="space-y-3 border-t border-slate-800 pt-5"><h3 className="font-semibold text-white">Historial de WhatsApp</h3>{whatsappHistory.loading ? <p className="text-sm text-slate-400">Cargando mensajes…</p> : !whatsappHistory.payload?.data?.length ? <p className="text-sm text-slate-400">Todavía no hay mensajes registrados.</p> : <ul className="space-y-2">{whatsappHistory.payload.data.map((message) => <li key={message.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{formatDate(message.created_at)}</span><span className={message.status === 'failed' ? 'text-red-300' : 'text-emerald-300'}>{message.status}</span></div><p className="mt-2 text-sm text-slate-300">{message.message}</p></li>)}</ul>}</section>
          <DirectoryRepairHistory repairs={detail.payload.repairs} />
        </> : detail.error && <button type="button" onClick={detail.reload} className={directoryButtonClass}>Reintentar</button>}
      </DirectoryModal>}
    </div>
  )
}
