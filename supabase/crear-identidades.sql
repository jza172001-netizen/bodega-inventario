-- ============================================================================
-- Crear los usuarios de identidad a partir de los accesos que ya existen
-- ============================================================================
-- NO ES UNA MIGRACIÓN A PROPÓSITO. Toca el esquema `auth`, depende de los datos
-- de cada ambiente, y escribe usuarios reales: eso no debe correr solo en cada
-- despliegue. Se ejecuta a mano, una vez, y se comprueba después.
--
-- LAS CONTRASEÑAS NUNCA SALEN DE LA BASE. Se leen de `app_users.password` y se
-- cifran ahí mismo. Nadie —ni quien corre esto— las ve.
--
-- Es re-ejecutable: solo toma los accesos que todavía no tienen identidad.
-- ============================================================================

do $$
declare u record; nuevo uuid; correo text;
begin
  for u in
    select id, username, name, password from app_users
    where deleted_at is null and auth_uid is null
      and username is not null and length(btrim(username)) > 0
      and password is not null and length(btrim(password)) > 0
  loop
    -- LA MISMA FÓRMULA que `correoInterno` en core/identidad.ts: quitar tildes,
    -- dejar solo letras y números, minúscula.
    --
    -- Si estas dos no producen EXACTAMENTE lo mismo, nadie entra y el mensaje
    -- que sale es «contraseña incorrecta» con la contraseña bien puesta — un
    -- fallo que se tarda horas en encontrar porque el síntoma miente. Por eso
    -- `core/identidad.ts` tiene su propia prueba.
    correo := lower(regexp_replace(
                translate(u.username, 'áéíóúüñÁÉÍÓÚÜÑàèìòùâêîôûçÇ', 'aeiouunAEIOUUNaeiouaeioucC'),
                '[^a-zA-Z0-9]', '', 'g')) || '@bodega.montecielo';
    nuevo := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', nuevo, 'authenticated', 'authenticated',
      correo, extensions.crypt(u.password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nombre', u.name), now(), now(), '', '', '', ''
    );

    -- La fila de `identities` hace falta: sin ella el ingreso por correo y
    -- contraseña no funciona en las versiones nuevas de Supabase, y el error que
    -- da no dice que es esto.
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (nuevo::text, nuevo,
            jsonb_build_object('sub', nuevo::text, 'email', correo, 'email_verified', true),
            'email', now(), now(), now());

    update app_users set auth_uid = nuevo where id = u.id;
  end loop;
end $$;

-- La comprobación: la contraseña de siempre tiene que servir contra el hash
-- nuevo, el correo tiene que estar confirmado, y tiene que haber una identidad.
select a.name, u.email,
       (u.encrypted_password = extensions.crypt(a.password, u.encrypted_password)) as la_clave_de_siempre_sirve,
       (u.email_confirmed_at is not null) as correo_confirmado,
       (select count(*) from auth.identities i where i.user_id = u.id) as identidades
from app_users a join auth.users u on u.id = a.auth_uid
where a.deleted_at is null order by a.name;
