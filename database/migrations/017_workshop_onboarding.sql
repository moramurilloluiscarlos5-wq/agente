-- Reutiliza workshops, profiles y bootstrap_workshop. No copia datos de negocio.
begin;

create or replace function public.provision_workshop(
  p_owner_user_id uuid, p_owner_name text, p_name text, p_slug text,
  p_phone text default null, p_address text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_workshop public.workshops;
  v_profile public.profiles;
begin
  if coalesce(trim(p_owner_name), '') = '' or length(trim(p_owner_name)) > 150
    or coalesce(trim(p_name), '') = '' or length(trim(p_name)) > 120
    or coalesce(trim(p_slug), '') = '' or length(p_phone) > 40 or length(p_address) > 200 then
    raise exception 'Los datos del taller no son válidos' using errcode = '23514';
  end if;

  -- Serializa altas simultáneas: nunca reasigna al empleado ni crea otro taller.
  select * into v_profile from public.profiles where id = p_owner_user_id for update;
  if not found or not v_profile.is_active then
    raise exception 'El propietario no tiene un perfil activo' using errcode = '42501';
  end if;
  if v_profile.role::text = 'SUPER_ADMIN' then
    raise exception 'SUPER_ADMIN pertenece a la plataforma' using errcode = '42501';
  end if;
  if v_profile.workshop_id is not null then
    raise exception 'Tu cuenta ya pertenece a un taller' using errcode = '23505';
  end if;

  insert into public.workshops (name, slug, owner_user_id, phone, address, status, plan)
  values (trim(p_name), trim(p_slug), p_owner_user_id, nullif(trim(p_phone), ''), nullif(trim(p_address), ''), 'ACTIVE', 'FREE')
  returning * into v_workshop;

  update public.profiles set full_name = trim(p_owner_name), role = 'OWNER', workshop_id = v_workshop.id
  where id = p_owner_user_id returning * into v_profile;
  perform public.bootstrap_workshop(v_workshop.id);
  return jsonb_build_object('workshop', to_jsonb(v_workshop), 'profile', to_jsonb(v_profile));
end;
$$;
revoke all on function public.provision_workshop(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_workshop(uuid, text, text, text, text, text) to service_role;

-- Extiende el trigger existente de Auth. app_metadata solo lo escribe el servidor
-- mediante Admin API; raw_user_meta_data nunca decide roles ni pertenencia.
-- Si falla cualquier paso, también se revierte la inserción en auth.users.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_registration jsonb := new.raw_app_meta_data -> 'workshop_registration';
  v_employee jsonb := new.raw_app_meta_data -> 'workshop_employee';
  v_actor public.profiles;
  v_owner_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, full_name) values (new.id, v_owner_name);
  if v_registration is not null and v_employee is not null then
    raise exception 'Tipo de registro no válido' using errcode = '23514';
  end if;
  if v_registration is not null then
    perform public.provision_workshop(new.id, v_owner_name, v_registration ->> 'name',
      v_registration ->> 'slug', v_registration ->> 'phone', v_registration ->> 'address');
  elsif v_employee is not null then
    select * into v_actor from public.profiles where id = (v_employee ->> 'actor_id')::uuid for share;
    if not found or not v_actor.is_active or v_actor.role::text not in ('OWNER', 'ADMINISTRADOR', 'SUPER_ADMIN')
      or v_actor.workshop_id is null or v_actor.workshop_id is distinct from (v_employee ->> 'workshop_id')::uuid then
      raise exception 'No puedes agregar empleados a este taller' using errcode = '42501';
    end if;
    perform 1 from public.workshops where id = v_actor.workshop_id and status = 'ACTIVE' for share;
    if not found then raise exception 'El taller no está activo' using errcode = '42501'; end if;
    if coalesce(v_employee ->> 'role', '') not in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION', 'CAJERO') then
      raise exception 'Rol de empleado no válido' using errcode = '23514';
    end if;
    update public.profiles set workshop_id = v_actor.workshop_id,
      role = (v_employee ->> 'role')::public.user_role,
      phone = v_employee ->> 'phone', is_active = coalesce((v_employee ->> 'is_active')::boolean, true)
    where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
commit;
notify pgrst, 'reload schema';
