-- ============================================================================
-- Los accesos, por el servidor — primera mitad (no cierra nada todavía)
-- ============================================================================
-- EL DEFECTO QUE ESTO ARREGLA
--
-- Un acceso nuevo NUNCA podía entrar. Dos fallas encadenadas:
--
-- 1. El alta comparaba el código contra la contraseña guardada EN EL TELÉFONO
--    (`selectedUser.password`). La nube nunca manda esa columna, así que en
--    cualquier teléfono que no fuera el que creó el acceso salía «Este acceso no
--    tiene código de alta». Es lo que le pasaba a CAMILO.
-- 2. Aunque pasara, el alta escribía la clave solo en `app_users`. La identidad
--    del servidor (`auth.users`) no se creaba, y la entrada le pregunta PRIMERO
--    a esa identidad: «credenciales inválidas» → «Contraseña incorrecta», con la
--    contraseña bien puesta. Las identidades de juli, kate y visita existen
--    porque se crearon a mano con `supabase/crear-identidades.sql`.
--
-- Ahora el alta la hace el SERVIDOR: compara el código acá, crea la identidad y
-- no guarda la clave en ninguna tabla.
--
-- LO QUE NO HACE TODAVÍA (va en la segunda mitad, cuando las tres personas
-- hayan entrado por esta vía): quitarle a la llave pública el permiso de editar
-- `app_users`, cortar `authenticate_user` y borrar las claves en texto plano.
-- ============================================================================

alter table app_users add column if not exists codigo_alta_hash text;
alter table app_users add column if not exists intentos_alta int not null default 0;

-- LA MISMA FÓRMULA que `correoInterno` en core/identidad.ts y que
-- `supabase/crear-identidades.sql`. Si no producen exactamente lo mismo, nadie
-- entra y el síntoma miente («contraseña incorrecta»). `tests/accesos.test.ts`
-- compara las dos.
create or replace function correo_interno(p_usuario text) returns text
language sql immutable as $$
  select lower(regexp_replace(
           translate(coalesce(p_usuario, ''), 'áéíóúüñÁÉÍÓÚÜÑàèìòùâêîôûçÇ', 'aeiouunAEIOUUNaeiouaeioucC'),
           '[^a-zA-Z0-9]', '', 'g')) || '@bodega.montecielo'
$$;

-- El usuario que sale del nombre, como lo hacía la pantalla de alta:
-- sin tildes, en minúscula, los espacios como «_».
create or replace function usuario_de_nombre(p_nombre text) returns text
language sql immutable as $$
  select regexp_replace(lower(btrim(
           translate(coalesce(p_nombre, ''), 'áéíóúüñÁÉÍÓÚÜÑàèìòùâêîôûçÇ', 'aeiouunAEIOUUNaeiouaeioucC'))),
           '\s+', '_', 'g')
$$;

-- ¿Quien llama es un administrador que entró con su identidad?
create or replace function es_administrador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users
    where auth_uid = auth.uid() and deleted_at is null and role::text = 'owner'
  )
$$;

-- Seis caracteres sin letras confundibles: se dicta por teléfono.
create or replace function nuevo_codigo_alta() returns text
language plpgsql volatile as $$
declare
  alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text := '';
begin
  for i in 1..6 loop
    c := c || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  end loop;
  return c;
end $$;

