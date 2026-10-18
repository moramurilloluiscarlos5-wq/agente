import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const ownerA = '11111111-1111-4111-8111-111111111111'
const techA = '22222222-2222-4222-8222-222222222222'
const ownerB = '33333333-3333-4333-8333-333333333333'

const MIGRATIONS = [
  '003_phase3.sql', '004_inventory_rpc.sql', '005_whatsapp.sql', '006_security_rbac.sql',
  '011_tracking.sql', '012_inventory_low_stock.sql', '013_workshops.sql', '014_workshops_roles.sql', '015_ai_provider.sql',
  '016_provision_workshop.sql', '017_workshop_onboarding.sql',
]

async function migrate() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    create or replace function gen_random_bytes(n integer) returns bytea
    language sql as $$
      select substring(decode(string_agg(md5(random()::text || gs), ''), 'hex') from 1 for n)
      from generate_series(1, greatest(1, ceil(n / 16.0)::integer)) gs;
    $$;
  `)
  const schema = (await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', '')
  await db.exec(schema)
  await db.exec('grant all on all tables in schema public to authenticated, service_role; grant usage, select on all sequences in schema public to authenticated, service_role;')
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), 'utf8'))
  return db
}

const asUser = async (db, userId, sql, params) => {
  await db.exec('reset role')
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}

test('licencias: migración 019 idempotente, RLS y escritura solo con service role', async (t) => {
  const db = await migrate()
  t.after(() => db.close())
  const sql = await readFile(new URL('../../database/migrations/019_licensing.sql', import.meta.url), 'utf8')

  const workshopA = (await db.query("insert into workshops(name,slug) values ('Taller A','taller-a') returning id")).rows[0].id
  const workshopB = (await db.query("insert into workshops(name,slug) values ('Taller B','taller-b') returning id")).rows[0].id
  await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6)', [ownerA, 'a@test', techA, 'ta@test', ownerB, 'b@test'])
  await db.query(`update profiles set
    role = case when id = $1::uuid then 'OWNER'::user_role when id = $2::uuid then 'TECNICO'::user_role else 'OWNER'::user_role end,
    workshop_id = case when id in ($1::uuid,$2::uuid) then $3::uuid else $4::uuid end`, [ownerA, techA, workshopA, workshopB])

  await db.exec(sql)
  await db.exec(sql)

  await t.test('seed y backfill: planes sembrados y talleres existentes en prueba, sin duplicados', async () => {
    assert.equal((await db.query('select count(*)::int n from plans')).rows[0].n, 2)
    const subs = (await db.query('select workshop_id,status from subscriptions')).rows
    const workshops = (await db.query('select count(*)::int n from workshops')).rows[0].n
    assert.equal(subs.length, workshops)
    assert.ok(subs.every((row) => row.status === 'trialing'))
  })

  await t.test('OWNER lee solo la suscripción de su taller', async () => {
    const rows = (await asUser(db, ownerA, 'select workshop_id,status from subscriptions')).rows
    assert.deepEqual(rows.map((row) => row.workshop_id), [workshopA])
  })

  await t.test('un técnico no lee la suscripción', async () => {
    assert.equal((await asUser(db, techA, 'select status from subscriptions')).rows.length, 0)
  })

  await t.test('los usuarios no ven columnas de Stripe ni billing_events', async () => {
    await assert.rejects(asUser(db, ownerA, 'select stripe_customer_id from subscriptions'))
    await assert.rejects(asUser(db, ownerA, 'select stripe_price_id from plans'))
    await assert.rejects(asUser(db, ownerA, 'select * from billing_events'))
  })

  await t.test('los planes activos son públicos', async () => {
    assert.equal((await asUser(db, ownerA, 'select code from plans')).rows.length, 2)
  })

  await t.test('ningún usuario puede modificar su propia licencia', async () => {
    await assert.rejects(asUser(db, ownerA, "update subscriptions set status = 'active' where workshop_id = $1", [workshopA]))
    await assert.rejects(asUser(db, ownerA, "insert into subscriptions(workshop_id,status) values ($1,'active')", [workshopB]))
    await assert.rejects(asUser(db, ownerA, 'delete from subscriptions where workshop_id = $1', [workshopA]))
    await assert.rejects(asUser(db, ownerA, "update plans set price_cents = 1"))
    assert.equal((await db.query('select status from subscriptions where workshop_id = $1', [workshopA])).rows[0].status, 'trialing')
  })

  await t.test('service role escribe y la idempotencia de eventos la garantiza la unicidad', async () => {
    await db.exec('set role service_role')
    try {
      await db.query("update subscriptions set status = 'active', stripe_subscription_id = 'sub_x' where workshop_id = $1", [workshopA])
      await db.query("insert into billing_events(provider_event_id,type,payload) values ('evt_1','x','{}')")
      await assert.rejects(db.query("insert into billing_events(provider_event_id,type,payload) values ('evt_1','x','{}')"))
      await assert.rejects(db.query("update subscriptions set status = 'invalido' where workshop_id = $1", [workshopA]))
      await assert.rejects(db.query("update subscriptions set stripe_subscription_id = 'sub_x' where workshop_id = $1", [workshopB]))
    } finally { await db.exec('reset role') }
  })
})
