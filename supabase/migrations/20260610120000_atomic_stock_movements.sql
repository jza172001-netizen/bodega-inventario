-- Movimiento + actualización de stock en UNA transacción (corrige C-3),
-- con decremento condicional que evita race conditions entre usuarios (corrige C-4)
-- y rechaza salidas mayores al stock disponible (corrige C-2 a nivel de servidor).
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
set search_path = public
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
    values (p_id, p_item_id, p_type, p_quantity, p_timestamp, p_personnel_id, p_notes, p_project_id, p_is_loan, p_is_returned, p_pending_pickup);
end;
$$;

-- Borrar un movimiento revirtiendo su efecto en el stock, en una sola transacción (corrige C-1 a nivel de servidor)
create or replace function delete_movement_and_revert_stock(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    m record;
begin
    select * into m from movements where id = p_movement_id;
    if not found then
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
