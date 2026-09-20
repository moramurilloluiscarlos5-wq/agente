-- Fase 3. Ejecutar después de schema.sql en el SQL Editor de Supabase.
-- Idempotente. No elimina registros. Las escrituras operativas pasan por la API.
begin;

-- Los perfiles no deben permitir autoasignarse un rol o reactivar una cuenta.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = ''
as $$ select role::text from public.profiles where id = auth.uid() and is_active = true $$;

revoke insert, update, delete on public.customers, public.devices, public.repair_orders, public.repair_status_history from anon, authenticated;

drop policy if exists repair_orders_select on public.repair_orders;
create policy repair_orders_select on public.repair_orders for select to authenticated using (
  deleted_at is null and (
    public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION')
    or (public.current_user_role() = 'TECNICO' and technician_id = auth.uid())
  )
);
drop policy if exists status_history_select on public.repair_status_history;
create policy status_history_select on public.repair_status_history for select to authenticated using (
  exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.deleted_at is null)
);

-- lpad(text, 4) truncaba los folios al superar 9999 órdenes.
create or replace function public.set_repair_order_number()
returns trigger language plpgsql set search_path = public
as $$
declare v_sequence text;
begin
  if new.order_number is null then
    v_sequence := nextval('public.repair_orders_sequence')::text;
    new.order_number := format('CAR-%s-%s', to_char(now(), 'YYYY'), lpad(v_sequence, greatest(4, length(v_sequence)), '0'));
  end if;
  return new;
end;
$$;

-- Bloqueos de fila mantienen el vínculo cliente/dispositivo al archivar o crear.
create or replace function public.phase3_validate_device()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.deleted_at is null then
    perform 1 from public.customers where id = new.customer_id and deleted_at is null for update;
    if not found then raise exception 'El cliente no existe o está archivado' using errcode = '23514'; end if;
  end if;
  if tg_op = 'UPDATE' and new.customer_id is distinct from old.customer_id
    and exists (select 1 from public.repair_orders where device_id = old.id) then
    raise exception 'No se puede cambiar el cliente de un dispositivo con órdenes' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists phase3_device_integrity on public.devices;
create trigger phase3_device_integrity before insert or update on public.devices
for each row execute function public.phase3_validate_device();

create or replace function public.phase3_validate_repair()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.estimated_cost < 0 or new.deposit < 0 then
    raise exception 'Los importes no pueden ser negativos' using errcode = '23514';
  end if;
  if new.deleted_at is null and new.status not in ('entregado', 'cancelado') then
    perform 1 from public.customers where id = new.customer_id and deleted_at is null for update;
    if not found then raise exception 'El cliente no existe o está archivado' using errcode = '23514'; end if;
    if new.device_id is not null then
      perform 1 from public.devices where id = new.device_id and customer_id = new.customer_id and deleted_at is null for update;
      if not found then raise exception 'El dispositivo no pertenece al cliente o está archivado' using errcode = '23514'; end if;
    end if;
  end if;
  if new.technician_id is not null and (tg_op = 'INSERT' or new.technician_id is distinct from old.technician_id) then
    perform 1 from public.profiles where id = new.technician_id and is_active and role in ('ADMINISTRADOR', 'TECNICO') for share;
    if not found then raise exception 'Selecciona un técnico activo' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists phase3_repair_integrity on public.repair_orders;
create trigger phase3_repair_integrity before insert or update on public.repair_orders
for each row execute function public.phase3_validate_repair();

