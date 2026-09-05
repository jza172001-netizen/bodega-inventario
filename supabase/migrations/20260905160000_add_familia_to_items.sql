-- Hasta ahora la familia de un ítem se ADIVINABA: la primera palabra del
-- nombre. Funciona para "Lechada gris claro" y "Lechada veige", pero también
-- junta "Taladro Demoledor" con "Taladro Inhalambrico", que son dos
-- herramientas distintas — y sin preguntarle a nadie.
--
-- Esta columna guarda la familia que el bodeguero CONFIRMÓ. La app sigue
-- proponiendo, pero la decisión queda escrita y manda sobre la suposición.
-- Null = todavía no se decidió; ahí se usa la sugerencia, para no desagrupar
-- de golpe lo que ya venía funcionando.
alter table items add column if not exists familia text;

comment on column items.familia is
    'Familia confirmada por el usuario. Null: sin decidir, se usa la sugerencia calculada del nombre.';
