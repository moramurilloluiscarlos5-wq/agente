import { Router } from 'express'
import { supabaseAdmin, requireSupabase } from '../config/supabase.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { databaseError, fail, pageParams, searchTerm, uuid, validateValue, text, money } from '../utils/operations.js'
import { hasPermission, requirePermission } from '../middleware/rbac.js'
import { scopeToWorkshop, stampWorkshop, workshopScope } from '../utils/workshop.js'

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
const writers = requireRole('ADMINISTRADOR', 'RECEPCION', 'TECNICO')
const admin = requireRole('ADMINISTRADOR')

const INVENTORY_CATEGORIES = [
  'Pantallas', 'Baterias', 'Centros_de_carga', 'Flex', 'Camaras',
  'Bocinas', 'Microfonos', 'Herramientas', 'Accesorios', 'Otros'
]

const MOVEMENT_TYPES = ['entrada', 'salida', 'ajuste']

const inventoryFields = {
  name: text(200, true),
  brand: text(100),
  compatible_brand: text(100),
  compatible_model: text(150),
  category: { type: 'enum', values: INVENTORY_CATEGORIES, required: true },
  supplier: text(150),
  cost: money,
  suggested_price: money,
  quantity: { type: 'integer', min: 0 },
  min_stock: { type: 'integer', min: 0 },
  location: text(100),
  sku: text(50, true),
}

function validateInventory(body, partial = false) {
  const data = {}
  for (const key of Object.keys(body)) {
    const rule = inventoryFields[key]
    if (!rule) fail(`Campo no permitido: ${key}`)

    const val = body[key]
    if (rule.type === 'enum') {
      if (!rule.values.includes(val)) fail(`Valor no válido para ${key}`)
      data[key] = val
    } else if (rule.type === 'integer') {
      const n = Number(val)
      if (!Number.isInteger(n) || (rule.min !== undefined && n < rule.min)) fail(`${key} debe ser un número entero válido`)
      data[key] = n
    } else {
      data[key] = validateValue(key, val, rule)
    }
  }
  if (!partial) {
    for (const [key, rule] of Object.entries(inventoryFields)) {
      if (rule.required && !Object.hasOwn(data, key)) fail(`El campo ${key} es obligatorio`)
    }
  }
  return data
}

// El costo es información interna: solo se expone a quien tenga inventory.view_cost.
function hideCost(rows, profile) {
  if (hasPermission(profile, 'inventory.view_cost')) return rows
  return rows.map(({ cost: _cost, ...rest }) => rest)
}

export function createInventoryRouter({ db = supabaseAdmin, authenticate = [requireSupabase, requireAuth, loadProfile] } = {}) {
  const router = Router()
  router.use(...authenticate)

  router.get('/', requirePermission('inventory.view'), asyncRoute(async (req, res) => {
    const { page, limit, from, to } = pageParams(req.query)
    const q = searchTerm(req.query.q)
    const category = req.query.category

    let query = scopeToWorkshop(db.from('inventory').select('*', { count: 'exact' }).is('deleted_at', null), req)

    if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,compatible_model.ilike.%${q}%`)
    if (category && INVENTORY_CATEGORIES.includes(category)) query = query.eq('category', category)
    // La comparación stock <= min_stock no puede expresarse como filtro PostgREST
    // entre dos columnas: se usa la columna generada is_low_stock (migración 012).
    if (req.query.low_stock === 'true') query = query.eq('is_low_stock', true)

    const { data, count, error } = await query.order('name').range(from, to)
    databaseError(error)
    res.json({ data: hideCost(data ?? [], req.profile), count, page, limit })
  }))

  router.get('/:id', requirePermission('inventory.view'), asyncRoute(async (req, res) => {
    const { data, error } = await scopeToWorkshop(db.from('inventory').select('*').eq('id', uuid(req.params.id)).is('deleted_at', null), req).maybeSingle()
    databaseError(error)
    if (!data) fail('Artículo no encontrado', 404)

    const { data: movements, error: mError } = await db.from('inventory_movements')
      .select('*, user:profiles(full_name)')
      .eq('inventory_id', data.id)
      .eq('workshop_id', data.workshop_id)
      .order('created_at', { ascending: false })
      .limit(20)
    databaseError(mError)

    res.json({ data: hideCost([data], req.profile)[0], movements })
  }))

  router.post('/', writers, requirePermission('inventory.create'), asyncRoute(async (req, res) => {
    const values = validateInventory(req.body)
    const { data, error } = await db.from('inventory').insert(stampWorkshop(values, req)).select('*').single()
    databaseError(error)
    res.status(201).json({ data: hideCost([data], req.profile)[0] })
  }))

  router.patch('/:id', writers, requirePermission('inventory.update'), asyncRoute(async (req, res) => {
    const values = validateInventory(req.body, true)
    let update = db.from('inventory').update(values).eq('id', uuid(req.params.id)).is('deleted_at', null)
    if (req.profile.role !== 'SUPER_ADMIN') update = update.eq('workshop_id', workshopScope(req))
    const { data, error } = await update.select('*').maybeSingle()
    databaseError(error)
    if (!data) fail('Artículo no encontrado', 404)
    res.json({ data: hideCost([data], req.profile)[0] })
  }))

  router.post('/:id/movements', writers, requirePermission('inventory.adjust_stock'), asyncRoute(async (req, res) => {
    const inventoryId = uuid(req.params.id)
    const { quantity, movement_type, reason } = req.body

    if (!Number.isInteger(quantity) || quantity === 0) fail('La cantidad debe ser un entero diferente de cero')
    if (!MOVEMENT_TYPES.includes(movement_type)) fail('Tipo de movimiento no válido')

    // Iniciar transacción vía RPC para asegurar consistencia
    const { data, error } = await db.rpc('register_inventory_movement', {
      p_inventory_id: inventoryId,
      p_type: movement_type,
      p_quantity: quantity,
      p_reason: reason || null,
      p_user_id: req.profile.id
    })

    databaseError(error)
    res.json({ data, message: 'Movimiento registrado correctamente' })
  }))

  router.delete('/:id', admin, requirePermission('inventory.update'), asyncRoute(async (req, res) => {
    let remove = db.from('inventory').update({ deleted_at: new Date().toISOString() }).eq('id', uuid(req.params.id))
    if (req.profile.role !== 'SUPER_ADMIN') remove = remove.eq('workshop_id', workshopScope(req))
    const { error } = await remove
    databaseError(error)
    res.json({ message: 'Artículo eliminado' })
  }))

  return router
}

export default createInventoryRouter()
