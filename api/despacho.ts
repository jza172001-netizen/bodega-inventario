/**
 * api/despacho.ts — La ventanilla para el asistente de IA
 * =======================================================
 * Una función sin servidor de Vercel. El asistente —ChatGPT, un bot de
 * Telegram, Gemini, el que sea— manda acá el bloque de texto y esto lo
 * registra. No hay que abrir la página web.
 *
 * LA REGLA MADRE: EL ASISTENTE NO DECIDE NADA
 *
 * El asistente solo escribe el papelito y lo mete por la ventanilla. Quien
 * cocina es `core/despacho.ts`, con las mismas reglas que usa la pantalla:
 * préstamo vs. gasto, accesorios pegados a su herramienta, y el freno por
 * falta de existencias. Un modelo se equivoca INTERPRETANDO —oye "pala" donde
 * dijeron "pulidora"— y eso es recuperable. Lo que no puede hacer es escribir
 * una cantidad que las reglas no aprobaron.
 *
 * POR QUÉ NO SE LE DA LA BASE DE DATOS DIRECTA
 *
 * Toda la lógica —que una herramienta nazca como préstamo y un consumible como
 * gasto, el asiento de apertura, el renglón de trazabilidad— vive en la capa de
 * aplicación. La base solo guarda filas. Un agente escribiendo directo en
 * Supabase mete el movimiento, sí, pero sin asiento en el Kardex y sin regla de
 * préstamo: cuadra la fila y descuadra el sistema.
 *
 * SEGURIDAD — LEER ESTO ANTES DE DESPLEGAR
 *
 * Esta función usa la clave de SERVICIO de Supabase, que se salta todas las
 * políticas. Vive solo en las variables de entorno de Vercel y NUNCA llega al
 * navegador. Lo único que separa esta ventanilla del mundo es `BODEGA_API_TOKEN`.
 * Si ese token se filtra, se filtra la bodega entera. Se rota cambiando la
 * variable en Vercel; no hace falta tocar código.
 *
 * Variables que hay que crear en Vercel (Settings → Environment Variables):
 *   SUPABASE_URL                 — la misma URL del proyecto
 *   SUPABASE_SERVICE_ROLE_KEY    — clave de servicio (NO la pública)
 *   BODEGA_API_TOKEN             — una cadena larga y aleatoria, inventada acá
 */

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { Item, Movement, MovementType, Personnel, InventoryType } from '../types';
import { planearLote, exigeProyecto } from '../core/despacho';
import { idDeterminista, firmaDe } from './identidad';
import { leerLote } from '../utils/lote';
import { isAsset } from '../utils/inventory';

/**
 * Tipos mínimos de la petición y la respuesta.
 *
 * A propósito descritos por su forma en vez de importar `@vercel/node`: es una
 * dependencia más que instalar y mantener para ganar dos nombres. Si algún día
 * se instala, estos tipos son compatibles.
 */
interface Peticion {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
}
interface Respuesta {
    status: (code: number) => Respuesta;
    json: (body: unknown) => void;
}

/** Comparación que no se delata por el tiempo que tarda. */
const tokenValido = (dado: string, esperado: string): boolean => {
    const a = Buffer.from(dado);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
};

const dbToItem = (r: Record<string, unknown>): Item => ({
    id: r.id as string,
    name: r.name as string,
    category: r.category as string,
    subCategory: (r.sub_category as string) ?? '',
    inventoryType: r.inventory_type as InventoryType,
    quantity: Number(r.quantity ?? 0),
    minStock: Number(r.min_stock ?? 0),
    unit: (r.unit as string) ?? 'und',
    color: (r.color as string) ?? undefined,
    brand: (r.brand as string) ?? undefined,
    familia: (r.familia as string) ?? undefined,
    accessories: (r.accessories as Item['accessories']) ?? undefined,
});

