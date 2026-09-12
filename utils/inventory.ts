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
    // Un disco o una broca también se gastan: para las cuentas son gasto, no
    // activo. Lo que los separa de los demás consumibles es dónde viven y a
    // quién se le pueden enganchar, no cómo se contabilizan.
    InventoryType.ACCESSORY,
]);

/** Del catálogo de accesorios: se engancha a una herramienta, no se despacha solo. */
export const isAccessory = (item?: Item): boolean => item?.inventoryType === InventoryType.ACCESSORY;

/** Herramienta: se presta y debe volver. */
export const isAsset = (item?: Item): boolean => !!item && LOAN_TYPES.has(item.inventoryType);

/** EPP o consumible: es gasto definitivo, no vuelve. */
export const isConsumable = (item?: Item): boolean => !!item && CONSUMABLE_TYPES.has(item.inventoryType);

// ── De qué tipo es esto, a juzgar por el nombre ──────────────────────
/**
 * Propone el tipo de un ítem nuevo leyendo su nombre.
 *
 * Nació de un bug callado: la lista de pedidos creaba TODO lo que llegaba como
 * `SINGLE_USE`, quemado en el código. Si llegaba una pulidora comprada y no
 * existía todavía, entraba como material de consumo — y entonces `isAsset` decía
 * que no era herramienta, así que **nunca se podía prestar**: no aparecía en
 * Préstamos, nadie la reclamaba, y en las cuentas pesaba como gasto. La pulidora
 * estaba ahí con su cantidad correcta; la app creía que era un bulto de cemento.
 *
 * DEVUELVE `null` CUANDO NO SABE, a propósito. Un tipo equivocado no truena: se
 * esconde durante meses y se descubre el día que alguien pregunta quién tiene la
 * pulidora. Antes que adivinar, se le pregunta a quien está mirando la
 * herramienta de verdad.
 *
 * Las palabras salen del inventario REAL de Montecielo, no de una lista
 * imaginada de ferretería.
 */
/**
 * Pistas que NOMBRAN la cosa. Solo valen en la primera palabra.
 *
 * "Cemento" nombra un consumible, pero "Rastrillo de cemento" es una
 * herramienta: ahí el cemento es para qué sirve, no qué es.
 */
const NOMBRAN: Array<[InventoryType, string[]]> = [
    [InventoryType.PPE, [
        'guante', 'gafas', 'bota', 'impermeable', 'tapaoido', 'casco', 'arnes',
        'eslinga', 'rodillera', 'careta', 'respirador', 'tapabocas', 'chaleco', 'overol',
    ]],
    [InventoryType.ELECTRICAL_TOOL, [
        'pulidora', 'radial', 'taladro', 'lijadora', 'mezcladora', 'vibrador', 'vibro',
        'tronzadora', 'colichadora', 'hidrolavadora', 'soldador', 'compresor', 'canguro',
        'rana', 'gramera', 'motor', 'cortadora', 'concretadora', 'guadaña', 'planta',
    ]],
    [InventoryType.SINGLE_USE, [
        'clavo', 'tornillo', 'lija', 'brocha', 'cinta', 'estopa', 'trapo', 'gasolina',
        'barniz', 'acido', 'silicona', 'pegante', 'lechada', 'cemento', 'pintura',
        'disco', 'broca', 'lampara', 'bombillo', 'galon', 'tubo', 'codo', 'semicodo',
        'buje', 'sifon', 'lapiz', 'soldadura', 'varilla', 'alambre', 'malla', 'bulto',
        'arena', 'grava',
    ]],
];

/**
 * Pistas que DESCRIBEN la cosa. Valen en cualquier posición.
 *
 * Son adjetivos, no sustantivos: una "extensión eléctrica" o una "pesa
 * eléctrica" son eléctricas aunque la palabra vaya de segunda. Son pocas a
 * propósito — cada una que se agregue puede pisar un nombre donde esa palabra
 * sea contexto y no naturaleza.
 */
