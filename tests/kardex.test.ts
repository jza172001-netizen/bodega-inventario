/**
 * tests/kardex.test.ts — Que el libro cuadre contra el stock
 * ==========================================================
 * La regla dura de la bodega: entradas menos salidas tiene que dar el stock.
 * Si no cuadra, el inventario no dice la verdad y no hay forma de saber dónde
 * se rompió.
 *
 * Los cuatro fallos que cubre esta prueba descuadraban el libro de cuatro
 * maneras distintas, y ninguno hacía ruido: la app seguía andando y mostrando
 * números con cara de correctos.
 *
 * Los manejadores viven en `App.tsx`, atados a React. Se sacan con el
 * compilador de TypeScript y se corren con las dependencias puestas a mano —
 * lo mismo que hace `tests/pantalla.test.ts`, y por lo mismo: si alguien
 * renombra o mueve uno, esto FALLA NOMBRÁNDOLO en vez de pasar callado contra
 * código que ya no existe.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// `typescript` es CommonJS: en módulo ES la forma que trae las APIs es la default.
import ts from 'typescript';
import { Item, InventoryType, Movement, MovementType, Personnel } from '../types';
import { NOTA_AJUSTE, esAjuste, pendienteDe, getActiveLoans } from '../utils/inventory';
import { igual, esCierto, grupo, cerrar } from './correr';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO = path.join(AQUI, '..', 'App.tsx');

const sacarDeApp = <T,>(nombres: string[], contexto: Record<string, unknown>): T => {
    const texto = fs.readFileSync(ARCHIVO, 'utf8');
    const sf = ts.createSourceFile(ARCHIVO, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const encontradas = new Map<string, string>();
    const visitar = (nodo: ts.Node): void => {
        if ((ts.isVariableDeclaration(nodo) || ts.isFunctionDeclaration(nodo))
            && nodo.name && nombres.includes(nodo.name.getText(sf))) {
            encontradas.set(
                nodo.name.getText(sf),
                ts.isVariableDeclaration(nodo) ? `const ${nodo.getText(sf)};` : nodo.getText(sf).replace(/^export\s+/, ''),
            );
        }
        ts.forEachChild(nodo, visitar);
    };
    visitar(sf);
    for (const n of nombres) {
        if (!encontradas.has(n)) {
            throw new Error(
                `No encontré "${n}" en App.tsx. Si la renombraste o la moviste, actualizá esta prueba: `
                + 'pasar por no encontrar la función sería peor que fallar.',
            );
        }
    }
    const cuerpo = ts.transpileModule(
        `(() => {\n${nombres.map(n => encontradas.get(n)).join('\n')}\nreturn { ${nombres.join(', ')} };\n})()`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
    ).outputText;
    const claves = Object.keys(contexto);
    // eslint-disable-next-line no-new-func
    return new Function(...claves, `return ${cuerpo};`)(...claves.map(k => contexto[k])) as T;
};

const PALA = '11111111-1111-4111-8111-111111111111';
const ALEX: Personnel = { id: '44444444-4444-4444-8444-444444444444', name: 'Alex' };

const ficha = (id: string, name: string, quantity: number, extra: Partial<Item> = {}): Item => ({
    id, name, quantity, inventoryType: InventoryType.HAND_TOOL,
    category: 'Prueba', subCategory: '', minStock: 0, unit: 'und', ...extra,
});

interface App {
    itemActual: (id?: string) => Item | undefined;
    ajustarEspejo: (id: string, q: number) => void;
    handleEditItem: (i: Item) => void;
    handleReturnItem: (id: string, condition?: string, notes?: string, cantidad?: number) => void;
    handleRestaurado: (f: Record<string, unknown>) => void;
    handleTransferLoan: (movementId: string, newPersonnelId: string) => void;
}

/** Monta `App.tsx` con un inventario y unos movimientos, sin React ni red. */
const app = (items: Item[], movements: Movement[] = []) => {
    const visto = {
        escrituras: [] as string[],
        cantidadesEscritas: [] as Array<{ id: string; quantity: number }>,
        itemsEscritos: [] as Item[],
        movimientosEscritos: [] as Array<Omit<Movement, 'id'>>,
        bitacora: [] as Array<{ accion: string; texto: string }>,
        avisos: [] as string[],
        cerrados: [] as string[],
        traspasos: [] as Movement[],
    };
    const estado = { items: [...items], movements: [...movements] };
    const espejo = { current: [...items] };
    const vivos = { current: [...movements] };

    const c: Record<string, unknown> = {
        items: estado.items, movements: estado.movements, personnel: [ALEX],
        // El espejo de movimientos: el manejador lo lee y lo deja al día, así
        // que dos llamadas seguidas ven lo que hizo la primera, como en la app.
        movimientosRef: vivos,
        itemsRef: espejo,
        MovementType, InventoryType, NOTA_AJUSTE, pendienteDe,
        crypto: { randomUUID: () => `mov-${visto.movimientosEscritos.length + 1}` },
        userName: 'Prueba',
        CONDICIONES_QUE_DAÑAN: new Set(['damaged', 'incomplete', 'needs_maintenance']),
        ETIQUETAS_ITEM: { quantity: 'cantidad', name: 'nombre' },
        describirCambios: () => 'cambió algo',
        describirEstado: () => '',
        setItems: (v: unknown) => {
            estado.items = typeof v === 'function' ? (v as (x: Item[]) => Item[])(estado.items) : v as Item[];
        },
        setMovements: (v: unknown) => {
            estado.movements = typeof v === 'function' ? (v as (x: Movement[]) => Movement[])(estado.movements) : v as Movement[];
        },
        setPersonnel: () => {}, setProjects: () => {}, setPurchaseOrders: () => {},
        setUsers: () => {}, setOrderNotes: () => {},
        migrateUsers: (u: unknown) => u,
        /**
         * `withSync` ya no recibe una promesa lanzada: recibe QUÉ se quiere
         * hacer y CON QUÉ, para poder anotarlo en la cola de pendientes,
         * sobrevivir a cerrar la app y reintentarlo. Acá se apunta lo que se le
         * pidió mandar, que es lo que antes se espiaba por `db`.
         */
        withSync: (tipo: string, args: unknown[]) => {
            visto.escrituras.push(tipo);
            if (tipo === 'updateItem') visto.itemsEscritos.push(args[0] as Item);
            if (tipo === 'updateItemQuantity') {
                visto.cantidadesEscritas.push({ id: args[0] as string, quantity: args[1] as number });
            }
            if (tipo === 'addMovement') visto.movimientosEscritos.push(args[0] as Omit<Movement, 'id'>);
            if (tipo === 'logMovementsWithStock') {
                for (const x of args[0] as Array<{ m: Omit<Movement, 'id'>; fallbackQty: number }>) {
                    visto.movimientosEscritos.push(x.m);
                    visto.cantidadesEscritas.push({ id: x.m.itemId, quantity: x.fallbackQty });
                }
            }
            if (tipo === 'markMovementReturned') visto.cerrados.push(args[0] as string);
            if (tipo === 'addMovement') visto.traspasos.push(args[0] as Movement);
            if (tipo === 'returnLoanAndRestoreStock') {
                const itemId = args[3] as string | undefined;
                const qty = args[4] as number | undefined;
                if (itemId && qty != null) visto.cantidadesEscritas.push({ id: itemId, quantity: qty });
            }
            return Promise.resolve();
        },
        addAuditLog: (accion: string, texto: string) => visto.bitacora.push({ accion, texto }),
        alert: (x: string) => visto.avisos.push(x),
        requireConfirm: (_: string, hacer: () => void) => hacer(),
        db: {
            fetchItems: () => Promise.resolve([]), fetchMovements: () => Promise.resolve([]),
            fetchPersonnel: () => Promise.resolve([]), fetchProjects: () => Promise.resolve([]),
            fetchPurchaseOrders: () => Promise.resolve([]), fetchUsers: () => Promise.resolve([]),
            fetchOrderList: () => Promise.resolve([]),
        },
    };
    const fn = sacarDeApp<App>(
        ['itemActual', 'ajustarEspejo', 'handleEditItem', 'handleReturnItem', 'handleRestaurado', 'handleTransferLoan'],
        c,
    );
    // `items` en el contexto es la lista del render: se congela a propósito, que
    // es justo lo que hacía perder unidades. El espejo sí se mueve.
    return { visto, estado, espejo, vivos, fn };
};

