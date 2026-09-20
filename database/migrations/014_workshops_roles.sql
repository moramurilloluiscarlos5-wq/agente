-- ═══════════════════════════════════════════════════════════════════════
--  014 · MULTI-TALLER — parte 2 de 2
--  · Usa como datos los roles OWNER y SUPER_ADMIN (creados en 013).
--  · Reescribe los RPC y triggers para que validen el taller en la BASE DE
--    DATOS, no solo en el backend (defensa en profundidad contra IDOR).
--  · No borra datos: solo convierte al administrador del taller original en
--    su DUEÑO y siembra permisos de los roles nuevos.
--  Ejecutar después de 013_workshops.sql.
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'role_permissions') then
    raise exception 'Aplica 006_security_rbac.sql antes de 014_workshops_roles.sql';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'workshops') then
    raise exception 'Aplica 013_workshops.sql antes de 014_workshops_roles.sql';
  end if;
end $$;

begin;

-- ─── 1. Roles nuevos y sus permisos ─────────────────────────────────────
insert into public.roles (code, name, description) values
  ('OWNER', 'Dueño del taller', 'Administración completa de su propio taller'),
  ('SUPER_ADMIN', 'Super administrador', 'Administración de toda la plataforma')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
select 'OWNER', code from public.permissions
on conflict do nothing;

insert into public.role_permissions (role_code, permission_code)
select 'SUPER_ADMIN', code from public.permissions
on conflict do nothing;

-- ─── 2. El administrador del taller original pasa a ser su DUEÑO ────────
-- Los demás administradores del taller siguen siendo ADMINISTRADOR.
update public.profiles
set role = 'OWNER'
where role = 'ADMINISTRADOR'
  and workshop_id is not null
  and exists (
    select 1 from public.workshops w
    where w.id = profiles.workshop_id and w.owner_user_id = profiles.id
  );

-- ─── 3. Validaciones de taller en los triggers existentes ───────────────
create or replace function public.phase3_validate_device()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.workshop_id is null then
    raise exception 'El dispositivo debe pertenecer a un taller' using errcode = '23514';
  end if;
  if new.deleted_at is null then
    perform 1 from public.customers
      where id = new.customer_id and deleted_at is null and workshop_id = new.workshop_id
      for update;
    if not found then
      raise exception 'El cliente no existe, está archivado o pertenece a otro taller' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.customer_id is distinct from old.customer_id
    and exists (select 1 from public.repair_orders where device_id = old.id) then
    raise exception 'No se puede cambiar el cliente de un dispositivo con órdenes' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.phase3_validate_repair()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.estimated_cost < 0 or new.deposit < 0 then
    raise exception 'Los importes no pueden ser negativos' using errcode = '23514';
  end if;
  if new.workshop_id is null then
    raise exception 'La orden debe pertenecer a un taller' using errcode = '23514';
  end if;
  if new.deleted_at is null and new.status not in ('entregado', 'cancelado') then
    perform 1 from public.customers
      where id = new.customer_id and deleted_at is null and workshop_id = new.workshop_id
      for update;
    if not found then
      raise exception 'El cliente no existe, está archivado o pertenece a otro taller' using errcode = '23514';
    end if;
    if new.device_id is not null then
      perform 1 from public.devices
        where id = new.device_id and customer_id = new.customer_id and deleted_at is null and workshop_id = new.workshop_id
        for update;
      if not found then
        raise exception 'El dispositivo no pertenece al cliente o está archivado' using errcode = '23514';
      end if;
    end if;
  end if;
  if new.technician_id is not null and (tg_op = 'INSERT' or new.technician_id is distinct from old.technician_id) then
    perform 1 from public.profiles
      where id = new.technician_id and is_active
        and role::text in ('OWNER', 'ADMINISTRADOR', 'TECNICO')
        and workshop_id = new.workshop_id
      for share;
    if not found then
      raise exception 'Selecciona un técnico activo del taller' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists phase3_repair_integrity on public.repair_orders;
create trigger phase3_repair_integrity before insert or update on public.repair_orders
for each row execute function public.phase3_validate_repair();

commit;

begin;

