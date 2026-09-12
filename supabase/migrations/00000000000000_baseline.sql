-- ============================================================================
-- MIGRACIÓN BASE — el punto de partida que faltaba
-- ============================================================================
-- POR QUÉ EXISTE ESTE ARCHIVO
--
-- Hasta hoy el repositorio NO ALCANZABA PARA RECONSTRUIR EL SERVIDOR. Las
-- migraciones versionadas asumían tablas, tipos y funciones creados a mano por
-- fuera de Git: aplicar el repo sobre un proyecto en blanco fallaba en la
-- primera línea. Producción tenía 35 migraciones aplicadas; el repositorio, 17.
--
-- Eso quiere decir que un desastre no tenía vuelta atrás. No es una molestia de
-- orden: es que si la base se pierde, se pierde.
--
-- DE DÓNDE SALIÓ
--
-- Leído del proyecto real (`xmizawuhiounkiaqrwxd`) el **12 de septiembre de
-- 2026**, con `pg_catalog`: tablas, columnas, tipos, claves, restricciones,
-- índices, disparadores, políticas y funciones. No está escrito de memoria ni
-- deducido del código: está copiado de lo que hay instalado.
--
-- CÓMO SE USA
--
-- Es lo PRIMERO que corre sobre una base en blanco. Las migraciones con fecha
-- van encima, en orden. Varias de ellas vuelven a crear funciones que están
-- acá: eso es a propósito y no molesta, porque son `create or replace`.
--
-- QUÉ NO TRAE
--
-- Los DATOS no. Esto levanta el esqueleto vacío. Para recuperar de verdad hace
-- falta además el respaldo de las filas — ver `supabase/RESTAURAR.md`.
-- ============================================================================

-- Producción usa `gen_random_uuid()`, de la extensión `uuid-ossp`, porque el
-- proyecto se creó cuando esa era la costumbre. Acá se usa `gen_random_uuid()`,
-- que es NATIVA de PostgreSQL desde la versión 13 y no necesita extensión.
--
-- Es a propósito y es mejor: una migración base que depende de una extensión
-- disponible solo en algunos servidores no sirve para reconstruir en cualquier
-- parte, que es justo para lo que existe. El valor que generan es el mismo UUID.
--
-- Se intenta instalar `uuid-ossp` igual, por si alguna migración futura la pide,
-- pero NO se frena si no está: reconstruir no puede depender de eso.
do $$ begin
    create extension if not exists "uuid-ossp";
exception when others then
    raise notice 'uuid-ossp no está disponible; se usa gen_random_uuid() y no hace falta';
end $$;

-- ── Los tipos ───────────────────────────────────────────────────────────────
-- `Accesorio` está en `inventory_type` pero no en el enum de TypeScript: es un
-- valor que quedó en la base y que el código no produce. No se quita acá; quitar
-- un valor de un enum en PostgreSQL no es trivial y no hace daño estar.

do $$ begin
    create type inventory_type as enum (
        'Herramienta Manual', 'Herramienta Eléctrica',
        'Equipo de Protección Personal', 'Material de Consumo', 'Accesorio');
exception when duplicate_object then null; end $$;

do $$ begin
    create type movement_type as enum ('Compra', 'Entrada', 'Salida', 'Merma');
exception when duplicate_object then null; end $$;