const prestamo = (id: string, itemId: string, quantity: number): Movement => ({
    id, itemId, quantity,
    type: MovementType.CHECK_OUT,
    timestamp: new Date('2026-09-12T07:00:00Z'),
    personnelId: ALEX.id, isLoan: true, isReturned: false,
});

grupo('editar la cantidad DEJA movimiento de ajuste', () => {
    /**
     * De 5 a 9 sin una sola línea en el libro. La bitácora decía que alguien
     * había editado el ítem, pero el Kardex dejaba de cuadrar contra el stock.
     */
    const a = app([ficha(PALA, 'Pala', 5)]);
    a.fn.handleEditItem(ficha(PALA, 'Pala', 9));

    igual(a.visto.movimientosEscritos.length, 1, 'se escribió un movimiento');
    const m = a.visto.movimientosEscritos[0];
    igual(m.type, MovementType.CHECK_IN, 'subir es Entrada');
    igual(m.quantity, 4, 'y la cantidad es la DIFERENCIA, no el total');
    esCierto(esAjuste(m), 'queda marcado como ajuste');
    esCierto((m.notes ?? '').includes('de 5 a 9'), 'la nota dice de cuánto a cuánto');
});

grupo('bajar la cantidad también deja movimiento', () => {
    const a = app([ficha(PALA, 'Pala', 5)]);
    a.fn.handleEditItem(ficha(PALA, 'Pala', 2));
    const m = a.visto.movimientosEscritos[0];
    igual(m.type, MovementType.WASTE, 'bajar es Merma');
    igual(m.quantity, 3, 'por la diferencia');
    esCierto(esAjuste(m), 'pero marcado como ajuste, para que no infle las mermas del mes');
});

