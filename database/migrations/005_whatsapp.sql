-- Fase 7. WhatsApp, consentimiento, outbox, automatizaciones y webhook.
-- Ejecutar después de 003_phase3.sql y 004_inventory_rpc.sql.
begin;

alter table public.customers
  add column if not exists whatsapp_e164 text,
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists whatsapp_opt_in_at timestamptz,
  add column if not exists whatsapp_opt_in_source text;

create index if not exists customers_whatsapp_e164_idx on public.customers (whatsapp_e164);

create table if not exists public.whatsapp_automations (
  id uuid primary key default gen_random_uuid(),
  event_type text not null unique,
  enabled boolean not null default true,
  template_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists whatsapp_automations_set_updated_at on public.whatsapp_automations;
create trigger whatsapp_automations_set_updated_at before update on public.whatsapp_automations
  for each row execute function public.handle_updated_at();

insert into public.whatsapp_automations (event_type, template_name) values
  ('recibido', 'repair_received'),
  ('diagnostico', 'repair_diagnosis_complete'),
  ('esperando_autorizacion', 'repair_waiting_authorization'),
  ('esperando_refaccion', 'repair_waiting_part'),
  ('en_reparacion', 'repair_started'),
  ('en_pruebas', 'repair_testing'),
  ('listo_para_entregar', 'repair_ready'),
  ('entregado', 'repair_delivered'),
  ('pago_pendiente', 'payment_pending')
on conflict (event_type) do nothing;

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  repair_order_id uuid references public.repair_orders(id) on delete set null,
  sent_by uuid references public.profiles(id) on delete set null,
  direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  phone text not null,
  message_type text not null default 'text' check (message_type in ('text', 'template')),
  template_name text,
  template_parameters jsonb not null default '[]'::jsonb,
  message text not null,
  provider text not null default 'meta',
  provider_message_id text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  error_message text,
  idempotency_key text not null unique,
  retry_count integer not null default 0 check (retry_count >= 0 and retry_count <= 3),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists whatsapp_messages_set_updated_at on public.whatsapp_messages;
create trigger whatsapp_messages_set_updated_at before update on public.whatsapp_messages
  for each row execute function public.handle_updated_at();

create index if not exists whatsapp_messages_customer_idx on public.whatsapp_messages (customer_id, created_at desc);
create index if not exists whatsapp_messages_repair_idx on public.whatsapp_messages (repair_order_id, created_at desc);
create index if not exists whatsapp_messages_status_idx on public.whatsapp_messages (status, created_at);
create unique index if not exists whatsapp_messages_provider_id_idx on public.whatsapp_messages (provider_message_id) where provider_message_id is not null;

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.whatsapp_automations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

revoke insert, update, delete on public.whatsapp_automations, public.whatsapp_messages, public.whatsapp_webhook_events from anon, authenticated;

drop policy if exists whatsapp_automations_select on public.whatsapp_automations;
create policy whatsapp_automations_select on public.whatsapp_automations for select to authenticated
  using (public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION', 'TECNICO'));

drop policy if exists whatsapp_messages_select on public.whatsapp_messages;
create policy whatsapp_messages_select on public.whatsapp_messages for select to authenticated
  using (
    public.current_user_role() in ('ADMINISTRADOR', 'RECEPCION')
    or sent_by = auth.uid()
    or exists (select 1 from public.repair_orders r where r.id = repair_order_id and r.technician_id = auth.uid())
  );

drop policy if exists whatsapp_webhook_events_none on public.whatsapp_webhook_events;
create policy whatsapp_webhook_events_none on public.whatsapp_webhook_events for select to authenticated using (false);

-- Consentimiento también queda protegido por la API de operaciones.
revoke update on public.customers from anon, authenticated;
grant update (first_name, last_name, phone, whatsapp, whatsapp_e164, whatsapp_opt_in, whatsapp_opt_in_at, whatsapp_opt_in_source, email, notes) on public.customers to authenticated;

commit;