export default async function handler(req: Peticion, res: Respuesta): Promise<void> {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return; }

    const esperado = process.env.BODEGA_API_TOKEN;
    const url = process.env.SUPABASE_URL;
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!esperado || !url || !clave) {
        // Sin configuración se responde error, nunca se abre sin llave.
        res.status(500).json({ error: 'Falta configuración del servidor' });
        return;
    }

    const dado = String(req.headers['x-bodega-token'] ?? '');
    if (!tokenValido(dado, esperado)) { res.status(401).json({ error: 'Token inválido' }); return; }

    const cuerpo = (req.body ?? {}) as { texto?: string; operacionId?: string; proyectoId?: string; fecha?: string };
    const texto = (cuerpo.texto ?? '').trim();
    if (!texto) { res.status(400).json({ error: 'Falta el texto del bloque' }); return; }

    // Sin operacionId no hay protección contra el doble envío, así que se exige.
    const operacionId = (cuerpo.operacionId ?? '').trim();
    if (!operacionId) {
        res.status(400).json({ error: 'Falta operacionId. Mandá un identificador único por bloque; repetirlo evita el doble registro.' });
        return;
    }

    const sb = createClient(url, clave, { auth: { persistSession: false } });

    const [itemsRes, personalRes] = await Promise.all([
        sb.from('items').select('*').is('deleted_at', null),
        sb.from('personnel').select('*').is('deleted_at', null),
    ]);
    if (itemsRes.error || personalRes.error) {
        res.status(502).json({ error: 'No se pudo leer la bodega' });
        return;
    }

    const items: Item[] = (itemsRes.data ?? []).map(r => dbToItem(r as Record<string, unknown>));
    const personnel: Personnel[] = (personalRes.data ?? []).map(r => ({
        id: (r as Record<string, unknown>).id as string,
        name: (r as Record<string, unknown>).name as string,
    }));

    const lote = leerLote(texto, personnel, items);
    const ts = cuerpo.fecha ? new Date(cuerpo.fecha) : new Date();

    // Lo que la app NO resolvió sola no se adivina: vuelve como pendiente para
    // que un humano lo mire. Un asistente confundido no puede inventar a quién
    // se le entregó una herramienta.
    const pendientes: Array<{ renglon: string; motivo: string }> = [];
    const batch: Array<Omit<Movement, 'id'>> = [];

    for (const linea of lote.lineas) {
        if (!linea.persona) {
            pendientes.push({ renglon: linea.personaTexto, motivo: 'No se identificó a la persona' });
            continue;
        }
        for (const it of linea.items) {
            if (!it.item) {
                pendientes.push({ renglon: `${linea.personaTexto}: ${it.texto}`, motivo: 'No se identificó el elemento' });
                continue;
            }
            if (it.dudoso) {
                pendientes.push({ renglon: `${linea.personaTexto}: ${it.texto}`, motivo: `Hay más de una opción parecida: ${it.candidatos.map(c => c.name).join(', ')}` });
                continue;
            }
            batch.push({
                itemId: it.item.id,
                type: MovementType.CHECK_OUT,
                quantity: it.cantidad,
                timestamp: ts,
                personnelId: linea.persona.id,
                projectId: cuerpo.proyectoId,
                notes: '',
                isLoan: isAsset(it.item),
                isReturned: false,
            });
        }
    }
    for (const ignorada of lote.ignoradas) {
        pendientes.push({ renglon: ignorada, motivo: 'No se pudo leer el renglón' });
    }

    // La misma regla de la pantalla, desde el mismo sitio: los consumibles
    // necesitan proyecto. El endpoint la ignoraba y aceptaba una salida de
    // cemento sin obra, que es un gasto que después no se le puede cobrar a
    // nadie.
    if (exigeProyecto(batch, items) && !cuerpo.proyectoId) {
        res.status(400).json({
            error: 'Hay consumibles en el bloque y los consumibles necesitan proyecto. Mandá proyectoId.',
            pendientes,
        });
        return;
    }

    // Las mismas reglas de la pantalla: accesorios pegados a su herramienta y
    // freno por existencias.
    const plan = planearLote(batch, items);

    const registrados: Array<{ elemento: string; cantidad: number; persona?: string }> = [];
    const fallos: Array<{ elemento: string; motivo: string }> = [];
    const nombrePersona = new Map(personnel.map(p => [p.id, p.name]));

    /**
     * Los identificadores, deducidos antes de escribir nada.
     *
     * El sufijo `repeticion` distingue una misma cosa pedida dos veces en el
     * mismo bloque, y se cuenta por firma y no por posición: así «Alex: 1 pala,
     * 1 pala» son dos movimientos y no uno, y un reintento con renglones caídos
     * no le cambia el identificador a nadie.
     */
    const repeticiones = new Map<string, number>();
    const aEscribir = plan.aplicar.map(({ movimiento, item }) => {
        const firma = firmaDe(movimiento);
        const repeticion = repeticiones.get(firma) ?? 0;
        repeticiones.set(firma, repeticion + 1);
        return { movimiento, item, id: idDeterminista(operacionId, movimiento, repeticion) };
    });

    const anotarRegistrado = (item: Item, m: Omit<Movement, 'id'>) =>
        registrados.push({ elemento: item.name, cantidad: m.quantity, persona: nombrePersona.get(m.personnelId ?? '') });

    const comoFila = (id: string, m: Omit<Movement, 'id'>) => ({
        id,
        item_id: m.itemId,
        type: m.type,
        quantity: m.quantity,
        timestamp: ts.toISOString(),
        personnel_id: m.personnelId ?? null,
        notes: m.notes ?? null,
        project_id: m.projectId ?? null,
        is_loan: m.isLoan ?? false,
        is_returned: false,
        pending_pickup: false,
    });

    /**
     * EL DESPACHO ENTERO EN UNA TRANSACCIÓN.
     *
     * Antes era un RPC por movimiento, y ahí se colaban dos fallos que no se
     * pueden cerrar de este lado:
     *
     *  · El núcleo pone la entrada automática ANTES que su salida, pero la red
     *    no respeta ese orden. El servidor podía recibir la salida primero,
     *    rechazarla por falta de stock, y guardar la entrada después.
     *  · La herramienta y su accesorio se validan juntos pero se escribían
     *    sueltos: si la pulidora fallaba, el disco ya se había gastado.
     *
     * Con un solo viaje, o entra el despacho completo o no entra nada, y los
     * dos casos desaparecen por construcción en vez de por vigilancia.
     */
    const { error: errorLote } = await sb.rpc('log_movements_and_update_stock', {
        p_movements: aEscribir.map(x => comoFila(x.id, x.movimiento)),
    });

    // PGRST202 / 42883: la función todavía no está en este proyecto.
    const faltaLaFuncion = !!errorLote
        && ((errorLote as { code?: string }).code === 'PGRST202' || (errorLote as { code?: string }).code === '42883');

    if (!errorLote) {
        for (const { movimiento, item } of aEscribir) anotarRegistrado(item, movimiento);
    } else if (!faltaLaFuncion) {
        /**
         * Falló el lote: NO SE ESCRIBIÓ NADA. Se dice así, completo.
         *
         * Es lo contrario de lo que hacía antes, que era reportar renglón por
         * renglón sobre escrituras que sí habían quedado a medias. Un «no entró
         * nada» cierto vale más que un «entraron tres de cinco» que hay que ir
         * a comprobar a mano.
         */
        const motivo = (errorLote as { message?: string }).message ?? 'Error al guardar';
        for (const { item } of aEscribir) fallos.push({ elemento: item.name, motivo });
    } else {
        /**
         * Camino de respaldo, de a un movimiento y SIN atomicidad.
         *
         * Solo se llega acá si la migración no está aplicada. Conserva las dos
         * guardas que se pueden poner de este lado: el accesorio no sale si su
         * herramienta falló, y una clave repetida se comprueba leyendo la fila
         * antes de darla por registrada.
         */
        let ultimaHerramientaFallo = false;
        for (const { movimiento, item, id } of aEscribir) {
            const esAccesorio = !!movimiento.notes?.startsWith('Sale con ');
            if (esAccesorio && ultimaHerramientaFallo) {
                fallos.push({ elemento: item.name, motivo: 'No salió porque su herramienta no se pudo registrar' });
                continue;
            }
            const { error } = await sb.rpc('log_movement_and_update_stock', {
                p_id: id,
                p_item_id: movimiento.itemId,
                p_type: movimiento.type,
                p_quantity: movimiento.quantity,
                p_timestamp: ts.toISOString(),
                p_personnel_id: movimiento.personnelId ?? null,
                p_notes: movimiento.notes ?? null,
                p_project_id: movimiento.projectId ?? null,
                p_is_loan: movimiento.isLoan ?? false,
                p_is_returned: false,
                p_pending_pickup: false,
            });
            if (!error) {
                if (!esAccesorio) ultimaHerramientaFallo = false;
                anotarRegistrado(item, movimiento);
                continue;
            }
            if (!/duplicate key|23505/i.test(error.message ?? '')) {
                if (!esAccesorio) ultimaHerramientaFallo = true;
                fallos.push({ elemento: item.name, motivo: error.message ?? 'Error al guardar' });
                continue;
            }
            // Clave repetida NO es prueba de que se guardó ESTO: se lee la fila
            // y se compara. Por ahí se colaba el reporte de registros falsos.
            const { data: yaEsta } = await sb
                .from('movements')
                .select('item_id, quantity, personnel_id, type')
                .eq('id', id)
                .maybeSingle();
            const fila = yaEsta as Record<string, unknown> | null;
            const coincide = !!fila
                && fila.item_id === movimiento.itemId
                && Number(fila.quantity) === movimiento.quantity
                && (fila.personnel_id ?? null) === (movimiento.personnelId ?? null);
            if (!esAccesorio) ultimaHerramientaFallo = !coincide;
            if (coincide) anotarRegistrado(item, movimiento);
            else fallos.push({ elemento: item.name, motivo: 'El identificador ya existe con otro contenido; no se registró' });
        }
    }

    for (const r of plan.rechazos) {
        fallos.push({ elemento: r.nombre, motivo: `Hay ${r.hay} ${r.unidad} y se pidieron ${r.pedido}` });
    }

    // Respuesta corta y en cristiano: la residente está trabajando.
    res.status(200).json({
        resumen: `${registrados.length} registrado(s)`
            + (fallos.length ? `, ${fallos.length} sin stock` : '')
            + (pendientes.length ? `, ${pendientes.length} por revisar` : ''),
        registrados,
        fallos,
        pendientes,
    });
}
