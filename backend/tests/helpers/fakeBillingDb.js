// Base de datos en memoria con la parte de la API de supabase-js que usa billing.
export function createFakeDb(seed = {}) {
  const tables = {
    workshops: [], plans: [], subscriptions: [], billing_events: [], audit_logs: [], profiles: [],
    ...Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])),
  }
  const unique = { billing_events: ['provider_event_id'], subscriptions: ['workshop_id', 'provider_subscription_id'] }
  const defaults = { subscriptions: () => ({ last_event_at: new Date(0).toISOString(), last_payment_at: new Date(0).toISOString(), cancel_at_period_end: false }) }
  let counter = 0

  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.payload = null; this.options = {}; this.returning = false; this.columns = '*'; this.count = false }
    select(columns = '*', options = {}) {
      if (this.op !== 'select') this.returning = true
      else { this.columns = columns; this.count = Boolean(options.count) }
      return this
    }
    insert(payload) { this.op = 'insert'; this.payload = payload; return this }
    upsert(payload, options = {}) { this.op = 'upsert'; this.payload = payload; this.options = options; return this }
    update(payload) { this.op = 'update'; this.payload = payload; return this }
    eq(column, value) { this.filters.push((row) => row[column] === value); return this }
    in(column, values) { this.filters.push((row) => values.includes(row[column])); return this }
    lte(column, value) { this.filters.push((row) => new Date(row[column]).getTime() <= new Date(value).getTime()); return this }
    order() { return this }
    limit() { return this }
    maybeSingle() { const { data, error } = this.run(); return Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error }) }
    single() { return this.maybeSingle() }
    then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject) }
    conflict(row, self = row) {
      const rows = tables[this.table]
      return (unique[this.table] ?? []).some((column) => row[column] != null && rows.some((other) => other !== self && other[column] === row[column]))
    }
    // `plan:plans(...)` en el select se resuelve con plan_id, como el embed de PostgREST.
    shape(row) {
      const copy = { ...row }
      if (typeof this.columns === 'string' && this.columns.includes('plan:plans')) copy.plan = tables.plans.find((plan) => plan.id === row.plan_id) ?? null
      return copy
    }
    run() {
      const rows = tables[this.table] ?? (tables[this.table] = [])
      const match = rows.filter((row) => this.filters.every((filter) => filter(row)))
      if (this.op === 'select') return this.count ? { data: null, count: match.length, error: null } : { data: match.map((row) => this.shape(row)), error: null }
      if (this.op === 'update') {
        for (const row of match) {
          const next = { ...row, ...this.payload }
          if (this.conflict(next, row)) return { data: null, error: { code: '23505' } }
        }
        match.forEach((row) => Object.assign(row, this.payload))
        return { data: this.returning ? match.map((row) => ({ ...row })) : null, error: null }
      }
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({ id: `id-${++counter}`, ...(defaults[this.table]?.() ?? {}), ...row }))
      for (const row of incoming) {
        if (this.table === 'subscriptions' && !tables.workshops.some((workshop) => workshop.id === row.workshop_id)) return { data: null, error: { code: '23503' } }
        if (this.conflict(row)) {
          if (this.op === 'upsert' && this.options.ignoreDuplicates) continue
          return { data: null, error: { code: '23505' } }
        }
        rows.push(row)
      }
      return { data: this.returning ? incoming : null, error: null }
    }
  }

  return {
    tables,
    from: (table) => new Query(table),
    auth: { admin: { getUserById: async (id) => ({ data: { user: tables.auth_users?.find((user) => user.id === id) ?? null }, error: null }) } },
  }
}
