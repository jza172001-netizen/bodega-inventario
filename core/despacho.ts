/**
 * core/despacho.ts — Qué pasa cuando algo sale o entra de la bodega
 * =================================================================
 * Acá vive la aritmética del stock, sin React. Recibe el inventario y las
 * líneas pedidas, y devuelve QUÉ HAY QUE APLICAR y QUÉ SE RECHAZA. No toca
 * estado, no guarda nada, no avisa a nadie.
 *
 * POR QUÉ ESTÁ AFUERA DE `App.tsx`
 *
 * 1. **Un servidor no tiene React.** Para que un asistente de IA registre un
 *    despacho por un endpoint, la regla tiene que poder correr sin pantalla.
 *    Mientras vivía entrelazada con `setItems` y `ajustarEspejo`, no podía.
 *
 * 2. **Había dos despachos distintos para la misma salida.** El formulario
 *    llamaba a `handleLogMovement`, que NO expandía accesorios; el chat llamaba
 *    a `handleLogMovements`, que SÍ. La misma salida de una pulidora dejaba
 *    cinco discos por un lado y cuatro por el otro. Con una sola función, esa
 *    divergencia deja de ser posible.
 *
 * 3. **El accesorio salía aunque la herramienta se rechazara.** Los accesorios
 *    se agregaban al final del lote y cada línea se validaba por su cuenta: con
 *    cero pulidoras y cinco discos, la pulidora se rechazaba y el disco se
 *    consumía igual. Acá la herramienta y sus accesorios son UNA unidad: o pasa
 *    el grupo completo, o no pasa nada del grupo.
 */

import { Item, Movement, MovementType, RechazoStock } from '../types';
import { esRetiro, alcanzaStock } from '../utils/inventory';

/** Un movimiento listo para registrar, con la cantidad en que queda su ítem. */
export interface Aplicacion {
    movimiento: Omit<Movement, 'id'>;
    /** El stock del ítem DESPUÉS de este movimiento. */
    nuevaCantidad: number;
    /** El ítem al que pertenece, ya resuelto. */
    item: Item;
}

export interface Plan {
    /** Lo que sí entra, en orden. */
    aplicar: Aplicacion[];
    /** Lo que no entró y por qué. El grupo entero, no la línea suelta. */
    rechazos: RechazoStock[];
    /**
     * Movimientos sin ítem en el inventario. No se botan: se registran igual
     * para que el historial no pierda nada, pero no mueven stock de nadie.
     */
    huerfanos: Array<Omit<Movement, 'id'>>;
}

/**
 * Los accesorios que salen pegados a una herramienta.
 *
 * Solo los que tienen `itemId` —los consumibles, que se gastan y descuentan—.
 * Los retornables (la maleta, el cargador) salen y vuelven CON la herramienta y
 * no son movimiento de nada.
 */
const accesoriosDe = (m: Omit<Movement, 'id'>, item?: Item): Array<Omit<Movement, 'id'>> => {
    if (m.type !== MovementType.CHECK_OUT) return [];
    return (item?.accessories ?? [])
        .filter(a => a.itemId)
        .map(a => ({
            ...m,
            itemId: a.itemId!,
            quantity: (a.cantidad ?? 1) * m.quantity,   // 2 pulidoras → 2 juegos de discos
            isLoan: false,                              // se gasta, no se presta
            notes: `Sale con ${item?.name ?? 'la herramienta'}`,
        }));
};

/**
 * Arma el plan de un lote.
 *
 * `items` es el inventario contra el que se valida. Quien llama decide si es el
 * del render o el espejo — desde acá no se sabe ni importa, y por eso mismo
 * esta función sirve igual en el navegador que en un servidor.
 *
 * El stock se va descontando línea por línea dentro del mismo lote: dos salidas
 * de tres palas cuando hay cinco dejan pasar la primera y rechazan la segunda,
 * en vez de aprobar las dos contra el mismo saldo inicial.
 */
export const planearLote = (
    batch: Array<Omit<Movement, 'id'>>,
    items: Item[],
): Plan => {
    const porId = new Map(items.map(i => [i.id, i]));
    const restante = new Map(items.map(i => [i.id, i.quantity]));
    const plan: Plan = { aplicar: [], rechazos: [], huerfanos: [] };

    for (const m of batch) {
        const item = porId.get(m.itemId);
        if (!item) { plan.huerfanos.push(m); continue; }

        // La herramienta y sus accesorios son UNA unidad de validación.
        const grupo = [m, ...accesoriosDe(m, item)];

        // ¿Alcanza para el grupo COMPLETO? Se prueba contra una copia, para no
        // dejar el saldo tocado si al final el grupo no pasa.
        const tentativo = new Map(restante);
        let falla: { item: Item; pedido: number; hay: number } | null = null;

        for (const linea of grupo) {
            const it = porId.get(linea.itemId);
            if (!it) continue;                       // accesorio huérfano: no frena la herramienta
            const hay = tentativo.get(linea.itemId) ?? 0;
            if (esRetiro(linea.type) && !alcanzaStock(hay, linea.quantity)) {
                falla = { item: it, pedido: linea.quantity, hay };
                break;
            }
            tentativo.set(linea.itemId, esRetiro(linea.type) ? hay - linea.quantity : hay + linea.quantity);
        }

        if (falla) {
            // El rechazo nombra lo que SE ACABÓ —que es lo que hay que reponer—
            // pero se lleva la línea ORIGINAL, para que reintentarla vuelva a
            // armar el grupo completo con sus accesorios.
            plan.rechazos.push({
                itemId: falla.item.id,
                nombre: falla.item.name,
                unidad: falla.item.unit,
                hay: falla.hay,
                pedido: falla.pedido,
                movimiento: m,
            });
            continue;                                 // el grupo entero se queda afuera
        }

        // Pasó completo: se confirma el saldo y se anotan las aplicaciones.
        for (const linea of grupo) {
            const it = porId.get(linea.itemId);
            if (!it) continue;
            const nueva = tentativo.get(linea.itemId)!;
            plan.aplicar.push({ movimiento: linea, nuevaCantidad: Math.max(0, nueva), item: it });
        }
        for (const [id, q] of tentativo) restante.set(id, q);
    }

    return plan;
};
