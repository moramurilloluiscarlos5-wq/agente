-- Device Tools: snapshots and real command audit. The USB commands never run
-- on Supabase/Railway; they run only in the paired localhost agent.
begin;

create table if not exists public.device_tool_events (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  agent_id text,
  serial text,
  mode text not null check (mode in ('adb', 'fastboot')),
  command text not null,
  status text not null check (status in ('ok', 'error', 'timeout')),
  stdout text,
  stderr text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists device_tool_events_workshop_idx on public.device_tool_events (workshop_id, created_at desc);

create table if not exists public.device_diagnostic_snapshots (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  repair_order_id uuid references public.repair_orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  serial text,
  model text,
  stage text not null default 'diagnostico',
  notes text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists device_snapshots_workshop_idx on public.device_diagnostic_snapshots (workshop_id, created_at desc);
create index if not exists device_snapshots_order_idx on public.device_diagnostic_snapshots (repair_order_id, created_at desc);

alter table public.device_tool_events enable row level security;
alter table public.device_diagnostic_snapshots enable row level security;
revoke all on public.device_tool_events, public.device_diagnostic_snapshots from anon, authenticated;
grant select on public.device_tool_events, public.device_diagnostic_snapshots to authenticated;

drop policy if exists device_tool_events_select on public.device_tool_events;
create policy device_tool_events_select on public.device_tool_events for select to authenticated
  using (workshop_id = public.current_workshop_id() and public.session_is_usable());
drop policy if exists device_snapshots_select on public.device_diagnostic_snapshots;
create policy device_snapshots_select on public.device_diagnostic_snapshots for select to authenticated
  using (workshop_id = public.current_workshop_id() and public.session_is_usable());

commit;
notify pgrst, 'reload schema';
