/**
 * tests/despacho-red.test.ts — El orden en que las cosas llegan al servidor
 * =========================================================================
 * El fallo que cubre esta prueba no vivía en el cálculo ni en la pantalla: vivía
 * en CUÁNTOS VIAJES se hacían a la red.
 *
 * Cuando alguien despacha algo que la app no tenía registrado, el plan arma dos
 * movimientos: primero la entrada que lo da por existente, después la salida.
 * En el arreglo quedan en ese orden. Pero se mandaban de a un viaje por
 * movimiento, y la red no respeta el orden en que uno los suelta: el servidor
 * podía recibir la salida primero, rechazarla por falta de stock, y guardar la
 * entrada después. La app ya había cantado éxito y mostraba saldo cero; el
 * servidor quedaba con una entrada, ninguna salida y saldo uno.
 *
 * De este lado solo se puede fijar una cosa, y es la que se fija acá: que salga
 * UN viaje con el lote completo y en orden. Que el servidor lo aplique como
 * transacción es cosa del SQL, y eso se comprueba contra PostgreSQL, no acá.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// `typescript` es CommonJS: en módulo ES la forma que trae las APIs es la default.
import ts from 'typescript';
import { Item, InventoryType, Movement, MovementType } from '../types';
import { planearLote } from '../core/despacho';
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
            encontradas.set(nodo.name.getText(sf),
                ts.isVariableDeclaration(nodo) ? `const ${nodo.getText(sf)};` : nodo.getText(sf).replace(/^export\s+/, ''));
        }
        ts.forEachChild(nodo, visitar);
    };
    visitar(sf);
    for (const n of nombres) {
        if (!encontradas.has(n)) {
            throw new Error(`No encontré "${n}" en App.tsx. Si la renombraste o la moviste, actualizá esta prueba.`);
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
const DISCO = '22222222-2222-4222-8222-222222222222';
const ALEX = '44444444-4444-4444-8444-444444444444';

const ficha = (id: string, name: string, quantity: number, extra: Partial<Item> = {}): Item => ({
    id, name, quantity, inventoryType: InventoryType.HAND_TOOL,
    category: 'Prueba', subCategory: '', minStock: 0, unit: 'und', ...extra,
});

const salida = (itemId: string, quantity = 1): Omit<Movement, 'id'> => ({
    itemId, quantity, type: MovementType.CHECK_OUT,
    timestamp: new Date('2026-09-12T12:00:00Z'),
    personnelId: ALEX, isLoan: true, isReturned: false,
});

interface App {
    handleLogMovements: (b: Array<Omit<Movement, 'id'>>, o?: Record<string, unknown>) => { ok: number; total: number; rechazos: unknown[] };
}

type Viaje = Array<{ m: Omit<Movement, 'id'>; id: string; fallbackQty: number }>;

const app = (items: Item[]) => {
    const visto = { viajes: [] as Viaje[], sueltos: [] as Array<Omit<Movement, 'id'>> };
    const espejo = { current: [...items] };
    const c: Record<string, unknown> = {
        itemsRef: espejo, personnel: [], MovementType, planearLote,
        crypto: { randomUUID: (() => { let n = 0; return () => `mov-${++n}`; })() },
        setItems: () => {}, setMovements: () => {},
        ajustarEspejo: (id: string, q: number) => { espejo.current = espejo.current.map(i => i.id === id ? { ...i, quantity: q } : i); },
        addAuditLog: () => {},
        /**
         * `withSync` ya no recibe una promesa lanzada: recibe QUÉ se quiere
         * hacer y CON QUÉ, para poder anotarlo, sobrevivir a cerrar la app y
         * reintentarlo. Acá se apunta lo que se le pidió mandar.
         */
        withSync: (tipo: string, args: unknown[]) => {
            if (tipo === 'logMovementsWithStock') visto.viajes.push(args[0] as Viaje);
            if (tipo === 'addMovement') visto.sueltos.push(args[0] as Omit<Movement, 'id'>);
            return Promise.resolve();
        },
        db: {},
    };
    return { visto, espejo, fn: sacarDeApp<App>(['handleLogMovements'], c) };
};

grupo('el lote sale en UN SOLO viaje', () => {
    const a = app([ficha(PALA, 'Pala', 5), ficha(DISCO, 'Disco', 5)]);
    a.fn.handleLogMovements([salida(PALA), salida(DISCO)]);
    igual(a.visto.viajes.length, 1, 'una sola llamada al servidor');
    igual(a.visto.viajes[0].length, 2, 'con los dos movimientos adentro');
});

grupo('la entrada automática viaja ANTES que su salida', () => {
    /**
     * El fallo entero: el plan las pone en este orden, pero mandarlas en dos
     * viajes deja que lleguen al revés. Si el orden se rompe acá, el servidor
     * ni siquiera tiene la oportunidad de aplicarlas bien.
     */
    const a = app([ficha(PALA, 'Pala', 0)]);
    const r = a.fn.handleLogMovements([salida(PALA)], { completarFaltante: true });

    igual(r.ok, 2, 'el plan armó entrada y salida');
    igual(a.visto.viajes.length, 1, 'y las dos van en el mismo viaje');
    const tipos = a.visto.viajes[0].map(x => x.m.type);
    igual(tipos, [MovementType.CHECK_IN, MovementType.CHECK_OUT], 'la entrada va de primera');
});

grupo('la herramienta y su accesorio viajan juntos', () => {
    // Se validan como una unidad; separarlos en la red deshace esa garantía.
    const a = app([
        ficha(PALA, 'Pulidora', 1, { accessories: [{ nombre: 'Disco', itemId: DISCO, cantidad: 1 }] as Item['accessories'] }),
        ficha(DISCO, 'Disco', 5),
    ]);
    a.fn.handleLogMovements([salida(PALA)]);
    igual(a.visto.viajes.length, 1, 'un viaje');
    igual(a.visto.viajes[0].map(x => x.m.itemId), [PALA, DISCO], 'herramienta y accesorio adentro');
});

grupo('cada movimiento viaja con su identificador y su saldo', () => {
    const a = app([ficha(PALA, 'Pala', 5)]);
    a.fn.handleLogMovements([salida(PALA, 2)]);
    const [primero] = a.visto.viajes[0];
    esCierto(!!primero.id, 'lleva identificador');
    igual(primero.fallbackQty, 3, 'y el saldo que le corresponde, por si hay que caer al camino viejo');
});

grupo('un lote rechazado entero no manda viaje vacío', () => {
    const a = app([ficha(PALA, 'Pala', 0)]);
    const r = a.fn.handleLogMovements([salida(PALA)]);
    igual(r.ok, 0, 'no entró nada');
    igual(a.visto.viajes.length, 1, 'se llama igual...');
    igual(a.visto.viajes[0].length, 0, '...pero con la lista vacía, que el servicio corta de una');
});

await cerrar();
