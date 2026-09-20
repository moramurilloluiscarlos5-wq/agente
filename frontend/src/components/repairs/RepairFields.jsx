import { Children, cloneElement, isValidElement, useId } from 'react'
import { repairInputClass } from './repairForm.js'

export function RepairField({ label, children, wide = false }) {
  const id = useId()
  return <div className={`grid gap-1.5 text-sm text-slate-300 ${wide ? 'sm:col-span-2' : ''}`}><label htmlFor={id}>{label}</label>{Children.map(children, (child) => isValidElement(child) && ['input', 'select', 'textarea'].includes(child.type) ? cloneElement(child, { id }) : child)}</div>
}

export default function RepairFields({ form, setForm, technicians = [], technicalOnly = false, technicianError = '', disabled = false }) {
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
  const textArea = (key, label, required = false) => (
    <RepairField label={label} wide>
      <textarea className={repairInputClass} rows={3} maxLength={10000} value={form[key]} onChange={(event) => change(key, event.target.value)} required={required} />
    </RepairField>
  )
  return (
    <fieldset disabled={disabled} className="space-y-6">
      {!technicalOnly && <>
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="mb-4 font-semibold">Recepción del equipo</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {textArea('reported_problem', 'Problema reportado *', true)}
            {textArea('symptoms', 'Síntomas observados')}
            {textArea('physical_condition', 'Estado físico al recibir')}
            {textArea('accessories_received', 'Accesorios recibidos')}
            <RepairField label="Fecha de recepción *"><input className={repairInputClass} type="datetime-local" value={form.received_at} onChange={(event) => change('received_at', event.target.value)} required /></RepairField>
            <RepairField label="Entrega estimada"><input className={repairInputClass} type="datetime-local" min={form.received_at} value={form.estimated_delivery_at} onChange={(event) => change('estimated_delivery_at', event.target.value)} /></RepairField>
            <div className="flex flex-wrap gap-5 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" className="accent-cyan-400" checked={form.is_water_damaged} onChange={(event) => change('is_water_damaged', event.target.checked)} /> Daño por líquido</label>
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" className="accent-cyan-400" checked={form.is_dropped} onChange={(event) => change('is_dropped', event.target.checked)} /> Presenta golpes o caída</label>
            </div>
            {Object.entries({ powers_on: 'Enciende', charges: 'Carga', displays_image: 'Muestra imagen', touch_works: 'Funciona el táctil' }).map(([key, label]) => (
              <RepairField key={key} label={label}><select className={repairInputClass} value={form[key]} onChange={(event) => change(key, event.target.value)}><option value="">Sin revisar</option><option value="true">Sí</option><option value="false">No</option></select></RepairField>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="mb-4 font-semibold">Asignación y estimación</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <RepairField label="Responsable" wide>
              <select className={repairInputClass} value={form.technician_id} onChange={(event) => change('technician_id', event.target.value)} disabled={Boolean(technicianError)}>
                <option value="">Sin asignar</option>
                {form.technician_id && !technicians.some((person) => person.id === form.technician_id) && <option value={form.technician_id}>Responsable actual (no disponible)</option>}
                {technicians.map((person) => <option key={person.id} value={person.id}>{person.full_name || 'Sin nombre'}</option>)}
              </select>
              {technicianError && <span role="alert" className="text-xs text-amber-300">{technicianError}</span>}
            </RepairField>
            <RepairField label="Costo estimado (MXN)"><input className={repairInputClass} type="number" min="0" max="99999999.99" step="0.01" value={form.estimated_cost} onChange={(event) => change('estimated_cost', event.target.value)} required /></RepairField>
            <RepairField label="Anticipo recibido (MXN)"><input className={repairInputClass} type="number" min="0" max="99999999.99" step="0.01" value={form.deposit} onChange={(event) => change('deposit', event.target.value)} required /></RepairField>
            <p className="text-xs text-slate-500 sm:col-span-2">La estimación puede cambiar después del diagnóstico.</p>
          </div>
        </section>
      </>}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-4 font-semibold">Diagnóstico y notas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {textArea('initial_diagnosis', 'Diagnóstico inicial')}
          {textArea('internal_notes', 'Notas internas')}
        </div>
      </section>
    </fieldset>
  )
}
