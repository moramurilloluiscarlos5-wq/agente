-- ═══════════════════════════════════════════════════════════════════════
--  CARLOSTECH AI — Esquema de base de datos (PostgreSQL / Supabase)
--  FASE 2 · Usuarios, roles y permisos reales con Row Level Security (RLS)
--  Ejecutar este archivo completo una sola vez en el SQL Editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Extensiones ────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ─── Tipos (enums) ──────────────────────────────────────────────────────
-- Los bloques DO permiten re-ejecutar el script sin errores (los tipos ya
-- creados se ignoran en lugar de fallar).
do $$ begin
  create type user_role as enum ('ADMINISTRADOR', 'TECNICO', 'RECEPCION');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type repair_status as enum (
    'recibido',
    'diagnostico',
    'esperando_autorizacion',
    'esperando_refaccion',
    'en_reparacion',
    'en_pruebas',
    'listo_para_entregar',
    'entregado',
    'cancelado'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type quote_status as enum ('pendiente', 'aceptada', 'rechazada', 'vencida', 'completada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type inventory_category as enum (
    'Pantallas', 'Baterias', 'Centros_de_carga', 'Flex', 'Camaras',
    'Bocinas', 'Microfonos', 'Herramientas', 'Accesorios', 'Otros'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type movement_type as enum ('entrada', 'salida', 'ajuste');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_method as enum ('efectivo', 'transferencia', 'tarjeta', 'otro');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_status as enum ('pendiente', 'parcial', 'pagado');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type warranty_status as enum ('activa', 'vencida', 'invalidada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type notification_type as enum (
    'repair_created', 'repair_ready', 'low_stock', 'warranty_expiring',
    'payment_pending', 'overdue_delivery', 'system'
  );
exception when duplicate_object then null;
end $$;

-- ─── Secuencias para numeración automática ──────────────────────────────
create sequence if not exists repair_orders_sequence;
create sequence if not exists quotes_sequence;

-- ─── Funciones y triggers globales ──────────────────────────────────────

-- Mantener updated_at actualizado automáticamente
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Crear perfil automáticamente al registrarse un usuario en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- Número de orden automático: CAR-2026-0001
create or replace function public.set_repair_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null then
    new.order_number := format(
      'CAR-%s-%s',
      to_char(now(), 'YYYY'),
      lpad(nextval('repair_orders_sequence')::text, 4, '0')
    );
  end if;
  return new;
end;
$$;

-- Número de cotización automático: COT-2026-0001
create or replace function public.set_quote_number()
returns trigger
language plpgsql
as $$
begin
  if new.quote_number is null then
    new.quote_number := format(
      'COT-%s-%s',
      to_char(now(), 'YYYY'),
      lpad(nextval('quotes_sequence')::text, 4, '0')
    );
  end if;
  return new;
end;
$$;

-- NOTA: current_user_role() se define más abajo, después de crear las tablas,
-- porque las funciones SQL validan sus referencias al momento de crearlas.

-- ─── Tablas ─────────────────────────────────────────────────────────────

-- Staff: enlaza con auth.users (Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'RECEPCION',
  full_name text not null default '',
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on profiles
  for each row execute function public.handle_updated_at();

-- Clientes
create table customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text not null,
  whatsapp text,
  email text,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger customers_set_updated_at before update on customers
  for each row execute function public.handle_updated_at();

create index customers_phone_idx on customers (phone);
create index customers_name_idx on customers (first_name, last_name);
create index customers_deleted_idx on customers (deleted_at);

-- Dispositivos de cada cliente
create table devices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  brand text not null,
  model text not null,
  color text,
  imei text,
  serial_number text,
  os text,
  physical_condition text,
  accessories_received text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger devices_set_updated_at before update on devices
  for each row execute function public.handle_updated_at();

create index devices_customer_idx on devices (customer_id);
create index devices_imei_idx on devices (imei);
create index devices_serial_idx on devices (serial_number);
create index devices_model_idx on devices (model);
create index devices_deleted_idx on devices (deleted_at);

-- Órdenes de reparación
create table repair_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references customers(id) on delete restrict,
  device_id uuid references devices(id) on delete set null,
  brand text,
  model text,
  reported_problem text not null,
  symptoms text,
  physical_condition text,
  is_water_damaged boolean not null default false,
  is_dropped boolean not null default false,
  powers_on boolean,
  charges boolean,
  displays_image boolean,
  touch_works boolean,
  accessories_received text,
  photos_urls text[],
  initial_diagnosis text,
  estimated_cost numeric(10,2) not null default 0,
  deposit numeric(10,2) not null default 0 check (deposit >= 0),
  received_at timestamptz not null default now(),
  estimated_delivery_at timestamptz,
  technician_id uuid references profiles(id) on delete set null,
  status repair_status not null default 'recibido',
  internal_notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger repair_orders_set_number before insert on repair_orders
  for each row when (new.order_number is null)
  execute function public.set_repair_order_number();

create trigger repair_orders_set_updated_at before update on repair_orders
  for each row execute function public.handle_updated_at();

create index repair_orders_number_idx on repair_orders (order_number);
create index repair_orders_status_idx on repair_orders (status);
create index repair_orders_customer_idx on repair_orders (customer_id);
create index repair_orders_technician_idx on repair_orders (technician_id);
create index repair_orders_received_idx on repair_orders (received_at);
create index repair_orders_deleted_idx on repair_orders (deleted_at);

-- Bitácora / historial de estados de la reparación
create table repair_status_history (
  id uuid primary key default gen_random_uuid(),
  repair_order_id uuid not null references repair_orders(id) on delete cascade,
  status repair_status not null,
  user_id uuid references profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index status_history_order_idx on repair_status_history (repair_order_id, created_at);

-- Diagnósticos generados por IA (insumos + respuesta)
create table diagnostics (
  id uuid primary key default gen_random_uuid(),
  repair_order_id uuid references repair_orders(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  input_data jsonb not null,
  ai_response jsonb not null,
  model text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index diagnostics_order_idx on diagnostics (repair_order_id);

-- Cotizaciones
create table quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  repair_order_id uuid references repair_orders(id) on delete set null,
  customer_id uuid not null references customers(id) on delete restrict,
  device_id uuid references devices(id) on delete set null,
  labor_cost numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  subtotal numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  deposit numeric(10,2) not null default 0,
  balance numeric(10,2) not null default 0,
  valid_until date,
  notes text,
  status quote_status not null default 'pendiente',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger quotes_set_number before insert on quotes
  for each row when (new.quote_number is null)
  execute function public.set_quote_number();

create trigger quotes_set_updated_at before update on quotes
  for each row execute function public.handle_updated_at();

create index quotes_number_idx on quotes (quote_number);
create index quotes_customer_idx on quotes (customer_id);
create index quotes_status_idx on quotes (status);
create index quotes_deleted_idx on quotes (deleted_at);

-- Líneas de cada cotización
create table quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  description text not null,
  item_type text not null default 'otro',
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index quote_items_quote_idx on quote_items (quote_id);

-- Inventario de refacciones y accesorios
create table inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  compatible_brand text,
  compatible_model text,
  category inventory_category not null default 'Otros',
  supplier text,
  cost numeric(10,2) not null default 0,
  suggested_price numeric(10,2) not null default 0,
  quantity integer not null default 0 check (quantity >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  location text,
  purchase_date date,
  sku text not null unique,
  is_low_stock boolean generated always as (quantity <= min_stock) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger inventory_set_updated_at before update on inventory
  for each row execute function public.handle_updated_at();

create index inventory_category_idx on inventory (category);
create index inventory_sku_idx on inventory (sku);
create index inventory_low_stock_idx on inventory (quantity) where quantity <= min_stock;
create index inventory_deleted_idx on inventory (deleted_at);

-- Movimientos de inventario (entrada / salida / ajuste)
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventory(id) on delete cascade,
  movement_type movement_type not null,
  quantity integer not null,
  reason text,
  user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index inventory_movements_item_idx on inventory_movements (inventory_id, created_at);

-- Pagos (anticipos, parciales y saldos)
create table payments (
  id uuid primary key default gen_random_uuid(),
  repair_order_id uuid references repair_orders(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  customer_id uuid not null references customers(id) on delete restrict,
  amount numeric(10,2) not null check (amount >= 0),
  method payment_method not null default 'efectivo',
  reference text,
  payment_date timestamptz not null default now(),
  status payment_status not null default 'pagado',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger payments_set_updated_at before update on payments
  for each row execute function public.handle_updated_at();

create index payments_customer_idx on payments (customer_id);
create index payments_order_idx on payments (repair_order_id);
create index payments_date_idx on payments (payment_date);
create index payments_deleted_idx on payments (deleted_at);

-- Garantías
create table warranties (
  id uuid primary key default gen_random_uuid(),
  repair_order_id uuid not null references repair_orders(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  device_id uuid references devices(id) on delete set null,
  service_description text,
  repair_date timestamptz not null default now(),
  duration_days integer not null default 90 check (duration_days > 0),
  expires_at timestamptz not null,
  conditions text,
  status warranty_status not null default 'activa',
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger warranties_set_updated_at before update on warranties
  for each row execute function public.handle_updated_at();

create index warranties_customer_idx on warranties (customer_id);
create index warranties_status_expires_idx on warranties (status, expires_at);
create index warranties_deleted_idx on warranties (deleted_at);

-- Notificaciones internas
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  notification_type notification_type not null default 'system',
  title text not null,
  message text,
  related_order_id uuid references repair_orders(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, read_at);

-- Conversaciones con el asistente CARLOSTECH AI
create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  conversation_id text not null default 'general',
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index ai_conversations_user_idx on ai_conversations (user_id, conversation_id, created_at);

-- Configuración del negocio (fila única, id = 1)
create table settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null default 'CARLOSTECH',
  logo_url text,
  phone text,
  whatsapp text,
  email text,
  address text,
  currency text not null default 'MXN',
  tax_rate numeric(5,2) not null default 0,
  default_warranty_days integer not null default 90,
  bank_data jsonb,
  terms_of_service text,
  accent_color text not null default '#2563eb',
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at before update on settings
  for each row execute function public.handle_updated_at();

insert into settings (id) values (1) on conflict (id) do nothing;

-- Rol del usuario autenticado, usado por las políticas RLS sin recursión.
-- Se define aquí (y no arriba) porque profile ya existe en este punto.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ─── Row Level Security (RLS) ─────────────────────────────────────────────
-- El backend usa la service role key (omite RLS). Estas políticas protegen el
-- acceso directo con la anon key y aplican permisos REALES por rol (no sólo
-- ocultar botones en el frontend).

alter table profiles enable row level security;
alter table customers enable row level security;
alter table devices enable row level security;
alter table repair_orders enable row level security;
alter table repair_status_history enable row level security;
alter table diagnostics enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;
alter table inventory enable row level security;
alter table inventory_movements enable row level security;
alter table payments enable row level security;
alter table warranties enable row level security;
alter table notifications enable row level security;
alter table ai_conversations enable row level security;
alter table settings enable row level security;

-- profiles: sólo para el propio usuario (los roles se leen sin exponer la tabla)
create policy profiles_select_own on profiles for select using (id = auth.uid());
create policy profiles_update_own on profiles for update using (id = auth.uid());

-- customers: todos leen; sólo ADMIN/RECEPCIÓN escriben; borrar sólo ADMIN
create policy customers_select on customers for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy customers_insert on customers for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy customers_update on customers for update to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy customers_delete on customers for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- devices: mismo modelo que customers
create policy devices_select on devices for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy devices_insert on devices for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy devices_update on devices for update to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy devices_delete on devices for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- repair_orders: todos leen; sólo ADMIN/RECEPCIÓN crean; el TÉCNICO actualiza sus órdenes
create policy repair_orders_select on repair_orders for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy repair_orders_insert on repair_orders for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy repair_orders_update on repair_orders for update to authenticated
  using (
    public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION')
    or (public.current_user_role() = 'TECNICO' and technician_id = auth.uid())
  );
create policy repair_orders_delete on repair_orders for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- repair_status_history: bitácora visible para el equipo, escribir permite el equipo
create policy status_history_select on repair_status_history for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy status_history_insert on repair_status_history for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy status_history_delete on repair_status_history for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- diagnostics: el TÉCNICO y ADMIN generan diagnósticos IA
create policy diagnostics_select on diagnostics for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy diagnostics_insert on diagnostics for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO'));
create policy diagnostics_delete on diagnostics for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- quotes / quote_items: leer todo el equipo; escribir ADMIN/RECEPCIÓN; borrar ADMIN
create policy quotes_select on quotes for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy quotes_insert on quotes for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy quotes_update on quotes for update to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy quotes_delete on quotes for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

create policy quote_items_select on quote_items for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy quote_items_insert on quote_items for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy quote_items_update on quote_items for update to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy quote_items_delete on quote_items for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- inventory / movements: ver todos, gestionar stock ADMIN/RECEPCIÓN y equipo técnico
create policy inventory_select on inventory for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy inventory_insert on inventory for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy inventory_update on inventory for update to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION', 'TECNICO'));
create policy inventory_delete on inventory for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

create policy inventory_movements_select on inventory_movements for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy inventory_movements_insert on inventory_movements for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy inventory_movements_delete on inventory_movements for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- payments: leer todos, registrar ADMIN/RECEPCIÓN, borrar ADMIN
create policy payments_select on payments for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy payments_insert on payments for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy payments_update on payments for update to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy payments_delete on payments for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- warranties: ver todos, crear/actualizar ADMIN/RECEPCIÓN
create policy warranties_select on warranties for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'TECNICO', 'RECEPCION'));
create policy warranties_insert on warranties for insert to authenticated
  with check (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy warranties_update on warranties for update to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION'));
create policy warranties_delete on warranties for delete to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- notifications: cada usuario ve/marca las suyas; ADMIN ve todas
create policy notifications_select on notifications for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'ADMINISTRADOR');
create policy notifications_update on notifications for update to authenticated
  using (user_id = auth.uid());
create policy notifications_insert on notifications for insert to authenticated
  with check (public.current_user_role() = 'ADMINISTRADOR');

-- ai_conversations: sólo el autor (o ADMIN en caso de auditoría)
create policy ai_conversations_select on ai_conversations for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'ADMINISTRADOR');
create policy ai_conversations_insert on ai_conversations for insert to authenticated
  with check (user_id = auth.uid());
create policy ai_conversations_delete on ai_conversations for delete to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'ADMINISTRADOR');

-- settings: lectura para el equipo autenticado; cambios sólo ADMIN
create policy settings_select on settings for select to authenticated using (true);
create policy settings_update on settings for update to authenticated
  using (public.current_user_role() = 'ADMINISTRADOR');

-- ─── Trigger de Supabase Auth: crear perfil al registrar usuario ───────────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
