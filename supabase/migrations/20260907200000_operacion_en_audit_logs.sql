-- Qué renglones fueron de la MISMA operación.
--
-- El historial del chat tiene que verse como se ve en la conversación: un
-- chulito por cosa hecha —"✅ 3 salidas registradas para Jhon jader · LODGES"—
-- que al tocarlo se abre y muestra el detalle. Hoy esos tres despachos son tres
-- renglones sueltos en la bitácora, sin nada que diga que salieron del mismo
-- toque, así que no hay cómo juntarlos ni cómo redactar el resumen.
--
-- `operacion_id` los amarra. Y `CHAT_RESUMEN` guarda la frase exacta que el
-- bodeguero ya vio en pantalla, para no tener que adivinarla después leyendo
-- las descripciones con expresiones regulares.
--
-- Nulo = renglón suelto, que es todo lo de antes de hoy.
-- Aditiva: ninguna fila existente cambia de significado.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS operacion_id text;

CREATE INDEX IF NOT EXISTS audit_logs_operacion_idx
    ON audit_logs (operacion_id) WHERE operacion_id IS NOT NULL;

COMMENT ON COLUMN audit_logs.operacion_id IS
    'Amarra los renglones que salieron del mismo toque. Nulo = renglón suelto.';
