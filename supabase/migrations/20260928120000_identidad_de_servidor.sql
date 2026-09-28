-- ============================================================================
-- Identidad de servidor — primera mitad, sin restringir nada todavía
-- ============================================================================
-- EL PROBLEMA
--
-- La app entra a Supabase como `anon`: UNA sola llave pública, la misma para
-- todo el mundo, metida dentro del JavaScript publicado. El servidor no tiene
-- cómo saber quién está escribiendo, así que no puede negarle nada a nadie.
-- Cualquiera con esa llave mueve el inventario entero.
--
-- Eso NO se cierra revocando: la app *es* `anon`, y quitarle el permiso la deja
-- muerta para todos. Hace falta que cada acceso sea un usuario de verdad del
-- servidor. Esto monta esa mitad; el corte va aparte y solo cuando esté
-- comprobado que los accesos entran por la vía nueva.
--
-- LO QUE NO CAMBIA: la pantalla de entrada. La persona sigue escribiendo su
-- nombre y su contraseña de siempre, y la app traduce el nombre a un correo
-- interno por debajo (`core/identidad.ts`).
-- ============================================================================

alter table app_users add column if not exists auth_uid uuid;

create unique index if not exists app_users_auth_uid_idx
    on app_users (auth_uid) where auth_uid is not null;

-- Quien entró con identidad puede leer SU PROPIA ficha, y solo esa.
--
-- Sin esto la identidad no sirve y además falla EN SILENCIO: la persona entra
-- bien con Auth, pero `app_users` no tenía política de lectura, así que la
-- consulta que busca su nombre y su rol devolvía vacío, la app lo leía como «no
-- pude preguntar» y caía al camino viejo. Todo parecía funcionar y la identidad
-- no se usaba nunca.
drop policy if exists mi_propia_ficha on app_users;
create policy mi_propia_ficha on app_users
    for select to authenticated
    using (auth_uid = auth.uid());

-- ============================================================================
-- «Esta persona tiene que cambiar su contraseña antes de seguir.»
-- ============================================================================
-- Las contraseñas que había eran de DOS caracteres. Mientras la llave pública
-- estuvo abierta eso casi no importaba —había puertas más grandes— pero al
-- cerrar todo lo demás, esas dos letras pasan a ser lo único que separa el
-- inventario de internet, y los nombres de usuario son adivinables.
--
-- No se cambian por detrás: alguien que llega en la mañana con la contraseña que
-- conoce y no entra es la encargada parada en la puerta de la bodega. Se le pide
-- AL ENTRAR, con la suya vieja en la mano.
--
-- Un acceso nuevo no lo necesita: nace con su código de alta y elige contraseña
-- en el primer ingreso.

alter table app_users add column if not exists debe_cambiar_clave boolean not null default false;

update app_users
   set debe_cambiar_clave = true
 where deleted_at is null
   and auth_uid is not null
   and length(btrim(coalesce(password, ''))) < 6;

-- ============================================================================
-- Los usuarios de identidad se crean con un bloque aparte, NO acá
-- ============================================================================
-- Copia las contraseñas que ya existen desde `app_users` hacia `auth.users`,
-- cifrándolas. Vive en `supabase/crear-identidades.sql` y no en una migración a
-- propósito: toca el esquema `auth`, depende de los datos de cada ambiente, y
-- una migración que escribe usuarios reales no debería correr sola en cada
-- despliegue.
