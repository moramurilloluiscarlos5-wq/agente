export const REPAIR_STATUSES = ['recibido', 'diagnostico', 'esperando_autorizacion', 'esperando_refaccion', 'en_reparacion', 'en_pruebas', 'listo_para_entregar', 'entregado', 'cancelado']
export const STAFF_ROLES = ['OWNER', 'ADMINISTRADOR', 'RECEPCION', 'TECNICO', 'CAJERO', 'SUPER_ADMIN']
export const QUOTE_STATUSES = ['pendiente', 'aceptada', 'rechazada', 'vencida', 'completada']
export const PAYMENT_METHODS = ['efectivo', 'transferencia', 'tarjeta', 'otro']
export const PAYMENT_STATUSES = ['pendiente', 'parcial', 'pagado']
export const WARRANTY_STATUSES = ['activa', 'vencida', 'invalidada']
export const REPAIR_SELECT = '*,customer:customers(id,first_name,last_name,phone,whatsapp,whatsapp_e164,whatsapp_opt_in),device:devices(id,brand,model,color,imei,serial_number),technician:profiles!repair_orders_technician_id_fkey(id,full_name)'
export const DEVICE_SELECT = '*,customer:customers(id,first_name,last_name,phone)'

export function fail(message, status = 400) {
  const error = new Error(message)
  error.status = status
  error.publicMessage = message
  throw error
}

export function uuid(value, label = 'Identificador') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(`${label} no válido`)
  return value
}

export function orderNumber(value) {
  if (typeof value !== 'string' || !/^CAR-\d{4}-\d{4,12}$/.test(value)) fail('Número de orden no válido')
  return value
}

export function pageParams(query) {
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback
    if (typeof value !== 'string' || !/^\d+$/.test(value)) fail('Paginación no válida')
    const result = Number(value)
    if (!Number.isSafeInteger(result) || result < 1 || result > max) fail('Paginación fuera de rango')
    return result
  }
  const page = integer(query.page, 1, 100000)
  const limit = integer(query.limit, 25, 100)
  return { page, limit, from: (page - 1) * limit, to: page * limit - 1 }
}

export function searchTerm(value) {
  if (value === undefined || value === '') return ''
  if (typeof value !== 'string' || value.length > 100) fail('La búsqueda debe tener máximo 100 caracteres')
  // PostgREST .or() embeds values in a filter expression: never accept its delimiters.
  return value.replace(/[^\p{L}\p{N}\s@.+-]/gu, ' ').trim()
}

export const text = (max, required = false) => ({ type: 'text', max, required })
export const id = (required = false) => ({ type: 'uuid', required })
export const bool = { type: 'boolean' }
export const money = { type: 'money' }
const customerFields = { first_name: text(100, true), last_name: text(100, true), phone: text(30, true), whatsapp: text(30), whatsapp_opt_in: bool, email: { type: 'email', max: 254 }, notes: text(5000) }
const deviceFields = { customer_id: id(true), brand: text(100, true), model: text(150, true), color: text(100), imei: text(30), serial_number: text(100), os: text(100), physical_condition: text(5000), accessories_received: text(2000), notes: text(5000) }
const repairFields = {
  customer_id: id(true), device_id: id(true), reported_problem: text(5000, true), symptoms: text(5000),
  physical_condition: text(5000), is_water_damaged: bool, is_dropped: bool, powers_on: bool,
  charges: bool, displays_image: bool, touch_works: bool, accessories_received: text(2000),
  initial_diagnosis: text(5000), estimated_cost: money, deposit: money,
  estimated_delivery_at: { type: 'date' }, technician_id: id(), internal_notes: text(5000),
}
export const TECHNICIAN_REPAIR_FIELDS = ['initial_diagnosis', 'internal_notes', 'symptoms', 'powers_on', 'charges', 'displays_image', 'touch_works']

