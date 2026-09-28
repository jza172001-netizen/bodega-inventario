-- ============================================================================
-- Custodia, ubicación y traslados
-- ============================================================================
-- LOS TRES HUECOS QUE CIERRA (HANDOFF §5)
--
-- 1. No existía «pendiente de verificar». Un ítem estaba en bodega o prestado a
--    alguien, y nada más. Las 24 unidades del Apéndice B.5 —«1 láser Total fuera
--    → posible: Jesús → verificar»— no tenían dónde vivir sin mentir.
-- 2. No había traslado obra → obra. «Mandé una pulidora de Bonilla para El
--    Cristo» se guardaba cambiándole la obra al préstamo: la obra anterior se
--    borraba y el historial decía que siempre había estado en El Cristo.
-- 3. No había «responsable anterior» como dato. El traspaso cerraba un préstamo
--    y abría otro, pero el nuevo no decía de dónde venía — y además lo abría SIN
--    pasar por el stock, así que el libro anotaba dos salidas por una pulidora.
--
-- POR QUÉ EL TRASLADO NO ES UN TIPO DE MOVIMIENTO NUEVO
--
-- Era lo obvio, y es la trampa. Las funciones de stock tratan como ENTRADA todo
-- lo que no es 'Salida' o 'Merma': un tipo 'Traslado' SUMARÍA una pulidora a la
-- bodega en cada traslado, en el servidor y en cada pantalla que calcula por
-- tipo. En su lugar, un traslado es lo que de verdad pasa con la custodia: el
-- préstamo anterior se salda con una devolución enlazada y se abre uno nuevo
-- que dice de cuál viene. Las dos filas van en la misma transacción, el stock
-- sube y baja lo mismo, y el libro cuadra sin excepciones.
-- ============================================================================

alter table movements add column if not exists viene_de            uuid;
alter table movements add column if not exists es_traslado         boolean not null default false;
alter table movements add column if not exists entregado_por       text;
alter table movements add column if not exists responsable_anterior text;

comment on column movements.viene_de is
    'En un préstamo que nace de un traslado o traspaso: el préstamo anterior que saldó. '
    'Es la cadena de custodia — quién la tenía antes y dónde estaba.';
comment on column movements.es_traslado is
    'La fila es la mitad de un traslado o traspaso, no una devolución a bodega ni un despacho. '
    'Los informes de «qué volvió hoy» no la cuentan.';
comment on column movements.entregado_por is
    'Quién hizo la entrega física. No siempre es quien la recibe ni quien registra.';
comment on column movements.responsable_anterior is
    'Quién la tenía antes, dicho con palabras, cuando no hay un préstamo anterior registrado.';

create index if not exists movements_viene_de_idx on movements (viene_de) where viene_de is not null;

-- ============================================================================
-- El lote transaccional, ahora con los campos de custodia
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
            devuelve_a, return_condition, return_notes, returned_at,
            viene_de, es_traslado, entregado_por, responsable_anterior
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
            nullif(r->>'returned_at', '')::timestamptz,
            nullif(r->>'viene_de', '')::uuid,
            coalesce((r->>'es_traslado')::boolean, false),
            nullif(r->>'entregado_por', ''),
            nullif(r->>'responsable_anterior', '')
        );
    end loop;
end;
$function$;

-- ============================================================================
-- asignaciones — lo que está afuera SIN préstamo confirmado
-- ============================================================================
-- Los tres niveles, en palabras de Juli:
--   · confirmada          — se sabe dónde está o quién la tiene hoy, pero no
--                           salió como préstamo registrado (la mezcladora que
--                           vive en El Cristo, sin un responsable).
--   · posible             — aparece relacionada en kardex o planilla, pero no se
--                           sabe si todavía la tiene.
--   · pendiente_verificar — la unidad existe; ni ubicación ni responsable.
--
-- ESTAS UNIDADES NO ESTÁN EN EL LIBRO. No suman al stock de la bodega —no
-- están ahí— ni se descuentan como préstamo —nadie confirmó tenerlas—. Entran al
-- libro solo cuando se resuelven, y siempre por un movimiento:
--   · se halló en bodega       → Entrada «Hallazgo».
--   · se confirmó quién la tiene → Entrada «Hallazgo» + Salida préstamo, juntas.
--
-- Una asignación POSIBLE nunca se vuelve préstamo sola. La regla es de Juli:
-- «no decir "lo tiene Jesús"; decir "1 láser Total fuera → posible asignación:
-- Jesús → verificar"».
--
-- Nada se borra: resolverla la CIERRA (`cerrada_en`, `cierre_motivo`) y queda.
-- ============================================================================
create table if not exists asignaciones (
    id                   uuid primary key default gen_random_uuid(),
    -- El ítem, cuando se sabe cuál es. La lista dice «Pulidoras pequeñas 7», no
    -- de qué marca: exigir el ítem para anotar es exigir clasificar antes de
    -- registrar, que es justo lo que no se le pide a la residente.
    item_id              uuid references items(id),
    descripcion          text not null,
    cantidad             numeric not null check (cantidad > 0),
    estado               text not null check (estado in ('confirmada', 'posible', 'pendiente_verificar')),
    personnel_id         uuid references personnel(id),
    -- El nombre tal como viene en la lista, cuando la persona no está en el
    -- personal o hay dos candidatos («Dani / William»).
    posible_responsable  text,
    project_id           uuid references projects(id),
    ubicacion            text,
    responsable_anterior text,
    entregado_por        text,
    condicion            text not null default 'no_especificado'
                         check (condicion in ('buena', 'mala', 'no_especificado')),
    desde                timestamptz,
    desde_desconocido    boolean not null default true,
    procedencia          text,
    notas                text,
    cerrada_en           timestamptz,
    cierre_motivo        text check (cierre_motivo in
                           ('confirmada_prestamo', 'hallada_bodega', 'hallada_obra', 'perdida', 'duplicada', 'corregida')),
    cierre_nota          text,
    cerrada_por          text,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    deleted_at           timestamptz,
    deleted_by           text
);

create index if not exists asignaciones_abiertas_idx on asignaciones (item_id) where cerrada_en is null and deleted_at is null;

drop trigger if exists asignaciones_touch_updated_at on asignaciones;
create trigger asignaciones_touch_updated_at before update on asignaciones
    for each row execute function touch_updated_at();

-- Igual que las demás tablas HOY: abierta a la llave pública. No es un olvido:
-- la app entera entra como `anon` hasta el corte de la Fase 1, y una tabla
-- cerrada antes que las otras dejaría esta pantalla vacía y las demás andando.
-- El corte la cierra junto con todas.
alter table asignaciones enable row level security;
drop policy if exists asignaciones_all on asignaciones;
create policy asignaciones_all on asignaciones for all using (true) with check (true);

grant select, insert, update on asignaciones to anon, authenticated, service_role;

-- En vivo, como la lista de pedidos: si un teléfono anota o resuelve una, el
-- otro la ve sin recargar. Sin esta línea la suscripción de la app se conecta
-- sin error y no recibe NADA — el peor fallo, el que no avisa. Guardado para
-- que la reconstrucción en un PostgreSQL sin Supabase no se caiga.
do $$ begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'asignaciones') then
        alter publication supabase_realtime add table asignaciones;
    end if;
end $$;
