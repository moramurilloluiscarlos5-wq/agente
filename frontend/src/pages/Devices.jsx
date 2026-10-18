import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Archive, Filter, Pencil, Plus, Smartphone, X } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { Alert, Button, ConfirmDialog, DataCard, EmptyState, SearchField, TableSkeleton } from '../components/ui/DesignSystem.jsx'
import { useToast } from '../hooks/useToast.js'
import { friendlyError } from '../utils/errors.js'
import { api } from '../services/api.js'
import { useAuth } from '../hooks/useAuth.js'
import { useDebouncedValue, useDirectoryRecords } from '../hooks/useDirectoryRecords.js'
import { formatDate } from '../utils/formatters.js'
import DirectoryCustomerPicker from '../components/ui/DirectoryCustomerPicker.jsx'
import {
  DirectoryFacts, DirectoryField, DirectoryLoading, DirectoryMessage, DirectoryModal,
  DirectoryPagination, DirectoryRepairHistory, directoryButtonClass, directoryPrimaryClass,
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
  const [confirmArchive, setConfirmArchive] = useState(false)
  const toast = useToast()
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
      toast.success(editor?.id ? 'Datos del equipo actualizados.' : 'Equipo registrado.')
      setEditor(null)
      setForm(EMPTY_DEVICE)
      setChosenCustomer(null)
      setParams({ ...(filterId ? { customer_id: filterId } : {}), id: response.data.id }, { replace: true })
      listing.reload()
      detail.reload()
    } catch (error) {
      setFormError(friendlyError(error, 'guardar el equipo'))
    } finally {
      mutationLock.current = false
      setSaving(false)
    }
  }

  async function archiveDevice() {
    if (mutationLock.current || !isAdmin || !device) return
    mutationLock.current = true
    setSaving(true)
    setFormError('')
    try {
      await api.delete(`/devices/${device.id}`)
      setConfirmArchive(false)
      toast.success(`${device.brand} ${device.model} se archivó. Su historial se conserva.`)
      setParams(filterId ? { customer_id: filterId } : {}, { replace: true })
      setPage(1)
      listing.reload()
    } catch (error) {
      setConfirmArchive(false)
      setFormError(friendlyError(error, 'archivar el equipo'))
    } finally {
      mutationLock.current = false
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Dispositivos" description="Equipos de tus clientes y su historial de reparaciones."
        actions={canEdit && <Button variant="primary" icon={Plus} onClick={() => openEditor()}>Nuevo equipo</Button>} />
      <DirectoryMessage>{notice}</DirectoryMessage>
      <DataCard
        toolbar={<div className="w-full space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchField label="Buscar dispositivos" value={query} onChange={(value) => { setQuery(value); setPage(1) }} placeholder="Marca, modelo, IMEI o serie" className="max-w-[22rem]" />
            <Button variant="secondary" icon={Filter} aria-expanded={showFilter} aria-controls="device-customer-filter" onClick={() => setShowFilter((value) => !value)}>Filtrar por cliente</Button>
            {filterId && <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--tf-border-strong)] py-1 pl-3 pr-1 text-[0.8125rem] text-[var(--tf-text)]">{linkedCustomer.payload?.data ? `${linkedCustomer.payload.data.first_name} ${linkedCustomer.payload.data.last_name}` : 'Cliente seleccionado'}<button type="button" aria-label="Quitar filtro de cliente" onClick={() => { setParams({}); setPage(1) }} className="tf-icon-btn h-6 w-6"><X size={13} /></button></span>}
          </div>
          {showFilter && <div id="device-customer-filter"><DirectoryCustomerPicker label="Filtrar equipos por cliente" value={filterId} selectedCustomer={linkedCustomer.payload?.data} onChange={(record) => { setParams({ customer_id: record.id }); setPage(1); setShowFilter(false) }} /></div>}
          <DirectoryMessage error>{linkedCustomer.error}</DirectoryMessage>
        </div>}
        footer={!listing.error && listing.payload?.count > 0 && <DirectoryPagination page={page} limit={PAGE_SIZE} count={listing.payload?.count ?? 0} onPage={setPage} disabled={listing.loading} />}>
        {listing.loading ? <TableSkeleton columns={4} rows={6} />
          : listing.error ? <div className="p-4"><Alert tone="error" action={<Button size="sm" onClick={listing.reload}>Reintentar</Button>}>{listing.error}</Alert></div>
            : !listing.payload?.data?.length ? <EmptyState icon={Smartphone} title={query || filterId ? 'No encontramos equipos' : 'Todavía no hay equipos'}
                description={query || filterId ? 'Prueba otra búsqueda o cambia el filtro de cliente.' : 'Registra un equipo y asígnalo a su cliente. También se registran al crear una reparación.'}
                action={!query && !filterId && canEdit && <Button variant="primary" icon={Plus} onClick={() => openEditor()}>Nuevo equipo</Button>} />
              : (
                <div className="ct-table-shell">
                  <table className="ct-table min-w-[40rem]">
                    <thead><tr><th scope="col">Equipo</th><th scope="col">Cliente</th><th scope="col">IMEI o serie</th><th scope="col">Registrado</th>{canEdit && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
                    <tbody>
                      {listing.payload.data.map((record) => (
                        <tr key={record.id}>
                          <td><button type="button" onClick={() => { setNotice(''); setFormError(''); setParams({ ...(filterId ? { customer_id: filterId } : {}), id: record.id }) }} className="text-left font-medium text-[var(--tf-text)] hover:text-[var(--tf-link)]">{record.brand} {record.model}</button>{record.color && <p className="text-xs text-[var(--tf-text-subtle)]">{record.color}</p>}</td>
                          <td>{record.customer ? `${record.customer.first_name} ${record.customer.last_name}` : '—'}</td>
                          <td className="tf-num break-all">{record.imei || record.serial_number || <span className="text-[var(--tf-text-subtle)]">Sin registrar</span>}</td>
                          <td className="whitespace-nowrap">{formatDate(record.created_at)}</td>
                          {canEdit && <td className="text-right"><button type="button" onClick={() => openEditor(record)} className="tf-icon-btn" aria-label={`Editar ${record.brand} ${record.model}`} title="Editar"><Pencil size={15} /></button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
      </DataCard>

      {editing ? <DirectoryModal title={editor?.id ? 'Editar equipo' : 'Nuevo equipo'} onClose={closePanel} busy={saving}>
        <form onSubmit={saveDevice} className="space-y-5"><DirectoryMessage error>{formError || (creatingFromLink ? linkedCustomer.error : '')}</DirectoryMessage>
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
          <div className="rounded-[var(--tf-radius-control)] border border-[var(--tf-border)] bg-[var(--tf-surface-sunken)] p-3"><p className="text-xs text-[var(--tf-text-subtle)]">Cliente</p><Link to={`/clientes?id=${device.customer_id}`} className="tf-link mt-1 inline-block">{device.customer ? `${device.customer.first_name} ${device.customer.last_name}` : 'Ver cliente'}</Link>{device.customer?.phone && <p className="tf-num mt-1 text-[0.8125rem] text-[var(--tf-text-muted)]">{device.customer.phone}</p>}</div>
          <DirectoryFacts items={[[ 'Color', device.color ], [ 'IMEI', device.imei ], [ 'Número de serie', device.serial_number ], [ 'Sistema operativo', device.os ], [ 'Estado físico', device.physical_condition ], [ 'Accesorios recibidos', device.accessories_received ], [ 'Notas', device.notes ], [ 'Fecha de registro', formatDate(device.created_at) ]]} />
          {canEdit && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openEditor(device)} disabled={saving} className={directoryButtonClass}><Pencil size={16} />Editar</button><Link to={`/reparaciones/nueva?customer_id=${device.customer_id}&device_id=${device.id}`} className={directoryPrimaryClass}><Plus size={16} />Nueva reparación</Link>{isAdmin && <button type="button" onClick={() => setConfirmArchive(true)} disabled={saving} className="ct-btn ct-btn-danger"><Archive size={15} />Archivar</button>}</div>}
          <DirectoryRepairHistory repairs={detail.payload.repairs} />
        </> : detail.error && <button type="button" onClick={detail.reload} className={directoryButtonClass}>Reintentar</button>}
      </DirectoryModal>}
      <ConfirmDialog open={confirmArchive} title="¿Archivar este equipo?" busy={saving} confirmLabel="Archivar equipo"
        description={device ? `${device.brand} ${device.model} dejará de aparecer en la lista de equipos activos. Su historial de reparaciones se conserva.` : ''}
        onConfirm={archiveDevice} onCancel={() => setConfirmArchive(false)} />
    </div>
  )
}
