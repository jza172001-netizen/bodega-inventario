-- El ciclo de una herramienta dañada.
--
-- Hasta hoy, devolver algo "dañado" guardaba la palabra en el movimiento y ahí
-- moría. Nadie volvía a acordarse de mandarla a arreglar, ni de reclamarla
-- cuando ya estaba lista donde el técnico. Son dos olvidos distintos y los dos
-- cuestan plata.
--
-- Acá se guardan los tres momentos reales —se dañó y está acá; se mandó al
-- taller; volvió arreglada— con la fecha de cada uno y quién lo marcó. La app
-- no adelanta ningún paso sola: cada uno lo confirma el bodeguero, porque solo
-- él sabe si la herramienta salió de verdad para el taller.
--
-- Aditivo: la columna nace nula y ninguna fila existente cambia.

ALTER TABLE items
    ADD COLUMN IF NOT EXISTS reparacion jsonb;

COMMENT ON COLUMN items.reparacion IS
    'Ciclo de reparación: {estado: dañada|enviada|arreglada, desde, enviadaEl, devueltaEl, nota, porQuien}. Cada paso lo confirma una persona.';
