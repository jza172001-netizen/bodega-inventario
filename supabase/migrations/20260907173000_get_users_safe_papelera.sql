-- get_users_safe tiene que saber de la papelera.
--
-- Ahora que borrar un acceso pone lápida en vez de quitar la fila, esta función
-- seguiría devolviendo los accesos borrados y volverían a aparecer en la
-- pantalla de entrada.
--
-- De paso devuelve setup_complete de verdad. Hasta hoy el cliente lo deducía de
-- que el nombre de usuario no fuera nulo, y acertaba —porque el usuario solo se
-- escribe cuando la persona pone su clave—, pero era una coincidencia entre dos
-- columnas, no un dato. La contraseña sigue sin viajar al cliente.
--
-- Se cambia el tipo de retorno, así que hay que soltarla y volverla a crear; va
-- en una sola transacción, y el cliente viejo mapea por nombre de columna, así
-- que la columna nueva no le estorba.

DROP FUNCTION IF EXISTS public.get_users_safe();

CREATE FUNCTION public.get_users_safe()
 RETURNS TABLE(user_id uuid, user_username text, user_role text, user_name text, user_setup_complete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT id, username, role::TEXT, name, COALESCE(setup_complete, false)
  FROM app_users
  WHERE deleted_at IS NULL
  ORDER BY name;
END;
$function$;
