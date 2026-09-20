-- ─── FASE 11: seguimiento público por token ───────────────────────────────
alter table public.repair_orders
  add column if not exists tracking_token text,
  add column if not exists tracking_enabled boolean not null default true;

do $$ begin
  create unique index if not exists repair_orders_tracking_token_key
    on public.repair_orders (tracking_token)
    where tracking_token is not null;
exception when duplicate_object then null;
end $$;

-- Rellenar token único y seguro para órdenes existentes.
update public.repair_orders
set tracking_token = encode(gen_random_bytes(32), 'base64')
where tracking_token is null;

-- Normalizar a formato URL-safe (sin +, / ni =).
update public.repair_orders
set tracking_token = replace(replace(replace(tracking_token, '+', '-'), '/', '_'), '=', '')
where tracking_token is not null
  and tracking_token ~ '[+/=]';

alter table public.repair_orders
  alter column tracking_enabled set default true;

do $$ begin
  alter table public.repair_status_history
    add column if not exists public_message text;
exception when duplicate_column then null;
end $$;