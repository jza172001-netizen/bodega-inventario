-- ============================================================================
-- APLICAR EN PRODUCCIÓN LAS TRES MIGRACIONES DEL 3-OCT-2026 — de una sola vez
-- ============================================================================
-- POR QUÉ ESTE ARCHIVO. Las tres migraciones del 3-oct están en el repo desde
-- ese día, pero NUNCA se aplicaron en producción (auditoría del 7-oct). Traen
-- `DROP` (políticas viejas, `authenticate_user`), y el conector de Supabase
-- pide confirmar a mano cada `DROP`: desde una sesión remota esa confirmación
-- no aparece y la orden se corta a los 60 s. Por eso se aplican desde el
-- editor SQL de Supabase, donde la confirmación la da una persona.
--
-- CÓMO SE USA (Juli):
--   1. supabase.com → proyecto de la bodega → SQL Editor → New query.
--   2. Pegá este archivo COMPLETO y dale Run. Si pregunta por «destructive
--      operations», confirmá: son las políticas viejas y la entrada vieja.
--   3. Tiene que salir una fila que empieza con «LISTO». Si sale un error que
--      empieza con «NO SE APLICÓ NADA», no se guardó nada: copiá el mensaje.
--
-- QUÉ HACE. Las tres migraciones, IDÉNTICAS a las de `supabase/migrations/`
-- (`verificar-baseline.cjs` lo comprueba letra por letra), dentro de UNA
-- transacción. Al final, una revisión: si la llave pública todavía lee algo,
-- si queda una clave en texto plano, si el Kardex no cuadra o si el
-- administrador dejara de ver la bodega, aborta y NO QUEDA NADA. O queda
-- todo, o no queda nada. Correrlo dos veces no duplica nada.
--
-- EFECTO PARA LA GENTE. Juli entra igual que siempre. Kate y Camilo entran con
-- el código de «🔑 Código» (decisión de Juli del 3-oct): la clave vieja de
-- Kate deja de servir.
--
-- Probado sobre PostgreSQL en blanco: `node supabase/verificar-baseline.cjs`.
-- ============================================================================

begin;

-- ▼▼▼ supabase/migrations/20261003120000_cierre_de_accesos.sql — textual ▼▼▼
-- ============================================================================
-- Cierre de accesos — los cuatro huecos de la auditoría del 2-oct-2026
-- ============================================================================
-- 1. CUALQUIERA PODÍA VOLVERSE ADMINISTRADOR. `es_administrador()` lee el rol
--    de `app_users`, y `app_users` tenía políticas públicas de insertar, editar
--    y borrar: con cualquier identidad (la de Kate, por ejemplo) bastaba
--    `update app_users set role = 'owner' where auth_uid = <la suya>` para pasar
--    el control de `crear_acceso`, `borrar_acceso`… Ningún código escribe ya en
--    esa tabla directo (todo va por las funciones de abajo), así que las tres
--    políticas se quitan. La de leer la propia ficha (`mi_propia_ficha`) queda.
--
-- 2. LA LLAVE PÚBLICA REVIVÍA ACCESOS BORRADOS. `restore_user` la podía
--    ejecutar `anon`, y desde el 2-oct además le quita el bloqueo a la
--    identidad: «visita», con su clave de dos letras, volvía a entrar. Ahora
--    restaurar y ver la papelera de accesos es solo de un administrador.
--
-- 3. EL TOPE DE INTENTOS DEL CÓDIGO DE ALTA NO CONTABA. `dar_de_alta` sumaba el
--    intento y enseguida lanzaba la excepción, y la excepción DESHACE la suma:
--    probado, tres códigos malos y el contador en cero. Ahora el código malo
--    suma y devuelve VACÍO (sin excepción), y la app lo dice como «código
--    incorrecto». Diez errados y el código muere.
--
-- (4, cerrar la identidad al salir, es de la app: `handleLogout`.)
--
-- Vuelta atrás: las tres políticas están en `00000000000000_baseline.sql`.
-- ============================================================================

drop policy if exists allow_insert on app_users;
drop policy if exists allow_update on app_users;
drop policy if exists allow_delete on app_users;

