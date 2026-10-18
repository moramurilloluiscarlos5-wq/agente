// Base de datos en memoria con la parte de la API de supabase-js que usa billing.
export function createFakeDb(seed = {}) {
  const tables = {
    workshops: [], plans: [], subscriptions: [], billing_events: [], audit_logs: [],
    ...Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])),
  }
  const unique = { billing_events: ['provider_event_id'], subscriptions: ['workshop_id', 'stripe_subscription_id'] }
  let counter = 0

  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.payload = null; this.options = {}; this.returning = false }
    select() { if (this.op !== 'select') this.returning = true; return this }
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
    conflict(row) {
      const rows = tables[this.table]
      return (unique[this.table] ?? []).some((column) => row[column] != null && rows.some((other) => other[column] === row[column]))
    }
    run() {
      const rows = tables[this.table] ?? (tables[this.table] = [])
      const match = rows.filter((row) => this.filters.every((filter) => filter(row)))
      if (this.op === 'select') return { data: match.map((row) => ({ ...row })), error: null }
      if (this.op === 'update') {
        match.forEach((row) => Object.assign(row, this.payload))
        return { data: this.returning ? match.map((row) => ({ ...row })) : null, error: null }
      }
      const defaults = this.table === 'subscriptions' ? { last_event_at: new Date(0).toISOString() } : {}
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({ id: `id-${++counter}`, ...defaults, ...row }))
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

  return { tables, from: (table) => new Query(table) }
}