grupo('guardar sin tocar la cantidad NO inventa movimiento', () => {
    const a = app([ficha(PALA, 'Pala', 5)]);
    a.fn.handleEditItem(ficha(PALA, 'Pala', 5, { unit: 'unidades' }));
    igual(a.visto.movimientosEscritos.length, 0, 'cero movimientos');
    igual(a.visto.escrituras.includes('updateItem'), true, 'pero el cambio sí se guarda');
});

grupo('DOS devoluciones seguidas no pierden una unidad', () => {
    /**
     * Las dos leían `items` del render, que no cambia hasta el siguiente: la
     * segunda calculaba su reposición contra la cantidad vieja y pisaba la
     * primera. De dos herramientas devueltas volvía una.
     */
    const a = app(
        [ficha(PALA, 'Pala', 0)],
        [prestamo('p1', PALA, 1), prestamo('p2', PALA, 1)],
    );
    a.fn.handleReturnItem('p1');
    a.fn.handleReturnItem('p2');

    const escritas = a.visto.cantidadesEscritas.filter(x => x.id === PALA).map(x => x.quantity);
    igual(escritas, [1, 2], 'la primera repone a 1 y la segunda a 2');
    igual(a.fn.itemActual(PALA)?.quantity, 2, 'y el espejo queda en dos');
});

grupo('una devolución ya hecha no repone dos veces', () => {
    const a = app([ficha(PALA, 'Pala', 1)], [{ ...prestamo('p1', PALA, 1), isReturned: true }]);
    a.fn.handleReturnItem('p1');
    igual(a.visto.escrituras.length, 0, 'no se escribió nada');
});

