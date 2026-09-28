/**
 * api/_comun.ts — Lo que comparten las ventanillas del asistente
 * ==============================================================
 * El guion bajo no es estético: Vercel NO convierte en función los archivos de
 * `api/` que empiezan así. Esto es código de apoyo, no una ventanilla más.
 *
 * Y no importa `@supabase/supabase-js` a propósito: recibe el cliente ya
 * armado, así una prueba le pasa uno falso que anota qué se escribió y EN QUÉ
 * ORDEN. La última auditoría encontró fallos que vivían justo ahí, en el orden
 * de las escrituras, y una prueba que no puede verlo no los puede atrapar.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import {
    Asignacion, InventoryType, Item, Movement, MovementType, Personnel, Project, ReturnCondition,
} from '../types';
import type { Bodega } from '../core/consultas';
import type { PlanRegistro } from '../core/registro';
import { uuidDe } from './identidad';

export interface Peticion {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
}
export interface Respuesta {
    status: (code: number) => Respuesta;
    json: (body: unknown) => void;
}

type ErrorDb = { message?: string; code?: string } | null;
/**
 * Lo mínimo del cliente de Supabase que se usa. Descrito por su forma para que
 * una prueba pueda poner uno falso sin arrastrar la librería ni las claves.
 */
export interface Cliente {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (tabla: string) => any;
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: ErrorDb }>;
}

