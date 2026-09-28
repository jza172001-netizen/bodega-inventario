-- ============================================================================
-- Devolver una parte: la devolución pasa a ser un movimiento propio
-- ============================================================================
-- EL HUECO QUE CIERRA
--
-- Hasta hoy devolver era marcar el préstamo como devuelto. Si salían tres palas
-- y volvía una, NO HABÍA DÓNDE ESCRIBIRLO: o se marcaban las tres como
-- devueltas —y la bodega creía tener dos palas que están en la obra— o no se
-- marcaba ninguna y la que sí volvió seguía figurando afuera. Las dos opciones
-- son mentira, y la encargada tenía que elegir cuál.
--
-- QUÉ CAMBIA
--
-- La devolución es una ENTRADA con su propia fila, enlazada al préstamo que
-- salda por `devuelve_a`. El préstamo no se toca: sigue diciendo tres, que es
-- el dato con el que se reclama. Lo que falta se calcula —tres menos lo que
-- volvió— y dos devoluciones de una son dos renglones, cada uno con su fecha y
-- su estado.
--
-- Y el Kardex cuadra solo, sin excepciones: salida 3, entrada 1, entrada 1. La
-- reposición de stock deja de ser un efecto invisible de marcar una casilla y
-- pasa a ser una línea del libro, como cualquier otra entrada.
--
-- POR QUÉ SIN CLAVE FORÁNEA
--
-- Tentador, y equivocado acá. La app trabaja sin señal y reintenta: una
-- devolución puede llegar al servidor antes que el préstamo que la origina si
-- un reintento se adelanta. Con clave foránea, esa devolución se rechaza y se
-- pierde el dato que más caro cuesta recuperar —lo que pasó— por defender una
-- integridad que igual se comprueba al leer. La prioridad es que el movimiento
-- no se pierda.
-- ============================================================================

alter table movements add column if not exists devuelve_a uuid;

comment on column movements.devuelve_a is
    'El préstamo que ESTA entrada devuelve. Null en cualquier otro movimiento. '
    'Lo pendiente de un préstamo es su cantidad menos la suma de lo que apunta acá.';

-- Se consulta siempre en el mismo sentido: «¿qué devoluciones tiene este
-- préstamo?». El índice es parcial porque la inmensa mayoría de las filas no
-- son devoluciones y no tienen por qué ocupar lugar en él.
create index if not exists movements_devuelve_a_idx
    on movements (devuelve_a) where devuelve_a is not null;

-- ============================================================================
-- El despacho en una transacción, ahora con los campos de la devolución
-- ============================================================================
-- Misma firma y mismo cuerpo que la de 12-sep: lo único que cambia es que el
-- INSERT ya no bota `devuelve_a`, `return_condition`, `return_notes` ni
-- `returned_at`. Sin esto una devolución parcial entraba al servidor como una
-- entrada suelta, el préstamo seguía figurando completo afuera, y el siguiente
-- reintento reponía el stock por segunda vez.
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

        -- El reintento no aplica dos veces. Se pregunta ANTES de tocar el
        -- stock: con un `on conflict do nothing` la fila no se duplicaría,
        -- pero el stock ya se habría movido otra vez.
        if exists (select 1 from movements where id = v_id) then
            continue;
        end if;

        if v_qty is null or v_qty <= 0 then
            raise exception 'Cantidad inválida (%) para el ítem %', v_qty, v_item;
        end if;

        v_delta := case when v_type in ('Salida', 'Merma') then -v_qty else v_qty end;

        if v_delta < 0 then
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
            personnel_id, notes, project_id, is_loan, is_returned, pending_pickup,
            devuelve_a, return_condition, return_notes, returned_at
        ) values (
            v_id, v_item, v_type::movement_type, v_qty, (r->>'timestamp')::timestamptz,
            nullif(r->>'personnel_id', '')::uuid,
            r->>'notes',
            nullif(r->>'project_id', '')::uuid,
            coalesce((r->>'is_loan')::boolean, false),
            coalesce((r->>'is_returned')::boolean, false),
            coalesce((r->>'pending_pickup')::boolean, false),
            nullif(r->>'devuelve_a', '')::uuid,
            nullif(r->>'return_condition', ''),
            nullif(r->>'return_notes', ''),
            nullif(r->>'returned_at', '')::timestamptz
        );
    end loop;
end;
$function$;

-- ============================================================================
-- Cerrar un préstamo NO vuelve a mover el stock
-- ============================================================================
-- `return_loan_and_restore_stock` hace dos cosas a la vez: marca el préstamo y
-- repone el stock. Con la devolución como movimiento propio la reposición ya la
-- hizo la entrada, así que cerrar el préstamo tiene que ser SOLO marcarlo — si
-- se siguiera usando esa función, el stock subiría dos veces por la misma
-- herramienta.
--
-- Cerrarlo es un `update` normal sobre `movements` (ver `markMovementReturned`
-- en `services/supabaseService.ts`), no una función nueva. A propósito: cada
-- función `security definer` que se agrega es una puerta más que la llave
-- pública puede empujar, y acá no hace falta ninguna puerta nueva.
--
-- `return_loan_and_restore_stock` se queda tal cual, sin tocar: la siguen usando
-- las versiones de la app que están abiertas en los teléfonos mientras esta se
-- despliega.
-- ============================================================================
