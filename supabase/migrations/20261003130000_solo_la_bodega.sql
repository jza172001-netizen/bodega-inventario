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
