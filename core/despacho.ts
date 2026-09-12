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

/**
 * Una entrada que hubo que inventar para que la salida pudiera pasar.
 *
 * NO es stock inventado: es un registro que llega tarde. En la bodega de
 * Montecielo la herramienta está ahí físicamente, lo que no está es en la app —
 * el inventario nunca se cargó entero. Cuando alguien despacha una pala que la
 * app no sabía que existía, lo honesto no es rechazar la salida: es anotar que
 * la pala estaba y que salió.
 *
 * Se devuelve aparte de `aplicar` para que la pantalla pueda MOSTRARLO antes de
 * que pase. Nada de esto se aplica solo: un asistente de IA equivocado no puede
 * inflar el inventario a espaldas de nadie.
 */
export interface Completado {
    item: Item;
    /** Cuántas unidades hubo que dar por existentes. */
    faltaban: number;
    /** `vacio`: no había ni una. `corto`: había, pero no alcanzaba. */
    motivo: 'vacio' | 'corto';
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
    /** Las entradas que se agregaron para cubrir lo que no alcanzaba. */
    completados: Completado[];
}

export interface OpcionesPlan {
    /**
     * Cuando no alcanza el stock, en vez de rechazar la salida se registra
     * primero la entrada que falta.
     *
     * La regla es de Juli: *«casi siempre lo que se saca se agrega al sistema y
     * se marca la salida automáticamente, a no ser de que haya existencia en
     * bodega»*. Lo que decide no es el texto que se pegó: **es la existencia**.
     * Si hay, sale y ya; si no hay, entra lo que falta y sale.
     *
     * Apagado por defecto. El despacho normal de la pantalla sigue frenando,
     * porque ahí la falta de stock sí es una señal de que algo está mal.
     */
    completarFaltante?: boolean;
    /** La nota que lleva la entrada inventada, para que el historial lo diga. */
    notaDeCompletado?: string;
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
    opciones: OpcionesPlan = {},
): Plan => {
    const porId = new Map(items.map(i => [i.id, i]));
    const restante = new Map(items.map(i => [i.id, i.quantity]));
    const plan: Plan = { aplicar: [], rechazos: [], huerfanos: [], completados: [] };

    for (const m of batch) {
        const item = porId.get(m.itemId);
        if (!item) { plan.huerfanos.push(m); continue; }

        // La herramienta y sus accesorios son UNA unidad de validación.
        const grupo = [m, ...accesoriosDe(m, item)];

        // ¿Alcanza para el grupo COMPLETO? Se prueba contra una copia, para no
        // dejar el saldo tocado si al final el grupo no pasa.
        const tentativo = new Map(restante);
        const entradas: Aplicacion[] = [];
        const completados: Completado[] = [];
        let falla: { item: Item; pedido: number; hay: number } | null = null;

        for (const linea of grupo) {
            const it = porId.get(linea.itemId);
            if (!it) continue;                       // accesorio huérfano: no frena la herramienta
            let hay = tentativo.get(linea.itemId) ?? 0;

            if (esRetiro(linea.type) && !alcanzaStock(hay, linea.quantity)) {
                if (!opciones.completarFaltante) {
                    falla = { item: it, pedido: linea.quantity, hay };
                    break;
                }
                /**
                 * No alcanza, pero la cosa está en la bodega: lo que faltaba era
                 * el registro. Entra lo justo —nunca más— y queda dicho por qué.
                 *
                 * Entrar de más sería inflar el inventario, que es el miedo
                 * legítimo de dejar que un asistente escriba. Acá el techo es el
                 * hueco: `quantity - hay`, ni una unidad más.
                 */
                const faltaban = linea.quantity - hay;
                const entrada: Omit<Movement, 'id'> = {
                    itemId: linea.itemId,
                    type: MovementType.CHECK_IN,
                    quantity: faltaban,
                    timestamp: linea.timestamp,
                    notes: opciones.notaDeCompletado
                        ?? 'No estaba registrado en el inventario; se registró al despacharlo',
                    isLoan: false,
                    isReturned: false,
                };
                hay += faltaban;
                tentativo.set(linea.itemId, hay);
                entradas.push({ movimiento: entrada, nuevaCantidad: hay, item: it });
                completados.push({ item: it, faltaban, motivo: (hay - faltaban) === 0 ? 'vacio' : 'corto' });
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
        // Las entradas van PRIMERO, para que el stock exista antes de salir.
        plan.aplicar.push(...entradas);
        plan.completados.push(...completados);
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