/** Comparación que no se delata por el tiempo que tarda. */
export const tokenValido = (dado: string, esperado: string): boolean => {
    const a = Buffer.from(dado);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * La puerta: método, configuración y token. Devuelve el mensaje de rechazo, o
 * nada si pasa. Sin configuración se responde error: nunca se abre sin llave.
 */
export const revisarPuerta = (req: Peticion, metodo: 'POST'): { codigo: number; error: string } | null => {
    if (req.method !== metodo) return { codigo: 405, error: `Solo ${metodo}` };
    const esperado = process.env.BODEGA_API_TOKEN;
    if (!esperado || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return { codigo: 500, error: 'Falta configuración del servidor' };
    }
    const dado = String(req.headers['x-bodega-token'] ?? '');
    if (!tokenValido(dado, esperado)) return { codigo: 401, error: 'Token inválido' };
    return null;
};

// ── De la base a los tipos de la app ─────────────────────────────────

type Fila = Record<string, unknown>;
const texto = (v: unknown) => (v as string | null | undefined) ?? undefined;
const fecha = (v: unknown) => (v ? new Date(v as string) : undefined);

export const filaAItem = (r: Fila): Item => ({
    id: r.id as string,
    name: r.name as string,
    category: (r.category as string) ?? '',
    subCategory: (r.sub_category as string) ?? '',
    inventoryType: r.inventory_type as InventoryType,
    quantity: Number(r.quantity ?? 0),
    minStock: Number(r.min_stock ?? 0),
    unit: (r.unit as string) ?? 'und',
    color: texto(r.color),
    brand: texto(r.brand),
    familia: texto(r.familia),
    accessories: (r.accessories as Item['accessories']) ?? undefined,
    reparacion: r.reparacion ? {
        ...(r.reparacion as Record<string, unknown>),
        desde: new Date((r.reparacion as Record<string, unknown>).desde as string),
    } as Item['reparacion'] : undefined,
});

export const filaAMovimiento = (r: Fila): Movement => ({
    id: r.id as string,
    itemId: r.item_id as string,
    type: r.type as MovementType,
    quantity: Number(r.quantity),
    timestamp: new Date(r.timestamp as string),
    personnelId: texto(r.personnel_id),
    notes: texto(r.notes),
    projectId: texto(r.project_id),
    isLoan: !!r.is_loan,
    isReturned: !!r.is_returned,
    pendingPickup: !!r.pending_pickup,
    returnCondition: texto(r.return_condition) as ReturnCondition | undefined,
    returnNotes: texto(r.return_notes),
    returnedAt: fecha(r.returned_at),
    devuelveA: texto(r.devuelve_a),
    vieneDe: texto(r.viene_de),
    esTraslado: !!r.es_traslado,
    entregadoPor: texto(r.entregado_por),
    responsableAnterior: texto(r.responsable_anterior),
});

export const filaAAsignacion = (r: Fila): Asignacion => ({
    id: r.id as string,
    itemId: texto(r.item_id),
    descripcion: r.descripcion as string,
    cantidad: Number(r.cantidad),
    estado: r.estado as Asignacion['estado'],
    personnelId: texto(r.personnel_id),
    posibleResponsable: texto(r.posible_responsable),
    projectId: texto(r.project_id),
    ubicacion: texto(r.ubicacion),
    responsableAnterior: texto(r.responsable_anterior),
    entregadoPor: texto(r.entregado_por),
    condicion: (r.condicion as Asignacion['condicion']) ?? 'no_especificado',
    desde: fecha(r.desde),
    desdeDesconocido: !!r.desde_desconocido,
    procedencia: texto(r.procedencia),
    notas: texto(r.notas),
    cerradaEn: fecha(r.cerrada_en),
    cierreMotivo: texto(r.cierre_motivo) as Asignacion['cierreMotivo'],
    cierreNota: texto(r.cierre_nota),
    cerradaPor: texto(r.cerrada_por),
    createdAt: new Date(r.created_at as string),
    updatedAt: fecha(r.updated_at),
});

/** La bodega entera, sin lo que está en la papelera. */
export const leerBodega = async (sb: Cliente): Promise<Bodega | null> => {
    const [it, mv, pe, pr, as] = await Promise.all([
        sb.from('items').select('*').is('deleted_at', null),
        sb.from('movements').select('*').is('deleted_at', null),
        sb.from('personnel').select('*').is('deleted_at', null),
        sb.from('projects').select('*').is('deleted_at', null),
        sb.from('asignaciones').select('*').is('deleted_at', null),
    ]);
    if (it.error || mv.error || pe.error || pr.error || as.error) return null;
    return {
        items: (it.data ?? []).map(filaAItem),
        movements: (mv.data ?? []).map(filaAMovimiento),
        personnel: (pe.data ?? []).map((r: Fila): Personnel => ({ id: r.id as string, name: r.name as string })),
        projects: (pr.data ?? []).map((r: Fila): Project => ({ id: r.id as string, name: r.name as string, status: (r.status as Project['status']) ?? 'active' })),
        asignaciones: (as.data ?? []).map(filaAAsignacion),
    };
};

// ── Idempotencia ─────────────────────────────────────────────────────

/** La huella del contenido: el mismo operacionId con otro contenido es un error. */
export const huellaDe = (cuerpo: unknown): string =>
    createHash('sha256').update(JSON.stringify(cuerpo ?? null)).digest('hex');

/**
 * Identificadores deducidos de la operación, en el orden en que el plan los
 * pide. El mismo envío planeado contra la misma bodega da los mismos ids, y el
 * lote transaccional salta lo que ya existe: un reintento no escribe dos veces.
 */
export const generadorDeIds = (operacionId: string) => {
    let n = 0;
    return () => uuidDe(`${operacionId}|registro|${n++}`);
};

// ── Aplicar un plan ──────────────────────────────────────────────────

const aFila = (m: Movement) => ({
    id: m.id,
    item_id: m.itemId,
    type: m.type,
    quantity: m.quantity,
    timestamp: new Date(m.timestamp).toISOString(),
    personnel_id: m.personnelId ?? null,
    notes: m.notes ?? null,
    project_id: m.projectId ?? null,
    is_loan: m.isLoan ?? false,
    is_returned: m.isReturned ?? false,
    pending_pickup: m.pendingPickup ?? false,
    devuelve_a: m.devuelveA ?? null,
    return_condition: m.returnCondition ?? null,
    return_notes: m.returnNotes ?? null,
    returned_at: m.returnedAt ? new Date(m.returnedAt).toISOString() : null,
    viene_de: m.vieneDe ?? null,
    es_traslado: m.esTraslado ?? false,
    entregado_por: m.entregadoPor ?? null,
    responsable_anterior: m.responsableAnterior ?? null,
});

const fechaOVacio = (d?: Date) => (d ? new Date(d).toISOString() : null);

export interface Aplicado {
    ok: boolean;
    /** Si falló el lote: NO SE ESCRIBIÓ NADA, y se dice así. */
    error?: string;
    /** Lo que falló después del lote. El movimiento sí quedó; esto hay que mirarlo. */
    avisos: string[];
}

/**
 * Escribe un plan, EN ESTE ORDEN, y el orden es el punto:
 *
 *  1. Los movimientos, en un lote transaccional. Es lo único que no se puede
 *     reconstruir, así que va primero; si falla, no se escribe nada más.
 *  2. Cerrar los préstamos saldados. Si esto falla, el pendiente ya da cero
 *     —se calcula de las devoluciones— y ninguna pantalla lo muestra afuera.
 *  3. Asignaciones, reparaciones y pedidos.
 *  4. La bitácora, para que se vea en Trazabilidad junto con lo de la app.
 */
export const aplicarPlan = async (
    sb: Cliente,
    plan: PlanRegistro,
    meta: { operacionId: string; accion: string; actor: string },
): Promise<Aplicado> => {
    const avisos: string[] = [];

    if (plan.movimientos.length > 0) {
        const { error } = await sb.rpc('log_movements_and_update_stock', { p_movements: plan.movimientos.map(aFila) });
        if (error) return { ok: false, error: error.message ?? 'No se pudo guardar', avisos };
    }

    for (const c of plan.cerrarPrestamos) {
        const cambios: Record<string, unknown> = { is_returned: true, pending_pickup: false, returned_at: c.en.toISOString() };
        if (c.condicion) cambios.return_condition = c.condicion;
        if (c.nota) cambios.return_notes = c.nota;
        const { error } = await sb.from('movements').update(cambios).eq('id', c.id).eq('is_returned', false);
        if (error) avisos.push(`No se pudo marcar cerrado el préstamo ${c.id}: ${error.message}`);
    }

    for (const a of plan.asignaciones) {
        const { error } = await sb.from('asignaciones').upsert({
            id: a.id, item_id: a.itemId ?? null, descripcion: a.descripcion, cantidad: a.cantidad,
            estado: a.estado, personnel_id: a.personnelId ?? null, posible_responsable: a.posibleResponsable ?? null,
            project_id: a.projectId ?? null, ubicacion: a.ubicacion ?? null,
            responsable_anterior: a.responsableAnterior ?? null, entregado_por: a.entregadoPor ?? null,
            condicion: a.condicion, desde: fechaOVacio(a.desde), desde_desconocido: a.desdeDesconocido,
            procedencia: a.procedencia ?? null, notas: a.notas ?? null,
            cerrada_en: fechaOVacio(a.cerradaEn), cierre_motivo: a.cierreMotivo ?? null,
            cierre_nota: a.cierreNota ?? null, cerrada_por: a.cerradaPor ?? null,
            created_at: new Date(a.createdAt).toISOString(),
        }, { onConflict: 'id' });
        if (error) avisos.push(`No se pudo guardar la asignación «${a.descripcion}»: ${error.message}`);
    }

    for (const r of plan.reparaciones) {
        const { error } = await sb.from('items').update({ reparacion: r.reparacion }).eq('id', r.itemId);
        if (error) avisos.push(`No se pudo marcar la reparación: ${error.message}`);
    }

    for (const p of plan.pedidos) {
        const { error } = await sb.from('order_list').upsert({
            id: p.id, texto: p.texto, cantidad: p.cantidad ?? null, unidad: p.unidad ?? null,
            comprado: false, recibido: false, created_at: p.createdAt.toISOString(),
        }, { onConflict: 'id' });
        if (error) avisos.push(`No se pudo anotar el pedido: ${error.message}`);
    }

    const { error: errorBitacora } = await sb.from('audit_logs').upsert({
        id: uuidDe(`${meta.operacionId}|bitacora`),
        timestamp: new Date().toISOString(),
        actor: meta.actor,
        action: meta.accion,
        description: plan.resumen,
        origen: 'asistente',
        operacion_id: meta.operacionId,
    }, { onConflict: 'id' });
    if (errorBitacora) avisos.push(`No quedó en la bitácora: ${errorBitacora.message}`);

    return { ok: true, avisos };
};

/**
 * EL COMPROBANTE: se consulta ANTES de planear y se guarda siempre.
 *
 * Un reintento con el mismo identificador y el mismo contenido devuelve lo que
 * se contestó la primera vez, aunque hoy la bodega ya haya cambiado. El mismo
 * identificador con OTRO contenido es un error de quien llama, y se dice.
 */
export const buscarComprobante = async (sb: Cliente, operacionId: string, huella: string):
    Promise<{ previa?: unknown; choque?: boolean }> => {
    const { data } = await sb.from('operaciones_endpoint').select('huella, respuesta').eq('operacion_id', operacionId).maybeSingle();
    if (!data) return {};
    const d = data as { huella: string; respuesta: unknown };
    return d.huella === huella ? { previa: d.respuesta } : { choque: true };
};

export const guardarComprobante = async (sb: Cliente, operacionId: string, huella: string, respuesta: unknown) => {
    const { error } = await sb.from('operaciones_endpoint').insert({ operacion_id: operacionId, huella, respuesta });
    if (error) console.warn('[asistente] No se pudo guardar el comprobante:', error.message);
};
