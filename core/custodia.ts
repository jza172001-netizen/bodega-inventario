/**
 * core/custodia.ts — Quién tiene qué, dónde, y de quién le llegó
 * ===============================================================
 * La regla de la custodia, sin React y sin red. La usan la app y el endpoint
 * del asistente: **la misma regla en un solo sitio**, como `core/despacho.ts`.
 *
 * DOS COSAS VIVEN ACÁ
 *
 * 1. **El traslado y el traspaso.** Mover una herramienta de obra o de manos NO
 *    es un tipo de movimiento nuevo: las funciones de stock tratan como entrada
 *    todo lo que no es salida o merma, y un tipo «Traslado» sumaría una pulidora
 *    a la bodega en cada traslado. Es lo que de verdad pasa con la custodia: el
 *    préstamo anterior se salda con una devolución enlazada y se abre uno nuevo
 *    que dice de cuál viene. Van juntos, en una transacción; el stock sube y
 *    baja lo mismo y el libro cuadra.
 *
 * 2. **Las asignaciones sin confirmar.** Lo que está afuera sin préstamo: «1
 *    láser Total fuera → posible: Jesús → verificar». Esas unidades NO están en
 *    el libro, y entran solo al resolverse, siempre por un movimiento.
 *
 * LO QUE NO SE SABE NO SE INVENTA. Ninguna función de acá rellena un campo que
 * no le dieron: sin fecha, `desdeDesconocido`; sin estado, `no_especificado`;
 * sin quién entregó, vacío — y la pantalla escribe «No especificado».
 */

import { Asignacion, CondicionAsignacion, EstadoAsignacion, Movement, MovementType, MotivoCierre } from '../types.js';
import { pendienteDe } from '../utils/inventory.js';

/** Lo que se muestra cuando un dato no se dijo. Nunca se guarda en su lugar. */
export const NO_ESPECIFICADO = 'No especificado';

export const ESTADOS: Record<EstadoAsignacion, string> = {
    confirmada: 'Confirmado',
    posible: 'Posible asignación',
    pendiente_verificar: 'Falta por verificar',
};

const limpio = (s?: string): string | undefined => {
    const t = s?.trim();
    return t ? t : undefined;
};

// ── Traslado y traspaso ──────────────────────────────────────────────

export interface Destino {
    /** A quién pasa. Sin decir: se queda con el mismo (traslado de obra). */
    personnelId?: string;
    /** A qué obra pasa. Sin decir: la misma (traspaso de manos). */
    projectId?: string;
}

export interface OpcionesTraspaso {
    /** Cuántas pasan. Sin decir: todo lo que sigue afuera. */
    cantidad?: number;
    entregadoPor?: string;
    nota?: string;
    ahora: Date;
    nuevoId: () => string;
    nombreDe?: (personnelId?: string) => string | undefined;
    obraDe?: (projectId?: string) => string | undefined;
}

export interface PlanTraspaso {
    /** La devolución que salda (del todo o en parte) el préstamo anterior. */
    devolucion: Movement;
    /** El préstamo nuevo, que dice de cuál viene. */
    nuevo: Movement;
    /** Si con esto el préstamo anterior quedó sin nada afuera. */
    cierra: boolean;
    cantidad: number;
}

/**
 * Arma un traslado de obra o un traspaso de manos, sin aplicarlo.
 *
 * Devuelve un error dicho en vez de un plan cuando no hay nada que mover: un
 * préstamo ya cerrado, o un destino idéntico al origen. Un traslado «de El
 * Cristo a El Cristo» no es un traslado, y registrarlo ensucia la cadena.
 */
