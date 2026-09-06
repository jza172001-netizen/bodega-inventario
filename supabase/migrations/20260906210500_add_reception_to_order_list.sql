-- Confirmar qué llegó de verdad de cada pedido.
--
-- La lista de pedidos era una libreta y no tocaba el inventario, a propósito.
-- Pero "comprado" y "recibido" no son lo mismo: se piden 5 bultos y llegan 3,
-- se pide una cosa y llega otra, o no llega nada. Marcar la compra sigue sin
-- mover nada; confirmar la RECEPCIÓN sí registra la entrada al inventario.
--
-- Con esto la app deja de llevar solo la trazabilidad de lo que sale y empieza
-- a llevar también la de lo que entra, sin cargar el inventario entero de una:
-- se va completando pedido a pedido.
--
-- Aditivo: las cuatro columnas nacen nulas o en falso, y todo lo anotado hasta
-- hoy queda exactamente como está.

ALTER TABLE order_list
    ADD COLUMN IF NOT EXISTS recibido     boolean     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS recibido_qty numeric,
    ADD COLUMN IF NOT EXISTS item_id      uuid,
    ADD COLUMN IF NOT EXISTS recibido_at  timestamptz;

COMMENT ON COLUMN order_list.recibido     IS 'Llegó a la bodega y entró al inventario.';
COMMENT ON COLUMN order_list.recibido_qty IS 'Cuánto llegó de verdad, que puede no ser lo pedido.';
COMMENT ON COLUMN order_list.item_id      IS 'A qué ítem del inventario entró.';