do $$ begin
    create type project_status as enum ('active', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
    create type purchase_order_status as enum ('Ordenado', 'Enviado', 'Recibido', 'Cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
    create type user_role as enum ('owner', 'employee', 'visitor');
exception when duplicate_object then null; end $$;

-- ── Las tablas ──────────────────────────────────────────────────────────────
-- `deleted_at` / `deleted_by` están en casi todas: es la LÁPIDA. Nada se borra
-- de verdad, porque una fila que desaparece la resucita el otro celular, que
-- todavía la tiene guardada y la vuelve a subir. Así volvieron 19 ítems el 18 de
-- agosto y 4 trabajadores el 9 de junio.
--
-- `updated_at` es lo que decide QUIÉN GANA cuando el teléfono y la nube no
-- coinciden: gana la fecha más nueva. Sin eso, una corrección hecha en el
-- teléfono se borraba sola al siguiente arranque.

create table if not exists items (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    category text not null,
    sub_category text not null default ''::text,
    inventory_type inventory_type not null,
    quantity numeric(12,2) not null default 0,
    min_stock numeric(12,2) not null default 0,
    price numeric(14,2) not null default 0,
    unit text not null default 'und'::text,
    color text,
    brand text,
    familia text,
    requires_return_note boolean not null default false,
    accessories jsonb not null default '[]'::jsonb,
    reparacion jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);

create table if not exists personnel (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone text,
    is_team_leader boolean not null default false,
    team_leader_id uuid references personnel(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);

create table if not exists projects (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    status project_status not null default 'active'::project_status,
    created_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);

create table if not exists movements (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references items(id) on delete cascade,
    type movement_type not null,
    quantity numeric(12,2) not null,
    "timestamp" timestamptz not null default now(),
    personnel_id uuid references personnel(id) on delete set null,
    notes text,
    project_id uuid references projects(id) on delete set null,
    is_loan boolean not null default false,
    is_returned boolean not null default false,
    pending_pickup boolean not null default false,
    return_condition text,
    return_notes text,
    returned_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);

create table if not exists purchase_orders (
    id uuid primary key default gen_random_uuid(),
    supplier text not null,
    status purchase_order_status not null default 'Ordenado'::purchase_order_status,
    order_date timestamptz not null default now(),
    expected_delivery_date timestamptz,
    received_date timestamptz,
    notes text,
    created_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);

create table if not exists purchase_order_items (
    id uuid primary key default gen_random_uuid(),
    purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
    item_id uuid not null references items(id) on delete restrict,
    quantity numeric(12,2) not null,
    price numeric(14,2) not null
);

-- OJO: `password` en texto plano. Está así en producción y esta migración copia
-- lo que hay, no lo que debería haber. `password_hash` existe pero es el respaldo
-- del navegador, no la credencial del servidor. Cerrar esto pide identidad de
-- servidor, que hoy no existe — ver HANDOFF.
create table if not exists app_users (
    id uuid primary key default gen_random_uuid(),
    username text unique,
    password text not null,
    password_hash text,
    role user_role not null default 'employee'::user_role,
    name text not null,
    setup_complete boolean not null default false,
    created_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);

-- La bitácora y el registro de uso llevan id de TEXTO, no uuid: se generan en el
-- navegador con un formato propio (`audit-<hora>-<azar>`).
create table if not exists audit_logs (
    id text primary key,
    "timestamp" timestamptz not null default now(),
    actor text not null default ''::text,
    action text not null default ''::text,
    description text not null default ''::text,
    origen text,
    operacion_id text,
    created_at timestamptz not null default now()
);

create table if not exists behavior_logs (
    id text primary key,
    "timestamp" timestamptz not null default now(),
    actor text not null default ''::text,
    action text not null default ''::text,
    detail text not null default ''::text,
    created_at timestamptz not null default now()
);

create table if not exists order_list (
    id uuid primary key default gen_random_uuid(),
    texto text not null,
    cantidad numeric,
    unidad text,
    familia text,
    color text,
    comprado boolean not null default false,
    recibido boolean not null default false,
    recibido_qty numeric,
    recibido_at timestamptz,
    item_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);

create table if not exists push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_key text not null unique,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    created_at timestamptz default now()
);

-- ── Las dos invariantes ─────────────────────────────────────────────────────
-- Puestas el 12-sep-2026. Antes NO HABÍA NI UN `check` en toda la base: las
-- reglas vivían solo en las funciones, así que cualquier escritura que no pasara
-- por ellas podía dejar el inventario en un estado imposible sin que nada
-- chistara. Una 'Salida' con cantidad negativa invertía el signo y SUMABA stock.

do $$ begin
    alter table movements add constraint movements_cantidad_positiva check (quantity > 0);
exception when duplicate_object then null; end $$;

do $$ begin
    alter table items add constraint items_cantidad_no_negativa check (quantity >= 0);
exception when duplicate_object then null; end $$;

-- ── Los índices ─────────────────────────────────────────────────────────────
-- Los `_vivos` y `_deleted_at_idx` son las dos caras de la lápida: una consulta
-- pide lo vivo y la papelera pide lo enterrado.

create index if not exists idx_items_inventory_type   on items (inventory_type);
create index if not exists items_vivos                on items (deleted_at) where deleted_at is null;
create index if not exists items_deleted_at_idx       on items (deleted_at) where deleted_at is not null;

create index if not exists idx_movements_item_id      on movements (item_id);
create index if not exists idx_movements_personnel_id on movements (personnel_id);
create index if not exists idx_movements_project_id   on movements (project_id);
create index if not exists idx_movements_timestamp    on movements ("timestamp" desc);
create index if not exists idx_movements_loan_active  on movements (is_loan) where is_loan = true and is_returned = false;
create index if not exists movements_vivos            on movements (deleted_at) where deleted_at is null;
create index if not exists movements_deleted_at_idx   on movements (deleted_at) where deleted_at is not null;

create index if not exists personnel_vivos            on personnel (id) where deleted_at is null;
create index if not exists personnel_deleted_at_idx   on personnel (deleted_at) where deleted_at is not null;
create index if not exists projects_vivos             on projects (id) where deleted_at is null;
create index if not exists projects_deleted_at_idx    on projects (deleted_at) where deleted_at is not null;

create index if not exists idx_poi_order_id           on purchase_order_items (purchase_order_id);
create index if not exists purchase_orders_vivos      on purchase_orders (id) where deleted_at is null;
create index if not exists purchase_orders_deleted_at_idx on purchase_orders (deleted_at) where deleted_at is not null;

create index if not exists idx_audit_logs_timestamp   on audit_logs ("timestamp" desc);
create index if not exists audit_logs_origen_idx      on audit_logs (origen, "timestamp" desc) where origen is not null;
create index if not exists audit_logs_operacion_idx   on audit_logs (operacion_id) where operacion_id is not null;
create index if not exists behavior_logs_timestamp_idx on behavior_logs ("timestamp" desc);

create index if not exists app_users_deleted_at_idx   on app_users (deleted_at) where deleted_at is not null;
create index if not exists order_list_deleted_at_idx  on order_list (deleted_at) where deleted_at is not null;

-- ── El sello de última modificación ─────────────────────────────────────────
-- Respeta el sello que mande el cliente: si la app ya puso `updated_at`, no se
-- pisa. Eso es lo que hace que una corrección hecha en el teléfono le gane a la
-- fila vieja de la nube cuando vuelva a sincronizar.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $function$
begin
    if new.updated_at is not distinct from old.updated_at then
        new.updated_at = now();
    end if;
    return new;
end;
$function$;

drop trigger if exists items_touch_updated_at on items;
create trigger items_touch_updated_at before update on items
    for each row execute function touch_updated_at();

drop trigger if exists movements_touch_updated_at on movements;
create trigger movements_touch_updated_at before update on movements
    for each row execute function touch_updated_at();

drop trigger if exists personnel_touch_updated_at on personnel;
create trigger personnel_touch_updated_at before update on personnel
    for each row execute function touch_updated_at();

drop trigger if exists order_list_touch_updated_at on order_list;
create trigger order_list_touch_updated_at before update on order_list
    for each row execute function touch_updated_at();

-- ── Los accesos ─────────────────────────────────────────────────────────────
-- `security definer` porque las políticas de `app_users` no dejan leer la tabla
-- de frente: estas funciones devuelven lo que se puede mostrar y nunca la
-- contraseña.
--
-- `authenticate_user` compara la contraseña EN TEXTO PLANO, y entra por nombre o
-- por usuario, sin distinguir mayúsculas. Está copiado de producción tal cual.

create or replace function public.authenticate_user(p_username text, p_password text)
returns table(user_id uuid, user_role text, user_name text)
language plpgsql
security definer
as $function$
begin
    return query
    select id, role::text, name
    from app_users
    where deleted_at is null
      and (lower(btrim(coalesce(username, ''))) = lower(btrim(p_username))
           or lower(btrim(coalesce(name, ''))) = lower(btrim(p_username)))
      and password = p_password
    limit 1;
end;
$function$;

create or replace function public.get_users_safe()
returns table(user_id uuid, user_username text, user_role text, user_name text, user_setup_complete boolean)
language plpgsql
security definer
as $function$
begin
    return query
    select id, username, role::text, name, coalesce(setup_complete, false)
    from app_users where deleted_at is null order by name;
end;
$function$;

create or replace function public.get_deleted_users_safe()
returns table(user_id uuid, user_username text, user_role text, user_name text,
              user_deleted_at timestamptz, user_deleted_by text)
language plpgsql
security definer
as $function$
begin
    return query
    select id, username, role::text, name, deleted_at, deleted_by
    from app_users where deleted_at is not null order by deleted_at desc;
end;
$function$;

create or replace function public.restore_user(p_id uuid)
returns void
language plpgsql
security definer
as $function$
begin
    update app_users set deleted_at = null, deleted_by = null where id = p_id;
end;
$function$;

-- ── El stock ────────────────────────────────────────────────────────────────
-- Las tres funciones que mueven inventario. Las definiciones completas —con el
-- porqué de cada guarda— están en las migraciones con fecha que van encima de
-- esta; acá quedan en su forma vigente al 12-sep-2026 para que una base en
-- blanco arranque coherente.

create or replace function public.log_movement_and_update_stock(
    p_id uuid, p_item_id uuid, p_type text, p_quantity numeric, p_timestamp timestamptz,
    p_personnel_id uuid default null, p_notes text default null, p_project_id uuid default null,
    p_is_loan boolean default false, p_is_returned boolean default false, p_pending_pickup boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    v_delta numeric;
begin
    v_delta := case when p_type in ('Salida', 'Merma') then -p_quantity else p_quantity end;
    if v_delta < 0 then
        -- Decremento condicional: si otro usuario consumió el stock primero,
        -- falla en vez de quedar negativo.
        update items set quantity = quantity + v_delta
        where id = p_item_id and quantity >= -v_delta;
        if not found then
            raise exception 'Stock insuficiente para el ítem %', p_item_id;
        end if;
    else
        update items set quantity = quantity + v_delta where id = p_item_id;
    end if;
    insert into movements (id, item_id, type, quantity, "timestamp", personnel_id, notes, project_id, is_loan, is_returned, pending_pickup)
    values (p_id, p_item_id, p_type::movement_type, p_quantity, p_timestamp, p_personnel_id, p_notes, p_project_id, p_is_loan, p_is_returned, p_pending_pickup);
end;
$function$;

-- El lote entero en UNA transacción. Con un RPC por movimiento, la red podía
-- entregar la salida antes que su entrada automática: el servidor rechazaba la
-- salida por falta de stock y guardaba la entrada después, mientras la app ya
-- había cantado éxito. O entra el despacho completo, o no entra nada.
create or replace function public.log_movements_and_update_stock(p_movements jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    r jsonb; v_type text; v_qty numeric; v_delta numeric; v_id uuid; v_item uuid;
begin
    if p_movements is null or jsonb_typeof(p_movements) <> 'array' then
        raise exception 'Se esperaba un arreglo de movimientos';
    end if;
    for r in select * from jsonb_array_elements(p_movements)
    loop
        v_id := (r->>'id')::uuid; v_item := (r->>'item_id')::uuid;
        v_type := r->>'type';     v_qty := (r->>'quantity')::numeric;

        -- El reintento no aplica dos veces. Se pregunta ANTES de tocar el stock:
        -- con un `on conflict do nothing` al insertar, la fila no se duplicaría
        -- pero el stock ya se habría movido otra vez.
        if exists (select 1 from movements where id = v_id) then continue; end if;

        if v_qty is null or v_qty <= 0 then
            raise exception 'Cantidad inválida (%) para el ítem %', v_qty, v_item;
        end if;

        v_delta := case when v_type in ('Salida', 'Merma') then -v_qty else v_qty end;
        if v_delta < 0 then
            update items set quantity = quantity + v_delta where id = v_item and quantity >= v_qty;
            if not found then raise exception 'Stock insuficiente para el ítem %', v_item; end if;
        else
            update items set quantity = quantity + v_delta where id = v_item;
            if not found then raise exception 'No existe el ítem %', v_item; end if;
        end if;

        insert into movements (id, item_id, type, quantity, "timestamp", personnel_id, notes, project_id, is_loan, is_returned, pending_pickup)
        values (v_id, v_item, v_type::movement_type, v_qty, (r->>'timestamp')::timestamptz,
                nullif(r->>'personnel_id', '')::uuid, r->>'notes', nullif(r->>'project_id', '')::uuid,
                coalesce((r->>'is_loan')::boolean, false),
                coalesce((r->>'is_returned')::boolean, false),
                coalesce((r->>'pending_pickup')::boolean, false));
    end loop;
end;
$function$;

-- Borrar pone LÁPIDA, no borra la fila. Una fila que desaparece la resucita el
-- otro celular en la siguiente sincronización.
create or replace function public.delete_movement_and_revert_stock(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    m record;
begin
    select * into m from movements where id = p_movement_id and deleted_at is null;
    if not found then return; end if;
    -- Un préstamo ya devuelto tiene efecto neto cero: salió y volvió. Revertirlo
    -- sumaría una segunda vez e inflaría el stock.
    if not (m.is_loan and m.is_returned) then
        if m.type in ('Salida', 'Merma') then
            update items set quantity = quantity + m.quantity where id = m.item_id;
        else
            update items set quantity = greatest(quantity - m.quantity, 0) where id = m.item_id;
        end if;
    end if;
    update movements set deleted_at = now(), updated_at = now() where id = p_movement_id;
end;
$function$;

create or replace function public.return_loan_and_restore_stock(
    p_movement_id uuid, p_condition text default null, p_notes text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    m record;
begin
    select * into m from movements where id = p_movement_id;
    if not found then return; end if;
    -- Guarda contra doble devolución: si ya estaba devuelto, no se suma otra vez.
    if m.is_returned then
        update movements
        set return_condition = coalesce(p_condition, return_condition),
            return_notes     = coalesce(p_notes, return_notes),
            returned_at      = coalesce(returned_at, now())
        where id = p_movement_id;
        return;
    end if;
    update movements
    set is_returned = true, pending_pickup = false,
        return_condition = coalesce(p_condition, return_condition),
        return_notes     = coalesce(p_notes, return_notes),
        returned_at      = now()
    where id = p_movement_id;
    if m.type = 'Salida' then
        update items set quantity = quantity + m.quantity where id = m.item_id;
    end if;
end;
$function$;

-- ── Seguridad a nivel de fila ───────────────────────────────────────────────
-- ⚠️ ESTO ESTÁ ABIERTO, Y ASÍ ESTÁ EN PRODUCCIÓN.
--
-- RLS está ACTIVO en todas las tablas, pero cada política es `for all to public
-- using (true) with check (true)`: o sea, activo y sin filtrar nada. Cualquiera
-- con la clave pública —que va adentro del JavaScript publicado— puede leer y
-- escribir el inventario entero.
--
-- Esta migración lo copia tal cual A PROPÓSITO: el archivo tiene que reproducir
-- el servidor que existe, no el que debería existir. Cerrarlo no se hace acá ni
-- se hace revocando, porque la app entra a Supabase COMO `anon` y quedaría
-- muerta. Pide identidad de servidor, que hoy no existe — ver HANDOFF.

alter table items                enable row level security;
alter table movements            enable row level security;
alter table personnel            enable row level security;
alter table projects             enable row level security;
alter table purchase_orders      enable row level security;
alter table purchase_order_items enable row level security;
alter table audit_logs           enable row level security;
alter table behavior_logs        enable row level security;
alter table app_users            enable row level security;
alter table order_list           enable row level security;
alter table push_subscriptions   enable row level security;

do $$
declare t text;
begin
    foreach t in array array['items','movements','personnel','projects','purchase_orders',
                             'purchase_order_items','audit_logs','behavior_logs']
    loop
        execute format('drop policy if exists service_access on %I', t);
        execute format('create policy service_access on %I for all using (true) with check (true)', t);
    end loop;
end $$;

drop policy if exists order_list_all on order_list;
create policy order_list_all on order_list for all using (true) with check (true);

drop policy if exists allow_all_push_subscriptions on push_subscriptions;
create policy allow_all_push_subscriptions on push_subscriptions for all using (true) with check (true);

-- `app_users` no tiene política de SELECT: leer la tabla de frente no se puede,
-- y por eso existen `get_users_safe` y `get_deleted_users_safe`.
drop policy if exists allow_insert on app_users;
create policy allow_insert on app_users for insert with check (true);
drop policy if exists allow_update on app_users;
create policy allow_update on app_users for update using (true) with check (true);
drop policy if exists allow_delete on app_users;
create policy allow_delete on app_users for delete using (true);