export function validateValue(key, value, rule) {
  if (value === null || value === '') {
    if (rule.required || rule.type === 'money' || ['is_water_damaged', 'is_dropped'].includes(key)) fail(`El campo ${key} es obligatorio`)
    return null
  }
  if (rule.type === 'uuid') return uuid(value, key)
  if (rule.type === 'boolean') {
    if (typeof value !== 'boolean') fail(`El campo ${key} debe ser verdadero o falso`)
    return value
  }
  if (rule.type === 'money') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 99999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) fail(`El campo ${key} debe ser un importe positivo con máximo dos decimales`)
    return value
  }
  if (rule.type === 'date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) fail(`El campo ${key} debe ser una fecha válida`)
    return new Date(value).toISOString()
  }
  if (typeof value !== 'string' || value.trim().length > rule.max || (rule.required && !value.trim())) fail(`El campo ${key} es obligatorio o supera ${rule.max} caracteres`)
  const result = value.trim()
  if (rule.type === 'email' && result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('Correo electrónico no válido')
  return rule.type === 'email' ? result.toLowerCase() || null : result || null
}

export function validatePayload(kind, body, { partial = false, role } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Se requiere un objeto con los datos')
  const fields = { customer: customerFields, device: deviceFields, repair: repairFields }[kind]
  if (!fields) throw new Error('Unknown payload kind')
  const data = {}
  for (const key of Object.keys(body)) {
    if (!Object.hasOwn(fields, key)) fail(`Campo no permitido: ${key}`)
    if (partial && kind === 'repair' && ['customer_id', 'device_id'].includes(key)) fail('El cliente y el dispositivo no se pueden cambiar en una orden existente')
    if (kind === 'repair' && role === 'TECNICO' && !TECHNICIAN_REPAIR_FIELDS.includes(key)) fail('No tienes permiso para modificar ese campo de la orden', 403)
    data[key] = validateValue(key, body[key], fields[key])
  }
  if (!partial) for (const [key, rule] of Object.entries(fields)) {
    if (rule.required && !Object.hasOwn(data, key)) fail(`El campo ${key} es obligatorio`)
  }
  if (!Object.keys(data).length) fail('No hay datos para guardar')
  return data
}

export function validateHistory(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['status', 'note'].includes(key))) fail('Datos de bitácora no válidos')
  if (!REPAIR_STATUSES.includes(body.status)) fail('Estado de reparación no válido')
  const note = body.note == null ? null : validateValue('note', body.note, text(5000))
  return { status: body.status, note }
}

function normalizeMoney(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 99999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    fail(`El campo ${fieldName} debe ser un importe válido con máximo dos decimales`)
  }
  return value
}

function normalizeInteger(value, fieldName, min = 0) {
  if (!Number.isInteger(value) || value < min) {
    fail(`El campo ${fieldName} debe ser un entero válido`)
  }
  return value
}

export function validateQuotePayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Se requiere un objeto con los datos')
  const allowed = ['customer_id', 'repair_order_id', 'device_id', 'labor_cost', 'discount', 'tax_rate', 'subtotal', 'total', 'deposit', 'balance', 'valid_until', 'notes', 'status']
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) fail(`Campo no permitido: ${key}`)
  }

  const data = {}
  if ('customer_id' in body) data.customer_id = uuid(body.customer_id, 'customer_id')
  if ('repair_order_id' in body) data.repair_order_id = uuid(body.repair_order_id, 'repair_order_id')
  if ('device_id' in body) data.device_id = uuid(body.device_id, 'device_id')
  if ('labor_cost' in body) data.labor_cost = normalizeMoney(body.labor_cost, 'labor_cost')
  if ('discount' in body) data.discount = normalizeMoney(body.discount, 'discount')
  if ('tax_rate' in body) {
    const tax = Number(body.tax_rate)
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) fail('El campo tax_rate debe estar entre 0 y 100')
    data.tax_rate = tax
  }
  if ('subtotal' in body) data.subtotal = normalizeMoney(body.subtotal, 'subtotal')
  if ('total' in body) data.total = normalizeMoney(body.total, 'total')
  if ('deposit' in body) data.deposit = normalizeMoney(body.deposit, 'deposit')
  if ('balance' in body) data.balance = normalizeMoney(body.balance, 'balance')
  if ('valid_until' in body) {
    const value = body.valid_until
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
      fail('El campo valid_until debe ser una fecha válida')
    }
    data.valid_until = value
  }
  if ('notes' in body) data.notes = validateValue('notes', body.notes, text(5000))
  if ('status' in body) {
    const status = String(body.status)
    if (!QUOTE_STATUSES.includes(status)) fail('Estado de cotización no válido')
    data.status = status
  }

  if (!partial) {
    if (!data.customer_id) fail('El campo customer_id es obligatorio')
    if (!data.labor_cost && data.labor_cost !== 0) fail('El campo labor_cost es obligatorio')
    if (!('status' in data)) data.status = 'pendiente'
  }

  if (!Object.keys(data).length) fail('No hay datos para guardar')
  return data
}

