-- ============================================================================
-- Restaurar un movimiento: validar y aplicar EN LA MISMA TRANSACCIÓN
-- ============================================================================
-- EL FALLO (R01 — corrección incompleta de A09, no un hallazgo nuevo)
--
-- El recorrido era: `PapeleraView.devolver` → `db.restaurar` →
-- `App.handleRestaurado`. La primera quitaba la lápida DE UNA, y solo después la
-- app miraba si el stock alcanzaba.
--
-- Con una salida borrada de 3 palas y una existencia actual de 1, el resultado
-- reproducido fue: **movimiento activo por 3, stock intacto en 1, y un mensaje
-- diciendo que sigue en la papelera**. La bitácora recibía las dos cosas: que se
-- restauró y que no se restauró.
--
-- La comprobación que se agregó para no recortar el stock a cero era correcta y
-- llegaba tarde. **Validar después de escribir no es validar** — el mismo error
-- que la guarda del accesorio en el endpoint, en otro sitio.
--
-- QUÉ HACE
--
-- Decide y aplica junto. Si no cabe, levanta una excepción y PostgreSQL revierte
-- todo: la lápida se queda puesta, el renglón sigue en la papelera, y el mensaje
-- de la app pasa a ser cierto.
--
-- Un préstamo ya devuelto tiene efecto neto cero —salió y volvió— así que
-- restaurarlo no mueve stock y nunca puede no caber.
-- ============================================================================

create or replace function public.restore_movement_and_apply_stock(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    m record;
begin
    select * into m from movements where id = p_movement_id;
    if not found then
        raise exception 'El movimiento % no existe', p_movement_id;
    end if;

    if m.deleted_at is null then
        return;   -- ya estaba vivo: restaurar dos veces no mueve stock dos veces
    end if;

    if not (m.is_loan and m.is_returned) then
        if m.type in ('Salida', 'Merma') then
            update items set quantity = quantity - m.quantity
            where id = m.item_id and quantity >= m.quantity;
            if not found then
                raise exception 'No alcanza el stock para restaurar esa salida de % unidades', m.quantity;
            end if;
        else
            update items set quantity = quantity + m.quantity where id = m.item_id;
            if not found then
                raise exception 'El ítem del movimiento ya no existe';
            end if;
        end if;
    end if;

    update movements set deleted_at = null, deleted_by = null, updated_at = now()
    where id = p_movement_id;
end;
$function$;
