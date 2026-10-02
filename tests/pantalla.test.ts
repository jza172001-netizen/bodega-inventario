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
import { planearLote, tipoExigeObra } from '../core/despacho';
import { verificarLote, listoParaRegistrar, obraDe, huellaDeLinea } from '../core/verificacion';
import { fichaDelBloque, identicoDe } from '../core/crearItem';
import { momentoConHora } from '../utils/date';
import { normStr } from '../utils/genus';
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

const MANEJADORES = ['fichaNueva', 'resuelto', 'obraGeneral', 'armarMovimientos', 'verificacionDelLote', 'quitarRegistrados', 'registrarLote', 'quitarLinea', 'desmarcarNuevo', 'confirmado', 'confirmarLinea', 'extraDeHuella'];

interface Manejadores {
    registrarLote: () => void;
    confirmarLinea: (id: string) => void;
    confirmado: (l: unknown) => boolean;
    quitarLinea: (id: string) => void;
    desmarcarNuevo: (id: string) => void;
    armarMovimientos: (crear: boolean) => { movs: Array<Omit<Movement, 'id'>>; registrados: Set<string>; nacen: Item[] };
    verificacionDelLote: () => { v: { porLinea: Map<string, Array<{ tipo: string; nivel: string }>>; porItem: Map<string, Array<{ tipo: string; nivel: string }>> } };
}

/** Monta el panel del bloque con un inventario y un texto pegado. */
/**
 * `obra`: la respuesta a la pregunta de arriba. Por defecto «Sin proyecto»
 * DECIDIDO (`__sin__`), que es lo que antes era el silencio; `''` es que nadie
 * contestó, y ahora el bloque pregunta, como el chat.
 */