export function validatePaymentPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Se requiere un objeto con los datos')
  const allowed = ['customer_id', 'repair_order_id', 'quote_id', 'amount', 'method', 'reference', 'payment_date', 'status']
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) fail(`Campo no permitido: ${key}`)
  }

  const data = {}
  if ('customer_id' in body) data.customer_id = uuid(body.customer_id, 'customer_id')
  if ('repair_order_id' in body) data.repair_order_id = uuid(body.repair_order_id, 'repair_order_id')
  if ('quote_id' in body) data.quote_id = uuid(body.quote_id, 'quote_id')
  if ('amount' in body) data.amount = normalizeMoney(body.amount, 'amount')
  if ('method' in body) {
    const method = String(body.method)
    if (!PAYMENT_METHODS.includes(method)) fail('Método de pago no válido')
    data.method = method
  }
  if ('reference' in body) data.reference = validateValue('reference', body.reference, text(200))
  if ('payment_date' in body) {
    const dateValue = body.payment_date
    if (typeof dateValue !== 'string' || Number.isNaN(Date.parse(dateValue))) fail('El campo payment_date debe ser una fecha válida')
    data.payment_date = new Date(dateValue).toISOString()
  }
  if ('status' in body) {
    const status = String(body.status)
    if (!PAYMENT_STATUSES.includes(status)) fail('Estado de pago no válido')
    data.status = status
  }

  if (!partial) {
    if (!data.customer_id) fail('El campo customer_id es obligatorio')
    if (!data.amount && data.amount !== 0) fail('El campo amount es obligatorio')
    if (!data.method) data.method = 'efectivo'
    if (!data.status) data.status = 'pagado'
  }

  if (!Object.keys(data).length) fail('No hay datos para guardar')
  return data
}

export function validateWarrantyPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Se requiere un objeto con los datos')
  const allowed = ['repair_order_id', 'customer_id', 'device_id', 'service_description', 'repair_date', 'duration_days', 'expires_at', 'conditions', 'status', 'notes']
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) fail(`Campo no permitido: ${key}`)
  }

  const data = {}
  if ('repair_order_id' in body) data.repair_order_id = uuid(body.repair_order_id, 'repair_order_id')
  if ('customer_id' in body) data.customer_id = uuid(body.customer_id, 'customer_id')
  if ('device_id' in body) data.device_id = uuid(body.device_id, 'device_id')
  if ('service_description' in body) data.service_description = validateValue('service_description', body.service_description, text(2000))
  if ('repair_date' in body) {
    const dateValue = body.repair_date
    if (typeof dateValue !== 'string' || Number.isNaN(Date.parse(dateValue))) fail('El campo repair_date debe ser una fecha válida')
    data.repair_date = new Date(dateValue).toISOString()
  }
  if ('duration_days' in body) data.duration_days = normalizeInteger(Number(body.duration_days), 'duration_days', 1)
  if ('expires_at' in body) {
    const dateValue = body.expires_at
    if (typeof dateValue !== 'string' || Number.isNaN(Date.parse(dateValue))) fail('El campo expires_at debe ser una fecha válida')
    data.expires_at = new Date(dateValue).toISOString()
  }
  if ('conditions' in body) data.conditions = validateValue('conditions', body.conditions, text(2000))
  if ('status' in body) {
    const status = String(body.status)
    if (!WARRANTY_STATUSES.includes(status)) fail('Estado de garantía no válido')
    data.status = status
  }
  if ('notes' in body) data.notes = validateValue('notes', body.notes, text(2000))

  if (!partial) {
    if (!data.repair_order_id) fail('El campo repair_order_id es obligatorio')
    if (!data.customer_id) fail('El campo customer_id es obligatorio')
    if (!data.duration_days) fail('El campo duration_days es obligatorio')
    if (!data.status) data.status = 'activa'
  }

  if (!Object.keys(data).length) fail('No hay datos para guardar')
  return data
}

