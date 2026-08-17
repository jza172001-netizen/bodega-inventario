-- Corrige B-1 (auditoría maestra 2026-07-10): el INSERT de log_movement_and_update_stock
-- pasaba p_type (text) a la columna movements.type (enum movement_type) sin cast,
-- por lo que TODOS los movimientos fallaban con 42804 y nunca se persistían.
create or replace function log_movement_and_update_stock(
    p_id             uuid,
    p_item_id        uuid,
    p_type           text,
    p_quantity       numeric,
    p_timestamp      timestamptz,
    p_personnel_id   uuid    default null,
    p_notes          text    default null,
    p_project_id     uuid    default null,
    p_is_loan        boolean default false,
    p_is_returned    boolean default false,
    p_pending_pickup boolean default false
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_delta numeric;
begin
    -- 'Salida' y 'Merma' descuentan; 'Entrada' y 'Compra' suman
    v_delta := case when p_type in ('Salida', 'Merma') then -p_quantity else p_quantity end;

    if v_delta < 0 then
        -- Decremento condicional: si otro usuario consumió el stock primero, falla en vez de quedar negativo
        update items set quantity = quantity + v_delta
        where id = p_item_id and quantity >= -v_delta;
        if not found then
            raise exception 'Stock insuficiente para el ítem %', p_item_id;
        end if;
    else
        update items set quantity = quantity + v_delta where id = p_item_id;
    end if;

    insert into movements (id, item_id, type, quantity, timestamp, personnel_id, notes, project_id, is_loan, is_returned, pending_pickup)
    values (p_id, p_item_id, p_type::movement_type, p_quantity, p_timestamp, p_personnel_id, p_notes, p_project_id, p_is_loan, p_is_returned, p_pending_pickup);
end;
$$;
