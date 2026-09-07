-- Que el acceso de cada persona se guarde de verdad, y no solo en su teléfono.
--
-- Juli creó los accesos de Santiago y de Camilo y desaparecieron. Dos causas,
-- las dos acá:
--
-- 1. `app_users` tiene UNIQUE (username), y los accesos nuevos nacían con el
--    nombre de usuario en CADENA VACÍA —porque ahora lo elige la propia
--    persona al entrar—. El primero entraba; el segundo chocaba contra la
--    restricción y fallaba callado. Se arregla del lado de la app usando NULL:
--    Postgres permite varios nulos bajo una restricción única, la cadena vacía
--    no. Por eso acá solo hace falta permitir el nulo.
--
-- 2. La tabla no tenía dónde guardar si la persona ya configuró su clave
--    (`setup_complete`) ni el hash de esa clave (`password_hash`). Vivían solo
--    en el localStorage de cada aparato, así que al entrar desde otro teléfono
--    la app no sabía nada: por eso Kate y Santiago aparecían como si ya
--    tuvieran contraseña.
--
-- Aditiva: ninguna fila existente cambia de significado. Los tres accesos que
-- ya están (Juli, Kate, Visitante) quedan marcados como configurados, que es
-- lo que son.

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS setup_complete boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS password_hash  text;

ALTER TABLE app_users ALTER COLUMN username DROP NOT NULL;

UPDATE app_users SET setup_complete = true
 WHERE username IS NOT NULL AND btrim(username) <> '';

COMMENT ON COLUMN app_users.setup_complete IS
    'La persona ya eligió su contraseña la primera vez que entró.';
COMMENT ON COLUMN app_users.password_hash IS
    'sha256 de la contraseña que puso la persona. El administrador no la conoce.';
