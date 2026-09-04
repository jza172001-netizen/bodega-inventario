-- La tabla guardaba cuándo salió la herramienta, quién la tuvo y en qué estado
-- volvió, pero NO cuándo volvió. Por eso una devolución de hoy seguía apareciendo
-- en el historial con la fecha de su salida (semanas atrás) y "¿qué me devolvieron
-- hoy?" era una pregunta que el Kardex no podía responder. Para una herramienta
-- devuelta dañada que se le va a cobrar a alguien, la fecha es el dato que zanja
-- la discusión.
alter table movements add column if not exists returned_at timestamptz;

comment on column movements.returned_at is
    'Momento en que la herramienta volvió a la bodega. Null si el préstamo sigue afuera.';

-- La devolución ahora deja fecha. Se mantiene la firma de 3 parámetros a
-- propósito: cambiarla crearía una sobrecarga en vez de reemplazar la función,
-- y las llamadas viejas seguirían yendo a la versión sin fecha.
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
            return_notes     = coalesce(p_notes, return_notes),
            -- Si venía de antes sin fecha, se le pone ahora; si ya tenía, se respeta:
            -- la primera devolución es la que vale.
            returned_at      = coalesce(returned_at, now())
        where id = p_movement_id;
        return;
    end if;

    update movements
    set is_returned      = true,
        pending_pickup   = false,
        return_condition = coalesce(p_condition, return_condition),
        return_notes     = coalesce(p_notes, return_notes),
        returned_at      = now()
    where id = p_movement_id;

    -- Solo una salida devuelve unidades a la bodega
    if m.type = 'Salida' then
        update items set quantity = quantity + m.quantity where id = m.item_id;
    end if;
end;
$$;

-- Relleno de las devoluciones que ya existían: la fecha real está en la
-- trazabilidad, que sí la guardó. Se cruza por herramienta + persona + estado,
-- que distingue incluso dos devoluciones del mismo Martillo por personas
-- distintas. Solo toca filas sin fecha, así que volver a correrla no hace nada.
with dev as (
    select a.timestamp,
           substring(a.description from 'Devuelta: "([^"]+)"')  as item_name,
           -- Anclado tras la comilla: hay herramientas cuyo nombre lleva " de "
           -- dentro ("Gafas de seguridad") y sin el ancla se tomaba por persona.
           substring(a.description from '" de (.+?) — estado:') as person_name,
           substring(a.description from 'estado: ([a-z_]+)$')   as cond
    from audit_logs a
    where a.action = 'LOAN_RETURNED'
),
match as (
    select m.id as movement_id, min(d.timestamp) as devuelto_en
    from dev d
    join items i      on i.name = d.item_name
    join personnel p  on p.name = d.person_name
    join movements m  on m.item_id = i.id
                     and m.personnel_id = p.id
                     and m.is_returned = true
                     and m.returned_at is null
                     and coalesce(m.return_condition, '') = coalesce(d.cond, '')
    group by m.id
)
update movements m
set returned_at = k.devuelto_en
from match k
where m.id = k.movement_id;
