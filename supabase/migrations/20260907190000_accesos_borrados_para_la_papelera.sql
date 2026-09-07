-- Los accesos borrados, para que la papelera pueda mostrarlos.
--
-- `app_users` tiene seguridad de fila con permisos de insertar, editar y
-- borrar, pero NINGUNO de leer: por eso los accesos vivos se leen con
-- `get_users_safe`, que es SECURITY DEFINER y se salta esa restricción.
--
-- La papelera hacía un SELECT directo, así que un acceso borrado desaparecía
-- de la pantalla de entrada y tampoco aparecía en la papelera — se perdía sin
-- forma de devolverlo desde la app, que es justo lo contrario de lo que la
-- papelera existe para hacer. Comprobado contra producción con la llave real
-- de la aplicación antes de escribir esto.
--
-- Devuelve lo mismo que su hermana y nada más: ni contraseña ni hash salen de
-- la base.

CREATE OR REPLACE FUNCTION public.get_deleted_users_safe()
 RETURNS TABLE(user_id uuid, user_username text, user_role text, user_name text,
               user_deleted_at timestamptz, user_deleted_by text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT id, username, role::TEXT, name, deleted_at, deleted_by
  FROM app_users
  WHERE deleted_at IS NOT NULL
  ORDER BY deleted_at DESC;
END;
$function$;

-- Y devolver un acceso: el UPDATE directo sí pasa la seguridad de fila
-- (`allow_update`), pero se hace acá para que la papelera hable con la tabla
-- de usuarios siempre por el mismo camino.
CREATE OR REPLACE FUNCTION public.restore_user(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE app_users SET deleted_at = NULL, deleted_by = NULL WHERE id = p_id;
END;
$function$;