export const armarTraspaso = (
    prestamo: Movement,
    movimientos: Movement[],
    destino: Destino,
    op: OpcionesTraspaso,
): PlanTraspaso | { error: string } => {
    if (!prestamo.isLoan || prestamo.type !== MovementType.CHECK_OUT) {
        return { error: 'Solo un préstamo se puede trasladar o traspasar.' };
    }
    const pendiente = prestamo.isReturned ? 0 : pendienteDe(prestamo, movimientos);
    if (pendiente <= 0) return { error: 'Ese préstamo ya volvió completo: no hay nada afuera que mover.' };

    const persona = destino.personnelId ?? prestamo.personnelId;
    const obra = destino.projectId ?? prestamo.projectId;
    if (persona === prestamo.personnelId && obra === prestamo.projectId) {
        return { error: 'El destino es el mismo que el origen: no cambia ni la persona ni la obra.' };
    }

    const cantidad = Math.max(1, Math.min(op.cantidad ?? pendiente, pendiente));
    const cambiaPersona = persona !== prestamo.personnelId;
    const cambiaObra = obra !== prestamo.projectId;

    const deQuien = op.nombreDe?.(prestamo.personnelId);
    const aQuien = op.nombreDe?.(persona);
    const deObra = op.obraDe?.(prestamo.projectId);
    const aObra = op.obraDe?.(obra);

    const partes: string[] = [];
    if (cambiaPersona) partes.push(`de ${deQuien ?? NO_ESPECIFICADO} a ${aQuien ?? NO_ESPECIFICADO}`);
    if (cambiaObra) partes.push(`obra ${deObra ?? NO_ESPECIFICADO} → ${aObra ?? NO_ESPECIFICADO}`);
    const que = cambiaPersona ? 'Traspaso' : 'Traslado';
    const detalle = `${que} ${partes.join(', ')}${cantidad < pendiente ? ` — ${cantidad} de ${pendiente}` : ''}`;
    const nota = limpio(op.nota);

    const devolucion: Movement = {
        id: op.nuevoId(),
        itemId: prestamo.itemId,
        type: MovementType.CHECK_IN,
        quantity: cantidad,
        timestamp: op.ahora,
        personnelId: prestamo.personnelId,
        projectId: prestamo.projectId,
        devuelveA: prestamo.id,
        esTraslado: true,
        returnedAt: op.ahora,
        notes: nota ? `${detalle}. ${nota}` : detalle,
        updatedAt: op.ahora,
    };

    const nuevo: Movement = {
        id: op.nuevoId(),
        itemId: prestamo.itemId,
        type: MovementType.CHECK_OUT,
        quantity: cantidad,
        // Un segundo después de la devolución: en el libro, el saldo del
        // anterior va antes que la salida del nuevo, siempre.
        timestamp: new Date(op.ahora.getTime() + 1000),
        personnelId: persona,
        projectId: obra,
        isLoan: true,
        isReturned: false,
        pendingPickup: false,
        vieneDe: prestamo.id,
        esTraslado: true,
        entregadoPor: limpio(op.entregadoPor),
        // El dato que pedía el hueco 3: quién la tenía, escrito en la fila.
        responsableAnterior: cambiaPersona ? deQuien : undefined,
        notes: nota ? `${detalle}. ${nota}` : detalle,
        updatedAt: op.ahora,
    };

    return { devolucion, nuevo, cierra: pendiente - cantidad === 0, cantidad };
};

/**
 * La cadena de custodia de un préstamo, del más viejo al actual.
 *
 * «¿Quién la tenía antes?» se contesta caminando `vieneDe` hacia atrás. Se
 * corta si encuentra un ciclo —no debería existir, pero un dato roto no puede
 * colgar la pantalla.
 */
export const cadenaDeCustodia = (prestamo: Movement, movimientos: Movement[]): Movement[] => {
    const porId = new Map(movimientos.map(m => [m.id, m]));
    const cadena: Movement[] = [prestamo];
    const vistos = new Set([prestamo.id]);
    let actual = prestamo;
    while (actual.vieneDe && !vistos.has(actual.vieneDe)) {
        const anterior = porId.get(actual.vieneDe);
        if (!anterior) break;
        cadena.unshift(anterior);
        vistos.add(anterior.id);
        actual = anterior;
    }
    return cadena;
};

// ── Asignaciones sin confirmar ───────────────────────────────────────

export interface DatosAsignacion {
    itemId?: string;
    descripcion: string;
    cantidad: number;
    estado: EstadoAsignacion;
    personnelId?: string;
    posibleResponsable?: string;
    projectId?: string;
    ubicacion?: string;
    responsableAnterior?: string;
    entregadoPor?: string;
    condicion?: CondicionAsignacion;
    desde?: Date;
    procedencia?: string;
    notas?: string;
}

