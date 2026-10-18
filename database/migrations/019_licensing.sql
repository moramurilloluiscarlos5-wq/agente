-- 019 · Licencias por suscripción (Stripe Billing).
--
-- Stripe es la fuente de verdad del cobro; estas tablas solo reflejan su estado.
-- Solo el backend (service_role) escribe: el webhook firmado es el único camino
-- que cambia una suscripción. Ningún usuario autenticado tiene INSERT/UPDATE/DELETE.
--
-- Nota de numeración: 017 y 018 ya existen en este repositorio, por eso esta
-- migración es la 019. Es idempotente y no destruye datos.

begin;

-- ─── 1. Planes ──────────────────────────────────────────────────────────
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'usd' check (char_length(currency) = 3 and currency = lower(currency)),
  interval text not null check (interval in ('month', 'year')),
  -- Opcional: si es nulo, el backend usa STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY.
  stripe_price_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.handle_updated_at();

-- ─── 2. Suscripciones (una fila vigente por taller) ─────────────────────
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null unique references public.workshops(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete')),
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Inicio del periodo de gracia: Stripe adelanta current_period_end al facturar,
  -- así que la gracia no puede calcularse a partir de esa fecha.
  past_due_since timestamptz,
  -- `created` del último evento de Stripe aplicado: descarta eventos fuera de orden.
  last_event_at timestamptz not null default 'epoch',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.handle_updated_at();

-- ─── 3. Eventos de facturación (idempotencia del webhook) ───────────────
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_type_idx on public.billing_events (type, created_at desc);

-- ─── 4. RLS: lectura limitada; escritura solo con service_role ──────────
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;

revoke all on public.plans from anon, authenticated;
revoke all on public.subscriptions from anon, authenticated;
revoke all on public.billing_events from anon, authenticated;

-- Catálogo: cualquiera puede ver los planes activos (sin ids de Stripe).
grant select (id, code, name, price_cents, currency, interval, active) on public.plans to anon, authenticated;
drop policy if exists plans_select_active on public.plans;
create policy plans_select_active on public.plans for select to anon, authenticated using (active);

-- Suscripción: solo OWNER/ADMINISTRADOR del propio taller (y SUPER_ADMIN).
-- Los ids de Stripe y los campos internos no se conceden a los clientes.
grant select (id, workshop_id, plan_id, status, current_period_end, trial_end, cancel_at_period_end, created_at, updated_at)
  on public.subscriptions to authenticated;
drop policy if exists subscriptions_select_admins on public.subscriptions;
create policy subscriptions_select_admins on public.subscriptions for select to authenticated
  using (
    (workshop_id = public.current_workshop_id() and public.is_workshop_admin())
    or public.is_platform_admin()
  );

-- billing_events no tiene políticas ni privilegios para clientes: solo service_role.

grant all on public.plans, public.subscriptions, public.billing_events to service_role;

-- ─── 5. Plan inicial (los precios reales viven en Stripe) ───────────────
insert into public.plans (code, name, price_cents, currency, interval) values
  ('base_monthly', 'Taller Flow · Mensual', 2900, 'usd', 'month'),
  ('base_yearly', 'Taller Flow · Anual', 29000, 'usd', 'year')
on conflict (code) do nothing;

-- ─── 6. Talleres existentes: prueba de 14 días para no bloquearlos ──────
-- Sin esto, el middleware de licencia respondería 402 a todos los talleres ya
-- registrados en cuanto se despliegue el backend.
insert into public.subscriptions (workshop_id, status, trial_end)
select w.id, 'trialing', now() + interval '14 days'
from public.workshops w
where not exists (select 1 from public.subscriptions s where s.workshop_id = w.id);

commit;
