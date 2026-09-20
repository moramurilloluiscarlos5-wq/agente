-- Fase 10. Filtro de stock bajo para el inventario.
-- PostgREST no puede comparar dos columnas entre sí (quantity <= min_stock), por lo
-- que el listado de inventario filtra por esta columna generada.
-- Ejecutar después de 011_tracking.sql.
begin;

alter table public.inventory
  add column if not exists is_low_stock boolean generated always as (quantity <= min_stock) stored;

create index if not exists inventory_low_stock_flag_idx on public.inventory (is_low_stock) where is_low_stock;

commit;