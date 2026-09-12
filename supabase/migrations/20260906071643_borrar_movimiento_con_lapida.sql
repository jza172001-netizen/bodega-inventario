-- ============================================================================
-- Borrar un movimiento pone LÁPIDA, no borra la fila
-- ============================================================================
-- ESTA MIGRACIÓN YA ESTABA APLICADA EN PRODUCCIÓN Y NO ESTABA EN GIT.
--
-- El repositorio traía dos migraciones con `delete from movements` dentro de
-- `delete_movement_and_revert_stock` (`20260610120000_atomic_stock_movements` y
-- `20260817140000_fix_loan_return_restores_stock`) y ninguna que lo corrigiera.
-- El servidor sí estaba corregido —se comprobó leyendo `pg_get_functiondef`
-- contra el proyecto real—, así que el que mentía era el repositorio, no la
-- base.
--
-- Eso no es un detalle de documentación: cualquiera que aplicara las
-- migraciones del repo sobre un proyecto nuevo —o sobre este— instalaba la
-- versión que BORRA DE VERDAD, y con eso se pierde la papelera y la única
-- defensa contra que el otro celular resucite lo borrado.
--
-- Esta es la definición tal cual está instalada, traída a Git para que el
-- repositorio deje de contradecir al servidor.
--
-- POR QUÉ LÁPIDA Y NO BORRÓN
--
-- Una fila que desaparece se resucita sola desde el otro celular, que todavía
-- la tiene guardada y la vuelve a subir en la siguiente sincronización. Así
-- volvieron los 15 movimientos de prueba de agosto después de borrarlos.
-- ============================================================================

create or replace function public.delete_movement_and_revert_stock(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    m record;
begin
    select * into m from movements where id = p_movement_id and deleted_at is null;
    if not found then
        return;  -- ya estaba enterrado, o nunca existió: no se toca el stock dos veces
    end if;

    -- Un préstamo ya devuelto tiene efecto neto cero: salió y volvió. Revertirlo
    -- sumaría una segunda vez e inflaría el stock.
    if not (m.is_loan and m.is_returned) then
        if m.type in ('Salida', 'Merma') then
            update items set quantity = quantity + m.quantity where id = m.item_id;
        else
            update items set quantity = greatest(quantity - m.quantity, 0) where id = m.item_id;
        end if;
    end if;

    update movements set deleted_at = now(), updated_at = now() where id = p_movement_id;
end;
$function$;
