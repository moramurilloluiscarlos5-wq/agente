import { Card, Input, Select, Textarea } from '../ui/DesignSystem.jsx'

const CHECKS = { powers_on: 'Enciende', charges: 'Carga', displays_image: 'Muestra imagen', touch_works: 'Funciona el táctil' }

// Campos compartidos por "Registrar reparación" y la edición dentro del detalle.
export default function RepairFields({ form, setForm, technicians = [], technicalOnly = false, technicianError = '', disabled = false, errors = {}, onFieldChange }) {
  const change = (key) => (event) => {
    const { type, checked, value } = event.target
    setForm((previous) => ({ ...previous, [key]: type === 'checkbox' ? checked : value }))
    onFieldChange?.(key)
  }
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      {!technicalOnly && <>
        <Card title="Recepción del equipo" description="Lo que el cliente reporta y cómo llega el equipo.">
          <div className="tf-form-grid">
            <Textarea fieldClassName="tf-span-2" label="Problema reportado" required maxLength={10000} value={form.reported_problem} onChange={change('reported_problem')} error={errors.reported_problem} placeholder="No carga después de una caída." />
            <Textarea label="Síntomas observados (opcional)" maxLength={10000} value={form.symptoms} onChange={change('symptoms')} placeholder="Se calienta al conectar el cargador." />
            <Textarea label="Estado físico al recibir (opcional)" maxLength={10000} value={form.physical_condition} onChange={change('physical_condition')} placeholder="Esquina superior estrellada." />
            <Textarea fieldClassName="tf-span-2" label="Accesorios recibidos (opcional)" maxLength={10000} value={form.accessories_received} onChange={change('accessories_received')} placeholder="Funda y tarjeta SIM." className="min-h-[4rem]" />
            <Input label="Fecha de recepción" required type="datetime-local" value={form.received_at} onChange={change('received_at')} error={errors.received_at} />
            <Input label="Entrega estimada (opcional)" type="datetime-local" min={form.received_at} value={form.estimated_delivery_at} onChange={change('estimated_delivery_at')} hint="Aparece en el panel como próxima entrega." />
            <fieldset className="tf-span-2">
              <legend className="tf-label">Revisión rápida al recibir</legend>
              <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(CHECKS).map(([key, label]) => (
                  <Select key={key} label={label} value={form[key]} onChange={change(key)}>
                    <option value="">Sin revisar</option><option value="true">Sí</option><option value="false">No</option>
                  </Select>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <label className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--tf-text-muted)]"><input type="checkbox" className="h-4 w-4 accent-[var(--tf-primary)]" checked={form.is_water_damaged} onChange={change('is_water_damaged')} />Daño por líquido</label>
                <label className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--tf-text-muted)]"><input type="checkbox" className="h-4 w-4 accent-[var(--tf-primary)]" checked={form.is_dropped} onChange={change('is_dropped')} />Presenta golpes o caída</label>
              </div>
            </fieldset>
          </div>
        </Card>

        <Card title="Asignación y estimación" description="La estimación puede cambiar después del diagnóstico.">
          <div className="tf-form-grid">
            <Select fieldClassName="tf-span-2" label="Responsable" value={form.technician_id} onChange={change('technician_id')} disabled={Boolean(technicianError)} error={technicianError || undefined}>
              <option value="">Sin asignar</option>
              {form.technician_id && !technicians.some((person) => person.id === form.technician_id) && <option value={form.technician_id}>Responsable actual (ya no está disponible)</option>}
              {technicians.map((person) => <option key={person.id} value={person.id}>{person.full_name || 'Sin nombre'}</option>)}
            </Select>
            <Input label="Costo estimado (MXN)" type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" value={form.estimated_cost} onChange={change('estimated_cost')} error={errors.estimated_cost} placeholder="950.00" />
            <Input label="Anticipo recibido (MXN)" type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" value={form.deposit} onChange={change('deposit')} error={errors.deposit} placeholder="150.00" />
          </div>
        </Card>
      </>}

      <Card title="Diagnóstico y notas">
        <div className="tf-form-grid">
          <Textarea label="Diagnóstico inicial (opcional)" maxLength={10000} value={form.initial_diagnosis} onChange={change('initial_diagnosis')} placeholder="Puerto de carga con sulfato." />
          <Textarea label="Notas internas (opcional)" maxLength={10000} value={form.internal_notes} onChange={change('internal_notes')} hint="Solo las ve el equipo del taller." />
        </div>
      </Card>
    </fieldset>
  )
}
