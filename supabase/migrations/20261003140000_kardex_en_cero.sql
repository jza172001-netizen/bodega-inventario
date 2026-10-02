-- ============================================================================
-- El Kardex en cero — sin tocar una sola cantidad
-- ============================================================================
-- La consulta 4 de `supabase/RESTAURAR.md` (entradas menos salidas = stock)
-- devolvía filas por dos razones, las dos de ANTES de que el libro llevara
-- todo. Esto solo AGREGA asientos que explican lo que ya pasó. El stock no se
-- mueve: los asientos se insertan directo, sin las funciones de stock.
--
-- 1. DEVOLUCIONES DE ANTES DEL 28-SEP. Devolver marcaba el préstamo
--    `is_returned` y reponía el stock sin dejar entrada. Desde el 28-sep cada
--    devolución es su propia entrada enlazada (`devuelve_a`). A cada préstamo
--    viejo cerrado sin su entrada se le pone la suya, con la fecha en que volvió.
--
-- 2. SIETE ÍTEMS CON STOCK SIN RESPALDO (18 unidades), todos con movimientos
--    del 5 al 8 de septiembre, antes de que el despacho se guardara en una sola
--    transacción (12-sep). Medido en producción el 3-oct-2026. Cada uno recibe
--    un asiento de regularización por la diferencia exacta — y SOLO si la
--    diferencia sigue siendo esa: si algo cambió, no se toca y se revisa a mano.
--
-- En una reconstrucción en blanco no hay nada de esto y no hace nada.
-- ============================================================================

-- ── 1. La entrada de cada devolución vieja ──────────────────────────────────
insert into movements (id, item_id, type, quantity, timestamp, personnel_id, project_id, notes,
                       is_loan, is_returned, pending_pickup, devuelve_a, returned_at)
select gen_random_uuid(), m.item_id, 'Entrada'::movement_type, m.quantity,
       coalesce(m.returned_at, m.timestamp), m.personnel_id, m.project_id,
       'Devolución de antes del 28-sep-2026 (se reponía sin entrada). Asiento de regularización del 3-oct-2026; el stock no se movió.',
       false, false, false, m.id, coalesce(m.returned_at, m.timestamp)
from movements m
where m.is_loan and m.is_returned and m.deleted_at is null
  and m.type = 'Salida'
  and m.timestamp < '2026-09-28'
  and not exists (select 1 from movements d where d.devuelve_a = m.id and d.deleted_at is null);

-- ── 2. Los siete ítems, por su diferencia exacta ────────────────────────────
do $$
declare
  r record;
  v_dif numeric;
begin
  for r in select * from (values
      ('311a59ea-fa68-43d1-9f11-f3125ba93387'::uuid, 12::numeric),  -- Polvo enchape
      ('147bf8ee-7d75-4167-b43f-b511f3567f9a'::uuid,  1::numeric),  -- clavos 2 acero
      ('3d5af03c-e345-468c-ade3-e41a5cc1dbfb'::uuid,  1::numeric),  -- Clavos Tiro
      ('b9ab575b-fdff-4121-97db-af3ba6f4efa3'::uuid,  1::numeric),  -- Estopa
      ('6ddc5c3e-1cd3-4e4f-8c97-80bc4685f522'::uuid,  1::numeric),  -- Lechada veige
      ('37ac8e0d-d8c7-4240-bd3b-b35e29fd91a1'::uuid,  1::numeric),  -- Lijadora (Amarilla · Dwalt)
      ('bbd6c28a-818d-46c8-b112-90c392dbda82'::uuid,  1::numeric)   -- Línea de vida con arnes
    ) as t(item_id, esperado)
  loop
    select i.quantity - coalesce(sum(case when m.type in ('Entrada', 'Compra') then m.quantity
                                          when m.type in ('Salida', 'Merma') then -m.quantity end), 0)
      into v_dif
      from items i left join movements m on m.item_id = i.id and m.deleted_at is null
     where i.id = r.item_id and i.deleted_at is null
     group by i.id, i.quantity;
    if v_dif is null then continue; end if;          -- no existe (base en blanco)
    if v_dif <> r.esperado then
      raise notice 'Kardex: % no se regulariza, la diferencia es % y se esperaba %', r.item_id, v_dif, r.esperado;
      continue;
    end if;
    insert into movements (id, item_id, type, quantity, timestamp, notes, is_loan, is_returned, pending_pickup)
    values (gen_random_uuid(), r.item_id, 'Entrada'::movement_type, r.esperado, now(),
            'Regularización del 3-oct-2026: stock que figuraba sin respaldo en el libro (movimientos del 5 al 8 de sep). El stock no se movió.',
            false, false, false);
  end loop;
end $$;