-- ── Restaurar un acceso: solo un administrador ──────────────────────────────
create or replace function restore_user(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede restaurar accesos.';
  end if;
  update app_users set deleted_at = null, deleted_by = null where id = p_id
  returning auth_uid into v_uid;
  if v_uid is not null then
    update auth.users set banned_until = null where id = v_uid;
  end if;
end $$;

-- ── La papelera de accesos: solo un administrador la ve ─────────────────────
-- A cualquier otro le sale vacía, sin error: la pantalla no se cae.
create or replace function get_deleted_users_safe()
returns table(user_id uuid, user_username text, user_role text, user_name text,
              user_deleted_at timestamptz, user_deleted_by text)
language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then return; end if;
  return query
  select id, username, role::text, name, deleted_at, deleted_by
  from app_users where deleted_at is not null order by deleted_at desc;
end $$;

revoke execute on function restore_user(uuid), get_deleted_users_safe() from public, anon;
grant execute on function restore_user(uuid), get_deleted_users_safe() to authenticated;

-- ── El alta, con el tope de intentos que SÍ cuenta ──────────────────────────
-- Igual a la del 2-oct salvo el código malo: antes `raise` (que deshacía la
-- suma), ahora suma y devuelve vacío.
create or replace function dar_de_alta(p_id uuid, p_codigo text, p_clave text)
returns table(user_id uuid, user_username text, user_role text, user_name text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  a app_users%rowtype;
  v_usuario text;
  v_correo text;
  v_uid uuid;
begin
  select * into a from app_users where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Ese acceso no existe.'; end if;
  if coalesce(a.setup_complete, false) then raise exception 'Este acceso ya está configurado: entrá con tu clave.'; end if;
  if a.codigo_alta_hash is null then raise exception 'Este acceso no tiene código de alta. Pedíselo al administrador.'; end if;
  if a.intentos_alta >= 10 then raise exception 'Demasiados intentos. Pedile al administrador un código nuevo.'; end if;
  if crypt(upper(btrim(coalesce(p_codigo, ''))), a.codigo_alta_hash) <> a.codigo_alta_hash then
    -- SIN excepción: una excepción revertiría esta suma, y el tope no existiría.
    update app_users set intentos_alta = intentos_alta + 1 where id = p_id;
    return;
  end if;
  if length(coalesce(p_clave, '')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres.'; end if;

  v_usuario := usuario_de_nombre(a.name);
  v_correo := correo_interno(v_usuario);
  if exists (select 1 from app_users where id <> p_id and deleted_at is null and username = v_usuario) then
    raise exception 'Ya hay alguien registrado con ese nombre.';
  end if;

  select id into v_uid from auth.users where email = v_correo;
  if v_uid is not null and exists (
       select 1 from app_users where auth_uid = v_uid and id <> p_id and deleted_at is null) then
    raise exception 'Ese nombre choca con el de otra persona. Usá otro nombre para este acceso.';
  end if;
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_correo, crypt(p_clave, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nombre', a.name), now(), now(), '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_uid::text, v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', v_correo, 'email_verified', true),
            'email', now(), now(), now());
  else
    update auth.users set encrypted_password = crypt(p_clave, gen_salt('bf')),
                          banned_until = null, updated_at = now()
     where id = v_uid;
  end if;

  update app_users
     set username = v_usuario, auth_uid = v_uid, setup_complete = true,
         debe_cambiar_clave = false, codigo_alta_hash = null, intentos_alta = 0,
         password = ''
   where id = p_id;

  return query select a.id, v_usuario, a.role::text, a.name;
end $$;

grant execute on function dar_de_alta(uuid, text, text) to anon, authenticated;
-- ▲▲▲ fin de 20261003120000_cierre_de_accesos.sql ▲▲▲

-- ▼▼▼ supabase/migrations/20261003130000_solo_la_bodega.sql — textual ▼▼▼
-- ============================================================================
-- Solo la gente de la bodega toca la bodega — y se retira la entrada vieja
-- ============================================================================
-- LO QUE CIERRA
--
-- 1. LA LLAVE PÚBLICA MOVÍA INVENTARIO. Las once tablas tenían una política
--    «todo para todos» y las funciones de stock las podía ejecutar `anon`. La
--    llave pública está en el código de la página: cualquiera que la abriera
--    podía registrar salidas, borrar movimientos o leer los teléfonos del
--    personal. Ahora hace falta SESIÓN de una persona de la bodega.
--
--    «De la bodega», no solo «con sesión»: una identidad suelta (un registro
--    público, un acceso borrado) no basta. `es_de_la_bodega()` exige una fila
--    viva de `app_users` con ese `auth_uid`.
--
--    `get_users_safe` y `dar_de_alta` siguen abiertas a propósito: la pantalla
--    de entrada necesita la lista de nombres, y el primer ingreso se hace sin
--    sesión (lo protege el código, con tope de intentos).
--
-- 2. L4: LA ENTRADA VIEJA SE RETIRA. `authenticate_user` comparaba claves en
--    texto plano. Las claves en texto plano se borran.
--
-- 3. KATE ENTRA COMO LA PRIMERA VEZ (decisión de Juli, 3-oct): su clave vieja
--    de dos letras deja de servir y su acceso queda esperando código de alta,
--    igual que el de Camilo. `dar_de_alta` reutiliza su identidad, así que su
--    historial sigue siendo suyo.
--
-- La API (`/api/*`) usa la llave de servicio, que no pasa por estas reglas.
-- Vuelta atrás: las políticas originales están en el baseline.
-- ============================================================================

-- ── ¿Quien llama es de la bodega? ───────────────────────────────────────────
-- Sin rol en el pedido (consola, migraciones) o con la llave de servicio: sí.
-- Con la llave pública: no. Con sesión: solo si tiene acceso vivo.
create or replace function es_de_la_bodega() returns boolean
language sql stable security definer set search_path = public as $$
  select case coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           '')
    when '' then true
    when 'service_role' then true
    else exists (select 1 from app_users where auth_uid = auth.uid() and deleted_at is null)
  end
$$;
revoke execute on function es_de_la_bodega() from public, anon;
grant execute on function es_de_la_bodega() to authenticated, service_role;

-- ── Las once tablas: solo la bodega ─────────────────────────────────────────
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['items', 'movements', 'personnel', 'projects', 'purchase_orders',
                           'purchase_order_items', 'order_list', 'asignaciones',
                           'audit_logs', 'behavior_logs', 'push_subscriptions']
  loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', p.policyname, t);
    end loop;
    execute format('create policy %I on %I for all to authenticated using (es_de_la_bodega()) with check (es_de_la_bodega())',
                   'solo_la_bodega', t);
    execute format('revoke all on table %I from anon', t);
  end loop;
end $$;

-- `app_users` y `operaciones_endpoint`: la llave pública tampoco las toca
-- directo (la lista de entrada sale de `get_users_safe`).
revoke all on table app_users from anon;
revoke all on table operaciones_endpoint from anon;

-- ── Las funciones de stock: con guarda, y sin la llave pública ──────────────
-- Son las instaladas, idénticas, con UNA línea más al principio.

create or replace function public.log_movement_and_update_stock(p_id uuid, p_item_id uuid, p_type text, p_quantity numeric, p_timestamp timestamp with time zone, p_personnel_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_project_id uuid DEFAULT NULL::uuid, p_is_loan boolean DEFAULT false, p_is_returned boolean DEFAULT false, p_pending_pickup boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_delta numeric;
begin
    if not es_de_la_bodega() then raise exception 'Hay que entrar con tu clave para mover la bodega.'; end if;
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
$function$;

create or replace function public.log_movements_and_update_stock(p_movements jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    r        jsonb;
    v_type   text;
    v_qty    numeric;
    v_delta  numeric;
    v_id     uuid;
    v_item   uuid;
begin
    if not es_de_la_bodega() then raise exception 'Hay que entrar con tu clave para mover la bodega.'; end if;
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

create or replace function public.delete_movement_and_revert_stock(p_movement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    m record;
begin
    if not es_de_la_bodega() then raise exception 'Hay que entrar con tu clave para mover la bodega.'; end if;
    select * into m from movements where id = p_movement_id and deleted_at is null;
    if not found then
        return;  -- ya estaba enterrado, o nunca existió: no se toca el stock dos veces
    end if;

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

create or replace function public.restore_movement_and_apply_stock(p_movement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    m record;
begin
    if not es_de_la_bodega() then raise exception 'Hay que entrar con tu clave para mover la bodega.'; end if;
    select * into m from movements where id = p_movement_id;
    if not found then
        raise exception 'El movimiento % no existe', p_movement_id;
    end if;

    if m.deleted_at is null then
        return;   -- ya estaba vivo: restaurar dos veces no mueve stock dos veces
    end if;

    if not (m.is_loan and m.is_returned) then
        if m.type in ('Salida', 'Merma') then
            -- Volver a aplicar una salida descuenta. Si no alcanza, NO se
            -- restaura: se revierte todo y la lápida se queda.
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

create or replace function public.return_loan_and_restore_stock(p_movement_id uuid, p_condition text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    m record;
begin
    if not es_de_la_bodega() then raise exception 'Hay que entrar con tu clave para mover la bodega.'; end if;
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
$function$;

revoke execute on function
  log_movement_and_update_stock(uuid, uuid, text, numeric, timestamptz, uuid, text, uuid, boolean, boolean, boolean),
  log_movements_and_update_stock(jsonb),
  delete_movement_and_revert_stock(uuid),
  restore_movement_and_apply_stock(uuid),
  return_loan_and_restore_stock(uuid, text, text)
  from public, anon;
grant execute on function
  log_movement_and_update_stock(uuid, uuid, text, numeric, timestamptz, uuid, text, uuid, boolean, boolean, boolean),
  log_movements_and_update_stock(jsonb),
  delete_movement_and_revert_stock(uuid),
  restore_movement_and_apply_stock(uuid),
  return_loan_and_restore_stock(uuid, text, text)
  to authenticated, service_role;

-- ── L4: la entrada vieja y las claves en texto plano ────────────────────────
drop function if exists authenticate_user(text, text);
update app_users set password = '' where password <> '';

-- ── Kate, como la primera vez ───────────────────────────────────────────────
-- La identidad se queda (es la de su historial), pero con una clave que nadie
-- conoce: la de dos letras deja de servir. `dar_de_alta` le pone la suya.
-- Solo si NUNCA entró por la identidad: correr esto otra vez después de su alta
-- no la puede devolver a cero. Lo mismo, sin condición, para las identidades
-- de accesos borrados («visita»).
-- `auth.users` lo trae Supabase; en una reconstrucción en blanco no existe y
-- ahí no hay a quién tocar.
do $kate$
begin
  if to_regclass('auth.users') is null then return; end if;
  update auth.users au set encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')), updated_at = now()
    from app_users u
   where u.auth_uid = au.id
     and (u.deleted_at is not null
          or (u.username = 'kate' and u.setup_complete and au.last_sign_in_at is null));
  update app_users u
     set setup_complete = false, debe_cambiar_clave = false, codigo_alta_hash = null, intentos_alta = 0
   where u.username = 'kate' and u.deleted_at is null and u.setup_complete
     and not exists (select 1 from auth.users au where au.id = u.auth_uid and au.last_sign_in_at is not null);
end $kate$;
-- ▲▲▲ fin de 20261003130000_solo_la_bodega.sql ▲▲▲

-- ▼▼▼ supabase/migrations/20261003140000_kardex_en_cero.sql — textual ▼▼▼
-- ============================================================================
-- El Kardex en cero — sin tocar una sola cantidad
-- ============================================================================
-- La consulta 4 de `supabase/RESTAURAR.md` (entradas menos salidas = stock)
-- devolvía filas por dos razones, las dos de ANTES de que el libro llevara
-- todo. Esto solo AGREGA asientos que explican lo que ya pasó. El stock no se
-- mueve: los asientos se insertan directo, sin las funciones de stock.
--
-- 1. DEVOLUCIONES DE ANTES DEL 28-SEP. Devolver marcaba el préstamo
--    `is_returned` y reponía el stock sin dejar entrada. Desde el 28-sep cada
--    devolución es su propia entrada enlazada (`devuelve_a`). A cada préstamo
--    viejo cerrado sin su entrada se le pone la suya, con la fecha en que volvió.
--
-- 2. SIETE ÍTEMS CON STOCK SIN RESPALDO (18 unidades), todos con movimientos
--    del 5 al 8 de septiembre, antes de que el despacho se guardara en una sola
--    transacción (12-sep). Medido en producción el 3-oct-2026. Cada uno recibe
--    un asiento de regularización por la diferencia exacta — y SOLO si la
--    diferencia sigue siendo esa: si algo cambió, no se toca y se revisa a mano.
--
-- En una reconstrucción en blanco no hay nada de esto y no hace nada.
-- ============================================================================

-- ── 1. La entrada de cada devolución vieja ──────────────────────────────────
insert into movements (id, item_id, type, quantity, timestamp, personnel_id, project_id, notes,
                       is_loan, is_returned, pending_pickup, devuelve_a, returned_at)
select gen_random_uuid(), m.item_id, 'Entrada'::movement_type, m.quantity,
       coalesce(m.returned_at, m.timestamp), m.personnel_id, m.project_id,
       'Devolución de antes del 28-sep-2026 (se reponía sin entrada). Asiento de regularización del 3-oct-2026; el stock no se movió.',
       false, false, false, m.id, coalesce(m.returned_at, m.timestamp)
from movements m
where m.is_loan and m.is_returned and m.deleted_at is null
  and m.type = 'Salida'
  and m.timestamp < '2026-09-28'
  and not exists (select 1 from movements d where d.devuelve_a = m.id and d.deleted_at is null);

-- ── 2. Los siete ítems, por su diferencia exacta ────────────────────────────
do $$
declare
  r record;
  v_dif numeric;
begin
  for r in select * from (values
      ('311a59ea-fa68-43d1-9f11-f3125ba93387'::uuid, 12::numeric),  -- Polvo enchape
      ('147bf8ee-7d75-4167-b43f-b511f3567f9a'::uuid,  1::numeric),  -- clavos 2 acero
      ('3d5af03c-e345-468c-ade3-e41a5cc1dbfb'::uuid,  1::numeric),  -- Clavos Tiro
      ('b9ab575b-fdff-4121-97db-af3ba6f4efa3'::uuid,  1::numeric),  -- Estopa
      ('6ddc5c3e-1cd3-4e4f-8c97-80bc4685f522'::uuid,  1::numeric),  -- Lechada veige
      ('37ac8e0d-d8c7-4240-bd3b-b35e29fd91a1'::uuid,  1::numeric),  -- Lijadora (Amarilla · Dwalt)
      ('bbd6c28a-818d-46c8-b112-90c392dbda82'::uuid,  1::numeric)   -- Línea de vida con arnes
    ) as t(item_id, esperado)
  loop
    select i.quantity - coalesce(sum(case when m.type in ('Entrada', 'Compra') then m.quantity
                                          when m.type in ('Salida', 'Merma') then -m.quantity end), 0)
      into v_dif
      from items i left join movements m on m.item_id = i.id and m.deleted_at is null
     where i.id = r.item_id and i.deleted_at is null
     group by i.id, i.quantity;
    if v_dif is null then continue; end if;          -- no existe (base en blanco)
    if v_dif <> r.esperado then
      raise notice 'Kardex: % no se regulariza, la diferencia es % y se esperaba %', r.item_id, v_dif, r.esperado;
      continue;
    end if;
    insert into movements (id, item_id, type, quantity, timestamp, notes, is_loan, is_returned, pending_pickup)
    values (gen_random_uuid(), r.item_id, 'Entrada'::movement_type, r.esperado, now(),
            'Regularización del 3-oct-2026: stock que figuraba sin respaldo en el libro (movimientos del 5 al 8 de sep). El stock no se movió.',
            false, false, false);
  end loop;
end $$;
-- ▲▲▲ fin de 20261003140000_kardex_en_cero.sql ▲▲▲


-- ════════════════════════════════════════════════════════════════════════════
-- REVISIÓN — si algo no quedó como debe, NADA de lo de arriba se guarda
-- ════════════════════════════════════════════════════════════════════════════
do $revision$
declare
  t text;
  v_juli uuid;
  v_total int;
  v_lee int;
  v_lista text;
  problemas text[] := '{}';
begin
  -- 1. Cada tabla de la bodega con su política «solo_la_bodega», y ninguna vieja.
  foreach t in array array['items', 'movements', 'personnel', 'projects', 'purchase_orders',
                           'purchase_order_items', 'order_list', 'asignaciones',
                           'audit_logs', 'behavior_logs', 'push_subscriptions'] loop
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t and policyname = 'solo_la_bodega') then
      problemas := problemas || format('la tabla %s quedó sin «solo_la_bodega»', t);
    end if;
  end loop;
  select string_agg(tablename || '.' || policyname, ', ') into v_lista from pg_policies
   where schemaname = 'public' and policyname <> 'solo_la_bodega'
     and not (tablename = 'app_users' and policyname = 'mi_propia_ficha');
  if v_lista is not null then problemas := problemas || ('quedaron políticas viejas: ' || v_lista); end if;

  -- 2. La llave pública no lee ni escribe ninguna tabla.
  select string_agg(c.relname, ', ') into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and has_table_privilege('anon', c.oid, 'select, insert, update, delete');
  if v_lista is not null then problemas := problemas || ('la llave pública todavía toca: ' || v_lista); end if;

  -- 3. Con la llave pública solo se entra (la lista) y se da de alta (el código).
  select string_agg(p.proname, ', ') into v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.proname not in ('get_users_safe', 'dar_de_alta')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_lista is not null then problemas := problemas || ('la llave pública todavía ejecuta: ' || v_lista); end if;
  if not has_function_privilege('anon', 'get_users_safe()', 'execute')
     or not has_function_privilege('anon', 'dar_de_alta(uuid,text,text)', 'execute') then
    problemas := problemas || 'la pantalla de entrada perdió la lista o el primer ingreso';
  end if;

  -- 4. La entrada vieja y las claves en texto plano.
  if to_regprocedure('authenticate_user(text,text)') is not null then
    problemas := problemas || 'authenticate_user sigue existiendo';
  end if;
  if exists (select 1 from app_users where coalesce(password, '') <> '') then
    problemas := problemas || 'quedó una clave en texto plano';
  end if;

  -- 5. Kate, como la primera vez (si nunca entró).
  if to_regclass('auth.users') is not null then
    if exists (select 1 from app_users u
                where u.username = 'kate' and u.deleted_at is null and u.setup_complete
                  and not exists (select 1 from auth.users au
                                   where au.id = u.auth_uid and au.last_sign_in_at is not null)) then
      problemas := problemas || 'Kate no quedó esperando código';
    end if;
  end if;

  -- 6. El Kardex cuadra: entradas menos salidas = stock, en cada ítem.
  select string_agg(name, ', ') into v_lista from (
    select i.name from items i
      left join movements m on m.item_id = i.id and m.deleted_at is null
     where i.deleted_at is null
     group by i.id, i.name, i.quantity
    having i.quantity <> coalesce(sum(case when m.type in ('Entrada', 'Compra') then m.quantity
                                           when m.type in ('Salida', 'Merma') then -m.quantity end), 0)) d;
  if v_lista is not null then problemas := problemas || ('el Kardex no cuadra en: ' || v_lista); end if;

  -- 7. El administrador sigue viendo TODA la bodega con su sesión.
  select auth_uid into v_juli from app_users
   where role::text = 'owner' and deleted_at is null and auth_uid is not null
   order by (username = 'juli') desc nulls last limit 1;
  if v_juli is null then
    problemas := problemas || 'no hay un administrador con identidad: nadie podría entrar';
  else
    select count(*) into v_total from items;
    perform set_config('request.jwt.claim.sub', v_juli::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_juli, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_lee from items;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', '', true);
    perform set_config('request.jwt.claims', '', true);
    if v_lee <> v_total then
      problemas := problemas || format('el administrador vería %s de %s ítems', v_lee, v_total);
    end if;
  end if;

  if array_length(problemas, 1) > 0 then
    raise exception 'NO SE APLICÓ NADA. %', array_to_string(problemas, ' · ');
  end if;
end $revision$;

-- ── Historial: que la lista de migraciones del proyecto diga que ya están ────
do $historial$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then return; end if;
  execute $q$
    insert into supabase_migrations.schema_migrations (version, name)
    values ('20261003120000', 'cierre_de_accesos'),
           ('20261003130000', 'solo_la_bodega'),
           ('20261003140000', 'kardex_en_cero')
    on conflict (version) do nothing$q$;
end $historial$;

commit;

select 'LISTO: llave pública cerrada, entrada vieja retirada, claves en texto plano borradas y Kardex en cero.' as resultado,
       (select count(*) from movements where deleted_at is null) as movimientos,
       (select count(*) from app_users where deleted_at is null and not coalesce(setup_complete, false)) as accesos_esperando_codigo;