const DESCRIBEN: Array<[InventoryType, string[]]> = [
    [InventoryType.ELECTRICAL_TOOL, ['electrica', 'eléctrica', 'electrico', 'eléctrico', 'laser', 'láser', 'inalambrico', 'inalámbrico']],
];

const sinTildes = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿Alguna de estas palabras es una pista de este tipo? */
const pegaCon = (palabras: string[], pistas: string[]): boolean =>
    pistas.some(pista => {
        const p = sinTildes(pista);
        // Palabra completa o arranque de palabra, nunca `includes` suelto: si no,
        // "brocha" le pegaría a "broca" por parecerse de letras.
        return palabras.some(w => w === p || w.startsWith(p));
    });

export const adivinarTipo = (nombre: string): InventoryType | null => {
    const palabras = sinTildes(nombre).split(/[\s/()·,.-]+/).filter(Boolean);
    if (palabras.length === 0) return null;

    /**
     * LA PRIMERA PALABRA MANDA, igual que en `familiaDe`: el bodeguero dice
     * primero QUÉ es y después de qué o para qué.
     *
     * Sin esta regla, tres nombres reales de Montecielo caían mal porque el
     * contexto le ganaba a la cosa:
     *   "Cepillo de alambre"     → alambre → consumible  (y es herramienta)
     *   "Rastrillo de cemento"   → cemento → consumible  (y es herramienta)
     *   "Mezclador para taladro" → taladro → eléctrica   (y es manual)
     */
    for (const [tipo, pistas] of NOMBRAN) if (pegaCon([palabras[0]], pistas)) return tipo;

    // Los adjetivos sí valen en cualquier posición: "Extensión eléctrica".
    for (const [tipo, pistas] of DESCRIBEN) if (pegaCon(palabras, pistas)) return tipo;

    return null;
};

// ── Movimiento de stock ──────────────────────────────────────────────
/**
 * ¿Este movimiento RESTA del stock?
 *
 * La respuesta es la misma en toda la app —salida y merma restan, lo demás
 * suma— pero estaba escrita a mano en una veintena de sitios, incluidas las dos
 * puntas del registro: `handleLogMovements` la usaba para armar el rechazo por
 * falta de existencias y `handleLogMovement` la volvía a escribir para hacer la
 * resta. Dos copias de la misma frase, y la validación de stock escrita dos
 * veces con dos finales distintos (una devuelve rechazo, la otra avisa).
 *
 * Hoy no produce ningún bug: el segundo chequeo es el que manda. El riesgo es
 * el día que alguien cambie la regla en una sola de las dos —por decir, dejar
 * que un consumible salga en negativo— y el lote empiece a opinar distinto que
 * la línea suelta. Con una sola frase, ese día no llega.
 */
export const esRetiro = (type: MovementType): boolean =>
    type === MovementType.CHECK_OUT || type === MovementType.WASTE;

/** ¿Alcanza lo que hay para lo que se pide? */
export const alcanzaStock = (hay: number, pedido: number): boolean => pedido <= hay;

/**
 * El ajuste de inventario: corregir una cantidad a mano DEJANDO RASTRO.
 *
 * Editar la cantidad de un ítem cambiaba el stock sin generar ningún
 * movimiento. De 5 a 9 sin una sola línea en el libro: el renglón de bitácora
 * decía que alguien lo había editado, pero el Kardex —entradas menos salidas—
 * dejaba de cuadrar contra el stock, y ese cuadre es la única forma de saber si
 * el inventario dice la verdad.
 *
 * No hay un tipo «Ajuste» en el enum, y agregarlo pide migrar un tipo de
 * PostgreSQL en un servidor que ya se sabe que difiere del repositorio. Así que
 * el ajuste va como Entrada o Merma según para dónde se corrigió, y se
 * distingue por la nota. `esAjuste` existe para que los informes de merma no
 * cuenten una corrección como material perdido: son cosas distintas.
 */
export const NOTA_AJUSTE = 'Ajuste de inventario';

export const esAjuste = (m: { notes?: string }): boolean =>
    (m.notes ?? '').startsWith(NOTA_AJUSTE);

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
        if (!esRetiro(m.type)) return false;
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
