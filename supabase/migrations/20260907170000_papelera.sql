-- La papelera: que lo borrado se pueda ver y devolver.
--
-- Casi toda la app ya borra con lápida (`deleted_at`), pero faltaban dos piezas:
--
-- 1. `app_users` y `order_list` eran las únicas tablas donde el borrado era de
--    verdad — `delete()` contra la fila. Un acceso borrado por equivocación, o
--    un renglón de la lista de pedidos, no había cómo devolverlos.
--
-- 2. La lápida decía CUÁNDO, nunca QUIÉN. Para saberlo tocaba adivinar cruzando
--    la bitácora por el nombre, y eso se rompe apenas dos cosas se llamen
--    parecido. `deleted_by` lo guarda al lado del dato, sin adivinar.
--
-- Aditiva: ninguna fila existente cambia de significado. Lo ya borrado antes de
-- hoy queda con `deleted_by` en nulo, que la papelera muestra como
-- «no quedó registrado quién» — que es la verdad, no un invento.

ALTER TABLE app_users  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE order_list ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE items           ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE movements       ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE personnel       ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE projects        ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE app_users       ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE order_list      ADD COLUMN IF NOT EXISTS deleted_by text;

-- Las listas de la papelera siempre filtran por lápida puesta. Sin índice, cada
-- apertura recorre la tabla entera.
CREATE INDEX IF NOT EXISTS items_deleted_at_idx           ON items           (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS movements_deleted_at_idx       ON movements       (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS personnel_deleted_at_idx       ON personnel       (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_deleted_at_idx        ON projects        (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_orders_deleted_at_idx ON purchase_orders (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS app_users_deleted_at_idx       ON app_users       (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_list_deleted_at_idx      ON order_list      (deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN items.deleted_by IS
    'Quién mandó esto a la papelera. Nulo = se borró antes de que se guardara el dato.';
