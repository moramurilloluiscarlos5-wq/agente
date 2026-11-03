-- ═══════════════════════════════════════════════════════════════════════
--  021 · Folio de orden con la marca ServiTrack: ST-2026-0001
--  Solo cambia el prefijo de las órdenes NUEVAS. Las existentes conservan
--  su número CAR-…, y el backend acepta ambos formatos.
--  Aplicar en Supabase → SQL Editor después de desplegar el backend que
--  acepta "ST-" (si se aplica antes, las órdenes nuevas no se podrían abrir).
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.set_repair_order_number()
returns trigger language plpgsql set search_path = public
as $$
declare v_sequence text;
begin
  if new.order_number is null then
    v_sequence := nextval('public.repair_orders_sequence')::text;
    new.order_number := format('ST-%s-%s', to_char(now(), 'YYYY'), lpad(v_sequence, greatest(4, length(v_sequence)), '0'));
  end if;
  return new;
end;
$$;
