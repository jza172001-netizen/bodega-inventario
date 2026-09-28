/**
 * core/registro.ts — Lo que el asistente puede registrar, además de salidas
 * ========================================================================
 * Devolución (total o parcial), traslado, hallazgo, daño y pedido. Cada uno se
 * PLANEA acá, sin red: devuelve qué movimientos escribir, qué préstamos cerrar,
 * qué asignaciones guardar. `api/registro.ts` solo lee, llama y aplica.
 *
 * LA REGLA MADRE, la misma del despacho: EL ASISTENTE NO DECIDE NADA. Si la
 * frase deja dos lecturas —«la pulidora» cuando Abel tiene una Makita y una
 * DeWalt— no se escoge una: se devuelve la duda, con las opciones. Un registro
 * equivocado con cara de correcto es peor que una pregunta.
 *
 * Y LO QUE NO SE SABE, NO SE INVENTA (punto 6 del prompt de Juli). Cada
 * registro devuelve su ficha con los quince campos; el que no se dijo sale
 * «No especificado». Hay una prueba que lo fija.
 */

import {
    Asignacion, EstadoReparacion, Item, Movement, MovementType, OrderNote, Personnel, ReturnCondition,
} from '../types.js';
import { getActiveLoans, pendienteDe, repartirDevolucion } from '../utils/inventory.js';
import { rankMatches } from '../utils/search.js';
import { itemsQueResponden, resolverItem, resolverPersona } from '../utils/lote.js';
import { NO_ESPECIFICADO, armarTraspaso, estaAbierta, resolverAsignacion } from './custodia.js';
import type { Bodega } from './consultas.js';

export type Operacion =
    | { operacion: 'devolucion'; persona: string; elemento: string; cantidad?: number; estado?: string; observacion?: string; entregadoPor?: string }
    | { operacion: 'traslado'; elemento: string; persona?: string; aPersona?: string; aObra?: string; cantidad?: number; entregadoPor?: string; observacion?: string }
    | { operacion: 'hallazgo'; elemento: string; enBodega?: boolean; obra?: string; lugar?: string; persona?: string; cantidad?: number; observacion?: string }
    | { operacion: 'dano'; elemento: string; observacion?: string; persona?: string }
    | { operacion: 'pedido'; texto: string; cantidad?: number; unidad?: string };

export const OPERACIONES = ['devolucion', 'traslado', 'hallazgo', 'dano', 'pedido'] as const;

/**
 * Los quince campos del punto 6 del prompt de Juli, siempre los quince.
 * El que no se sabe dice «No especificado» — nunca un valor de relleno.
 */
export interface Ficha {
    fecha: string; hora: string; movimiento: string; elemento: string; cantidad: string;
    marca: string; color: string; responsableAnterior: string; responsableNuevo: string;
    quienEntrega: string; quienRecibe: string; origen: string; destino: string;
    estado: string; observacion: string;
}

export interface PlanRegistro {
    /** En orden, para el lote transaccional. */
    movimientos: Movement[];
    cerrarPrestamos: Array<{ id: string; condicion?: ReturnCondition; nota?: string; en: Date }>;
    asignaciones: Asignacion[];
    reparaciones: Array<{ itemId: string; reparacion: EstadoReparacion }>;
    pedidos: OrderNote[];
    resumen: string;
    fichas: Ficha[];
}

export type ResultadoPlan = PlanRegistro | { error: string; dudas?: string[] };

const ne = (v?: string | number | null): string => {
    if (v === undefined || v === null) return NO_ESPECIFICADO;
    const t = String(v).trim();
    return t ? t : NO_ESPECIFICADO;
};

const limpio = (s?: string) => { const t = s?.trim(); return t ? t : undefined; };

/**
 * Las palabras con que se dice el estado, a lo que guarda la base. Lo que no
 * se reconoce NO se adivina: queda sin estado, que se lee «No especificado».
 */