-- ─── 4. RPC de órdenes con alcance de taller ────────────────────────────
create or replace function public.create_repair_order(p_data jsonb, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_order public.repair_orders; v_device public.devices; v_workshop uuid;
begin
  -- El taller se deriva del actor: nunca de los datos que envía el navegador.
  select workshop_id into v_workshop
  from public.profiles
  where id = p_actor and is_active and role::text in ('OWNER', 'ADMINISTRADOR', 'RECEPCION')
  for share;
  if not found or v_workshop is null then
    raise exception 'No tienes permiso para crear órdenes' using errcode = '42501';
  end if;
  if not public.workshop_is_active(v_workshop) then
    raise exception 'El taller se encuentra suspendido' using errcode = '42501';
  end if;

  perform 1 from public.customers
    where id = (p_data->>'customer_id')::uuid and deleted_at is null and workshop_id = v_workshop
    for update;
  if not found then raise exception 'Cliente no encontrado' using errcode = 'P0002'; end if;

  select * into v_device from public.devices
    where id = (p_data->>'device_id')::uuid
      and customer_id = (p_data->>'customer_id')::uuid
      and deleted_at is null
      and workshop_id = v_workshop
    for update;
  if not found then raise exception 'El dispositivo no pertenece al cliente o está archivado' using errcode = '23514'; end if;

  if coalesce(trim(p_data->>'reported_problem'), '') = '' then
    raise exception 'Describe el problema reportado' using errcode = '23514';
  end if;

  if (p_data->>'technician_id') is not null and not exists (
    select 1 from public.profiles
    where id = (p_data->>'technician_id')::uuid and is_active and workshop_id = v_workshop
  ) then
    raise exception 'Selecciona un técnico activo del taller' using errcode = '23514';
  end if;

  insert into public.repair_orders (
    workshop_id, customer_id, device_id, brand, model, reported_problem, symptoms, physical_condition,
    is_water_damaged, is_dropped, powers_on, charges, displays_image, touch_works,
    accessories_received, initial_diagnosis, estimated_cost, deposit, estimated_delivery_at,
    technician_id, internal_notes, created_by
  ) values (
    v_workshop, (p_data->>'customer_id')::uuid, v_device.id, v_device.brand, v_device.model,
    p_data->>'reported_problem', p_data->>'symptoms', p_data->>'physical_condition',
    coalesce((p_data->>'is_water_damaged')::boolean, false), coalesce((p_data->>'is_dropped')::boolean, false),
    (p_data->>'powers_on')::boolean, (p_data->>'charges')::boolean, (p_data->>'displays_image')::boolean,
    (p_data->>'touch_works')::boolean, p_data->>'accessories_received', p_data->>'initial_diagnosis',
    coalesce((p_data->>'estimated_cost')::numeric, 0), coalesce((p_data->>'deposit')::numeric, 0),
    (p_data->>'estimated_delivery_at')::timestamptz, (p_data->>'technician_id')::uuid, p_data->>'internal_notes', p_actor
  ) returning * into v_order;

  insert into public.repair_status_history(repair_order_id, status, user_id, note)
    values (v_order.id, v_order.status, p_actor, 'Equipo recibido; orden creada.');
  return to_jsonb(v_order);
end;
$$;

-- siguiente-014-b

create or replace function public.update_repair_order(p_order_number text, p_data jsonb, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_order public.repair_orders; v_new public.repair_orders; v_role text; v_workshop uuid;
begin
  select role::text, workshop_id into v_role, v_workshop
  from public.profiles where id = p_actor and is_active for share;
  if not found or v_workshop is null then
    raise exception 'Usuario inactivo o sin permisos' using errcode = '42501';
  end if;

  -- El número de orden solo se resuelve dentro del taller del actor.
  select * into v_order from public.repair_orders
    where order_number = p_order_number and deleted_at is null and workshop_id = v_workshop
    for update;
  if not found or (v_role = 'TECNICO' and v_order.technician_id is distinct from p_actor) then
    raise exception 'Orden no encontrada' using errcode = 'P0002';
  end if;

  if exists (select 1 from jsonb_object_keys(p_data) k where k not in (
    'reported_problem', 'symptoms', 'physical_condition', 'is_water_damaged', 'is_dropped', 'powers_on',
    'charges', 'displays_image', 'touch_works', 'accessories_received', 'initial_diagnosis',
    'estimated_cost', 'deposit', 'estimated_delivery_at', 'technician_id', 'internal_notes'
  )) then raise exception 'Campo de orden no permitido' using errcode = '23514'; end if;

  if v_role = 'TECNICO' and exists (select 1 from jsonb_object_keys(p_data) k where k not in (
    'initial_diagnosis', 'internal_notes', 'symptoms', 'powers_on', 'charges', 'displays_image', 'touch_works'
  )) then raise exception 'No tienes permiso para modificar ese campo' using errcode = '42501'; end if;

  if (p_data->>'technician_id') is not null and not exists (
    select 1 from public.profiles
    where id = (p_data->>'technician_id')::uuid and is_active and workshop_id = v_workshop
  ) then
    raise exception 'Selecciona un técnico activo del taller' using errcode = '23514';
  end if;

  v_new := jsonb_populate_record(v_order, p_data);
  if coalesce(trim(v_new.reported_problem), '') = '' then
    raise exception 'Describe el problema reportado' using errcode = '23514';
  end if;

  update public.repair_orders set
    reported_problem = v_new.reported_problem, symptoms = v_new.symptoms, physical_condition = v_new.physical_condition,
    is_water_damaged = v_new.is_water_damaged, is_dropped = v_new.is_dropped, powers_on = v_new.powers_on,
    charges = v_new.charges, displays_image = v_new.displays_image, touch_works = v_new.touch_works,
    accessories_received = v_new.accessories_received, initial_diagnosis = v_new.initial_diagnosis,
    estimated_cost = v_new.estimated_cost, deposit = v_new.deposit, estimated_delivery_at = v_new.estimated_delivery_at,
    technician_id = v_new.technician_id, internal_notes = v_new.internal_notes
    where id = v_order.id
    returning * into v_order;
  return to_jsonb(v_order);
end;
$$;

-- siguiente-014-c

create or replace function public.append_repair_history(p_order_number text, p_status public.repair_status, p_note text, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_order public.repair_orders; v_role text; v_workshop uuid;
begin
  select role::text, workshop_id into v_role, v_workshop
  from public.profiles where id = p_actor and is_active for share;
  if not found or v_workshop is null then
    raise exception 'Usuario inactivo o sin permisos' using errcode = '42501';
  end if;

  select * into v_order from public.repair_orders
    where order_number = p_order_number and deleted_at is null and workshop_id = v_workshop
    for update;
  if not found or (v_role = 'TECNICO' and v_order.technician_id is distinct from p_actor) then
    raise exception 'Orden no encontrada' using errcode = 'P0002';
  end if;

  if p_status is null then raise exception 'Selecciona un estado' using errcode = '23514'; end if;
  if v_order.status = p_status and coalesce(trim(p_note), '') = '' then
    raise exception 'Escribe una nota o selecciona otro estado' using errcode = '23514';
  end if;
  if length(p_note) > 5000 then raise exception 'La nota supera 5000 caracteres' using errcode = '23514'; end if;

  update public.repair_orders set status = p_status where id = v_order.id returning * into v_order;
  insert into public.repair_status_history(repair_order_id, status, user_id, note)
    values (v_order.id, p_status, p_actor, nullif(trim(p_note), ''));
  return to_jsonb(v_order);
end;
$$;

create or replace function public.archive_workshop_record(p_entity text, p_id uuid, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_result jsonb; v_workshop uuid;
begin
  select workshop_id into v_workshop from public.profiles
    where id = p_actor and is_active and role::text in ('OWNER', 'ADMINISTRADOR') for share;
  if not found or v_workshop is null then
    raise exception 'Solo administración puede archivar registros' using errcode = '42501';
  end if;

  if p_entity = 'customer' then
    perform 1 from public.customers
      where id = p_id and deleted_at is null and workshop_id = v_workshop for update;
    if not found then raise exception 'Cliente no encontrado' using errcode = 'P0002'; end if;
    if exists (select 1 from public.devices where customer_id = p_id and deleted_at is null)
      or exists (select 1 from public.repair_orders where customer_id = p_id and deleted_at is null and status not in ('entregado', 'cancelado'))
      or exists (select 1 from public.quotes where customer_id = p_id and deleted_at is null and status in ('pendiente', 'aceptada'))
      or exists (select 1 from public.warranties where customer_id = p_id and deleted_at is null and status = 'activa')
      or exists (select 1 from public.payments where customer_id = p_id and deleted_at is null and status <> 'pagado') then
      raise exception 'El cliente tiene dispositivos o servicios activos; archívalos o complétalos primero' using errcode = '23514';
    end if;
    update public.customers set deleted_at = now() where id = p_id returning to_jsonb(customers.*) into v_result;
  elsif p_entity = 'device' then
    perform 1 from public.devices
      where id = p_id and deleted_at is null and workshop_id = v_workshop for update;
    if not found then raise exception 'Dispositivo no encontrado' using errcode = 'P0002'; end if;
    if exists (select 1 from public.repair_orders where device_id = p_id and deleted_at is null and status not in ('entregado', 'cancelado'))
      or exists (select 1 from public.quotes where device_id = p_id and deleted_at is null and status in ('pendiente', 'aceptada'))
      or exists (select 1 from public.warranties where device_id = p_id and deleted_at is null and status = 'activa') then
      raise exception 'El dispositivo tiene reparaciones o servicios activos' using errcode = '23514';
    end if;
    update public.devices set deleted_at = now() where id = p_id returning to_jsonb(devices.*) into v_result;
  else
    raise exception 'Tipo de registro no válido' using errcode = '23514';
  end if;
  return v_result;
end;
$$;

-- ─── 5. Movimientos de inventario con alcance de taller ─────────────────
create or replace function public.register_inventory_movement(
  p_inventory_id uuid,
  p_type movement_type,
  p_quantity integer,
  p_reason text,
  p_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_current_stock integer;
  v_new_stock integer;
  v_workshop uuid;
  v_result jsonb;
begin
  -- El taller se deriva del usuario autenticado, nunca del navegador.
  select workshop_id into v_workshop
  from public.profiles where id = p_user_id and is_active for share;
  if not found or v_workshop is null then
    raise exception 'Usuario sin taller asignado' using errcode = '42501';
  end if;
  if not public.workshop_is_active(v_workshop) then
    raise exception 'El taller se encuentra suspendido' using errcode = '42501';
  end if;

  -- El artículo debe pertenecer al mismo taller: impide mover stock ajeno.
  select quantity into v_current_stock
  from public.inventory
  where id = p_inventory_id and deleted_at is null and workshop_id = v_workshop
  for update;
  if not found then
    raise exception 'Artículo no encontrado' using errcode = 'P0002';
  end if;

  if p_type = 'entrada' then
    v_new_stock := v_current_stock + abs(p_quantity);
  elsif p_type = 'salida' then
    v_new_stock := v_current_stock - abs(p_quantity);
  elsif p_type = 'ajuste' then
    v_new_stock := p_quantity;
  end if;

  if v_new_stock < 0 then
    raise exception 'Stock insuficiente para realizar esta salida' using errcode = '23514';
  end if;

  insert into public.inventory_movements (
    inventory_id, movement_type, quantity, reason, user_id, workshop_id
  ) values (
    p_inventory_id,
    p_type,
    case when p_type = 'ajuste' then v_new_stock - v_current_stock else p_quantity end,
    p_reason,
    p_user_id,
    v_workshop
  );

  update public.inventory
  set quantity = v_new_stock, updated_at = now()
  where id = p_inventory_id;

  select jsonb_build_object('id', p_inventory_id, 'new_stock', v_new_stock) into v_result;
  return v_result;
end;
$$;

-- ─── 6. Alta de taller: configuración y automatizaciones iniciales ──────
-- Un taller nuevo arranca en cero: sin clientes, sin órdenes y sin stock.
create or replace function public.bootstrap_workshop(p_workshop_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
  select name into v_name from public.workshops where id = p_workshop_id;
  if not found then
    raise exception 'Taller no encontrado' using errcode = 'P0002';
  end if;

  insert into public.settings (workshop_id, business_name)
  values (p_workshop_id, v_name)
  on conflict (workshop_id) do nothing;

  insert into public.whatsapp_automations (workshop_id, event_type, template_name) values
    (p_workshop_id, 'recibido', 'repair_received'),
    (p_workshop_id, 'diagnostico', 'repair_diagnosis_complete'),
    (p_workshop_id, 'esperando_autorizacion', 'repair_waiting_authorization'),
    (p_workshop_id, 'esperando_refaccion', 'repair_waiting_part'),
    (p_workshop_id, 'en_reparacion', 'repair_started'),
    (p_workshop_id, 'en_pruebas', 'repair_testing'),
    (p_workshop_id, 'listo_para_entregar', 'repair_ready'),
    (p_workshop_id, 'entregado', 'repair_delivered'),
    (p_workshop_id, 'pago_pendiente', 'payment_pending')
  on conflict (workshop_id, event_type) do nothing;

  insert into public.whatsapp_settings (workshop_id)
  values (p_workshop_id)
  on conflict (workshop_id) do nothing;
end;
$$;

-- ─── 7. Permisos de ejecución: solo el backend (service_role) ───────────
revoke all on function public.create_repair_order(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.update_repair_order(text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.append_repair_history(text, public.repair_status, text, uuid) from public, anon, authenticated;
revoke all on function public.archive_workshop_record(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.register_inventory_movement(uuid, public.movement_type, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.bootstrap_workshop(uuid) from public, anon, authenticated;

grant execute on function public.create_repair_order(jsonb, uuid) to service_role;
grant execute on function public.update_repair_order(text, jsonb, uuid) to service_role;
grant execute on function public.append_repair_history(text, public.repair_status, text, uuid) to service_role;
grant execute on function public.archive_workshop_record(text, uuid, uuid) to service_role;
grant execute on function public.register_inventory_movement(uuid, public.movement_type, integer, text, uuid) to service_role;
grant execute on function public.bootstrap_workshop(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
