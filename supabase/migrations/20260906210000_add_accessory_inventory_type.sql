-- El catálogo de accesorios.
--
-- Los accesorios de una herramienta —los discos de la pulidora, las brocas del
-- taladro, el soporte del láser— se venían tomando del inventario de
-- consumibles: al abrir «+ Accesorio» en una pulidora salían bombillos, estopa,
-- gafas y clavos. Ninguno de esos es accesorio de nada, y un disco no se cuenta
-- junto a una libra de clavos.
--
-- Con este valor nuevo los accesorios pasan a ser una lista propia, con su
-- propio contador, que el bodeguero llena de a poco y solo se puede enganchar a
-- herramientas.
--
-- Es aditivo: no toca ninguna fila existente y nada de lo guardado cambia de
-- significado. Los cuatro valores de siempre siguen igual.

ALTER TYPE inventory_type ADD VALUE IF NOT EXISTS 'Accesorio';
