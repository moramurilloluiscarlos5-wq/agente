import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const admin = '11111111-1111-4111-8111-111111111111'
const tech = '22222222-2222-4222-8222-222222222222'
const otherTech = '33333333-3333-4333-8333-333333333333'
const receptionist = '44444444-4444-4444-8444-444444444444'

test('phase 3 and inventory PostgreSQL migrations, transactions, relationships and grants', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
  `)
  // gen_random_uuid() is PostgreSQL core; PGlite doesn't bundle the unused pgcrypto extension.
  const schema = (await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', '')
  const migration = await readFile(new URL('../../database/migrations/003_phase3.sql', import.meta.url), 'utf8')
  const inventoryMigration = await readFile(new URL('../../database/migrations/004_inventory_rpc.sql', import.meta.url), 'utf8')
  await db.exec(schema)
  await db.exec('grant all on all tables in schema public to authenticated, service_role; grant usage, select on all sequences in schema public to authenticated, service_role;')
  await db.exec(migration)
  await db.exec(migration)
  await db.exec(inventoryMigration)
  await db.exec(inventoryMigration)
  await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6),($7,$8)', [admin, 'admin@example.test', tech, 'tech@example.test', otherTech, 'other@example.test', receptionist, 'reception@example.test'])
  await db.query("update profiles set role = case when id = $1 then 'ADMINISTRADOR'::user_role when id = $2 then 'RECEPCION'::user_role else 'TECNICO'::user_role end", [admin, receptionist])
  const customer = (await db.query("insert into customers(first_name,last_name,phone) values ('Ana','López','6141234567') returning id")).rows[0].id
  const customer2 = (await db.query("insert into customers(first_name,last_name,phone) values ('Luis','García','6147654321') returning id")).rows[0].id
  const device = (await db.query("insert into devices(customer_id,brand,model) values ($1,'Samsung','A54') returning id", [customer])).rows[0].id
  const values = { customer_id: customer, device_id: device, reported_problem: 'No enciende', technician_id: tech, estimated_cost: 800 }
  const call = async (name, params, placeholders) => (await db.query(`select ${name}(${placeholders}) as data`, params)).rows[0].data

  await t.test('inventory RPC rejects browser roles and permits the backend service role', async () => {
    const item = (await db.query("insert into inventory(name,sku,quantity) values ('Pantalla','TEST-SCREEN',5) returning id")).rows[0].id
    const params = [item, 'entrada', 2, 'Prueba de permisos', admin]
    const placeholders = '$1::uuid,$2::movement_type,$3::integer,$4::text,$5::uuid'
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await assert.rejects(call('register_inventory_movement', params, placeholders), /permission denied for function register_inventory_movement/)
        await assert.rejects(db.query('update inventory set quantity=99 where id=$1', [item]), /permission denied for table inventory/)
        await assert.rejects(db.query("insert into inventory_movements(inventory_id,movement_type,quantity,user_id) values ($1,'entrada',94,$2)", [item, admin]), /permission denied for table inventory_movements/)
      } finally {
        await db.exec('reset role')
      }
    }
    assert.equal((await db.query('select quantity from inventory where id=$1', [item])).rows[0].quantity, 5)
    assert.equal((await db.query('select count(*)::int as count from inventory_movements where inventory_id=$1', [item])).rows[0].count, 0)

    await db.exec('set role service_role')
    try {
      const grants = (await db.query(`
        select bool_and(has_table_privilege(current_user, 'public.inventory', privilege)) as inventory,
          bool_and(has_table_privilege(current_user, 'public.inventory_movements', privilege)) as movements
        from unnest(array['INSERT', 'UPDATE', 'DELETE']) as privileges(privilege)
      `)).rows[0]
      assert.deepEqual(grants, { inventory: true, movements: true })
      const moved = await call('register_inventory_movement', params, placeholders)
      assert.deepEqual(moved, { id: item, new_stock: 7 })
    } finally {
      await db.exec('reset role')
    }
    assert.equal((await db.query('select quantity from inventory where id=$1', [item])).rows[0].quantity, 7)
    const movements = (await db.query('select quantity,user_id from inventory_movements where inventory_id=$1', [item])).rows
    assert.deepEqual(movements, [{ quantity: 2, user_id: admin }])
  })

  await t.test('create produces a number and initial history in one transaction', async () => {
    await db.exec('set role service_role')
    const created = await call('create_repair_order', [JSON.stringify(values), admin], '$1::jsonb,$2::uuid')
    assert.match(created.order_number, /^CAR-\d{4}-0001$/)
    assert.equal(created.brand, 'Samsung')
    assert.equal(created.status, 'recibido')
    const history = await db.query('select * from repair_status_history where repair_order_id = $1', [created.id])
    assert.equal(history.rows.length, 1)
    assert.equal(history.rows[0].user_id, admin)
    values.order_number = created.order_number
    await db.exec('reset role')
  })

  await t.test('wrong customer/device relationship rejects creation without orphan records', async () => {
    await assert.rejects(call('create_repair_order', [JSON.stringify({ ...values, customer_id: customer2 }), admin], '$1::jsonb,$2::uuid'), /no pertenece/)
    assert.equal((await db.query('select count(*)::int as count from repair_orders')).rows[0].count, 1)
    await assert.rejects(db.query('update devices set customer_id=$1 where id=$2', [customer2, device]), /dispositivo con órdenes/)
  })

  await t.test('technician updates are restricted to their assigned order and allowed fields', async () => {
    await assert.rejects(call('update_repair_order', [values.order_number, '{"initial_diagnosis":"Prueba"}', otherTech], '$1,$2::jsonb,$3::uuid'), /Orden no encontrada/)
    await assert.rejects(call('update_repair_order', [values.order_number, '{"estimated_cost":1}', tech], '$1,$2::jsonb,$3::uuid'), /No tienes permiso/)
    const changed = await call('update_repair_order', [values.order_number, '{"initial_diagnosis":"Puerto dañado"}', tech], '$1,$2::jsonb,$3::uuid')
    assert.equal(changed.initial_diagnosis, 'Puerto dañado')
    assert.equal(Number(changed.estimated_cost), 800)
    await assert.rejects(call('update_repair_order', [values.order_number, '{"status":"entregado"}', admin], '$1,$2::jsonb,$3::uuid'), /Campo de orden/)
  })

  await t.test('failed history insert rolls back status and failed initial history rolls back creation', async () => {
    await db.exec("create function test_fail_history() returns trigger language plpgsql as $$ begin raise exception 'simulated history failure'; end $$; create trigger test_fail_history before insert on repair_status_history for each row execute function test_fail_history();")
    await assert.rejects(call('append_repair_history', [values.order_number, 'diagnostico', 'Prueba', tech], '$1,$2::repair_status,$3,$4::uuid'), /simulated history failure/)
    assert.equal((await db.query('select status from repair_orders where order_number=$1', [values.order_number])).rows[0].status, 'recibido')
    await assert.rejects(call('create_repair_order', [JSON.stringify(values), admin], '$1::jsonb,$2::uuid'), /simulated history failure/)
    assert.equal((await db.query('select count(*)::int as count from repair_orders')).rows[0].count, 1)
    await db.exec('drop trigger test_fail_history on repair_status_history; drop function test_fail_history();')
  })

  await t.test('history updates order and records actor, while rejecting unauthorized and empty notes', async () => {
    await assert.rejects(call('append_repair_history', [values.order_number, 'diagnostico', 'Prueba', otherTech], '$1,$2::repair_status,$3,$4::uuid'), /Orden no encontrada/)
    await assert.rejects(call('append_repair_history', [values.order_number, 'recibido', '', tech], '$1,$2::repair_status,$3,$4::uuid'), /Escribe una nota/)
    const updated = await call('append_repair_history', [values.order_number, 'diagnostico', 'Revisando puerto', tech], '$1,$2::repair_status,$3,$4::uuid')
    assert.equal(updated.status, 'diagnostico')
    assert.equal((await db.query('select count(*)::int as count from repair_status_history')).rows[0].count, 2)
  })

  await t.test('RLS and grants prevent direct edits, role escalation and reading another technician history', async () => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [otherTech])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from repair_orders')).rows.length, 0)
    assert.equal((await db.query('select * from repair_status_history')).rows.length, 0)
    await assert.rejects(db.query("update profiles set role='ADMINISTRADOR' where id=$1", [otherTech]), /permission denied/)
    await assert.rejects(call('append_repair_history', [values.order_number, 'entregado', 'Forged', admin], '$1,$2::repair_status,$3,$4::uuid'), /permission denied/)
    await assert.rejects(db.query("update repair_orders set status='entregado'"), /permission denied/)
    await db.exec('reset role')
  })

  await t.test('archiving requires admin, resolved repairs and archived devices; reopening is blocked', async () => {
    await assert.rejects(call('archive_workshop_record', ['device', device, receptionist], '$1,$2::uuid,$3::uuid'), /Solo administración/)
    await assert.rejects(call('archive_workshop_record', ['device', device, admin], '$1,$2::uuid,$3::uuid'), /servicios activos/)
    await assert.rejects(call('archive_workshop_record', ['customer', customer, admin], '$1,$2::uuid,$3::uuid'), /servicios activos/)
    await call('append_repair_history', [values.order_number, 'entregado', 'Cliente recibió equipo', admin], '$1,$2::repair_status,$3,$4::uuid')
    const archivedDevice = await call('archive_workshop_record', ['device', device, admin], '$1,$2::uuid,$3::uuid')
    assert.ok(archivedDevice.deleted_at)
    await assert.rejects(call('append_repair_history', [values.order_number, 'en_reparacion', 'Reabrir', admin], '$1,$2::repair_status,$3,$4::uuid'), /archivado/)
    const archivedCustomer = await call('archive_workshop_record', ['customer', customer, admin], '$1,$2::uuid,$3::uuid')
    assert.ok(archivedCustomer.deleted_at)
    await assert.rejects(db.query("insert into devices(customer_id,brand,model) values ($1,'Apple','iPhone')", [customer]), /archivado/)
  })

  await t.test('order numbering grows beyond four digits without truncation', async () => {
    await db.exec("select setval('repair_orders_sequence', 9999)")
    const device2 = (await db.query("insert into devices(customer_id,brand,model) values ($1,'Apple','iPhone') returning id", [customer2])).rows[0].id
    const created = await call('create_repair_order', [JSON.stringify({ customer_id: customer2, device_id: device2, reported_problem: 'Pantalla rota' }), admin], '$1::jsonb,$2::uuid')
    assert.match(created.order_number, /-10000$/)
  })
})
