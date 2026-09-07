-- De dónde salió cada acción.
--
-- El chat necesita poder mostrar SU historial —lo que se hizo desde ahí— y que
-- se vea igual en todos los celulares. La bitácora ya se sincroniza entre
-- teléfonos, así que no hace falta una tabla nueva: lo único que faltaba era
-- saber cuáles de esos renglones vinieron del chat.
--
-- Nulo = se hizo desde las pantallas de siempre, que es todo lo de antes de hoy.
-- Aditiva: ninguna fila existente cambia de significado.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS origen text;

CREATE INDEX IF NOT EXISTS audit_logs_origen_idx
    ON audit_logs (origen, "timestamp" DESC) WHERE origen IS NOT NULL;

COMMENT ON COLUMN audit_logs.origen IS
    'Desde dónde se hizo la acción: "chat" si salió del asistente. Nulo = pantallas normales.';
