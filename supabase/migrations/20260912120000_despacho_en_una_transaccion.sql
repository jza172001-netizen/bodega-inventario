-- ============================================================================
-- El despacho completo en UNA transacción
-- ============================================================================
-- EL FALLO QUE ARREGLA
--
-- Cuando alguien despacha una pala que la app no tenía registrada, el núcleo
-- arma DOS movimientos: primero la entrada que la da por existente, después la
-- salida. En el arreglo los pone en ese orden, pero se mandaban de a un RPC por
-- movimiento, y la red no respeta el orden en que uno los suelta.
--
-- Reproducido: el servidor recibe la salida primero, la rechaza por falta de
-- stock, y guarda la entrada después. La app ya cantó «2 registrados» y muestra
-- saldo cero. El servidor queda con una entrada, ninguna salida y saldo uno.
-- Dos celulares viendo cosas distintas, y ningún error a la vista.
--
-- Esto NO se puede arreglar en la aplicación: mientras sean dos viajes, pueden
-- llegar en cualquier orden o puede llegar uno solo. Tiene que ser un viaje.
--
-- QUÉ HACE
--
-- Recibe el lote entero como JSON y lo aplica EN ORDEN dentro de una sola
-- transacción. Si un renglón falla, no queda ninguno: PostgreSQL revierte todo.
-- O entra el despacho completo, o no entra nada.
--
-- POR QUÉ NO REEMPLAZA A `log_movement_and_update_stock`
--
-- La función de a uno se queda. La app la sigue usando cuando de verdad es un
-- movimiento suelto, y es el camino de respaldo si esta todavía no está
-- instalada en algún ambiente. Quitarla dejaría la app muerta mientras se
-- despliega, que es exactamente lo que no se hace de noche.
-- ============================================================================

create or replace function public.log_movements_and_update_stock(p_movements jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    r        jsonb;
    v_type   text;
    v_qty    numeric;
    v_delta  numeric;
    v_id     uuid;
    v_item   uuid;
begin
    if p_movements is null or jsonb_typeof(p_movements) <> 'array' then
        raise exception 'Se esperaba un arreglo de movimientos';
    end if;

    for r in select * from jsonb_array_elements(p_movements)
    loop
        v_id   := (r->>'id')::uuid;
        v_item := (r->>'item_id')::uuid;
        v_type := r->>'type';
        v_qty  := (r->>'quantity')::numeric;

        -- El reintento no aplica dos veces.
        --
        -- Se pregunta ANTES de tocar el stock, no con un `on conflict do
        -- nothing` al insertar: ahí la fila no se duplicaría, pero el stock ya
        -- se habría movido otra vez. El identificador lo deduce quien llama a
        -- partir de la operación, así que el mismo bloque mandado dos veces
        -- trae los mismos identificadores.
        if exists (select 1 from movements where id = v_id) then
            continue;
        end if;

        -- Una cantidad negativa en una 'Salida' invierte el signo y SUMA stock.
        -- No había nada que lo impidiera: ni en la función ni en la tabla.
        if v_qty is null or v_qty <= 0 then
            raise exception 'Cantidad inválida (%) para el ítem %', v_qty, v_item;
        end if;

        v_delta := case when v_type in ('Salida', 'Merma') then -v_qty else v_qty end;

        if v_delta < 0 then
            -- Decremento condicional: si otro usuario consumió el stock
            -- primero, falla en vez de quedar negativo.
            update items set quantity = quantity + v_delta
            where id = v_item and quantity >= v_qty;
            if not found then
                raise exception 'Stock insuficiente para el ítem %', v_item;
            end if;
        else
            update items set quantity = quantity + v_delta where id = v_item;
            if not found then
                raise exception 'No existe el ítem %', v_item;
            end if;
        end if;

        insert into movements (
            id, item_id, type, quantity, timestamp,
            personnel_id, notes, project_id, is_loan, is_returned, pending_pickup
        ) values (
            v_id, v_item, v_type::movement_type, v_qty, (r->>'timestamp')::timestamptz,
            nullif(r->>'personnel_id', '')::uuid,
            r->>'notes',
            nullif(r->>'project_id', '')::uuid,
            coalesce((r->>'is_loan')::boolean, false),
            coalesce((r->>'is_returned')::boolean, false),
            coalesce((r->>'pending_pickup')::boolean, false)
        );
    end loop;
end;
$function$;

-- ============================================================================
-- Las dos invariantes, escritas donde no se pueden saltar
-- ============================================================================
-- Hasta hoy no había NI UN `check` en toda la base. Las reglas vivían solo en
-- las funciones, así que cualquier escritura que no pasara por ellas —el camino
-- de respaldo, una sincronización, una consulta a mano— podía dejar el
-- inventario en un estado imposible sin que nada chistara.
--
-- Verificado antes de agregarlas contra los datos de producción:
-- 0 movimientos con cantidad <= 0, 0 ítems con cantidad < 0.
-- ============================================================================

-- Envueltas para que se puedan volver a aplicar: la migración base ya las trae,
-- así que sobre una base reconstruida desde cero esto llega segundo. Una
-- migración que solo corre la primera vez no sirve para reconstruir nada.
do $$ begin
    alter table movements add constraint movements_cantidad_positiva check (quantity > 0);
exception when duplicate_object then null; end $$;

do $$ begin
    alter table items add constraint items_cantidad_no_negativa check (quantity >= 0);
exception when duplicate_object then null; end $$;
