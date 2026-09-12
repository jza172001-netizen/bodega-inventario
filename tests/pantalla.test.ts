/**
 * tests/pantalla.test.ts — El despacho por bloque, TAL CUAL está en la pantalla
 * ============================================================================
 * ESTA PRUEBA EXISTE POR UNA LECCIÓN CARA.
 *
 * Había 191 comprobaciones y todas pasaban con ocho fallos nuevos adentro.
 * Ninguno vivía en el núcleo: vivían en la pantalla, en el endpoint y en el
 * orden de las escrituras. Las pruebas cubrían lo que era fácil cubrir —
 * funciones puras sin React— y ahí no estaban los huecos.
 *
 * CÓMO SE PRUEBA UN COMPONENTE SIN NAVEGADOR
 *
 * `FloatingChat.tsx` tiene 2.300 líneas y depende de React, de íconos y de
 * medio `App.tsx`. Montarlo pediría un marco de pruebas que en este entorno no
 * se puede ni instalar (`npm install` se cae con `xlsx`).
 *
 * Entonces se saca del archivo, con el compilador de TypeScript, EL TEXTO REAL
 * de los manejadores, y se ejecuta con las dependencias puestas a mano. No es
 * una copia: si alguien cambia `registrarLote`, esta prueba corre el cambio. Si
 * alguien le renombra o le mueve las piezas, esta prueba FALLA EN VOZ ALTA en
 * vez de pasar contra código viejo — que es exactamente lo que pasó con el
 * arnés de los auditores y casi me hace cantar victoria sin arreglar nada.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// `typescript` es CommonJS: en módulo ES la forma que trae las APIs es la default.
import ts from 'typescript';
import { Item, InventoryType, Movement, MovementType, Personnel, Project } from '../types';
import { planearLote } from '../core/despacho';
import { leerLote } from '../utils/lote';
import { isAsset, isConsumable } from '../utils/inventory';
import { igual, esCierto, grupo, cerrar } from './correr';

// `tsx` corre esto como módulo ES: no hay `__dirname`.
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO = path.join(AQUI, '..', 'components', 'FloatingChat.tsx');

/**
 * Saca del componente las declaraciones que se nombran y las devuelve vivas.
 *
 * Se arman con `new Function` y no con `vm`: un `vm` crea otro universo, y ahí
 * un arreglo hecho adentro no es «el mismo tipo» que uno de acá. Comparar los
 * resultados se vuelve una trampa de falsos negativos — ya me costó media hora
 * creyendo que algo seguía roto cuando el valor era correcto.
 */
const sacarDelComponente = <T,>(nombres: string[], contexto: Record<string, unknown>): T => {
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
                `No encontré "${n}" en FloatingChat.tsx. Si la renombraste o la moviste, `
                + 'actualizá esta prueba: pasar por no encontrar la función sería peor que fallar.',
            );
        }
    }
    const cuerpo = ts.transpileModule(
        `(() => {\n${nombres.map(n => encontradas.get(n)).join('\n')}\nreturn { ${nombres.join(', ')} };\n})()`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
    ).outputText;
    const claves = Object.keys(contexto);
    // eslint-disable-next-line no-new-func
    const armar = new Function(...claves, `return ${cuerpo};`);
    return armar(...claves.map(k => contexto[k])) as T;
};

const ALEX: Personnel = { id: '44444444-4444-4444-8444-444444444444', name: 'Alex' };
const OBRA: Project = { id: '55555555-5555-4555-8555-555555555555', name: 'Obra', status: 'active' } as Project;
const PALA = '11111111-1111-4111-8111-111111111111';

const ficha = (id: string, name: string, quantity: number, inventoryType = InventoryType.HAND_TOOL): Item => ({
    id, name, quantity, inventoryType, category: 'Prueba', subCategory: '', minStock: 0, unit: 'und',
});

const MANEJADORES = ['fichaNueva', 'resuelto', 'armarMovimientos', 'quitarRegistrados', 'registrarLote', 'quitarLinea', 'desmarcarNuevo'];

interface Manejadores {
    registrarLote: () => void;
    quitarLinea: (id: string) => void;
    desmarcarNuevo: (id: string) => void;
    armarMovimientos: (ts: Date, p: Project | undefined, crear: boolean) => { movs: Array<Omit<Movement, 'id'>>; registrados: Set<string>; nacen: Item[] };
}

