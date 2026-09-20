-- ═══════════════════════════════════════════════════════════════════════
--  013 · MULTI-TALLER (multi-tenant) — Fase 12, parte 1 de 2
--  Migración ADITIVA. No borra, no trunca y no reinicia nada.
--  Ejecutar después de 012_inventory_low_stock.sql.
--
--  Modelo elegido
--   · Tabla tenant: public.workshops ("taller").
--   · Pertenencia: profiles.workshop_id (un usuario = un taller). No se crea
--     tabla de membresías porque hoy un usuario no trabaja en varios talleres;
--     si eso cambia se agrega workshop_members sin tocar workshop_id.
--   · SUPER_ADMIN es el único rol que puede no tener taller.
--   · Las tablas hijas (repair_status_history, quote_items) se aíslan a través
--     de su tabla padre, que sí lleva workshop_id.
--   · Los roles OWNER/SUPER_ADMIN se agregan al enum aquí y se usan como datos
--     en 014_workshops_roles.sql (PostgreSQL no permite usar un valor de enum
--     recién creado en la misma transacción).
-- ═══════════════════════════════════════════════════════════════════════

alter type public.user_role add value if not exists 'OWNER';
alter type public.user_role add value if not exists 'SUPER_ADMIN';

begin;

-- ─── 1. Talleres ────────────────────────────────────────────────────────
create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid references public.profiles(id) on delete set null,
  phone text,
  email text,
  address text,
  description text,
  logo_url text,
  accent_color text not null default '#2563eb',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  plan text not null default 'FREE' check (plan in ('FREE', 'PRO', 'BUSINESS')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists workshops_set_updated_at on public.workshops;
create trigger workshops_set_updated_at before update on public.workshops
  for each row execute function public.handle_updated_at();

alter table public.workshops enable row level security;
revoke insert, update, delete on public.workshops from anon, authenticated;
-- Cada taller solo puede leer su propia ficha gracias a la política workshops_select.
grant select on public.workshops to authenticated;

-- Taller original: aquí se conservan TODOS los datos que ya existen hoy.
insert into public.workshops (name, slug)
values ('CARLOSTECH', 'carlostech')
on conflict (slug) do nothing;

-- ─── 2. Columna workshop_id en cada entidad raíz (nullable primero) ─────
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'profiles', 'customers', 'devices', 'repair_orders', 'diagnostics', 'quotes',
    'inventory', 'inventory_movements', 'payments', 'warranties',
    'whatsapp_messages', 'whatsapp_automations', 'audit_logs',
    'notifications', 'ai_conversations', 'settings'
  ] loop
    execute format('alter table public.%I add column if not exists workshop_id uuid', v_table);
  end loop;
end $$;

-- ─── 3. Asignar los datos existentes al taller original ─────────────────
do $$
declare v_workshop uuid;
        v_table text;
begin
  select id into v_workshop from public.workshops where slug = 'carlostech';
  if v_workshop is null then
    raise exception 'No se pudo crear el taller inicial CARLOSTECH';
  end if;

  foreach v_table in array array[
    'profiles', 'customers', 'devices', 'repair_orders', 'diagnostics', 'quotes',
    'inventory', 'inventory_movements', 'payments', 'warranties',
    'whatsapp_messages', 'whatsapp_automations', 'audit_logs',
    'notifications', 'ai_conversations', 'settings'
  ] loop
    execute format('update public.%I set workshop_id = $1 where workshop_id is null', v_table) using v_workshop;
  end loop;

  -- El dueño del taller original es el primer administrador existente.
  update public.workshops
  set owner_user_id = (select id from public.profiles where role = 'ADMINISTRADOR' order by created_at limit 1)
  where slug = 'carlostech' and owner_user_id is null;
end $$;

commit;

begin;

-- ─── 4. NOT NULL en las entidades de negocio (profiles queda nullable) ──
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'customers', 'devices', 'repair_orders', 'diagnostics', 'quotes',
    'inventory', 'inventory_movements', 'payments', 'warranties',
    'whatsapp_messages', 'whatsapp_automations', 'audit_logs',
    'notifications', 'ai_conversations', 'settings'
  ] loop
    execute format('alter table public.%I alter column workshop_id set not null', v_table);
  end loop;
