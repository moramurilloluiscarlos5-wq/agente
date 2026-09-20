export const repairInputClass = 'ct-input'
export const repairButtonClass = 'ct-btn ct-btn-primary'
export const repairSecondaryClass = 'ct-btn ct-btn-secondary'

export function customerName(customer) {
  return [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Cliente no disponible'
}

export function deviceName(device) {
  return [device?.brand, device?.model].filter(Boolean).join(' ') || 'Equipo no disponible'
}

export function localDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function repairFormValues(repair = {}) {
  return {
    reported_problem: repair.reported_problem ?? '',
    symptoms: repair.symptoms ?? '',
    physical_condition: repair.physical_condition ?? '',
    accessories_received: repair.accessories_received ?? '',
    is_water_damaged: repair.is_water_damaged ?? false,
    is_dropped: repair.is_dropped ?? false,
    powers_on: repair.powers_on == null ? '' : String(repair.powers_on),
    charges: repair.charges == null ? '' : String(repair.charges),
    displays_image: repair.displays_image == null ? '' : String(repair.displays_image),
    touch_works: repair.touch_works == null ? '' : String(repair.touch_works),
    initial_diagnosis: repair.initial_diagnosis ?? '',
    internal_notes: repair.internal_notes ?? '',
    estimated_cost: repair.estimated_cost ?? '0',
    deposit: repair.deposit ?? '0',
    received_at: localDateInput(repair.received_at ?? new Date()),
    estimated_delivery_at: localDateInput(repair.estimated_delivery_at),
    technician_id: repair.technician_id ?? '',
  }
}

export function repairFormPayload(form, technicalOnly = false) {
  const notes = {
    initial_diagnosis: form.initial_diagnosis.trim() || null,
    internal_notes: form.internal_notes.trim() || null,
  }
  if (technicalOnly) return notes
  const cost = Number(form.estimated_cost)
  const deposit = Number(form.deposit)
  if (!Number.isFinite(cost) || !Number.isFinite(deposit) || cost < 0 || deposit < 0) {
    throw new Error('El costo estimado y el anticipo deben ser importes válidos mayores o iguales a cero.')
  }
  return {
    ...notes,
    reported_problem: form.reported_problem.trim(),
    symptoms: form.symptoms.trim() || null,
    physical_condition: form.physical_condition.trim() || null,
    accessories_received: form.accessories_received.trim() || null,
    is_water_damaged: form.is_water_damaged,
    is_dropped: form.is_dropped,
    ...Object.fromEntries(['powers_on', 'charges', 'displays_image', 'touch_works'].map((key) => [key, form[key] === '' ? null : form[key] === 'true'])),
    estimated_cost: cost,
    deposit,
    received_at: new Date(form.received_at).toISOString(),
    estimated_delivery_at: form.estimated_delivery_at ? new Date(form.estimated_delivery_at).toISOString() : null,
    technician_id: form.technician_id || null,
  }
}