-- ── Crear un acceso (solo un administrador) ─────────────────────────────────
-- Devuelve el código de alta UNA vez. En la tabla queda cifrado: quien lea la
-- base no puede usarlo.
create or replace function crear_acceso(p_nombre text, p_rol text)
returns table(acceso_id uuid, codigo text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_codigo text := nuevo_codigo_alta();
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede crear accesos. Volvé a entrar con tu clave.';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'Falta el nombre.';
  end if;
  if p_rol not in ('owner', 'employee', 'visitor') then
    raise exception 'Rol desconocido: %', p_rol;
  end if;
  if exists (select 1 from app_users where deleted_at is null
             and usuario_de_nombre(name) = usuario_de_nombre(p_nombre)) then
    raise exception 'Ya hay un acceso con ese nombre.';
  end if;
  -- `password` es NOT NULL en la tabla: vacía quiere decir «sin clave en la
  -- tabla», y `authenticate_user` (abajo) ya no acepta claves vacías.
  insert into app_users (id, name, role, setup_complete, codigo_alta_hash, intentos_alta, password)
  values (v_id, btrim(p_nombre), p_rol::user_role, false, crypt(v_codigo, gen_salt('bf')), 0, '');
  return query select v_id, v_codigo;
end $$;

-- ── Código de alta nuevo para un acceso que no ha entrado nunca ──────────────
-- Para CAMILO, y para cualquiera que perdió su código antes de usarlo.
create or replace function nuevo_codigo_de_alta(p_id uuid)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_codigo text := nuevo_codigo_alta();
begin
  if not es_administrador() then
    raise exception 'Solo un administrador puede dar códigos de alta.';
  end if;
  update app_users
     set codigo_alta_hash = crypt(v_codigo, gen_salt('bf')), intentos_alta = 0
   where id = p_id and deleted_at is null and coalesce(setup_complete, false) = false;
  if not found then
    raise exception 'Ese acceso ya está configurado o no existe.';
  end if;
  return v_codigo;
end $$;

-- ── El alta: la persona pone su clave con el código ──────────────────────────
-- La llama alguien que TODAVÍA no tiene sesión, así que la puede ejecutar la
-- llave pública. Lo que la protege es el código, comparado acá y con tope de
-- intentos: diez equivocados y el código muere.
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
    update app_users set intentos_alta = intentos_alta + 1 where id = p_id;
    raise exception 'Código de alta incorrecto.';
  end if;
  if length(coalesce(p_clave, '')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres.'; end if;

  v_usuario := usuario_de_nombre(a.name);
  v_correo := correo_interno(v_usuario);
  if exists (select 1 from app_users where id <> p_id and deleted_at is null and username = v_usuario) then
    raise exception 'Ya hay alguien registrado con ese nombre.';
  end if;

  -- La identidad del servidor, igual que `crear-identidades.sql`. Si ya existe
  -- una con ese correo (un acceso borrado y recreado), se reutiliza y se le
  -- pone la clave nueva, en vez de chocar.
  select id into v_uid from auth.users where email = v_correo;
  -- Nunca la identidad de OTRA persona activa: «Ka te» y «Kate» dan el mismo
  -- correo, y reutilizarla le cambiaría la clave a Kate.
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

  -- La clave NO se guarda en `app_users`: la tiene solo la identidad.
  update app_users
     set username = v_usuario, auth_uid = v_uid, setup_complete = true,
         debe_cambiar_clave = false, codigo_alta_hash = null, intentos_alta = 0,
         password = ''
   where id = p_id;

  return query select a.id, v_usuario, a.role::text, a.name;
end $$;

-- ── Editar nombre y rol (solo un administrador) ──────────────────────────────
-- El usuario NO se toca: de él sale el correo de la identidad, y cambiarlo
-- dejaría a la persona afuera con su clave bien puesta.
create or replace function editar_acceso(p_id uuid, p_nombre text, p_rol text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_administrador() then raise exception 'Solo un administrador puede editar accesos.'; end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'Falta el nombre.'; end if;
  if p_rol not in ('owner', 'employee', 'visitor') then raise exception 'Rol desconocido: %', p_rol; end if;
  -- Que no quede la bodega sin administrador.
  if p_rol <> 'owner' and not exists (
       select 1 from app_users where deleted_at is null and role::text = 'owner' and id <> p_id) then
    raise exception 'Tiene que quedar al menos un administrador.';
  end if;
  update app_users set name = btrim(p_nombre), role = p_rol::user_role where id = p_id and deleted_at is null;
end $$;

-- ── Mandar a la papelera (solo un administrador) ─────────────────────────────
-- Lápida, no borrado: se puede restaurar. Y la identidad del servidor queda
-- bloqueada: sin esto, la cuenta borrada seguía pudiendo autenticarse.
create or replace function borrar_acceso(p_id uuid, p_quien text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not es_administrador() then raise exception 'Solo un administrador puede borrar accesos.'; end if;
  if exists (select 1 from app_users where id = p_id and auth_uid = auth.uid()) then
    raise exception 'No podés borrar tu propio acceso.';
  end if;
  if (select role::text from app_users where id = p_id) = 'owner' and not exists (
       select 1 from app_users where deleted_at is null and role::text = 'owner' and id <> p_id) then
    raise exception 'Tiene que quedar al menos un administrador.';
  end if;
  update app_users set deleted_at = now(), deleted_by = p_quien
   where id = p_id and deleted_at is null
   returning auth_uid into v_uid;
  if v_uid is not null then
    update auth.users set banned_until = 'infinity' where id = v_uid;
  end if;
end $$;

-- `restore_user` también desbloquea la identidad: restaurar a medias dejaba a
-- la persona en la lista y sin poder entrar.
create or replace function restore_user(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  update app_users set deleted_at = null, deleted_by = null where id = p_id
  returning auth_uid into v_uid;
  if v_uid is not null then
    update auth.users set banned_until = null where id = v_uid;
  end if;
end $$;

-- ── «Ya cambié mi clave» ─────────────────────────────────────────────────────
-- La clave nueva la guarda la identidad (`supabase.auth.updateUser`). Acá solo
-- se baja la bandera y se borra la vieja en texto plano: antes `cambiarClave`
-- escribía la NUEVA en texto plano en `app_users.password`.
create or replace function ya_cambie_mi_clave()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update app_users set debe_cambiar_clave = false, password = ''
   where auth_uid = auth.uid() and deleted_at is null;
  if not found then raise exception 'No hay sesión: volvé a entrar.'; end if;
end $$;

-- ── La entrada vieja ya no acepta una clave VACÍA ────────────────────────────
-- Estaba abierta: `authenticate_user('CAMILO', '')` devolvía el acceso de dueño,
-- porque CAMILO tenía la clave vacía y la función compara por nombre también.
-- Ahora una clave vacía no es una clave. Y quien entró por el alta nueva queda
-- con la clave vacía en la tabla: solo entra por su identidad.
create or replace function authenticate_user(p_username text, p_password text)
returns table(user_id uuid, user_role text, user_name text)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_password, '') = '' then return; end if;
  return query
  select id, role::text, name
  from app_users
  where deleted_at is null
    and coalesce(password, '') <> ''
    and (
      lower(btrim(coalesce(username, ''))) = lower(btrim(p_username))
      or lower(btrim(coalesce(name, ''))) = lower(btrim(p_username))
    )
    and password = p_password
  limit 1;
end $$;

-- Permisos. Postgres le da EXECUTE a PUBLIC (todo el mundo) al crear una
-- función: quitárselo solo a `anon` no alcanza, hay que quitárselo a PUBLIC.
revoke execute on function crear_acceso(text, text), nuevo_codigo_de_alta(uuid),
  editar_acceso(uuid, text, text), borrar_acceso(uuid, text), ya_cambie_mi_clave(),
  es_administrador(), nuevo_codigo_alta()
  from public, anon;
grant execute on function crear_acceso(text, text), nuevo_codigo_de_alta(uuid),
  editar_acceso(uuid, text, text), borrar_acceso(uuid, text), ya_cambie_mi_clave(),
  es_administrador()
  to authenticated;
grant execute on function dar_de_alta(uuid, text, text) to anon, authenticated;