const panel = (items: Item[], texto: string, conProyecto = false, sinSubir = 0,
               extra: { personal?: Personnel[]; obras?: Project[]; obra?: string; movimientos?: Movement[] } = {}) => {
    const visto = { cerrado: false, enviados: [] as Array<Omit<Movement, 'id'>>, creados: [] as Item[], avisos: [] as string[],
                    personasCreadas: [] as Personnel[], obrasCreadas: [] as Project[] };
    const personal = extra.personal ?? [ALEX];
    const obras = extra.obras ?? (conProyecto ? [OBRA] : []);
    const c: Record<string, unknown> = {
        lote: leerLote(texto, personal, items, obras),
        loteFecha: '2026-09-12',
        loteProyecto: extra.obra ?? (conProyecto ? OBRA.id : '__sin__'),
        // «✓ Pedido correcto» por trabajador, con la huella del renglón.
        // Se muta en el MISMO Map: los manejadores extraídos ya lo tienen.
        loteConfirmados: new Map<string, string>(),
        setLoteConfirmados: (f: (m: Map<string, string>) => Map<string, string>) => {
            const m = c.loteConfirmados as Map<string, string>;
            const n = f(m); m.clear(); n.forEach((v, k) => m.set(k, v));
        },
        loteNombres: new Map(),
        huellaDeLinea, fichaDelBloque, identicoDe,
        movements: extra.movimientos ?? [],
        personnel: personal,
        verificarLote, listoParaRegistrar, obraDe, normStr, tipoExigeObra,
        momentoConHora: (iso: string, hora?: string) => new Date(`${iso}T${hora ?? '12:00'}:00-05:00`),
        onCreatePersonnel: (p: Omit<Personnel, 'id'>) => {
            const nuevo = { ...p, id: `persona-${visto.personasCreadas.length + 1}` } as Personnel;
            personal.push(nuevo); visto.personasCreadas.push(nuevo); return nuevo;
        },
        onCreateProject: (p: Omit<Project, 'id'>) => {
            const nueva = { ...p, id: `obra-${visto.obrasCreadas.length + 1}` } as Project;
            visto.obrasCreadas.push(nueva); return nueva;
        },
        loteCompletar: true,
        loteNuevos: new Map<string, InventoryType>(),
        projects: obras,
        items, InventoryType, MovementType, isAsset, isConsumable, planearLote,
        // Cuántas operaciones quedaron guardadas en el teléfono sin confirmar.
        // Cambia lo que dice el mensaje: «anotadas» no es lo mismo que
        // «registradas», y la pantalla llegó a decir lo segundo sin que el
        // servidor hubiera recibido nada.
        sinSubir,
        momentoDeFecha: () => new Date('2026-09-12T12:00:00Z'),
        setLote: (v: unknown) => { c.lote = typeof v === 'function' ? (v as (x: unknown) => unknown)(c.lote) : v; },
        setLoteNuevos: (v: unknown) => { c.loteNuevos = typeof v === 'function' ? (v as (x: unknown) => unknown)(c.loteNuevos) : v; },
        cerrarLote: () => { visto.cerrado = true; c.lote = null; },
        // Como React: crear un ítem NO lo mete en `items` de este render (llega
        // en el siguiente). Lo ve el ESPEJO de App, que es contra lo que se
        // registra. Antes este doble lo metía en `items` al instante, y así
        // tapaba que dos renglones del mismo ítem nuevo crearan dos gemelos.
        onCreateItem: (v: Omit<Item, 'id'>) => {
            const nuevo = { ...v, id: `creado-${visto.creados.length + 1}` } as Item;
            visto.creados.push(nuevo); return nuevo;
        },
        onLogMovements: (batch: Array<Omit<Movement, 'id'>>, opciones?: Record<string, unknown>) => {
            visto.enviados.push(...batch);
            const plan = planearLote(batch, [...items, ...visto.creados], opciones);
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

/**
 * Registrar como lo hace una persona: «✓ Pedido correcto» en cada trabajador y
 * después «Registrar». Confirmar NO salta lo que hay que decidir: eso sigue
 * frenando, y las pruebas de abajo lo comprueban.
 */
function registrar(p: { c: Record<string, unknown>; fn: Manejadores }) {
    const ls = (p.c.lote as { lineas: Array<{ id: string }> } | null)?.lineas ?? [];
    for (const l of ls) p.fn.confirmarLinea(l.id);
    p.fn.registrarLote();
}

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
    registrar(p);
    igual(p.visto.enviados.length, 1, 'se registra la pala');
    igual(p.visto.cerrado, false, 'el panel NO se cierra');
    igual(pendientes(p.c), ['zorbex'], 'y queda el zorbex esperando');
});

grupo('cuando todo se resuelve, el panel sí se cierra', () => {
    const p = panel([ficha(PALA, 'Pala', 3)], 'Alex: 1 pala');
    registrar(p);
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
    registrar(p);

    const porNombre = new Map(p.visto.creados.map(i => [i.name, i.inventoryType]));
    igual(p.visto.creados.length, 2, 'nacen beta y gamma');
    igual(porNombre.get('Beta'), InventoryType.ELECTRICAL_TOOL, 'beta conserva Eléctrica (nace con mayúscula, como en el chat)');
    igual(porNombre.get('Gamma'), InventoryType.SINGLE_USE, 'gamma conserva Consumo');
});

grupo('los ítems nuevos nacen en CERO', () => {
    // La cantidad la pone después la entrada de completado, con su nota. Si
    // naciera con la cantidad pedida, esa cantidad entraría dos veces y el
    // Kardex dejaría de cuadrar.
    const p = panel([], 'Alex: 3 palines', true);
    const lote = p.c.lote as { lineas: Array<{ items: Array<{ id: string }> }> };
    (p.c.loteNuevos as Map<string, InventoryType>).set(lote.lineas[0].items[0].id, InventoryType.HAND_TOOL);
    registrar(p);
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

    for (let i = 0; i < 5; i++) p.fn.armarMovimientos(false);
    igual(p.visto.creados.length, 0, 'cinco renders, cero ítems creados');

    const simulado = p.fn.armarMovimientos(false);
    igual(simulado.movs.length, 2, 'pero el plan sí ve los dos');
    igual(simulado.nacen.length, 2, 'con sus fichas en cero');
    igual(simulado.nacen.every(i => i.quantity === 0), true, 'todas en cero');

    p.fn.armarMovimientos(true);
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
    const { movs, nacen } = p.fn.armarMovimientos(false);
    const plan = planearLote(movs, [...(p.c.items as Item[]), ...nacen], { completarFaltante: true });
    const entradas = plan.completados.reduce((s, x) => s + x.faltaban, 0);
    igual(movs.length, 2, 'dos salidas');
    igual(entradas, 1, 'y una entrada automática que la pantalla tiene que mostrar');
});

grupo('los consumibles no pasan sin proyecto', () => {
    const p = panel([ficha('cemento', 'Cemento', 5, InventoryType.SINGLE_USE)], 'Alex: 1 cemento');
    registrar(p);
    igual(p.visto.enviados.length, 0, 'no se envió nada');
    esCierto(p.visto.avisos.some(a => /decidir/i.test(a)), 'y se avisa que falta decidir');
    const linea = (p.c.lote as { lineas: Array<{ id: string }> }).lineas[0];
    igual(p.fn.verificacionDelLote().v.porLinea.get(linea.id)?.map(a => a.tipo), ['obra_obligatoria'],
        'y lo que falta es la obra: material de consumo no sale «sin proyecto»');
});

grupo('la pantalla no dice «registrado» si el servidor no lo recibió', () => {
    /**
     * Se simuló una caída de conexión: el mensaje salía igual —«1 salida
     * registrada»—, la existencia bajaba en pantalla y el servidor no había
     * recibido nada. El dato no se pierde, queda en la cola y se reintenta
     * solo, pero «registrada» a secas afirma algo que todavía no pasó.
     *
     * En esta bodega esa diferencia es justo la que importa: dos celulares y
     * una sola bodega.
     */
    const conPendientes = panel([ficha(PALA, 'Pala', 3)], 'Alex: 1 pala', false, 2);
    registrar(conPendientes);
    const dicho = conPendientes.visto.avisos.join(' ');
    esCierto(/sin subir/i.test(dicho), 'avisa que todavía no subió');
    esCierto(/anotadas/i.test(dicho), 'y no dice «registradas»');

    const todoSubido = panel([ficha(PALA, 'Pala', 3)], 'Alex: 1 pala', false, 0);
    registrar(todoSubido);
    const dicho2 = todoSubido.visto.avisos.join(' ');
    esCierto(/registradas/i.test(dicho2), 'con todo subido sí dice registradas');
    esCierto(!/sin subir/i.test(dicho2), 'y no asusta de más');
});

// ── La lógica del chat, en el bloque ──────────────────────────────────

const JUAN: Personnel = { id: '66666666-6666-4666-8666-666666666666', name: 'Juan Puerta' };
const CRISTO: Project = { id: '77777777-7777-4777-8777-777777777777', name: 'El Cristo', status: 'active' } as Project;
const BONILLA: Project = { id: '88888888-8888-4888-8888-888888888888', name: 'Bonilla', status: 'active' } as Project;
type L = { id: string; items: Array<{ id: string }>; paraId?: string; crear?: { nombre: string; liderId?: string } };
const lineas = (c: Record<string, unknown>) => (c.lote as { lineas: L[] } | null)?.lineas ?? [];

grupo('cada renglón sale con la obra, la hora y el lugar de SU encabezado', () => {
    const p = panel([ficha(PALA, 'Pala', 5)], '@ El Cristo · 07:30 · contenedor\nAlex: 1 pala\n@ Bonilla · 09:15\nJuan: 2 palas',
        false, 0, { personal: [{ ...ALEX }, { ...JUAN }], obras: [CRISTO, BONILLA], obra: '' });
    registrar(p);
    igual(p.visto.enviados.map(m => m.projectId), [CRISTO.id, BONILLA.id], 'cada uno a su obra, sin elegir nada arriba');
    igual(p.visto.enviados.map(m => new Date(m.timestamp).toISOString().slice(11, 16)), ['12:30', '14:15'],
        'a la hora dictada (7:30 y 9:15 en Colombia)');
    igual(p.visto.enviados[0].notes, 'Lugar: contenedor', 'el lugar queda escrito');
});

grupo('la obra se PREGUNTA, como el chat: sin contestar no sale; «sin proyecto» vale', () => {
    const p = panel([ficha(PALA, 'Pala', 5)], 'Alex: 1 pala', false, 0, { obra: '' });
    registrar(p);
    igual(p.visto.enviados.length, 0, 'sin decir la obra, nada');
    igual(p.fn.verificacionDelLote().v.porLinea.get(lineas(p.c)[0].id)?.map(a => a.tipo), ['obra'], 'falta la obra (opcional)');
    const q = panel([ficha(PALA, 'Pala', 5)], 'Alex: 1 pala', false, 0, { obra: '__sin__' });
    registrar(q);
    igual(q.visto.enviados.length, 1, 'con «Sin proyecto» decidido, sale');
    igual(q.visto.enviados[0].projectId, undefined, 'y sale sin obra');
});

grupo('OFICIAL: igual que el chat, se pregunta para quién de su cuadrilla', () => {
    const alex = { ...ALEX, isTeamLeader: true };
    const juan = { ...JUAN, teamLeaderId: ALEX.id };
    const p = panel([ficha(PALA, 'Pala', 5)], 'Alex: 1 pala', false, 0, { personal: [alex, juan] });
    registrar(p);
    igual(p.visto.enviados.length, 0, 'sin decir para quién, no sale');
    lineas(p.c)[0].paraId = JUAN.id;
    registrar(p);
    igual(p.visto.enviados.map(m => m.personnelId), [JUAN.id], 'sale a Juan, el de su cuadrilla');

    const q = panel([ficha(PALA, 'Pala', 5)], 'Alex: 1 pala', false, 0, { personal: [{ ...alex }, { ...juan }] });
    lineas(q.c)[0].paraId = ALEX.id;
    registrar(q);
    igual(q.visto.enviados.map(m => m.personnelId), [ALEX.id], '«sin especificar» = al oficial, como en el chat');
});

grupo('persona nueva: se crea en SU cuadrilla, una sola vez, y solo si alguien lo decide', () => {
    const alex = { ...ALEX, isTeamLeader: true };
    const p = panel([ficha(PALA, 'Pala', 5)], 'Pedro (cuadrilla de Alex): 1 pala\nPedro (cuadrilla de Alex): 1 pala', false, 0, { personal: [alex] });
    registrar(p);
    igual(p.visto.personasCreadas.length, 0, 'NADIE se crea solo (la lección de Rafael)');
    for (const l of lineas(p.c)) l.crear = { nombre: 'Pedro', liderId: ALEX.id };
    registrar(p);
    igual(p.visto.personasCreadas.map(x => [x.name, x.teamLeaderId]), [['Pedro', ALEX.id]], 'un Pedro, en la cuadrilla de Alex');
    igual(p.visto.enviados.map(m => m.personnelId), ['persona-1', 'persona-1'], 'y las dos salidas son suyas');
});

grupo('«ya la tiene otro»: no sale sin el «✓ Pedido correcto» del trabajador', () => {
    const PULI = '99999999-9999-4999-8999-999999999999';
    const prestada: Movement = { id: 'p', itemId: PULI, type: MovementType.CHECK_OUT, quantity: 1, timestamp: new Date('2026-09-10T12:00:00Z'),
        personnelId: JUAN.id, isLoan: true, isReturned: false };
    const p = panel([ficha(PULI, 'Pulidora', 0, InventoryType.ELECTRICAL_TOOL)], 'Alex: 1 pulidora', false, 0,
        { personal: [{ ...ALEX }, { ...JUAN }], movimientos: [prestada] });
    const it = lineas(p.c)[0].items[0];
    igual(p.fn.verificacionDelLote().v.porItem.get(it.id)?.map(a => a.tipo), ['ya_la_tiene'], 'avisa que la tiene Juan');
    p.fn.registrarLote();
    igual(p.visto.enviados.length, 0, 'sin confirmar el pedido de Alex, no sale');
    registrar(p);
    esCierto(p.visto.enviados.length > 0, 'con el aviso a la vista y el pedido confirmado, sale');
});

grupo('EL MISMO PEDIDO POR EL CHAT Y POR EL BLOQUE DA LO MISMO', () => {
    /**
     * Las dos puertas tienen que dar los mismos movimientos: quién, qué, cuánto,
     * obra y préstamo/gasto. Se corre el confirmar REAL del chat
     * (`handleConfirmWizard`) contra el del bloque.
     */
    const alex = { ...ALEX, isTeamLeader: true };
    const juan = { ...JUAN, teamLeaderId: ALEX.id };
    const items = [ficha(PALA, 'Pala', 5), ficha('guante', 'Guantes', 9, InventoryType.PPE)];
    const enviadosChat: Array<Omit<Movement, 'id'>> = [];
    const chat = sacarDelComponente<{ handleConfirmWizard: () => void }>(['handleConfirmWizard', 'LOAN_TYPES', 'todayISO'], {
        wizardIsAddMode: false,
        wizardSel: new Map([[PALA, 2], ['guante', 1]]),
        wizardData: { selectedTypes: [InventoryType.HAND_TOOL, InventoryType.PPE], worker: juan, newWorkerName: '', teamLeaderWorker: alex, project: CRISTO, newProjectName: '' },
        wizardDate: '2026-09-12', personnel: [alex, juan], items, InventoryType, MovementType, tipoExigeObra,
        momentoDeFecha: () => new Date('2026-09-12T12:00:00Z'),
        onLogMovements: (b: Array<Omit<Movement, 'id'>>) => { enviadosChat.push(...b); return { ok: b.length, total: b.length, rechazos: [] }; },
        onCreatePersonnel: () => { throw new Error('no debería crear'); }, onCreateProject: () => { throw new Error('no debería crear'); },
        addBot: () => {}, addBotYGuarda: () => {}, cancelWizard: () => {}, setReponerQty: () => {}, setReposicion: () => {},
    });
    chat.handleConfirmWizard();

    const b = panel(items, '@ El Cristo\nAlex: 2 palas, 1 guantes', false, 0, { personal: [alex, juan], obras: [CRISTO] });
    lineas(b.c)[0].paraId = JUAN.id;
    registrar(b);

    const clave = (m: Omit<Movement, 'id'>) => `${m.itemId}|${m.personnelId}|${m.quantity}|${m.projectId}|${m.isLoan}|${m.type}`;
    igual(b.visto.enviados.map(clave).sort(), enviadosChat.map(clave).sort(), 'mismos movimientos por las dos puertas');
});

grupo('una mañana real: 10 personas, 60 cosas — ni una perdida, ni una repetida', () => {
    /**
     * El problema que Juli nombró para el viernes: «procesar cantidad de
     * registros». Diez trabajadores, seis cosas cada uno, la mitad sin
     * existencia (entra lo que falta y sale). Por los manejadores REALES.
     */
    const nombres = ['Pala', 'Martillo', 'Pica', 'Palustre', 'Machete', 'Almadana', 'Tenazas', 'Nivel', 'Llana', 'Balde',
        'Carretilla', 'Escalera', 'Flexometro', 'Segueta', 'Barra', 'Cincel', 'Serrucho', 'Hombresolo', 'Alicate', 'Zapapico'];
    const inventario = nombres.map((n, k) => ficha(`i${k}`, n, k % 2 ? 0 : 50));
    const gente: Personnel[] = Array.from({ length: 10 }, (_, k) => ({ id: `p${k}`, name: `Trabajador${String.fromCharCode(65 + k)}` }));
    const texto = gente.map((g, k) => `${g.name}: ` + Array.from({ length: 6 }, (_, j) => `${1 + j % 3} ${nombres[(k * 6 + j) % 20].toLowerCase()}`).join(', ')).join('\n');

    const t0 = performance.now();
    const p = panel(inventario, texto, true, 0, { personal: gente, obras: [OBRA], obra: OBRA.id });
    registrar(p);
    const ms = performance.now() - t0;

    const salidas = p.visto.enviados.filter(m => m.type === MovementType.CHECK_OUT);
    igual(salidas.length, 60, 'las 60 salieron');
    igual(new Set(salidas.map(m => `${m.personnelId}|${m.itemId}`)).size, 60, 'cada una una sola vez, a su persona');
    igual(pendientes(p.c), [], 'nada se quedó en pantalla');
    esCierto(salidas.every(m => m.projectId === OBRA.id), 'todas con su obra');
    esCierto(ms < 2000, `leer, verificar y registrar en menos de 2 s (tomó ${Math.round(ms)} ms)`);
});

// ── «✓ Pedido correcto» por trabajador (fase A, 2-oct) ───────────────────

grupo('SIN «✓ Pedido correcto» no se registra NADA', () => {
    const p = panel([ficha(PALA, 'Pala', 5)], 'Alex: 1 pala');
    p.fn.registrarLote();
    igual(p.visto.enviados.length, 0, 'todo resuelto, pero nadie confirmó');
    p.fn.confirmarLinea(lineas(p.c)[0].id);
    p.fn.registrarLote();
    igual(p.visto.enviados.length, 1, 'confirmado, sale');
});

grupo('se confirma por trabajador: el que no se confirmó se queda', () => {
    const p = panel([ficha(PALA, 'Pala', 5)], 'Alex: 1 pala\nJuan Puerta: 2 palas', false, 0, { personal: [{ ...ALEX }, { ...JUAN }] });
    p.fn.confirmarLinea(lineas(p.c)[0].id);
    p.fn.registrarLote();
    igual(p.visto.enviados.map(m => m.personnelId), [ALEX.id], 'solo el de Alex');
});

grupo('cambiar algo DESPUÉS de confirmar lo desconfirma solo', () => {
    const p = panel([ficha(PALA, 'Pala', 5)], 'Alex: 1 pala', false, 0, { personal: [{ ...ALEX }, { ...JUAN }] });
    const l = lineas(p.c)[0] as L & { items: Array<{ id: string; cantidad: number }> };
    p.fn.confirmarLinea(l.id);
    esCierto(p.fn.confirmado(l), 'confirmado');
    l.items[0].cantidad = 4;   // la cantidad cambió
    esCierto(!p.fn.confirmado(l), 'cambiar la cantidad lo desconfirma');
    p.fn.registrarLote();
    igual(p.visto.enviados.length, 0, 'y no sale con la cantidad que nadie confirmó');
    l.paraId = JUAN.id;
    p.fn.confirmarLinea(l.id);
    l.paraId = undefined;      // para quién cambió
    esCierto(!p.fn.confirmado(l), 'cambiar para quién también');
});

grupo('confirmar NO salta lo que hay que decidir', () => {
    const p = panel([ficha(PALA, 'Pala', 5)], 'Alex: 1 pala, 1 zorbex');
    registrar(p);
    igual(p.visto.enviados.length, 1, 'sale la pala');
    igual(pendientes(p.c), ['zorbex'], 'el zorbex (sin decidir) se queda aunque el trabajador esté confirmado');
});

grupo('un ítem nuevo nace con las reglas del chat, y nunca gemelo', () => {
    const codo2 = { ...ficha('c2', 'Codos 2"', 4, InventoryType.SINGLE_USE), familia: 'Codos', ruta: 'Tubería / Accesorios' };
    const p = panel([codo2], 'Alex: 3 codos de 5', true);
    const it = lineas(p.c)[0].items[0];
    (p.c.loteNuevos as Map<string, InventoryType>).set(it.id, InventoryType.SINGLE_USE);
    registrar(p);
    igual(p.visto.creados.map(i => [i.name, i.familia, i.ruta]), [['Codos 5"', 'Codos', 'Tubería / Accesorios']],
        '«codos de 5» nace «Codos 5"», en la familia y el género de sus hermanos');
    // Si YA existe igualito, se usa ese.
    const q = panel([codo2, { ...ficha('c5', 'Codos 5"', 0, InventoryType.SINGLE_USE), familia: 'Codos' }], 'Alex: 3 codos de 5x', true);
    const it2 = lineas(q.c)[0].items[0] as unknown as { id: string; nombre: string };
    it2.nombre = 'codos de 5';
    (q.c.loteNuevos as Map<string, InventoryType>).set(it2.id, InventoryType.SINGLE_USE);
    registrar(q);
    igual(q.visto.creados.length, 0, 'no se crea un gemelo');
    igual(q.visto.enviados.map(m => m.itemId), ['c5'], 'sale el que ya estaba');
});

grupo('el MISMO ítem nuevo en dos renglones nace UNA vez', () => {
    // Antes nacían dos «Zorbex»: `identicoDe` buscaba en `items` del render, que
    // todavía no tenía el que se acababa de crear.
    const BETO: Personnel = { id: '66666666-6666-4666-8666-666666666666', name: 'Beto' };
    const p = panel([], 'Alex: 1 zorbex\nBeto: 2 zorbex', true, 0, { personal: [ALEX, BETO] });
    for (const l of lineas(p.c)) (p.c.loteNuevos as Map<string, InventoryType>).set(l.items[0].id, InventoryType.HAND_TOOL);
    registrar(p);
    igual(p.visto.creados.map(i => i.name), ['Zorbex'], 'nace uno solo');
    igual(p.visto.enviados.filter(m => m.type === MovementType.CHECK_OUT).map(m => m.itemId), ['creado-1', 'creado-1'],
        'y las dos salidas son de ese');
});

grupo('«Sin asignar trabajador», como el paso 2 del chat', () => {
    const p = panel([ficha(PALA, 'Pala', 5)], 'Nadie conocido: 1 pala');
    registrar(p);
    igual(p.visto.enviados.length, 0, 'sin decidir quién, no sale');
    (lineas(p.c)[0] as unknown as { sinPersona: boolean }).sinPersona = true;
    registrar(p);
    igual(p.visto.enviados.map(m => m.personnelId), [undefined], 'decidido «sin asignar», sale sin persona');
});

await cerrar();
