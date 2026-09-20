-- Fase IA: metadatos de proveedor y consumo, siempre ligados al taller.
alter table public.diagnostics add column if not exists provider text;
alter table public.diagnostics add column if not exists tokens_used integer;
create index if not exists diagnostics_workshop_provider_idx on public.diagnostics (workshop_id, provider, created_at desc);

-- Un técnico solo puede consultar diagnósticos de sus órdenes asignadas o los
-- que él mismo creó. La API usa service_role, por lo que también aplica esta
-- regla explícitamente en /api/ai/history.
drop policy if exists diagnostics_select on public.diagnostics;
create policy diagnostics_select on public.diagnostics for select to authenticated using (
  public.is_platform_admin()
  or (
    workshop_id = public.current_workshop_id()
    and public.session_is_usable()
    and (
      public.is_workshop_admin()
      or created_by = auth.uid()
      or exists (
        select 1 from public.repair_orders r
        where r.id = diagnostics.repair_order_id
          and r.technician_id = auth.uid()
          and r.workshop_id = diagnostics.workshop_id
          and r.deleted_at is null
      )
    )
  )
);
notify pgrst, 'reload schema';
