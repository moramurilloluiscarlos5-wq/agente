-- Fase de registro: alta transaccional de taller y propietario.
-- La cuenta de Supabase Auth se crea fuera de PostgreSQL; si esta operación falla,
-- el backend elimina esa cuenta como compensación.
drop function if exists public.provision_workshop(uuid, text, text, text, text);

create or replace function public.provision_workshop(
  p_owner_user_id uuid,
  p_owner_name text,
  p_name text,
  p_slug text,
  p_phone text default null,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop public.workshops;
  v_profile public.profiles;
begin
  if p_owner_user_id is null or coalesce(trim(p_owner_name), '') = '' or coalesce(trim(p_name), '') = '' or coalesce(trim(p_slug), '') = '' then
    raise exception 'Los datos del taller son obligatorios' using errcode = '23514';
  end if;

  insert into public.workshops (name, slug, owner_user_id, phone, address, status, plan)
  values (trim(p_name), trim(p_slug), p_owner_user_id, nullif(trim(p_phone), ''), nullif(trim(p_address), ''), 'ACTIVE', 'FREE')
  returning * into v_workshop;

  update public.profiles
  set full_name = trim(p_owner_name),
      role = 'OWNER',
      workshop_id = v_workshop.id,
      is_active = true
  where id = p_owner_user_id
    and is_active = true;

  if not found then
    raise exception 'El propietario no tiene un perfil activo' using errcode = 'P0002';
  end if;

  perform public.bootstrap_workshop(v_workshop.id);

  update public.settings
  set business_name = v_workshop.name
  where workshop_id = v_workshop.id;

  select * into v_profile from public.profiles where id = p_owner_user_id;
  return jsonb_build_object('workshop', to_jsonb(v_workshop), 'profile', to_jsonb(v_profile));
end;
$$;

revoke all on function public.provision_workshop(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_workshop(uuid, text, text, text, text, text) to service_role;
notify pgrst, 'reload schema';