/** Crea una asignación, validando lo que no puede faltar y sin rellenar lo demás. */
export const crearAsignacion = (
    d: DatosAsignacion,
    op: { ahora: Date; nuevoId: () => string },
): Asignacion | { error: string } => {
    const descripcion = limpio(d.descripcion);
    if (!descripcion) return { error: 'Falta decir qué es.' };
    if (!Number.isFinite(d.cantidad) || d.cantidad <= 0) return { error: 'La cantidad tiene que ser mayor que cero.' };
    if (!(d.estado in ESTADOS)) return { error: `Estado desconocido: ${d.estado}` };
    return {
        id: op.nuevoId(),
        itemId: d.itemId,
        descripcion,
        cantidad: d.cantidad,
        estado: d.estado,
        personnelId: d.personnelId,
        posibleResponsable: limpio(d.posibleResponsable),
        projectId: d.projectId,
        ubicacion: limpio(d.ubicacion),
        responsableAnterior: limpio(d.responsableAnterior),
        entregadoPor: limpio(d.entregadoPor),
        condicion: d.condicion ?? 'no_especificado',
        desde: d.desde,
        desdeDesconocido: !d.desde,
        procedencia: limpio(d.procedencia),
        notas: limpio(d.notas),
        createdAt: op.ahora,
        updatedAt: op.ahora,
    };
};

export const estaAbierta = (a: Asignacion): boolean => !a.cerradaEn;

/** Unidades afuera sin confirmar, por ítem. Solo las que ya tienen ítem. */
export const afueraSinConfirmar = (asignaciones: Asignacion[]): Map<string, number> => {
    const porItem = new Map<string, number>();
    for (const a of asignaciones) {
        if (!estaAbierta(a) || !a.itemId) continue;
        porItem.set(a.itemId, (porItem.get(a.itemId) ?? 0) + a.cantidad);
    }
    return porItem;
};

export type Resolucion =
    /** Se confirmó quién la tiene: entra al libro y sale prestada, juntas. */
    | { tipo: 'prestamo'; itemId: string; personnelId: string; projectId?: string; cantidad?: number; entregadoPor?: string; nota?: string }
    /** Apareció en la bodega: entra al libro y queda disponible. */
    | { tipo: 'bodega'; itemId: string; cantidad?: number; nota?: string }
    /**
     * Apareció en una obra, sin que nadie la tenga a cargo: «encontré el láser
     * Total en Salvador Bahía». Sale de pendientes como CONFIRMADA en ese
     * lugar. No entra al libro —no volvió a la bodega ni se le prestó a nadie—.
     */
    | { tipo: 'obra'; projectId?: string; ubicacion?: string; cantidad?: number; nota?: string }
    /** No existe, o estaba contada dos veces. Sin movimiento: nunca estuvo en el libro. */
    | { tipo: 'perdida' | 'duplicada'; cantidad?: number; nota: string };

export interface PlanResolucion {
    movimientos: Movement[];
    /** La asignación original, CERRADA. Queda: no se borra nada. */
    cerrada: Asignacion;
    /** Si se resolvió una parte, lo que sigue abierto, en una fila nueva. */
    resto?: Asignacion;
    /** Si se halló en una obra: la asignación nueva, confirmada, donde está. */
    hallada?: Asignacion;
}

/**
 * Resuelve una asignación — del todo o en parte.
 *
 * NADA SE BORRA NI SE REESCRIBE. La original se cierra tal como estaba —si
 * decía 7, sigue diciendo 7— con una nota de qué se resolvió. Si se resolvió
 * una parte, lo que falta sigue en una fila nueva que dice de cuál viene. Así
 * el historial conserva que hubo 7 pulidoras en duda hasta tal día.
 */