end $$;

-- ─── 5. Llaves foráneas hacia workshops (on delete restrict) ────────────
do $$
declare v_table text;
        v_name text;
begin
  foreach v_table in array array[
    'profiles', 'customers', 'devices', 'repair_orders', 'diagnostics', 'quotes',
    'inventory', 'inventory_movements', 'payments', 'warranties',
    'whatsapp_messages', 'whatsapp_automations', 'audit_logs',
    'notifications', 'ai_conversations', 'settings'
  ] loop
    v_name := v_table || '_workshop_id_fkey';
    if not exists (
      select 1 from pg_constraint
      where conname = v_name and conrelid = format('public.%I', v_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (workshop_id) references public.workshops(id) on delete restrict',
        v_table, v_name
      );
    end if;
  end loop;
end $$;

-- ─── 6. Unicidad por taller ─────────────────────────────────────────────
-- Las automatizaciones y los SKU dejan de ser globales: cada taller tiene los suyos.
alter table public.whatsapp_automations drop constraint if exists whatsapp_automations_event_type_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_automations_workshop_event_key') then
    alter table public.whatsapp_automations
      add constraint whatsapp_automations_workshop_event_key unique (workshop_id, event_type);
  end if;
end $$;

alter table public.inventory drop constraint if exists inventory_sku_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_workshop_sku_key') then
    alter table public.inventory add constraint inventory_workshop_sku_key unique (workshop_id, sku);
  end if;
end $$;

-- ─── 7. settings pasa de "fila única" a "una fila por taller" ───────────
do $$
declare v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.settings'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%id = 1%';
  if v_constraint is not null then
    execute format('alter table public.settings drop constraint %I', v_constraint);
  end if;
end $$;

create sequence if not exists public.settings_id_seq;
alter table public.settings alter column id set default nextval('public.settings_id_seq'::regclass);
select setval('public.settings_id_seq', greatest(coalesce((select max(id) from public.settings), 1), 1));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'settings_workshop_id_key') then
    alter table public.settings add constraint settings_workshop_id_key unique (workshop_id);
  end if;
end $$;

-- ─── 8. Configuración de WhatsApp por taller ────────────────────────────
create table if not exists public.whatsapp_settings (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null unique references public.workshops(id) on delete cascade,
  enabled boolean not null default false,
  simulate boolean not null default false,
  phone_number_id text,
  business_account_id text,
  access_token_encrypted text,
  app_secret_encrypted text,
  verify_token text,
  api_version text not null default 'v22.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists whatsapp_settings_set_updated_at on public.whatsapp_settings;
create trigger whatsapp_settings_set_updated_at before update on public.whatsapp_settings
  for each row execute function public.handle_updated_at();

alter table public.whatsapp_settings enable row level security;
revoke insert, update, delete on public.whatsapp_settings from anon, authenticated;

-- ─── 9. Índices por taller ──────────────────────────────────────────────
create index if not exists profiles_workshop_idx on public.profiles (workshop_id);
create index if not exists customers_workshop_created_idx on public.customers (workshop_id, created_at desc);
create index if not exists devices_workshop_created_idx on public.devices (workshop_id, created_at desc);
create index if not exists repair_orders_workshop_status_idx on public.repair_orders (workshop_id, status);
create index if not exists repair_orders_workshop_received_idx on public.repair_orders (workshop_id, received_at desc);
create index if not exists repair_orders_workshop_number_idx on public.repair_orders (workshop_id, order_number);
create index if not exists quotes_workshop_created_idx on public.quotes (workshop_id, created_at desc);
create index if not exists payments_workshop_date_idx on public.payments (workshop_id, payment_date desc);
create index if not exists warranties_workshop_expires_idx on public.warranties (workshop_id, expires_at);
create index if not exists inventory_workshop_name_idx on public.inventory (workshop_id, name);
create index if not exists inventory_movements_workshop_idx on public.inventory_movements (workshop_id, created_at desc);
create index if not exists diagnostics_workshop_idx on public.diagnostics (workshop_id, created_at desc);
create index if not exists whatsapp_messages_workshop_idx on public.whatsapp_messages (workshop_id, created_at desc);
create index if not exists audit_logs_workshop_idx on public.audit_logs (workshop_id, created_at desc);
create index if not exists notifications_workshop_idx on public.notifications (workshop_id, created_at desc);
create index if not exists ai_conversations_workshop_idx on public.ai_conversations (workshop_id, created_at desc);

commit;

begin;

-- ─── 10. Funciones de contexto del taller ───────────────────────────────
-- Devuelven datos derivados de la sesión (auth.uid()), nunca del cliente.
create or replace function public.current_workshop_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select workshop_id from public.profiles where id = auth.uid() and is_active = true $$;

-- Se redefine igual que en 003: un usuario desactivado no debe conservar acceso.
create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = ''
as $$ select role::text from public.profiles where id = auth.uid() and is_active = true $$;

create or replace function public.workshop_is_active(p_workshop uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.workshops where id = p_workshop and status = 'ACTIVE') $$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and is_active and role::text = 'SUPER_ADMIN') $$;

