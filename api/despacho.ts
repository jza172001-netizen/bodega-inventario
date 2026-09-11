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
import { createHash, timingSafeEqual } from 'node:crypto';
import { Item, Movement, MovementType, Personnel, InventoryType } from '../types';
import { planearLote } from '../core/despacho';
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

/**
 * El identificador de cada movimiento, DEDUCIDO y no sorteado.
 *
 * Es lo que impide el doble registro. Si el asistente manda el mismo bloque dos
 * veces —doble toque, reintento porque se perdió la respuesta, o el bot que se
 * confunde— la segunda vez sale exactamente el mismo identificador, y la base
 * rechaza la fila repetida por clave primaria. Sin esto, un reintento despacha
 * dos veces y la bodega pierde material de verdad.
 *
 * Se arma un UUID a partir del hash de la operación y el número de renglón, con
 * la versión y la variante en su sitio para que sea un UUID válido.
 */
const idDeterminista = (operacionId: string, indice: number): string => {
    const h = createHash('sha256').update(`${operacionId}:${indice}`).digest('hex');
    const v = (parseInt(h[16], 16) & 0x3 | 0x8).toString(16);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

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

    // Las mismas reglas de la pantalla: accesorios pegados a su herramienta y
    // freno por existencias.
    const plan = planearLote(batch, items);

    const registrados: Array<{ elemento: string; cantidad: number; persona?: string }> = [];
    const fallos: Array<{ elemento: string; motivo: string }> = [];
    const nombrePersona = new Map(personnel.map(p => [p.id, p.name]));

    for (let i = 0; i < plan.aplicar.length; i++) {
        const { movimiento, nuevaCantidad, item } = plan.aplicar[i];
        const id = idDeterminista(operacionId, i);
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
            // Clave repetida = este renglón YA se registró en un envío anterior.
            // No es un fallo: es justamente la protección funcionando.
            const repetido = /duplicate key|23505/i.test(error.message ?? '');
            if (repetido) registrados.push({ elemento: item.name, cantidad: movimiento.quantity, persona: nombrePersona.get(movimiento.personnelId ?? '') });
            else fallos.push({ elemento: item.name, motivo: error.message ?? 'Error al guardar' });
            continue;
        }
        // El espejo del stock se deja como lo calculó el núcleo, por si la RPC
        // no existiera y hubiera que caer al camino no atómico.
        void nuevaCantidad;
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
