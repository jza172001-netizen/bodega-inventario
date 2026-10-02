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