export const resolverAsignacion = (
    a: Asignacion,
    r: Resolucion,
    op: { ahora: Date; nuevoId: () => string; porQuien?: string; nombreDe?: (id?: string) => string | undefined; obraDe?: (id?: string) => string | undefined },
): PlanResolucion | { error: string } => {
    if (!estaAbierta(a)) return { error: 'Esa asignación ya estaba resuelta.' };
    const n = Math.max(1, Math.min(r.cantidad ?? a.cantidad, a.cantidad));
    const resto = a.cantidad - n;

    const origen = `${ESTADOS[a.estado].toLowerCase()}${a.procedencia ? `, ${a.procedencia}` : ''}`;
    const movimientos: Movement[] = [];
    let motivo: MotivoCierre;
    let queSePaso: string;

    if (r.tipo === 'prestamo' || r.tipo === 'bodega') {
        if (!r.itemId) return { error: 'Para entrar al inventario hace falta decir qué ítem es.' };
        if (r.tipo === 'prestamo' && !r.personnelId) return { error: 'Para confirmar el préstamo hace falta decir quién la tiene.' };
        const nota = limpio(r.nota);
        // La unidad aparece: entra al libro. Sin esta entrada, el préstamo
        // sacaría del stock de la bodega una herramienta que nunca estuvo ahí.
        movimientos.push({
            id: op.nuevoId(),
            itemId: r.itemId,
            type: MovementType.CHECK_IN,
            quantity: n,
            timestamp: op.ahora,
            notes: `Hallazgo: «${a.descripcion}» estaba en ${origen}${nota ? `. ${nota}` : ''}`,
            updatedAt: op.ahora,
        });
        if (r.tipo === 'prestamo') {
            movimientos.push({
                id: op.nuevoId(),
                itemId: r.itemId,
                type: MovementType.CHECK_OUT,
                quantity: n,
                timestamp: new Date(op.ahora.getTime() + 1000),
                personnelId: r.personnelId,
                projectId: r.projectId ?? a.projectId,
                isLoan: true,
                isReturned: false,
                pendingPickup: false,
                entregadoPor: limpio(r.entregadoPor),
                responsableAnterior: a.responsableAnterior,
                notes: `Confirmado: estaba en ${origen}${nota ? `. ${nota}` : ''}`,
                updatedAt: op.ahora,
            });
            motivo = 'confirmada_prestamo';
            queSePaso = `${n} confirmada(s) como préstamo a ${op.nombreDe?.(r.personnelId) ?? NO_ESPECIFICADO}`;
        } else {
            motivo = 'hallada_bodega';
            queSePaso = `${n} hallada(s) en bodega`;
        }
    } else if (r.tipo === 'obra') {
        if (!r.projectId && !limpio(r.ubicacion)) return { error: 'Hace falta decir en qué obra o lugar apareció.' };
        motivo = 'hallada_obra';
        const donde = [op.obraDe?.(r.projectId), limpio(r.ubicacion)].filter(Boolean).join(' · ') || NO_ESPECIFICADO;
        queSePaso = `${n} hallada(s) en ${donde}${limpio(r.nota) ? `: ${limpio(r.nota)}` : ''}`;
    } else {
        const nota = limpio(r.nota);
        // Dar algo por perdido sin decir por qué es borrar con otro nombre.
        if (!nota) return { error: 'Hace falta una nota: por qué se da por perdida o duplicada.' };
        motivo = r.tipo;
        queSePaso = `${n} dada(s) por ${r.tipo === 'perdida' ? 'perdida(s)' : 'duplicada(s)'}: ${nota}`;
    }

    const idResto = resto > 0 ? op.nuevoId() : undefined;
    const cerrada: Asignacion = {
        ...a,
        cerradaEn: op.ahora,
        cierreMotivo: motivo,
        cierreNota: idResto ? `${queSePaso}. Las otras ${resto} siguen abiertas.` : queSePaso,
        cerradaPor: op.porQuien,
        updatedAt: op.ahora,
    };
    const abierta: Asignacion | undefined = idResto ? {
        ...a,
        id: idResto,
        cantidad: resto,
        notas: [a.notas, `Sigue de una asignación de ${a.cantidad}; ${queSePaso}.`].filter(Boolean).join(' '),
        createdAt: op.ahora,
        updatedAt: op.ahora,
    } : undefined;

    // Hallada en una obra: la que estaba en duda se cierra y nace una
    // confirmada donde está, que dice de cuál viene. Nada se sobrescribe.
    const hallada: Asignacion | undefined = r.tipo === 'obra' ? {
        ...a,
        id: op.nuevoId(),
        cantidad: n,
        estado: 'confirmada',
        projectId: r.projectId ?? a.projectId,
        ubicacion: limpio(r.ubicacion) ?? a.ubicacion,
        notas: [a.notas, `Hallada el ${op.ahora.toISOString().slice(0, 10)}; antes: ${ESTADOS[a.estado].toLowerCase()}.`].filter(Boolean).join(' '),
        createdAt: op.ahora,
        updatedAt: op.ahora,
    } : undefined;

    return { movimientos, cerrada, resto: abierta, hallada };
};
