/**
 * utils/inventory.ts — La regla de negocio en un solo lugar
 * =========================================================
 * La bodega maneja dos naturalezas distintas y la app las venía mezclando:
 *
 *   ACTIVO (herramienta manual/eléctrica): se PRESTA. Sale, vuelve, se reclama.
 *                                          La pregunta es "¿dónde está?".
 *   GASTO  (EPP y consumible):             se ENTREGA. Sale y no vuelve.
 *                                          La pregunta es "¿cuánto se gastó y en qué?".
 *
 * Antes de este archivo, el filtro de préstamo activo estaba reescrito a mano en
 * ~21 sitios y el set "herramienta vs consumible" duplicado 6 veces con 4 nombres
 * distintos (LOAN_TYPES, CONSUMABLE_TYPES, ASSETS, VUELVE_POR_DEFECTO). Cada copia
 * era una oportunidad de que una pantalla contara distinto que otra — y eso fue
 * exactamente lo que pasó: el informe mostraba un solo responsable donde el Kardex
 * mostraba dos.
 */

import { Item, InventoryType, Movement, MovementType } from '../types';

// ── Naturaleza del ítem ──────────────────────────────────────────────
export const LOAN_TYPES = new Set<InventoryType>([
    InventoryType.HAND_TOOL,
    InventoryType.ELECTRICAL_TOOL,
]);

export const CONSUMABLE_TYPES = new Set<InventoryType>([
    InventoryType.PPE,
    InventoryType.SINGLE_USE,
]);

/** Herramienta: se presta y debe volver. */
export const isAsset = (item?: Item): boolean => !!item && LOAN_TYPES.has(item.inventoryType);

/** EPP o consumible: es gasto definitivo, no vuelve. */
export const isConsumable = (item?: Item): boolean => !!item && CONSUMABLE_TYPES.has(item.inventoryType);

// ── Préstamos ────────────────────────────────────────────────────────
/** Lo que está fuera de bodega y no ha vuelto. */
export const getActiveLoans = (movements: Movement[]): Movement[] =>
    movements.filter(m => m.isLoan && !m.isReturned);

/**
 * Índice ítem → TODOS sus préstamos activos.
 * Reemplaza el `activeLoans.find(m => m.itemId === item.id)` que se usaba en el
 * informe: con find(), un palustre repartido entre Abel y Alexander solo reportaba
 * a Abel y el segundo tenedor desaparecía sin dejar rastro.
 */
export const getActiveLoansByItem = (movements: Movement[]): Map<string, Movement[]> => {
    const byItem = new Map<string, Movement[]>();
    for (const m of getActiveLoans(movements)) {
        if (!byItem.has(m.itemId)) byItem.set(m.itemId, []);
        byItem.get(m.itemId)!.push(m);
    }
    return byItem;
};

export interface PersonLoanSummary {
    personnelId?: string;
    nombre: string;
    /** Unidades fuera, no número de movimientos: 1 movimiento de 2 martillos son 2 unidades. */
    unidades: number;
    movs: Movement[];
}

/**
 * Préstamos activos agrupados por persona, sumando unidades.
 * Contar movimientos en vez de unidades es lo que hacía que el informe dijera
 * "Martillo" cuando Adrián tenía 2.
 */
export const getLoansByPerson = (
    movements: Movement[],
    personNameOf: (id?: string) => string,
): PersonLoanSummary[] => {
    const porPersona = new Map<string, PersonLoanSummary>();
    for (const m of getActiveLoans(movements)) {
        const key = m.personnelId ?? '__sin_asignar__';
        if (!porPersona.has(key)) {
            porPersona.set(key, {
                personnelId: m.personnelId,
                nombre: m.personnelId ? personNameOf(m.personnelId) : 'Sin asignar',
                unidades: 0,
                movs: [],
            });
        }
        const reg = porPersona.get(key)!;
        reg.unidades += m.quantity;
        reg.movs.push(m);
    }
    return [...porPersona.values()].sort((a, b) => b.unidades - a.unidades);
};

/** Une varios movimientos del mismo ítem en una sola línea legible: "Martillo ×2, Canguro ×1". */
export const summarizeLoanItems = (
    loans: Movement[],
    itemNameOf: (itemId: string) => string,
): string => {
    const porItem = new Map<string, number>();
    for (const l of loans) porItem.set(l.itemId, (porItem.get(l.itemId) ?? 0) + l.quantity);
    return [...porItem.entries()]
        .map(([id, qty]) => `${itemNameOf(id)} ×${qty}`)
        .join(', ');
};

