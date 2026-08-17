-- Devolver un préstamo NO reponía el stock: la herramienta volvía a la bodega pero la
-- cantidad seguía descontada. Combinado con el borrado del movimiento, dejó 11 herramientas
-- eléctricas en 0 ("AGOTADO" falso) sin ningún movimiento que lo explicara.
-- Marca la devolución y repone la cantidad en una sola transacción. Idempotente.
create or replace function return_loan_and_restore_stock(
    p_movement_id uuid,
    p_condition   text default null,
    p_notes       text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    m record;
begin
    select * into m from movements where id = p_movement_id;
    if not found then
        return;
    end if;

    -- Guarda contra doble devolución: si ya estaba devuelto, no se vuelve a sumar stock
    if m.is_returned then
        update movements
        set return_condition = coalesce(p_condition, return_condition),
            return_notes     = coalesce(p_notes, return_notes)
        where id = p_movement_id;
        return;
    end if;

    update movements
    set is_returned      = true,
        pending_pickup   = false,
        return_condition = coalesce(p_condition, return_condition),
        return_notes     = coalesce(p_notes, return_notes)
    where id = p_movement_id;

    -- Solo una salida devuelve unidades a la bodega
    if m.type = 'Salida' then
        update items set quantity = quantity + m.quantity where id = m.item_id;
    end if;
end;
$$;

-- Borrar un movimiento revertía SIEMPRE su efecto. Ahora que la devolución repone el stock,
-- borrar un préstamo ya devuelto sumaría una segunda vez e inflaría el inventario: su efecto
-- neto ya es cero (salió y volvió), así que solo se borra el registro.
create or replace function delete_movement_and_revert_stock(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    m record;
begin
    select * into m from movements where id = p_movement_id;
    if not found then
        return;
    end if;

    if m.is_loan and m.is_returned then
        -- Efecto neto cero: la unidad ya volvió al stock en la devolución
        delete from movements where id = p_movement_id;
        return;
    end if;

    if m.type in ('Salida', 'Merma') then
        update items set quantity = quantity + m.quantity where id = m.item_id;
    else
        update items set quantity = greatest(quantity - m.quantity, 0) where id = m.item_id;
    end if;

    delete from movements where id = p_movement_id;
end;
$$;
