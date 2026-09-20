import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const ownerA = '11111111-1111-4111-8111-111111111111'
const techA = '22222222-2222-4222-8222-222222222222'
const ownerB = '33333333-3333-4333-8333-333333333333'
const techB = '44444444-4444-4444-8444-444444444444'
const superAdmin = '55555555-5555-4555-8555-555555555555'

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
  `)
  // gen_random_uuid() es parte del core; PGlite no incluye la extensión pgcrypto.
  // 011_tracking.sql usa gen_random_bytes(): se sustituye por una función
  // equivalente solo para el entorno de pruebas (las migraciones no se tocan).
  await db.exec(`
    create or replace function gen_random_bytes(n integer) returns bytea
    language sql as $$
      select substring(decode(string_agg(md5(random()::text || gs), ''), 'hex') from 1 for n)
      from generate_series(1, greatest(1, ceil(n / 16.0)::integer)) gs;
    $$;
  `)
  const schema = (await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8'))
    .replace('create extension if not exists pgcrypto;', '')
  await db.exec(schema)
  await db.exec('grant all on all tables in schema public to authenticated, service_role; grant usage, select on all sequences in schema public to authenticated, service_role;')
  for (const file of MIGRATIONS) {
    const sql = await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), 'utf8')
    // Cada migración debe poder aplicarse dos veces sin efectos destructivos.
    await db.exec(sql)
    await db.exec(sql)
  }
  return db
}

test('multi-taller: aislamiento real en la base de datos', async (t) => {
  const db = await migrate()
  t.after(() => db.close())

  // ─── Escenario: dos talleres independientes ────────────────────────────
  const workshopA = (await db.query("insert into workshops(name,slug) values ('Taller A','taller-a') returning id")).rows[0].id
  const workshopB = (await db.query("insert into workshops(name,slug) values ('Taller B','taller-b') returning id")).rows[0].id
  await db.query('select bootstrap_workshop($1)', [workshopA])
  await db.query('select bootstrap_workshop($1)', [workshopB])

  await db.query(
    'insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)',
    [ownerA, 'ownera@test', techA, 'techa@test', ownerB, 'ownerb@test', techB, 'techb@test', superAdmin, 'super@test'],
  )
  await db.query(`
    update profiles set role = case
      when id = $1 then 'OWNER'::user_role
      when id = $2 then 'TECNICO'::user_role
      when id = $3 then 'OWNER'::user_role
      when id = $4 then 'TECNICO'::user_role
      else 'SUPER_ADMIN'::user_role end,
      workshop_id = case when id in ($1,$2) then $5::uuid when id in ($3,$4) then $6::uuid else null end
  `, [ownerA, techA, ownerB, techB, workshopA, workshopB])

  const customerA = (await db.query("insert into customers(workshop_id,first_name,last_name,phone) values ($1,'Ana','De A','6000000001') returning id", [workshopA])).rows[0].id
  const customerB = (await db.query("insert into customers(workshop_id,first_name,last_name,phone) values ($1,'Beto','De B','6000000002') returning id", [workshopB])).rows[0].id
  const deviceA = (await db.query("insert into devices(workshop_id,customer_id,brand,model) values ($1,$2,'Samsung','A54') returning id", [workshopA, customerA])).rows[0].id
  const deviceB = (await db.query("insert into devices(workshop_id,customer_id,brand,model) values ($1,$2,'Apple','iPhone 13') returning id", [workshopB, customerB])).rows[0].id
  const itemB = (await db.query("insert into inventory(workshop_id,name,sku,quantity) values ($1,'Pantalla B','SKU-B',7) returning id", [workshopB])).rows[0].id
  const call = async (name, params, placeholders) => (await db.query(`select ${name}(${placeholders}) as data`, params)).rows[0].data

  await t.test('registro atómico: Auth, OWNER y configuración propios; todos los datos de negocio empiezan en cero', async () => {
    const id = '66666666-6666-4666-8666-666666666666'
    await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values ($1,$2,$3,$4)', [
      id, 'new@test', { full_name: 'Nuevo propietario' }, { workshop_registration: { name: 'Nuevo', slug: 'nuevo' } },
    ])
    const profile = (await db.query('select * from profiles where id = $1', [id])).rows[0]
    assert.equal(profile.role, 'OWNER')
    assert.ok(profile.workshop_id)
    const workshop = (await db.query('select * from workshops where id = $1', [profile.workshop_id])).rows[0]
    assert.equal(workshop.owner_user_id, id)
    assert.equal(workshop.status, 'ACTIVE')
    assert.equal((await db.query('select business_name from settings where workshop_id = $1', [workshop.id])).rows[0].business_name, 'Nuevo')
    for (const table of ['customers', 'devices', 'repair_orders', 'payments', 'inventory']) {
      assert.equal((await db.query(`select count(*)::int as n from ${table} where workshop_id = $1`, [workshop.id])).rows[0].n, 0)
    }
    assert.ok((await db.query("select count(*)::int as n from role_permissions where role_code = 'OWNER'")).rows[0].n > 0)
    const before = (await db.query('select count(*)::int as n from workshops')).rows[0].n
    await assert.rejects(db.query('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3)', [
      '67676767-6767-4767-8767-676767676767', 'new@test', { workshop_registration: { name: 'Duplicado', slug: 'duplicado' } },
    ]), /unique|duplicate/)
    await assert.rejects(call('provision_workshop', [id, 'Nuevo propietario', 'Segundo', 'segundo'], '$1,$2,$3,$4'), /ya pertenece/)
    assert.equal((await db.query('select count(*)::int as n from workshops')).rows[0].n, before)
  })

  await t.test('fallo de configuración revierte Auth, perfil y taller juntos', async () => {
    const id = '77777777-7777-4777-8777-777777777777'
    await db.exec("create function test_fail_bootstrap() returns trigger language plpgsql as $$ begin raise exception 'fallo de configuración simulado'; end; $$; create trigger test_fail_bootstrap before insert on settings for each row execute function test_fail_bootstrap();")
    try {
      await assert.rejects(db.query('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3)', [id, 'failure@test', { workshop_registration: { name: 'Fallo', slug: 'fallo' } }]), /simulado/)
      for (const table of ['auth.users', 'profiles']) assert.equal((await db.query(`select count(*)::int as n from ${table} where id = $1`, [id])).rows[0].n, 0)
      assert.equal((await db.query("select count(*)::int as n from workshops where slug = 'fallo'")).rows[0].n, 0)
    } finally {
      await db.exec('drop trigger test_fail_bootstrap on settings; drop function test_fail_bootstrap();')
    }
  })

  await t.test('usuario sin taller completa onboarding; empleado y SUPER_ADMIN no pueden crear otro', async () => {
    const id = '88888888-8888-4888-8888-888888888888'
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)', [id, 'unassigned@test', { workshop_id: workshopA, role: 'SUPER_ADMIN', workshop_registration: { name: 'forged', slug: 'forged' } }])
    let profile = (await db.query('select * from profiles where id = $1', [id])).rows[0]
    assert.equal(profile.workshop_id, null)
    assert.equal(profile.role, 'RECEPCION')
    const result = await call('provision_workshop', [id, 'Sin taller', 'Taller propio', 'propio'], '$1,$2,$3,$4')
    assert.equal(result.profile.role, 'OWNER')
    await assert.rejects(call('provision_workshop', [techA, 'Tech', 'Duplicado', 'duplicado'], '$1,$2,$3,$4'), /ya pertenece/)
    await assert.rejects(call('provision_workshop', [superAdmin, 'Super', 'Duplicado', 'duplicado'], '$1,$2,$3,$4'), /plataforma/)
    await db.exec('set role authenticated')
    try { await assert.rejects(call('provision_workshop', [id, 'Sin taller', 'Taller propio', 'propio'], '$1,$2,$3,$4'), /permission denied/) }
    finally { await db.exec('reset role') }
  })

  await t.test('empleado se crea dentro del taller del administrador sin crear otro taller', async () => {
    const id = '99999999-9999-4999-8999-999999999999'
    const before = (await db.query('select count(*)::int as n from workshops')).rows[0].n
    await db.query('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3)', [id, 'employee@test', { workshop_employee: { actor_id: ownerA, workshop_id: workshopA, role: 'TECNICO' } }])
    const profile = (await db.query('select role,workshop_id from profiles where id = $1', [id])).rows[0]
    assert.deepEqual(profile, { role: 'TECNICO', workshop_id: workshopA })
    assert.equal((await db.query('select count(*)::int as n from workshops')).rows[0].n, before)
    await assert.rejects(db.query('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3)', ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'wrongemployee@test', { workshop_employee: { actor_id: ownerA, workshop_id: workshopB, role: 'TECNICO' } }]), /No puedes/)
  })

  await t.test('un taller nuevo arranca en cero y con su propia configuración', async () => {
    const counts = (await db.query('select count(*)::int as count from customers where workshop_id = $1', [workshopB])).rows[0].count
    assert.equal(counts, 1)
    const empty = (await db.query("select count(*)::int as count from workshops w where w.id = $1 and not exists (select 1 from customers c where c.workshop_id = w.id and c.id <> $2)", [workshopB, customerB])).rows[0].count
    assert.equal(empty, 1)
    const settings = (await db.query('select business_name from settings where workshop_id = $1', [workshopB])).rows[0]
    assert.equal(settings.business_name, 'Taller B')
    const automations = (await db.query('select count(*)::int as count from whatsapp_automations where workshop_id = $1', [workshopB])).rows[0].count
    assert.equal(automations, 9)
    assert.equal((await db.query('select count(*)::int as count from whatsapp_settings where workshop_id = $1', [workshopB])).rows[0].count, 1)
  })

  await t.test('no se puede crear una orden con cliente o equipo de otro taller', async () => {
    // Equipo de B con cliente de A: el trigger lo bloquea.
    await assert.rejects(
      db.query('insert into repair_orders(workshop_id,customer_id,device_id,reported_problem) values ($1,$2,$3,$4)', [workshopA, customerA, deviceB, 'Cruce de talleres']),
      /otro taller|no pertenece al cliente/,
    )
    // Orden en A apuntando al cliente de B.
    await assert.rejects(
      call('create_repair_order', [JSON.stringify({ customer_id: customerB, device_id: deviceB, reported_problem: 'Robo de datos' }), ownerA], '$1::jsonb,$2::uuid'),
      /Cliente no encontrado/,
    )
  })

  await t.test('RLS: cada sesión solo ve los datos de su propio taller', async () => {
    const asUser = async (userId, fn) => {
      await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', userId])
      await db.exec('set role authenticated')
      try {
        return await fn()
      } finally {
        await db.exec('reset role')
      }
    }

    // Owner A ve su cliente; el cliente de B es invisible (idempotente ante IDOR).
    const visibleA = await asUser(ownerA, () => db.query('select id from customers'))
    assert.deepEqual(visibleA.rows.map((row) => row.id), [customerA])

    // Owner B ve solo el suyo.
    const visibleB = await asUser(ownerB, () => db.query('select id from customers'))
    assert.deepEqual(visibleB.rows.map((row) => row.id), [customerB])

    // SUPER_ADMIN no tiene taller: no ve clientes a través de las políticas.
    const visibleSuper = await asUser(superAdmin, () => db.query('select id from customers'))
    assert.deepEqual(visibleSuper.rows, [])
  })

  await t.test('taller suspendido: el equipo pierde el acceso sin perder los datos', async () => {
    await db.query("update workshops set status = 'SUSPENDED' where id = $1", [workshopA])
    const callAs = (name, params, placeholders) => db.query(`select ${name}(${placeholders}) as data`, params)

    await assert.rejects(
      callAs('create_repair_order', [JSON.stringify({ customer_id: customerA, device_id: deviceA, reported_problem: 'Suspendido' }), ownerA], '$1::jsonb,$2::uuid'),
      /suspendido/,
    )
    await assert.rejects(
      callAs('register_inventory_movement', [itemB, 'entrada', 1, 'Stock de otro taller', techA], '$1::uuid,$2::movement_type,$3::integer,$4::text,$5::uuid'),
      /suspendido/,
    )

    // Los datos siguen intactos.
    assert.equal((await db.query('select count(*)::int as count from customers where workshop_id = $1', [workshopA])).rows[0].count, 1)

    await db.query("update workshops set status = 'ACTIVE' where id = $1", [workshopA])
    const created = await call('create_repair_order', [JSON.stringify({ customer_id: customerA, device_id: deviceA, reported_problem: 'Reactivado' }), ownerA], '$1::jsonb,$2::uuid')
    assert.ok(created.order_number)
  })

  await t.test('el stock se mueve solo dentro del mismo taller', async () => {
    await assert.rejects(
      call('register_inventory_movement', [itemB, 'entrada', 2, 'Cruce de stock', ownerA], '$1::uuid,$2::movement_type,$3::integer,$4::text,$5::uuid'),
      /no encontrado/,
    )
    assert.equal((await db.query('select quantity from inventory where id = $1', [itemB])).rows[0].quantity, 7)

    const movement = (await db.query('select workshop_id from inventory_movements where inventory_id = $1 order by created_at desc limit 1', [itemB])).rows[0]
    assert.equal(movement, undefined)
  })
})