export const daysSince = (d: Date | string): number =>
    Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

// ── Consumo ──────────────────────────────────────────────────────────
export interface ConsumptionRow<T> { key: T; unidades: number; movs: Movement[] }

export interface ConsumptionReport {
    /** Ítems consumidos, de mayor a menor. */
    porItem: ConsumptionRow<Item>[];
    /** Quién consumió cuánto — el dato que el informe descartaba por completo. */
    porPersona: ConsumptionRow<string>[];
    porTipo: ConsumptionRow<InventoryType>[];
    totalUnidades: number;
    /** Unidades por semana en el período, para que "500 clavos" tenga escala. */
    promedioSemanal: number;
    movimientos: Movement[];
}

/**
 * Consumo real de EPP y consumibles en una ventana de tiempo.
 *
 * Excluye `isLoan` a propósito: un préstamo vuelve a la bodega, así que no se
 * consumió. Sin esa exclusión, un arnés prestado (EPP que sí vuelve, caso que el
 * bodeguero puede forzar) se contaba como gasto y desviaba el análisis de compras.
 */
export const getConsumption = (
    movements: Movement[],
    itemMap: Map<string, Item>,
    range: { from: Date; to: Date },
    personNameOf: (id?: string) => string,
): ConsumptionReport => {
    const relevant = movements.filter(m => {
        const t = new Date(m.timestamp);
        if (t < range.from || t > range.to) return false;
        if (m.type !== MovementType.CHECK_OUT && m.type !== MovementType.WASTE) return false;
        if (m.isLoan) return false;
        return isConsumable(itemMap.get(m.itemId));
    });

    const byItem = new Map<string, ConsumptionRow<Item>>();
    const byPerson = new Map<string, ConsumptionRow<string>>();
    const byType = new Map<InventoryType, ConsumptionRow<InventoryType>>();

    for (const m of relevant) {
        const item = itemMap.get(m.itemId);
        if (!item) continue;

        if (!byItem.has(item.id)) byItem.set(item.id, { key: item, unidades: 0, movs: [] });
        const ri = byItem.get(item.id)!;
        ri.unidades += m.quantity;
        ri.movs.push(m);

        const pKey = m.personnelId ?? '__sin_asignar__';
        if (!byPerson.has(pKey)) {
            byPerson.set(pKey, {
                key: m.personnelId ? personNameOf(m.personnelId) : 'Sin asignar',
                unidades: 0,
                movs: [],
            });
        }
        const rp = byPerson.get(pKey)!;
        rp.unidades += m.quantity;
        rp.movs.push(m);

        if (!byType.has(item.inventoryType)) byType.set(item.inventoryType, { key: item.inventoryType, unidades: 0, movs: [] });
        const rt = byType.get(item.inventoryType)!;
        rt.unidades += m.quantity;
        rt.movs.push(m);
    }

    const totalUnidades = relevant.reduce((s, m) => s + m.quantity, 0);
    const dias = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86400000));
    const desc = <T>(a: ConsumptionRow<T>, b: ConsumptionRow<T>) => b.unidades - a.unidades;

    return {
        porItem: [...byItem.values()].sort(desc),
        porPersona: [...byPerson.values()].sort(desc),
        porTipo: [...byType.values()].sort(desc),
        totalUnidades,
        promedioSemanal: Math.round((totalUnidades / dias) * 7 * 10) / 10,
        movimientos: relevant,
    };
};

/**
 * Todo lo entregado que no vuelve — el lente de consumo de la vista de préstamos.
 *
 * A diferencia de `getConsumption`, aquí NO se excluye `isLoan`: al contrario, es
 * el único sitio donde aparecen los EPP/consumibles que quedaron marcados como
 * préstamo (los viejos, de antes del arreglo del default por tipo, y los que el
 * bodeguero fuerza a propósito). Si los escondiéramos quedarían en el limbo: fuera
 * del lente de préstamos por ser consumibles, y fuera de este por estar marcados.
 */
export const getConsumedMovements = (movements: Movement[], itemMap: Map<string, Item>): Movement[] =>
    movements.filter(m =>
        m.type === MovementType.CHECK_OUT &&
        !m.isReturned &&
        isConsumable(itemMap.get(m.itemId))
    );

/** Préstamos activos de herramienta — el lente limpio, sin EPP ni consumibles. */
export const getActiveToolLoans = (movements: Movement[], itemMap: Map<string, Item>): Movement[] =>
    getActiveLoans(movements).filter(m => isAsset(itemMap.get(m.itemId)));