create or replace function public.create_repair_order(p_data jsonb, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_order public.repair_orders; v_device public.devices;
begin
  perform 1 from public.profiles where id = p_actor and is_active and role in ('ADMINISTRADOR', 'RECEPCION') for share;
  if not found then raise exception 'No tienes permiso para crear órdenes' using errcode = '42501'; end if;
  perform 1 from public.customers where id = (p_data->>'customer_id')::uuid and deleted_at is null for update;
  if not found then raise exception 'Cliente no encontrado' using errcode = 'P0002'; end if;
  select * into v_device from public.devices where id = (p_data->>'device_id')::uuid
    and customer_id = (p_data->>'customer_id')::uuid and deleted_at is null for update;
  if not found then raise exception 'El dispositivo no pertenece al cliente o está archivado' using errcode = '23514'; end if;
  if coalesce(trim(p_data->>'reported_problem'), '') = '' then raise exception 'Describe el problema reportado' using errcode = '23514'; end if;

  insert into public.repair_orders (
    customer_id, device_id, brand, model, reported_problem, symptoms, physical_condition,
    is_water_damaged, is_dropped, powers_on, charges, displays_image, touch_works,
    accessories_received, initial_diagnosis, estimated_cost, deposit, estimated_delivery_at,
    technician_id, internal_notes, created_by
  ) values (
    (p_data->>'customer_id')::uuid, v_device.id, v_device.brand, v_device.model,
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

create or replace function public.update_repair_order(p_order_number text, p_data jsonb, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_order public.repair_orders; v_new public.repair_orders; v_role public.user_role;
begin
  select role into v_role from public.profiles where id = p_actor and is_active for share;
  if not found then raise exception 'Usuario inactivo o sin permisos' using errcode = '42501'; end if;
  select * into v_order from public.repair_orders where order_number = p_order_number and deleted_at is null for update;
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
  v_new := jsonb_populate_record(v_order, p_data);
  if coalesce(trim(v_new.reported_problem), '') = '' then raise exception 'Describe el problema reportado' using errcode = '23514'; end if;
  update public.repair_orders set
    reported_problem = v_new.reported_problem, symptoms = v_new.symptoms, physical_condition = v_new.physical_condition,
    is_water_damaged = v_new.is_water_damaged, is_dropped = v_new.is_dropped, powers_on = v_new.powers_on,
    charges = v_new.charges, displays_image = v_new.displays_image, touch_works = v_new.touch_works,
    accessories_received = v_new.accessories_received, initial_diagnosis = v_new.initial_diagnosis,
    estimated_cost = v_new.estimated_cost, deposit = v_new.deposit, estimated_delivery_at = v_new.estimated_delivery_at,
    technician_id = v_new.technician_id, internal_notes = v_new.internal_notes
    where id = v_order.id returning * into v_order;
  return to_jsonb(v_order);
end;
$$;

create or replace function public.append_repair_history(p_order_number text, p_status public.repair_status, p_note text, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare v_order public.repair_orders; v_role public.user_role;
begin
  select role into v_role from public.profiles where id = p_actor and is_active for share;
  if not found then raise exception 'Usuario inactivo o sin permisos' using errcode = '42501'; end if;
  select * into v_order from public.repair_orders where order_number = p_order_number and deleted_at is null for update;
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
declare v_result jsonb;
begin
  perform 1 from public.profiles where id = p_actor and is_active and role = 'ADMINISTRADOR' for share;
  if not found then raise exception 'Solo administración puede archivar registros' using errcode = '42501'; end if;
  if p_entity = 'customer' then
    perform 1 from public.customers where id = p_id and deleted_at is null for update;
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
    perform 1 from public.devices where id = p_id and deleted_at is null for update;
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

revoke all on function public.create_repair_order(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.update_repair_order(text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.append_repair_history(text, public.repair_status, text, uuid) from public, anon, authenticated;
revoke all on function public.archive_workshop_record(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_repair_order(jsonb, uuid) to service_role;
grant execute on function public.update_repair_order(text, jsonb, uuid) to service_role;
grant execute on function public.append_repair_history(text, public.repair_status, text, uuid) to service_role;
grant execute on function public.archive_workshop_record(text, uuid, uuid) to service_role;

create index if not exists repair_orders_device_idx on public.repair_orders(device_id);
notify pgrst, 'reload schema';
commit;