create or replace function public.is_workshop_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_user_role() in ('OWNER', 'ADMINISTRADOR') $$;

-- Sesión utilizable = perfil activo con taller activo (o SUPER_ADMIN).
create or replace function public.session_is_usable()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_platform_admin()
      or (public.current_workshop_id() is not null and public.workshop_is_active(public.current_workshop_id()))
$$;

-- ─── 11. RLS: perfil, clientes y dispositivos ───────────────────────────
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid() or public.is_platform_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (workshop_id = public.current_workshop_id() and public.session_is_usable());
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert to authenticated
  with check (workshop_id = public.current_workshop_id() and public.is_workshop_admin());
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (workshop_id = public.current_workshop_id() and public.is_workshop_admin());
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers for delete to authenticated using (false);

drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices for select to authenticated
  using (workshop_id = public.current_workshop_id() and public.session_is_usable());
drop policy if exists devices_insert on public.devices;
create policy devices_insert on public.devices for insert to authenticated
  with check (workshop_id = public.current_workshop_id() and public.is_workshop_admin());
drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices for update to authenticated
  using (workshop_id = public.current_workshop_id() and public.is_workshop_admin());
drop policy if exists devices_delete on public.devices;
create policy devices_delete on public.devices for delete to authenticated using (false);

-- ─── 12. RLS: órdenes y bitácora ────────────────────────────────────────
drop policy if exists repair_orders_select on public.repair_orders;
create policy repair_orders_select on public.repair_orders for select to authenticated using (
  deleted_at is null
  and workshop_id = public.current_workshop_id()
  and public.session_is_usable()
  and (
    public.current_user_role() in ('OWNER', 'ADMINISTRADOR', 'RECEPCION', 'CAJERO')
    or (public.current_user_role() = 'TECNICO' and technician_id = auth.uid())
  )
);
drop policy if exists repair_orders_insert on public.repair_orders;
create policy repair_orders_insert on public.repair_orders for insert to authenticated with check (false);
drop policy if exists repair_orders_update on public.repair_orders;
create policy repair_orders_update on public.repair_orders for update to authenticated using (false);
drop policy if exists repair_orders_delete on public.repair_orders;
create policy repair_orders_delete on public.repair_orders for delete to authenticated using (false);

drop policy if exists status_history_select on public.repair_status_history;
create policy status_history_select on public.repair_status_history for select to authenticated using (
  public.session_is_usable()
  and exists (
    select 1 from public.repair_orders r
    where r.id = repair_order_id
      and r.deleted_at is null
      and r.workshop_id = public.current_workshop_id()
  )
);
drop policy if exists status_history_insert on public.repair_status_history;
create policy status_history_insert on public.repair_status_history for insert to authenticated with check (false);
drop policy if exists status_history_delete on public.repair_status_history;
create policy status_history_delete on public.repair_status_history for delete to authenticated using (false);

