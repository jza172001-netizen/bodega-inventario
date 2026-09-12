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

    // Cuántas veces ya salió esta misma combinación en este bloque, para que
    // «Alex: 1 pala, 1 pala» no colapse en un solo movimiento.
    const repeticiones = new Map<string, number>();
    /** Si la última herramienta no se pudo guardar, sus accesorios no salen. */
    let ultimaHerramientaFallo = false;

    for (const { movimiento, nuevaCantidad, item } of plan.aplicar) {
        /**
         * Si la herramienta no se pudo guardar, su accesorio NO SE ESCRIBE.
         *
         * El núcleo los valida juntos, pero la persistencia es un RPC por
         * movimiento: si la pulidora falla al escribirse —porque otro usuario le
         * movió el stock entre la planificación y la escritura— el disco se
         * descontaba igual y quedaba registrado solo, gastado sin herramienta.
         *
         * Esta guarda va ANTES del RPC a propósito. La primera versión la puse
         * después, y ahí no servía de nada: para cuando preguntaba si la
         * herramienta había fallado, el disco YA estaba escrito y el stock YA
         * había bajado. Revisar después de escribir no es revisar.
         *
         * La garantía completa pide una transacción por despacho; esto cierra el
         * caso que se puede cerrar sin migración.
         */
        const esAccesorio = !!movimiento.notes?.startsWith('Sale con ');
        if (esAccesorio && ultimaHerramientaFallo) {
            fallos.push({ elemento: item.name, motivo: 'No salió porque su herramienta no se pudo registrar' });
            continue;
        }

        const firma = firmaDe(movimiento);
        const repeticion = repeticiones.get(firma) ?? 0;
        repeticiones.set(firma, repeticion + 1);
        const id = idDeterminista(operacionId, movimiento, repeticion);
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
        if (error) {
            const repetido = /duplicate key|23505/i.test(error.message ?? '');
            if (!repetido) {
                if (!esAccesorio) ultimaHerramientaFallo = true;
                fallos.push({ elemento: item.name, motivo: error.message ?? 'Error al guardar' });
                continue;
            }
            /**
             * Clave repetida NO es prueba de que se guardó ESTO.
             *
             * Antes se daba por buena sin mirar, y por ahí se colaba el reporte
             * falso. Ahora se lee la fila que ya existe y se compara con lo que
             * se iba a escribir. Si coincide, el reintento está funcionando: ya
             * estaba. Si no coincide, es un choque de identificadores y hay que
             * decirlo, no taparlo.
             */
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
            if (coincide) {
                if (!esAccesorio) ultimaHerramientaFallo = false;
                registrados.push({ elemento: item.name, cantidad: movimiento.quantity, persona: nombrePersona.get(movimiento.personnelId ?? '') });
            } else {
                if (!esAccesorio) ultimaHerramientaFallo = true;
                fallos.push({ elemento: item.name, motivo: 'El identificador ya existe con otro contenido; no se registró' });
            }
            continue;
        }
        // El espejo del stock se deja como lo calculó el núcleo, por si la RPC
        // no existiera y hubiera que caer al camino no atómico.
        void nuevaCantidad;
        if (!esAccesorio) ultimaHerramientaFallo = false;
        registrados.push({ elemento: item.name, cantidad: movimiento.quantity, persona: nombrePersona.get(movimiento.personnelId ?? '') });
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