export const leerEstado = (texto?: string): ReturnCondition | undefined => {
    const t = (texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (!t) return undefined;
    if (/^(buen[oa]?|ok|bien)$/.test(t)) return 'good';
    if (/desgast/.test(t)) return 'worn';
    if (/incomplet|falta/.test(t)) return 'incomplete';
    if (/mantenim|revisi/.test(t)) return 'needs_maintenance';
    if (/^(mal[oa]?|danad[oa]|dano|rot[oa]|averiad[oa])$/.test(t)) return 'damaged';
    return undefined;
};

const NOMBRE_ESTADO: Record<ReturnCondition, string> = {
    good: 'Bueno', worn: 'Desgaste normal', incomplete: 'Incompleta',
    damaged: 'Dañada', needs_maintenance: 'Requiere mantenimiento',
};

const DAÑAN = new Set<ReturnCondition>(['damaged', 'incomplete', 'needs_maintenance']);

interface Op { ahora: Date; nuevoId: () => string; porQuien?: string }

const ficha = (ahora: Date, parcial: Partial<Ficha>): Ficha => {
    const local = new Date(ahora.getTime() - 5 * 60 * 60 * 1000).toISOString();
    return {
        fecha: local.slice(0, 10), hora: local.slice(11, 16),
        movimiento: NO_ESPECIFICADO, elemento: NO_ESPECIFICADO, cantidad: NO_ESPECIFICADO,
        marca: NO_ESPECIFICADO, color: NO_ESPECIFICADO,
        responsableAnterior: NO_ESPECIFICADO, responsableNuevo: NO_ESPECIFICADO,
        quienEntrega: NO_ESPECIFICADO, quienRecibe: NO_ESPECIFICADO,
        origen: NO_ESPECIFICADO, destino: NO_ESPECIFICADO,
        estado: NO_ESPECIFICADO, observacion: NO_ESPECIFICADO,
        ...Object.fromEntries(Object.entries(parcial).map(([k, v]) => [k, ne(v as string)])),
    };
};

const vacio = (): Omit<PlanRegistro, 'resumen' | 'fichas'> => ({
    movimientos: [], cerrarPrestamos: [], asignaciones: [], reparaciones: [], pedidos: [],
});

const persona = (b: Bodega, texto: string | undefined, rol: string): { p?: Personnel; error?: string; dudas?: string[] } => {
    if (!limpio(texto)) return {};
    const r = resolverPersona(texto!, b.personnel);
    if (!r.elegido) return { error: `No encontré a «${texto}» (${rol}) en el personal.` };
    if (r.dudoso) return { error: `«${texto}» (${rol}) puede ser más de una persona.`, dudas: r.candidatos.slice(0, 4).map(p => p.name) };
    return { p: r.elegido };
};

const obra = (b: Bodega, texto?: string) => {
    if (!limpio(texto)) return {};
    const r = rankMatches(b.projects, texto!, p => [p.name], 3);
    if (!r[0] || r[0].score < 500) return { error: `No encontré la obra «${texto}».` };
    if (r[1] && r[0].score - r[1].score < 100) return { error: `«${texto}» puede ser más de una obra.`, dudas: r.map(x => x.value.name) };
    return { o: r[0].value };
};

/** Los préstamos vivos que responden a un elemento, opcionalmente de una persona. */
const prestamosDe = (b: Bodega, elemento: string, personaId?: string): Movement[] => {
    const ids = new Set(itemsQueResponden(elemento, b.items).map(i => i.id));
    return b.movements.filter(m =>
        m.isLoan && m.type === MovementType.CHECK_OUT && !m.isReturned && ids.has(m.itemId)
        && (!personaId || m.personnelId === personaId) && pendienteDe(m, b.movements) > 0);
};

// ── Devolución ───────────────────────────────────────────────────────

const devolucion = (b: Bodega, o: Extract<Operacion, { operacion: 'devolucion' }>, op: Op): ResultadoPlan => {
    const quien = persona(b, o.persona, 'quien devuelve');
    if (quien.error) return { error: quien.error, dudas: quien.dudas };
    if (!quien.p) return { error: 'Falta decir quién devuelve.' };
    const p = quien.p;

    const suyos = prestamosDe(b, o.elemento, p.id);
    if (suyos.length === 0) {
        const tiene = getActiveLoans(b.movements).filter(m => m.personnelId === p.id)
            .map(m => `${m.quantity} × ${b.items.find(i => i.id === m.itemId)?.name ?? '?'}`);
        return { error: `${p.name} no tiene «${o.elemento}» prestada.`, dudas: tiene.length ? [`Tiene: ${tiene.join(', ')}`] : undefined };
    }
    // Dos ítems distintos que responden al mismo nombre: no se escoge por él.
    const itemsDistintos = [...new Set(suyos.map(m => m.itemId))];
    const afuera = suyos.reduce((s, m) => s + pendienteDe(m, b.movements), 0);
    const cantidad = o.cantidad ?? afuera;
    if (itemsDistintos.length > 1 && cantidad < afuera) {
        return {
            error: `${p.name} tiene más de una clase de «${o.elemento}». ¿Cuál devolvió?`,
            dudas: itemsDistintos.map(id => b.items.find(i => i.id === id)?.name ?? id),
        };
    }
    if (cantidad > afuera) {
        return { error: `${p.name} tiene ${afuera} afuera y se quieren devolver ${cantidad}. No se registra más de lo que salió.` };
    }

    const estado = leerEstado(o.estado);
    const plan = vacio();
    const partes = repartirDevolucion(suyos.map(m => m.id), b.movements, cantidad);
    const fichas: Ficha[] = [];
    for (const parte of partes) {
        const prestamo = suyos.find(m => m.id === parte.id)!;
        const item = b.items.find(i => i.id === prestamo.itemId);
        plan.movimientos.push({
            id: op.nuevoId(),
            itemId: prestamo.itemId,
            type: MovementType.CHECK_IN,
            quantity: parte.cantidad,
            timestamp: op.ahora,
            personnelId: prestamo.personnelId,
            projectId: prestamo.projectId,
            devuelveA: prestamo.id,
            returnCondition: estado,
            returnNotes: limpio(o.observacion),
            returnedAt: op.ahora,
            entregadoPor: limpio(o.entregadoPor),
            notes: `Devolución${parte.cantidad < pendienteDe(prestamo, b.movements) ? ` — parcial, ${parte.cantidad} de ${pendienteDe(prestamo, b.movements)}` : ''} (asistente)`,
            updatedAt: op.ahora,
        });
        if (pendienteDe(prestamo, b.movements) - parte.cantidad === 0) {
            plan.cerrarPrestamos.push({ id: prestamo.id, condicion: estado, nota: limpio(o.observacion), en: op.ahora });
        }
        if (item && estado && DAÑAN.has(estado) && item.reparacion?.estado !== 'enviada') {
            plan.reparaciones.push({ itemId: item.id, reparacion: { estado: 'dañada', desde: op.ahora, nota: limpio(o.observacion), porQuien: op.porQuien } });
        }
        fichas.push(ficha(op.ahora, {
            movimiento: 'Devolución', elemento: item?.name, cantidad: String(parte.cantidad),
            marca: item?.brand, color: item?.color,
            // Quién la trajo NO se supone: puede haberla traído otro. Si no se
            // dijo, queda «No especificado».
            responsableAnterior: p.name, quienEntrega: limpio(o.entregadoPor),
            quienRecibe: 'Bodega', origen: b.projects.find(x => x.id === prestamo.projectId)?.name,
            destino: 'Bodega', estado: estado ? NOMBRE_ESTADO[estado] : undefined, observacion: o.observacion,
        }));
    }
    const quedan = afuera - cantidad;
    return {
        ...plan,
        resumen: `Devolución de ${p.name}: ${cantidad} × ${o.elemento}${quedan > 0 ? ` — le quedan ${quedan}` : ''}${estado ? `, ${NOMBRE_ESTADO[estado].toLowerCase()}` : ''}.`,
        fichas,
    };
};

// ── Traslado ─────────────────────────────────────────────────────────

const traslado = (b: Bodega, o: Extract<Operacion, { operacion: 'traslado' }>, op: Op): ResultadoPlan => {
    const de = persona(b, o.persona, 'quien la tiene');
    if (de.error) return { error: de.error, dudas: de.dudas };
    const a = persona(b, o.aPersona, 'a quién pasa');
    if (a.error) return { error: a.error, dudas: a.dudas };
    const destinoObra = obra(b, o.aObra);
    if (destinoObra.error) return { error: destinoObra.error, dudas: destinoObra.dudas };
    if (!a.p && !destinoObra.o) return { error: 'Falta decir a quién o a qué obra pasa.' };

    const candidatos = prestamosDe(b, o.elemento, de.p?.id);
    if (candidatos.length === 0) {
        return { error: `No hay «${o.elemento}» prestada${de.p ? ` a ${de.p.name}` : ''} para trasladar.` };
    }
    // Más de un préstamo que calza, de gente u obras distintas: no se escoge.
    const claves = new Set(candidatos.map(m => `${m.itemId}|${m.personnelId}|${m.projectId}`));
    if (claves.size > 1) {
        return {
            error: `Hay más de una «${o.elemento}» afuera. ¿Cuál se traslada?`,
            dudas: candidatos.map(m => `${b.items.find(i => i.id === m.itemId)?.name} — ${b.personnel.find(x => x.id === m.personnelId)?.name ?? NO_ESPECIFICADO}`),
        };
    }
    const prestamo = [...candidatos].sort((x, y) => +new Date(x.timestamp) - +new Date(y.timestamp))[0];
    const nombreDe = (id?: string) => b.personnel.find(x => x.id === id)?.name;
    const obraDe = (id?: string) => b.projects.find(x => x.id === id)?.name;
    const plan = armarTraspaso(prestamo, b.movements, { personnelId: a.p?.id, projectId: destinoObra.o?.id }, {
        cantidad: o.cantidad, entregadoPor: o.entregadoPor, nota: o.observacion,
        ahora: op.ahora, nuevoId: op.nuevoId, nombreDe, obraDe,
    });
    if ('error' in plan) return { error: plan.error };
    const item = b.items.find(i => i.id === prestamo.itemId);
    return {
        ...vacio(),
        movimientos: [plan.devolucion, plan.nuevo],
        cerrarPrestamos: plan.cierra ? [{ id: prestamo.id, en: op.ahora }] : [],
        resumen: `${plan.nuevo.notes}: ${item?.name ?? o.elemento}.`,
        fichas: [ficha(op.ahora, {
            movimiento: a.p ? 'Traspaso' : 'Traslado', elemento: item?.name, cantidad: String(plan.cantidad),
            marca: item?.brand, color: item?.color,
            responsableAnterior: nombreDe(prestamo.personnelId), responsableNuevo: nombreDe(plan.nuevo.personnelId),
            quienEntrega: limpio(o.entregadoPor), quienRecibe: nombreDe(plan.nuevo.personnelId),
            origen: obraDe(prestamo.projectId), destino: obraDe(plan.nuevo.projectId), observacion: o.observacion,
        })],
    };
};

// ── Hallazgo ─────────────────────────────────────────────────────────

const hallazgo = (b: Bodega, o: Extract<Operacion, { operacion: 'hallazgo' }>, op: Op): ResultadoPlan => {
    const idsItem = new Set(itemsQueResponden(o.elemento, b.items).map(i => i.id));
    const abiertas = b.asignaciones.filter(a => estaAbierta(a) && (
        (a.itemId && idsItem.has(a.itemId))
        || (rankMatches([a], o.elemento, x => [x.descripcion], 1)[0]?.score ?? 0) >= 500));
    if (abiertas.length === 0) {
        return { error: `No hay nada pendiente por ubicar que se parezca a «${o.elemento}». Si es algo nuevo, registralo como entrada.` };
    }
    if (abiertas.length > 1) {
        return { error: `Hay más de una pendiente que se parece a «${o.elemento}». ¿Cuál apareció?`, dudas: abiertas.map(a => `${a.cantidad} × ${a.descripcion}${a.posibleResponsable ? ` (${a.posibleResponsable})` : ''}`) };
    }
    const asig = abiertas[0];
    const quien = persona(b, o.persona, 'quien la tiene');
    if (quien.error) return { error: quien.error, dudas: quien.dudas };
    const donde = obra(b, o.obra);
    if (donde.error) return { error: donde.error, dudas: donde.dudas };

    // Para entrar al libro hace falta saber QUÉ ítem es. Si la asignación no lo
    // tiene, se toma el único que responde al nombre; si hay varios, se pregunta.
    const itemDe = (): { id?: string; error?: string; dudas?: string[] } => {
        if (asig.itemId) return { id: asig.itemId };
        const r = resolverItem(o.elemento, b.items);
        if (!r.elegido || r.dudoso) return { error: `¿Cuál ítem del inventario es «${o.elemento}»?`, dudas: r.candidatos.map(i => i.name) };
        return { id: r.elegido.id };
    };

    let r;
    let movimiento: string;
    if (quien.p) {
        const it = itemDe(); if (it.error) return { error: it.error, dudas: it.dudas };
        r = resolverAsignacion(asig, { tipo: 'prestamo', itemId: it.id!, personnelId: quien.p.id, projectId: donde.o?.id, cantidad: o.cantidad, nota: o.observacion },
            { ...op, nombreDe: id => b.personnel.find(x => x.id === id)?.name });
        movimiento = 'Hallazgo — confirmado con responsable';
    } else if (o.enBodega) {
        const it = itemDe(); if (it.error) return { error: it.error, dudas: it.dudas };
        r = resolverAsignacion(asig, { tipo: 'bodega', itemId: it.id!, cantidad: o.cantidad, nota: o.observacion }, op);
        movimiento = 'Hallazgo — en bodega';
    } else if (donde.o || limpio(o.lugar)) {
        r = resolverAsignacion(asig, { tipo: 'obra', projectId: donde.o?.id, ubicacion: o.lugar, cantidad: o.cantidad, nota: o.observacion },
            { ...op, obraDe: id => b.projects.find(x => x.id === id)?.name });
        movimiento = 'Hallazgo — en obra';
    } else {
        return { error: 'Falta decir dónde apareció: en bodega, en qué obra o lugar, o quién la tiene.' };
    }
    if ('error' in r) return { error: r.error };
    const item = b.items.find(i => i.id === (asig.itemId ?? r.movimientos[0]?.itemId));
    return {
        ...vacio(),
        movimientos: r.movimientos,
        asignaciones: [r.cerrada, ...(r.resto ? [r.resto] : []), ...(r.hallada ? [r.hallada] : [])],
        resumen: `Hallazgo de «${asig.descripcion}»: ${r.cerrada.cierreNota}.`,
        fichas: [ficha(op.ahora, {
            movimiento, elemento: item?.name ?? asig.descripcion, cantidad: String(Math.min(o.cantidad ?? asig.cantidad, asig.cantidad)),
            marca: item?.brand, color: item?.color,
            responsableAnterior: asig.responsableAnterior, responsableNuevo: quien.p?.name,
            quienRecibe: quien.p?.name ?? (o.enBodega ? 'Bodega' : undefined),
            destino: o.enBodega ? 'Bodega' : [donde.o?.name, limpio(o.lugar)].filter(Boolean).join(' · '),
            observacion: o.observacion,
        })],
    };
};

// ── Daño ─────────────────────────────────────────────────────────────

const dano = (b: Bodega, o: Extract<Operacion, { operacion: 'dano' }>, op: Op): ResultadoPlan => {
    const r = resolverItem(o.elemento, b.items);
    if (!r.elegido || r.dudoso) return { error: `¿Cuál es «${o.elemento}»?`, dudas: r.candidatos.map(i => i.name) };
    const item: Item = r.elegido;
    if (item.reparacion?.estado === 'enviada') return { error: `${item.name} ya está en el taller.` };
    // Cambia el ESTADO, no la existencia: la herramienta dañada sigue siendo
    // parte del inventario, y así la pidió Juli.
    return {
        ...vacio(),
        reparaciones: [{ itemId: item.id, reparacion: { estado: 'dañada', desde: op.ahora, nota: limpio(o.observacion), porQuien: op.porQuien } }],
        resumen: `${item.name} quedó marcada como dañada. Sigue en el inventario.`,
        fichas: [ficha(op.ahora, {
            movimiento: 'Daño', elemento: item.name, cantidad: '1', marca: item.brand, color: item.color,
            responsableAnterior: limpio(o.persona), estado: 'Dañada', observacion: o.observacion,
        })],
    };
};

// ── Pedido ───────────────────────────────────────────────────────────

const pedido = (o: Extract<Operacion, { operacion: 'pedido' }>, op: Op): ResultadoPlan => {
    const texto = limpio(o.texto);
    if (!texto) return { error: 'Falta decir qué hay que pedir.' };
    const nota: OrderNote = {
        id: op.nuevoId(), texto, cantidad: o.cantidad, unidad: limpio(o.unidad),
        comprado: false, createdAt: op.ahora, updatedAt: op.ahora,
    };
    return {
        ...vacio(), pedidos: [nota],
        resumen: `Anotado para pedir: ${o.cantidad ? `${o.cantidad} ${nota.unidad ?? ''} ` : ''}${texto}.`.replace(/\s+/g, ' '),
        fichas: [ficha(op.ahora, { movimiento: 'Pedido', elemento: texto, cantidad: o.cantidad != null ? String(o.cantidad) : undefined })],
    };
};

export const planearRegistro = (b: Bodega, o: Operacion, op: Op): ResultadoPlan => {
    const cantidad = 'cantidad' in o ? o.cantidad : undefined;
    if (cantidad !== undefined && (!Number.isFinite(cantidad) || cantidad <= 0)) {
        return { error: 'La cantidad tiene que ser un número mayor que cero.' };
    }
    if (o.operacion !== 'pedido' && !limpio(o.elemento)) return { error: 'Falta decir qué elemento.' };
    switch (o.operacion) {
        case 'devolucion': return devolucion(b, o, op);
        case 'traslado': return traslado(b, o, op);
        case 'hallazgo': return hallazgo(b, o, op);
        case 'dano': return dano(b, o, op);
        case 'pedido': return pedido(o, op);
        default: return { error: `Operación desconocida. Las que hay: ${OPERACIONES.join(', ')}.` };
    }
};
