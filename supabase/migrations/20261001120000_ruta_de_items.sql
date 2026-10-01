-- Los géneros por encima de la familia.
--
-- Juli organiza la bodega como un árbol de géneros y subgéneros hasta llegar a
-- la especie, que es la medida:
--
--     Tubería → Accesorios → Codo → 1/2" · 3/4" · 1"
--     Tubería → Tubos → Tubo sanitario → 2" · 3" · 4"
--
-- La familia (Codo) ya tenía columna. Lo de arriba —Tubería, Accesorios— no
-- tenía dónde vivir. Va como texto con los niveles separados por « / », de lo
-- general a lo particular, porque la profundidad no es fija: mañana puede haber
-- un nivel más y no debe hacer falta otra migración.
--
-- Null = sin género: el ítem va en la raíz, como hasta hoy. No toca cantidades
-- ni movimientos.
alter table items add column if not exists ruta text;

comment on column items.ruta is
    'Géneros por encima de la familia, de lo general a lo particular, separados por " / ". Null: en la raíz.';
