import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Archive, Pencil, Plus, Smartphone, Users } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Badge, Button, ConfirmDialog, DataCard, EmptyState, SearchField, TableSkeleton } from '../components/ui/DesignSystem.jsx'
import { useToast } from '../hooks/useToast.js'
import { friendlyError } from '../utils/errors.js'

const WHATSAPP_STATUS = { queued: 'En cola', sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'Falló', simulated: 'Simulado' }
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { useDebouncedValue, useDirectoryRecords } from '../hooks/useDirectoryRecords.js'
import { formatDate } from '../utils/formatters.js'
import {
  DirectoryFacts, DirectoryField, DirectoryLoading, DirectoryMessage, DirectoryModal,
  DirectoryPagination, DirectoryRepairHistory, directoryButtonClass, directoryPrimaryClass,
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
  const [confirmArchive, setConfirmArchive] = useState(false)
  const toast = useToast()
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
      toast.success(editor?.id ? 'Datos del cliente actualizados.' : 'Cliente registrado.')
      setEditor(null)
      setForm(EMPTY_CUSTOMER)
      setParams({ id: response.data.id }, { replace: true })
      listing.reload()
      detail.reload()
    } catch (error) {
      setFormError(friendlyError(error, 'guardar el cliente'))
    } finally {
      mutationLock.current = false
      setSaving(false)
    }
  }

  async function archiveCustomer() {
    if (mutationLock.current || !isAdmin || !customer) return
    mutationLock.current = true
    setSaving(true)
    setFormError('')
    try {
      await api.delete(`/customers/${customer.id}`)
      setConfirmArchive(false)
      toast.success(`${customer.first_name} ${customer.last_name} se archivó. Su historial se conserva.`)
      setParams({}, { replace: true })
      setPage(1)
      listing.reload()
    } catch (error) {
      setConfirmArchive(false)
      setFormError(friendlyError(error, 'archivar al cliente'))
    } finally {
      mutationLock.current = false
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Clientes" description="Contactos, equipos e historial de atención del taller."
        actions={canEdit && <Button variant="primary" icon={Plus} onClick={() => openEditor()}>Nuevo cliente</Button>} />
      <DirectoryMessage>{notice}</DirectoryMessage>
      <DataCard
        toolbar={<SearchField label="Buscar clientes" value={query} onChange={(value) => { setQuery(value); setPage(1) }} placeholder="Nombre, teléfono o correo" />}
        footer={!listing.error && listing.payload?.count > 0 && <DirectoryPagination page={page} limit={PAGE_SIZE} count={listing.payload?.count ?? 0} onPage={setPage} disabled={listing.loading} />}>
        {listing.loading ? <TableSkeleton columns={4} rows={6} />
          : listing.error ? <div className="p-4"><Alert tone="error" action={<Button size="sm" onClick={listing.reload}>Reintentar</Button>}>{listing.error}</Alert></div>
            : !listing.payload?.data?.length ? <EmptyState icon={Users} title={query ? 'No encontramos clientes' : 'Todavía no hay clientes'}
                description={query ? 'Prueba con otro nombre o teléfono.' : 'Registra a tu primer cliente para asociar sus equipos y reparaciones.'}
                action={!query && canEdit && <Button variant="primary" icon={Plus} onClick={() => openEditor()}>Nuevo cliente</Button>} />
              : (
                <div className="ct-table-shell">
                  <table className="ct-table min-w-[40rem]">
                    <thead><tr><th scope="col">Cliente</th><th scope="col">Teléfono</th><th scope="col">Correo</th><th scope="col">Cliente desde</th>{canEdit && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
                    <tbody>
                      {listing.payload.data.map((record) => (
                        <tr key={record.id}>
                          <td><button type="button" onClick={() => { setNotice(''); setFormError(''); setParams({ id: record.id }) }} className="text-left font-medium text-[var(--tf-text)] hover:text-[var(--tf-link)]">{record.first_name} {record.last_name}</button></td>
                          <td className="tf-num whitespace-nowrap">{record.phone}</td>
                          <td className="max-w-[16rem] truncate">{record.email || <span className="text-[var(--tf-text-subtle)]">Sin correo</span>}</td>
                          <td className="whitespace-nowrap">{formatDate(record.created_at)}</td>
                          {canEdit && <td className="text-right"><button type="button" onClick={() => openEditor(record)} className="tf-icon-btn" aria-label={`Editar a ${record.first_name} ${record.last_name}`} title="Editar"><Pencil size={15} /></button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
      </DataCard>

      {editing ? <DirectoryModal title={editor?.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={closePanel} busy={saving}>
        <form onSubmit={saveCustomer} className="space-y-5">
          <DirectoryMessage error>{formError}</DirectoryMessage>
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
            <DirectoryField label="Nombre" name="first_name" value={form.first_name} onChange={changeField} required maxLength={100} autoComplete="given-name" />
            <DirectoryField label="Apellidos" name="last_name" value={form.last_name} onChange={changeField} required maxLength={100} autoComplete="family-name" />
            <DirectoryField label="Teléfono" name="phone" value={form.phone} onChange={changeField} required type="tel" maxLength={30} autoComplete="tel" />
            <DirectoryField label="WhatsApp" name="whatsapp" value={form.whatsapp} onChange={changeField} type="tel" maxLength={30} />
            <label className="flex items-center gap-3 rounded-[var(--tf-radius-control)] border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] px-3 py-2.5 text-[0.8125rem] text-[var(--tf-text-muted)] sm:col-span-2"><input type="checkbox" checked={Boolean(form.whatsapp_opt_in)} onChange={(event) => changeField('whatsapp_opt_in', event.target.checked)} className="h-4 w-4 accent-[var(--tf-primary)]" />El cliente acepta recibir actualizaciones de su reparación por WhatsApp</label>
            <DirectoryField label="Correo electrónico" name="email" value={form.email} onChange={changeField} type="email" maxLength={254} autoComplete="email" />
            <DirectoryField label="Notas" name="notes" value={form.notes} onChange={changeField} textarea maxLength={5000} />
          </fieldset>
          <div className="flex justify-end gap-3"><button type="button" onClick={closePanel} disabled={saving} className={directoryButtonClass}>Cancelar</button><button type="submit" disabled={saving} className={directoryPrimaryClass}>{saving ? 'Guardando…' : 'Guardar cliente'}</button></div>
        </form>
      </DirectoryModal> : selectedId && <DirectoryModal title={customer ? `${customer.first_name} ${customer.last_name}` : 'Detalle del cliente'} onClose={closePanel} busy={saving}>
        <DirectoryMessage>{notice}</DirectoryMessage><DirectoryMessage error>{formError || detail.error}</DirectoryMessage>
        {detail.loading ? <DirectoryLoading /> : customer ? <>
          <DirectoryFacts items={[[ 'Teléfono', customer.phone ], [ 'WhatsApp', customer.whatsapp_e164 || customer.whatsapp ], [ 'Consentimiento WhatsApp', customer.whatsapp_opt_in ? 'Autorizado' : 'No autorizado' ], [ 'Correo electrónico', customer.email ], [ 'Cliente desde', formatDate(customer.created_at) ], [ 'Notas', customer.notes ]]} />
          {canEdit && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openEditor(customer)} disabled={saving} className={directoryButtonClass}><Pencil size={16} />Editar</button><Link to={`/reparaciones/nueva?customer_id=${customer.id}`} className={directoryPrimaryClass}><Plus size={16} />Nueva reparación</Link>{isAdmin && <button type="button" onClick={() => setConfirmArchive(true)} disabled={saving} className="ct-btn ct-btn-danger"><Archive size={15} />Archivar</button>}</div>}
          <section className="space-y-3 border-t border-[var(--tf-border)] pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Equipos del cliente</h3>{canEdit && <Link to={`/dispositivos?customer_id=${customer.id}&new=1`} className="tf-link">Registrar equipo</Link>}</div>
            {!detail.payload.devices?.length ? <p className="text-[0.8125rem] text-[var(--tf-text-muted)]">Todavía no hay equipos registrados.</p> : <ul className="grid gap-2 sm:grid-cols-2">{detail.payload.devices.map((device) => <li key={device.id}><Link to={`/dispositivos?id=${device.id}`} className="flex h-full items-start gap-3 rounded-[var(--tf-radius-control)] border border-[var(--tf-border)] p-3 transition-colors hover:border-[var(--tf-border-strong)] hover:bg-[rgba(148,163,184,.04)]"><Smartphone size={17} className="mt-0.5 shrink-0 text-[var(--tf-text-subtle)]" /><div><p className="text-sm text-[var(--tf-text)]">{device.brand} {device.model}</p><p className="tf-num mt-1 break-all text-xs text-[var(--tf-text-subtle)]">{device.imei ? `IMEI: ${device.imei}` : device.serial_number ? `Serie: ${device.serial_number}` : 'Sin identificador'}</p></div></Link></li>)}</ul>}
          </section>
          <section className="space-y-3 border-t border-[var(--tf-border)] pt-5"><h3 className="text-sm font-semibold">Mensajes de WhatsApp</h3>{whatsappHistory.loading ? <p className="text-[0.8125rem] text-[var(--tf-text-muted)]">Cargando mensajes…</p> : !whatsappHistory.payload?.data?.length ? <p className="text-[0.8125rem] text-[var(--tf-text-muted)]">Todavía no hay mensajes enviados a este cliente.</p> : <ul className="space-y-2">{whatsappHistory.payload.data.map((message) => <li key={message.id} className="rounded-[var(--tf-radius-control)] border border-[var(--tf-border)] p-3"><div className="flex items-center justify-between gap-2 text-xs text-[var(--tf-text-subtle)]"><span>{formatDate(message.created_at)}</span><Badge tone={message.status === 'failed' ? 'danger' : message.status === 'read' || message.status === 'delivered' ? 'success' : 'neutral'}>{WHATSAPP_STATUS[message.status] ?? message.status}</Badge></div><p className="mt-2 text-[0.8125rem] text-[var(--tf-text-muted)]">{message.message}</p></li>)}</ul>}</section>
          <DirectoryRepairHistory repairs={detail.payload.repairs} />
        </> : detail.error && <button type="button" onClick={detail.reload} className={directoryButtonClass}>Reintentar</button>}
      </DirectoryModal>}
      <ConfirmDialog open={confirmArchive} title="¿Archivar a este cliente?" busy={saving} confirmLabel="Archivar cliente"
        description={customer ? `${customer.first_name} ${customer.last_name} dejará de aparecer en la lista de clientes activos. Sus equipos y su historial de reparaciones se conservan.` : ''}
        onConfirm={archiveCustomer} onCancel={() => setConfirmArchive(false)} />
    </div>
  )
}
