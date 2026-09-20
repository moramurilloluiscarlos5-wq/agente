-- Función para registrar movimientos de inventario y actualizar stock
create or replace function public.register_inventory_movement(
  p_inventory_id uuid,
  p_type movement_type,
  p_quantity integer,
  p_reason text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stock integer;
  v_new_stock integer;
  v_result jsonb;
begin
  -- Obtener stock actual
  select quantity into v_current_stock
  from public.inventory
  where id = p_inventory_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Artículo no encontrado' using errcode = 'P0002';
  end if;

  -- Calcular nuevo stock
  if p_type = 'entrada' then
    v_new_stock := v_current_stock + abs(p_quantity);
  elsif p_type = 'salida' then
    v_new_stock := v_current_stock - abs(p_quantity);
  elsif p_type = 'ajuste' then
    v_new_stock := p_quantity;
  end if;

  if v_new_stock < 0 then
    raise exception 'Stock insuficiente para realizar esta salida' using errcode = '23514';
  end if;

  -- Insertar movimiento
  insert into public.inventory_movements (
    inventory_id,
    movement_type,
    quantity,
    reason,
    user_id
  ) values (
    p_inventory_id,
    p_type,
    case when p_type = 'ajuste' then v_new_stock - v_current_stock else p_quantity end,
    p_reason,
    p_user_id
  );

  -- Actualizar inventario
  update public.inventory
  set quantity = v_new_stock,
      updated_at = now()
  where id = p_inventory_id;

  select jsonb_build_object(
    'id', p_inventory_id,
    'new_stock', v_new_stock
  ) into v_result;

  return v_result;
end;
$$;

-- La API valida permisos y fija el actor antes de invocar esta función.
revoke all on function public.register_inventory_movement(uuid, public.movement_type, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.register_inventory_movement(uuid, public.movement_type, integer, text, uuid) to service_role;
revoke insert, update, delete on public.inventory, public.inventory_movements from anon, authenticated;