commit;

begin;

-- ─── 13. RLS: resto de las entidades de negocio ─────────────────────────
-- El backend escribe con service_role; el acceso directo con anon key queda
-- limitado al mismo taller y solo en modo lectura salvo lo indicado.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'diagnostics', 'quotes', 'inventory', 'payments', 'warranties',
    'whatsapp_messages', 'whatsapp_automations'
  ] loop
    execute format('drop policy if exists %I on public.%I', v_table || '_select', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_insert', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_update', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_delete', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (workshop_id = public.current_workshop_id() and public.session_is_usable())',
      v_table || '_select', v_table
    );
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', v_table || '_insert', v_table);
    execute format('create policy %I on public.%I for update to authenticated using (false)', v_table || '_update', v_table);
    execute format('create policy %I on public.%I for delete to authenticated using (false)', v_table || '_delete', v_table);
  end loop;
end $$;

-- El técnico solo ve los mensajes de sus órdenes o los que él envió.
drop policy if exists whatsapp_messages_select on public.whatsapp_messages;
create policy whatsapp_messages_select on public.whatsapp_messages for select to authenticated using (
  workshop_id = public.current_workshop_id()
  and public.session_is_usable()
  and (
    public.current_user_role() in ('OWNER', 'ADMINISTRADOR', 'RECEPCION', 'CAJERO')
    or sent_by = auth.uid()
    or exists (
      select 1 from public.repair_orders r
      where r.id = repair_order_id and r.technician_id = auth.uid()
    )
  )
);

-- quote_items e inventory_movements se aíslan a través de su padre.
drop policy if exists quote_items_select on public.quote_items;
create policy quote_items_select on public.quote_items for select to authenticated using (
  public.session_is_usable()
  and exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.deleted_at is null and q.workshop_id = public.current_workshop_id()
  )
);
drop policy if exists inventory_movements_select on public.inventory_movements;
create policy inventory_movements_select on public.inventory_movements for select to authenticated using (
  public.session_is_usable()
  and exists (
    select 1 from public.inventory i
    where i.id = inventory_id and i.deleted_at is null and i.workshop_id = public.current_workshop_id()
  )
);

-- ─── 14. RLS: avisos, IA, configuración y auditoría ─────────────────────
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (
  user_id = auth.uid()
  or (workshop_id = public.current_workshop_id() and public.is_workshop_admin())
);
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated with check (false);
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid());

drop policy if exists ai_conversations_select on public.ai_conversations;
create policy ai_conversations_select on public.ai_conversations for select to authenticated using (
  (user_id = auth.uid() and workshop_id = public.current_workshop_id()) or public.is_platform_admin()
);
drop policy if exists ai_conversations_insert on public.ai_conversations;
create policy ai_conversations_insert on public.ai_conversations for insert to authenticated
  with check (user_id = auth.uid() and workshop_id = public.current_workshop_id() and public.session_is_usable());
drop policy if exists ai_conversations_delete on public.ai_conversations;
create policy ai_conversations_delete on public.ai_conversations for delete to authenticated
  using (user_id = auth.uid() and workshop_id = public.current_workshop_id());

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to authenticated
  using (workshop_id = public.current_workshop_id() and public.session_is_usable());
drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings for update to authenticated
  using (workshop_id = public.current_workshop_id() and public.is_workshop_admin());

-- La auditoría de un taller solo la ve su administración; SUPER_ADMIN ve todo.
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (
  public.is_platform_admin()
  or (workshop_id = public.current_workshop_id() and public.is_workshop_admin())
);

-- Cada taller ve únicamente su propia ficha.
drop policy if exists workshops_select on public.workshops;
create policy workshops_select on public.workshops for select to authenticated
  using (id = public.current_workshop_id() or public.is_platform_admin());

-- Los tokens de WhatsApp nunca se leen desde el navegador.
revoke select on public.whatsapp_settings from anon, authenticated;

commit;

notify pgrst, 'reload schema';
