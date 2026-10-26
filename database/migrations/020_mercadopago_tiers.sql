-- 020 · Licencias por niveles (Plus, Pro, Max) cobradas con Mercado Pago.
--
-- Requiere 019_licensing.sql. Reemplaza Stripe por Mercado Pago (suscripciones
-- "preapproval"): las columnas de Stripe pasan a nombres de proveedor genéricos
-- sin perder datos. Igual que en 019, solo el backend (service_role) escribe:
-- la notificación firmada de Mercado Pago es el único camino que cambia una
-- suscripción. Es idempotente.

begin;

-- ─── 1. Planes: nivel y precios en pesos ────────────────────────────────
alter table public.plans add column if not exists tier text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_tier_check' and conrelid = 'public.plans'::regclass) then
    alter table public.plans add constraint plans_tier_check check (tier in ('plus', 'pro', 'max'));
  end if;
end $$;

-- El precio de Stripe ya no se usa: el monto se envía a Mercado Pago desde price_cents.
alter table public.plans drop column if exists stripe_price_id;

-- Planes de un solo nivel de la etapa con Stripe: quedan inactivos. Se marcan como Max
-- para que una suscripción antigua no pierda funciones.
update public.plans set tier = 'max', active = false where code in ('base_monthly', 'base_yearly');
update public.plans set tier = 'max' where tier is null;
alter table public.plans alter column tier set not null;

-- Precios en centavos de MXN. El anual cuesta 10 meses (2 meses gratis).
-- Para cambiar un precio después, edita price_cents aquí: quien ya está suscrito
-- conserva su monto hasta que cambie de plan.
insert into public.plans (code, name, tier, price_cents, currency, interval) values
  ('plus_monthly', 'Plus mensual', 'plus', 29900, 'mxn', 'month'),
  ('plus_yearly', 'Plus anual', 'plus', 299000, 'mxn', 'year'),
  ('pro_monthly', 'Pro mensual', 'pro', 54900, 'mxn', 'month'),
  ('pro_yearly', 'Pro anual', 'pro', 549000, 'mxn', 'year'),
  ('max_monthly', 'Max mensual', 'max', 89900, 'mxn', 'month'),
  ('max_yearly', 'Max anual', 'max', 899000, 'mxn', 'year')
on conflict (code) do nothing;

-- Catálogo público: el nivel también se puede leer.
grant select (tier) on public.plans to anon, authenticated;

-- ─── 2. Suscripciones: identificadores del proveedor ────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'stripe_subscription_id') then
    alter table public.subscriptions rename column stripe_subscription_id to provider_subscription_id;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'stripe_customer_id') then
    alter table public.subscriptions rename column stripe_customer_id to provider_customer_id;
  end if;
end $$;

-- `last_modified` del último cobro aplicado (authorized_payment): descarta resultados
-- de cobro fuera de orden sin mezclarlos con la versión de la suscripción.
alter table public.subscriptions add column if not exists last_payment_at timestamptz not null default 'epoch';

-- ─── 3. Talleres: el nivel contratado se refleja en workshops.plan ──────
alter table public.workshops drop constraint if exists workshops_plan_check;
alter table public.workshops add constraint workshops_plan_check check (plan in ('FREE', 'PLUS', 'PRO', 'MAX', 'BUSINESS'));

commit;