export function validateAIDiagnosticPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Se requiere un objeto con los datos')
  const allowed = ['device_brand', 'device_model', 'issue', 'observations', 'symptoms', 'repair_order_id', 'device_id']
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) fail(`Campo no permitido: ${key}`)
  }

  const data = {}
  if ('device_brand' in body) data.device_brand = validateValue('device_brand', body.device_brand, text(100, true))
  if ('device_model' in body) data.device_model = validateValue('device_model', body.device_model, text(120, true))
  if ('issue' in body) data.issue = validateValue('issue', body.issue, text(5000, true))
  if ('observations' in body) data.observations = validateValue('observations', body.observations, text(6000))
  if ('symptoms' in body) data.symptoms = validateValue('symptoms', body.symptoms, text(3000))
  if ('repair_order_id' in body) data.repair_order_id = uuid(body.repair_order_id, 'repair_order_id')
  if ('device_id' in body) data.device_id = uuid(body.device_id, 'device_id')

  if (!data.issue) fail('El campo issue es obligatorio')
  if (!data.device_brand || !data.device_model) fail('Marca y modelo del equipo son obligatorios')

  return data
}

export function scopeRepairs(query, profile) {
  if (!STAFF_ROLES.includes(profile?.role)) fail('Permiso insuficiente', 403)
  // El taller sale de la sesión: SUPER_ADMIN no tiene taller, pero scopeRepairs
  // se usa con perfiles de taller; si llegara sin taller se bloquea aquí.
  if (!profile?.workshop_id && profile?.role !== 'SUPER_ADMIN') fail('Tu cuenta no tiene un taller asignado. Contacta con el administrador.', 403)
  if (profile?.workshop_id) query = query.eq('workshop_id', profile.workshop_id)
  return profile.role === 'TECNICO' ? query.eq('technician_id', profile.id) : query
}

export function assertRepairAccess(repair, profile) {
  if (!repair) fail('Orden no encontrada', 404)
  if (!STAFF_ROLES.includes(profile?.role) || (profile.role !== 'SUPER_ADMIN' && repair.workshop_id && profile.workshop_id !== repair.workshop_id) || (profile.role === 'TECNICO' && repair.technician_id !== profile.id)) fail('Orden no encontrada', 404)
  return repair
}

export function databaseError(error) {
  if (!error) return
  if (error.code === 'PGRST202' || error.code === '42883') fail('Falta aplicar la migración database/migrations/003_phase3.sql en Supabase.', 503)
  if (error.code === 'PGRST205' && /whatsapp_(automations|messages|webhook_events)/i.test(error.message ?? '')) fail('Falta aplicar la migración database/migrations/005_whatsapp.sql en Supabase.', 503)
  if (error.code === 'PGRST205' && /audit_logs/i.test(error.message ?? '')) fail('Falta aplicar la migración database/migrations/006_security_rbac.sql en Supabase.', 503)
  if ((error.code === 'PGRST204' || error.code === '42703') && /is_low_stock/i.test(error.message ?? '')) fail('Falta aplicar la migración database/migrations/012_inventory_low_stock.sql en Supabase.', 503)
  if ((error.code === 'PGRST204' || error.code === '42703') && /(tokens_used|provider)/i.test(error.message ?? '')) fail('Falta aplicar la migración database/migrations/015_ai_provider.sql en Supabase.', 503)
  if (error.code === '23505') fail('Ya existe un registro con esos datos', 409)
  if (error.code === '23503') fail('El registro está relacionado con otros datos o ya no existe', 409)
  if (['P0001', 'P0002', '42501', '40001', '23514'].includes(error.code)) {
    const status = { P0002: 404, '42501': 403, '40001': 409 }[error.code] ?? 400
    fail(error.message || 'No se puede realizar esta operación', status)
  }
  throw error
}