/** Monta el panel del bloque con un inventario y un texto pegado. */
const panel = (items: Item[], texto: string, conProyecto = false) => {
    const visto = { cerrado: false, enviados: [] as Array<Omit<Movement, 'id'>>, creados: [] as Item[], avisos: [] as string[] };
    const c: Record<string, unknown> = {
        lote: leerLote(texto, [ALEX], items),
        loteFecha: '2026-09-12',
        loteProyecto: conProyecto ? OBRA.id : '',
        loteCompletar: true,
        loteNuevos: new Map<string, InventoryType>(),
        projects: conProyecto ? [OBRA] : [],
        items, InventoryType, MovementType, isAsset, isConsumable, planearLote,
        momentoDeFecha: () => new Date('2026-09-12T12:00:00Z'),
        setLote: (v: unknown) => { c.lote = typeof v === 'function' ? (v as (x: unknown) => unknown)(c.lote) : v; },
        setLoteNuevos: (v: unknown) => { c.loteNuevos = typeof v === 'function' ? (v as (x: unknown) => unknown)(c.loteNuevos) : v; },
        cerrarLote: () => { visto.cerrado = true; c.lote = null; },
        onCreateItem: (v: Omit<Item, 'id'>) => {
            const nuevo = { ...v, id: `creado-${visto.creados.length + 1}` } as Item;
            items.push(nuevo); visto.creados.push(nuevo); return nuevo;
        },
        onLogMovements: (batch: Array<Omit<Movement, 'id'>>, opciones?: Record<string, unknown>) => {
            visto.enviados.push(...batch);
            const plan = planearLote(batch, items, opciones);
            return { ok: plan.aplicar.length, total: plan.aplicar.length + plan.rechazos.length, rechazos: plan.rechazos };
        },
        addBot: (x: string) => visto.avisos.push(x),
        addBotYGuarda: (x: string) => visto.avisos.push(x),
        onBehaviorLog: undefined,
        setReponerQty: () => {},
        setReposicion: () => {},
    };
    return { visto, c, fn: sacarDelComponente<Manejadores>(MANEJADORES, c) };
};

/** Qué quedó todavía en pantalla, por nombre pedido. */
const pendientes = (c: Record<string, unknown>): string[] => {
    const lote = c.lote as { lineas: Array<{ items: Array<{ nombre: string }> }> } | null;
    return lote ? lote.lineas.flatMap(l => l.items.map(i => i.nombre)) : [];
};

grupo('lo que NO se resolvió se queda en pantalla', () => {
    /**
     * «Alex: 1 pala, 1 zorbex»: la pala existe, el zorbex no. Antes entraba la
     * pala y se borraba la línea COMPLETA de Alex, zorbex incluido: el panel se
     * cerraba y el pendiente no volvía nunca. La promesa de esta pantalla es que
     * el movimiento no se pierde.
     */
    const p = panel([ficha(PALA, 'Pala', 3)], 'Alex: 1 pala, 1 zorbex');
    p.fn.registrarLote();
    igual(p.visto.enviados.length, 1, 'se registra la pala');
    igual(p.visto.cerrado, false, 'el panel NO se cierra');
    igual(pendientes(p.c), ['zorbex'], 'y queda el zorbex esperando');
});

grupo('cuando todo se resuelve, el panel sí se cierra', () => {
    const p = panel([ficha(PALA, 'Pala', 3)], 'Alex: 1 pala');
    p.fn.registrarLote();
    igual(p.visto.enviados.length, 1, 'entró');
    igual(p.visto.cerrado, true, 'y no queda nada que mostrar');
});

grupo('quitar un renglón NO le corre el tipo a los demás', () => {
    /**
     * Las decisiones se guardaban por posición (`0:1`). Al quitar un renglón los
     * siguientes se corrían y HEREDABAN la decisión del vecino: lo marcado como
     * «Consumo» nacía «Eléctrica», y por ahí volvía el error de préstamo vs.
     * gasto que ya se había arreglado. Ahora cada ítem lleva su id.
     */
    const p = panel([], 'Alex: 1 alfa, 1 beta, 1 gamma', true);
    const lote = p.c.lote as { lineas: Array<{ items: Array<{ id: string }> }> };
    const [alfa, beta, gamma] = lote.lineas[0].items;
    (p.c.loteNuevos as Map<string, InventoryType>).set(beta.id, InventoryType.ELECTRICAL_TOOL);
    (p.c.loteNuevos as Map<string, InventoryType>).set(gamma.id, InventoryType.SINGLE_USE);

    p.fn.desmarcarNuevo(alfa.id);
    p.fn.quitarLinea(alfa.id);
    p.fn.registrarLote();

    const porNombre = new Map(p.visto.creados.map(i => [i.name, i.inventoryType]));
    igual(p.visto.creados.length, 2, 'nacen beta y gamma');
    igual(porNombre.get('beta'), InventoryType.ELECTRICAL_TOOL, 'beta conserva Eléctrica');
    igual(porNombre.get('gamma'), InventoryType.SINGLE_USE, 'gamma conserva Consumo');
});