grupo('devolver DAÑADA no deshace la reposición', () => {
    /**
     * Se reponía el stock y después se mandaba el objeto viejo, con su cantidad
     * vieja, en el `updateItem` que abre la reparación. Si esa escritura llegaba
     * después, borraba la reposición: la herramienta volvía dañada y el stock se
     * quedaba descontado para siempre.
     */
    const a = app([ficha(PALA, 'Pala', 0)], [prestamo('p1', PALA, 1)]);
    a.fn.handleReturnItem('p1', 'damaged', 'llegó torcida');

    const guardado = a.visto.itemsEscritos.find(i => i.id === PALA);
    esCierto(!!guardado, 'se guardó el ítem con su reparación abierta');
    igual(guardado?.quantity, 1, 'Y CON LA CANTIDAD YA REPUESTA, no con la vieja');
    igual(guardado?.reparacion?.estado, 'dañada', 'la reparación sí quedó abierta');
});

grupo('prestar 3, devolver 1, devolver 1 — el préstamo sigue diciendo 3 y queda 1', () => {
    /**
     * La aceptación que pidió Juli, palabra por palabra: «prestar 3 y devolver
     * 1 debe conservar el préstamo original, registrar esa devolución y dejar 2
     * pendientes». Antes no había forma de decirlo: devolver era todo o nada.
     */
    const a = app([ficha(PALA, 'Pala', 0)], [prestamo('p1', PALA, 3)]);

    a.fn.handleReturnItem('p1', 'good', '', 1);
    igual(getActiveLoans(a.vivos.current).map(m => m.quantity), [2], 'tras la primera: quedan 2 afuera');

    a.fn.handleReturnItem('p1', 'worn', 'mango flojo', 1);

    const original = a.vivos.current.find(m => m.id === 'p1')!;
    igual(original.quantity, 3, 'el préstamo original NO se tocó: sigue diciendo 3');
    igual(original.isReturned, false, 'y NO se cerró: todavía falta una');

    const devoluciones = a.vivos.current.filter(m => m.devuelveA === 'p1');
    igual(devoluciones.length, 2, 'DOS devoluciones, dos renglones');
    igual(devoluciones.map(d => d.quantity), [1, 1], 'de una cada una');
    igual(devoluciones.map(d => d.type), [MovementType.CHECK_IN, MovementType.CHECK_IN], 'cada una es una Entrada del libro');
    esCierto(devoluciones.some(d => d.returnCondition === 'worn' && d.returnNotes === 'mango flojo'),
        'cada una guarda SU estado y su nota');

    igual(getActiveLoans(a.vivos.current).map(m => m.quantity), [1], 'queda 1 pendiente');
    igual(a.fn.itemActual(PALA)?.quantity, 2, 'y la bodega tiene las 2 que volvieron');
    igual(a.visto.cerrados, [], 'el préstamo no se mandó a cerrar');
});

grupo('la última devolución cierra el préstamo SIN reponer dos veces', () => {
    const a = app([ficha(PALA, 'Pala', 0)], [prestamo('p1', PALA, 3)]);
    a.fn.handleReturnItem('p1', 'good', '', 1);
    a.fn.handleReturnItem('p1', 'good');          // sin cantidad: lo que falta

    igual(a.vivos.current.filter(m => m.devuelveA === 'p1').map(d => d.quantity), [2, 1],
        'la segunda devuelve lo que faltaba, no las 3 de la salida');
    igual(a.fn.itemActual(PALA)?.quantity, 3, 'la bodega recupera exactamente 3');
    igual(a.visto.cerrados, ['p1'], 'y ahí sí se cierra el préstamo');
    esCierto(!a.visto.escrituras.includes('returnLoanAndRestoreStock'),
        'cerrar NO usa la función que repone: la entrada ya repuso');
    igual(getActiveLoans(a.vivos.current).length, 0, 'no queda nada afuera');
});

grupo('el Kardex cuadra: salida 3, entrada 1, entrada 2', () => {
    const a = app([ficha(PALA, 'Pala', 0)], [prestamo('p1', PALA, 3)]);
    a.fn.handleReturnItem('p1', 'good', '', 1);
    a.fn.handleReturnItem('p1', 'good', '', 2);
    const libro = a.vivos.current.reduce((s, m) =>
        s + (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE ? -m.quantity : m.quantity), 0);
    // Stock antes del préstamo: 3. Libro desde ahí: −3 +1 +2 = 0 → stock 3.
    igual(3 + libro, a.fn.itemActual(PALA)?.quantity, 'lo que dice el libro es lo que hay');
});