grupo('los ítems nuevos nacen en CERO', () => {
    // La cantidad la pone después la entrada de completado, con su nota. Si
    // naciera con la cantidad pedida, esa cantidad entraría dos veces y el
    // Kardex dejaría de cuadrar.
    const p = panel([], 'Alex: 3 palines', true);
    const lote = p.c.lote as { lineas: Array<{ items: Array<{ id: string }> }> };
    (p.c.loteNuevos as Map<string, InventoryType>).set(lote.lineas[0].items[0].id, InventoryType.HAND_TOOL);
    p.fn.registrarLote();
    igual(p.visto.creados.length, 1, 'nació uno');
    igual(p.visto.creados[0].quantity, 0, 'y nació en cero');
    igual(p.visto.enviados[0].quantity, 3, 'la salida sí pide tres');
});

grupo('DIBUJAR la vista previa no crea nada', () => {
    /**
     * La vista previa llama a `armarMovimientos` para mostrar el plan de verdad,
     * y la vista previa corre EN CADA RENDER. Sin la bandera `crear`, abrir el
     * panel con tres renglones marcados como nuevos creaba tres ítems en el
     * inventario, y volvía a crearlos con cada tecla.
     */
    const p = panel([], 'Alex: 1 alfa, 1 beta', true);
    const lote = p.c.lote as { lineas: Array<{ items: Array<{ id: string }> }> };
    for (const it of lote.lineas[0].items) (p.c.loteNuevos as Map<string, InventoryType>).set(it.id, InventoryType.HAND_TOOL);

    const momento = new Date('2026-09-12T12:00:00Z');
    for (let i = 0; i < 5; i++) p.fn.armarMovimientos(momento, OBRA, false);
    igual(p.visto.creados.length, 0, 'cinco renders, cero ítems creados');

    const simulado = p.fn.armarMovimientos(momento, OBRA, false);
    igual(simulado.movs.length, 2, 'pero el plan sí ve los dos');
    igual(simulado.nacen.length, 2, 'con sus fichas en cero');
    igual(simulado.nacen.every(i => i.quantity === 0), true, 'todas en cero');

    p.fn.armarMovimientos(momento, OBRA, true);
    igual(p.visto.creados.length, 2, 'y con `crear` sí nacen, una sola vez');
});

grupo('la vista previa cuenta igual que el núcleo', () => {
    /**
     * Hay UNA pala y dos personas piden una cada una. Cada renglón comparaba 1
     * contra 1 por su cuenta y ninguno avisaba nada; al confirmar, el núcleo
     * generaba una entrada automática que nadie aprobó. Dos cuentas para lo
     * mismo siempre terminan divergiendo.
     */
    const item = ficha(PALA, 'Pala', 1);
    const p = panel([item], 'Alex: 1 pala\nAlex: 1 pala');
    const { movs, nacen } = p.fn.armarMovimientos(new Date('2026-09-12T12:00:00Z'), undefined, false);
    const plan = planearLote(movs, [...(p.c.items as Item[]), ...nacen], { completarFaltante: true });
    const entradas = plan.completados.reduce((s, x) => s + x.faltaban, 0);
    igual(movs.length, 2, 'dos salidas');
    igual(entradas, 1, 'y una entrada automática que la pantalla tiene que mostrar');
});

grupo('los consumibles no pasan sin proyecto', () => {
    const p = panel([ficha('cemento', 'Cemento', 5, InventoryType.SINGLE_USE)], 'Alex: 1 cemento');
    p.fn.registrarLote();
    igual(p.visto.enviados.length, 0, 'no se envió nada');
    esCierto(p.visto.avisos.some(a => /proyecto/i.test(a)), 'y se avisa por qué');
});

await cerrar();