grupo('dos toques seguidos no devuelven más de lo que salió', () => {
    /**
     * Leído de `movements` del render, el segundo toque veía el mismo pendiente
     * que el primero. Con el espejo, el segundo ya ve la devolución del primero.
     */
    const a = app([ficha(PALA, 'Pala', 0)], [prestamo('p1', PALA, 1)]);
    a.fn.handleReturnItem('p1');
    a.fn.handleReturnItem('p1');
    igual(a.vivos.current.filter(m => m.devuelveA === 'p1').length, 1, 'una sola devolución');
    igual(a.fn.itemActual(PALA)?.quantity, 1, 'y una sola unidad repuesta');
});

grupo('pedir devolver más de lo que hay afuera devuelve solo lo que hay', () => {
    const a = app([ficha(PALA, 'Pala', 0)], [prestamo('p1', PALA, 2)]);
    a.fn.handleReturnItem('p1', 'good', '', 5);
    igual(a.vivos.current.filter(m => m.devuelveA === 'p1').map(d => d.quantity), [2],
        'devolver 5 de 2 inventaría tres palas que la bodega nunca tuvo');
    igual(a.fn.itemActual(PALA)?.quantity, 2, 'stock: 2');
});

grupo('traspasar un préstamo devuelto en parte pasa SOLO lo que falta', () => {
    const a = app([ficha(PALA, 'Pala', 0)], [prestamo('p1', PALA, 3)]);
    a.fn.handleReturnItem('p1', 'good', '', 1);
    a.fn.handleTransferLoan('p1', 'otro');
    igual(a.visto.traspasos.map(m => m.quantity), [2],
        'de tres palas volvió una: al otro le pasan dos, no tres');
});

grupo('restaurar de la papelera ya NO decide el stock acá', () => {
    /**
     * Esta prueba cambió de lado, y el motivo importa.
     *
     * Antes `handleRestaurado` traía su propia cuenta: miraba si la salida
     * cabía y, si no, avisaba y se devolvía. La cuenta estaba bien y LLEGABA
     * TARDE: para cuando corría, el servidor ya le había quitado la lápida al
     * movimiento. Con una salida borrada de 3 palas y una existencia de 1
     * quedaba el movimiento activo por 3, el stock intacto en 1, y un mensaje
     * diciendo que seguía en la papelera. La bitácora recibía las dos cosas.
     *
     * Validar después de escribir no es validar. Ahora decide y aplica el
     * servidor, en una transacción, y si no cabe lanza y revierte —eso se
     * comprueba contra PostgreSQL, no acá—. Lo que se fija en esta prueba es
     * que la app NO vuelva a meter una segunda cuenta: dos cuentas para lo
     * mismo siempre terminan divergiendo.
     */
    const a = app([ficha(PALA, 'Pala', 1)]);
    a.fn.handleRestaurado({ tabla: 'movements', movItemId: PALA, movCantidad: 3, movEsSalida: true, movNetoCero: false });

    igual(a.visto.cantidadesEscritas.length, 0, 'no escribe cantidades: eso lo hizo el servidor');
    igual(a.fn.itemActual(PALA)?.quantity, 1, 'no toca el espejo por su cuenta');
    igual(a.visto.avisos.length, 0, 'y no inventa un aviso sobre algo que ya decidió el servidor');
});

grupo('restaurar cualquier cosa vuelve a leer del servidor', () => {
    // Si se llegó hasta acá, el servidor ya aplicó. Lo único que falta es que
    // la pantalla deje de mostrar lo viejo.
    const a = app([ficha(PALA, 'Pala', 5)]);
    a.fn.handleRestaurado({ tabla: 'movements', movItemId: PALA, movCantidad: 3, movEsSalida: true, movNetoCero: false });
    igual(a.visto.cantidadesEscritas.length, 0, 'sin cuentas locales');

    const b = app([ficha(PALA, 'Pala', 5)]);
    b.fn.handleRestaurado({ tabla: 'items' });
    igual(b.visto.cantidadesEscritas.length, 0, 'un ítem restaurado tampoco mueve stock desde acá');
});

await cerrar();
