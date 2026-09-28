/**
 * tests/custodia.test.ts — Quién tiene qué, y de quién le llegó
 * ==============================================================
 * La regla pura de `core/custodia.ts`. La comparten la app y el endpoint del
 * asistente, así que un fallo acá sale por las dos puertas.
 *
 * Las reglas que fija, en palabras de Juli:
 *  · «La tenía Juan y se la entregué a Carlos» — el responsable anterior es un
 *    DATO de la fila, no solo historial.
 *  · Un traslado no mueve el stock de la bodega: el libro cuadra.
 *  · Una posible asignación nunca se vuelve préstamo sola.
 *  · Lo que no se sabe queda vacío. Nunca se inventa.
 */
import { Asignacion, Movement, MovementType } from '../types';
import {
    armarTraspaso, cadenaDeCustodia, crearAsignacion, resolverAsignacion, afueraSinConfirmar,
} from '../core/custodia';
import { getActiveLoans } from '../utils/inventory';
import { igual, esCierto, grupo, cerrar } from './correr';

let n = 0;
const nuevoId = () => `id-${++n}`;
const AHORA = new Date('2026-09-28T15:00:00Z');
const nombres: Record<string, string> = { juan: 'Juan', carlos: 'Carlos' };
const obras: Record<string, string> = { bonilla: 'Bonilla', cristo: 'El Cristo' };
const op = { ahora: AHORA, nuevoId, nombreDe: (id?: string) => (id ? nombres[id] : undefined), obraDe: (id?: string) => (id ? obras[id] : undefined) };

const prestamo = (p: Partial<Movement> = {}): Movement => ({
    id: 'p1', itemId: 'pulidora', type: MovementType.CHECK_OUT, quantity: 1,
    timestamp: new Date('2026-09-01T12:00:00Z'), personnelId: 'juan', projectId: 'bonilla',
    isLoan: true, isReturned: false, ...p,
});

/** Lo que el libro suma: entradas menos salidas. */
const libro = (ms: Movement[]) => ms.reduce((s, m) =>
    s + (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE ? -m.quantity : m.quantity), 0);

grupo('traspaso: «la tenía Juan y se la entregué a Carlos»', () => {
    const p = prestamo();
    const plan = armarTraspaso(p, [p], { personnelId: 'carlos' }, { ...op, entregadoPor: 'Kate' });
    if ('error' in plan) throw new Error(plan.error);

    igual(plan.nuevo.personnelId, 'carlos', 'el préstamo nuevo es de Carlos');
    igual(plan.nuevo.responsableAnterior, 'Juan', 'y DICE que la tenía Juan, como dato');
    igual(plan.nuevo.vieneDe, 'p1', 'apunta al préstamo de Juan');
    igual(plan.nuevo.entregadoPor, 'Kate', 'quién entregó queda aparte de quién recibe');
    igual(plan.nuevo.projectId, 'bonilla', 'sin decir obra, sigue en la misma');
    igual(plan.devolucion.devuelveA, 'p1', 'la devolución salda el préstamo de Juan');
    esCierto(!!plan.devolucion.esTraslado && !!plan.nuevo.esTraslado, 'las dos mitades se marcan como traslado');
    igual(plan.cierra, true, 'el de Juan queda cerrado');
    igual(libro([plan.devolucion, plan.nuevo]), 0, 'EL STOCK DE LA BODEGA NO SE MUEVE: entra 1, sale 1');

    const todos = [p, plan.devolucion, plan.nuevo];
    igual(getActiveLoans(todos).map(m => m.personnelId), ['carlos'], 'afuera: solo el de Carlos');
    igual(cadenaDeCustodia(plan.nuevo, todos).map(m => m.personnelId), ['juan', 'carlos'], 'la cadena: Juan → Carlos');
});

grupo('traslado de obra: «mandé una pulidora de Bonilla para El Cristo»', () => {
    const p = prestamo();
    const plan = armarTraspaso(p, [p], { projectId: 'cristo' }, op);
    if ('error' in plan) throw new Error(plan.error);
    igual(plan.nuevo.projectId, 'cristo', 'destino: El Cristo');
    igual(plan.devolucion.projectId, 'bonilla', 'y el origen queda escrito en la devolución: Bonilla');
    igual(plan.nuevo.personnelId, 'juan', 'la persona no cambia');
    igual(plan.nuevo.responsableAnterior, undefined, 'no cambió de manos: no hay responsable anterior que inventar');
    esCierto((plan.nuevo.notes ?? '').includes('Bonilla → El Cristo'), 'la nota dice de dónde a dónde');
});

grupo('traslado de una parte', () => {
    const p = prestamo({ quantity: 3 });
    const plan = armarTraspaso(p, [p], { personnelId: 'carlos' }, { ...op, cantidad: 1 });
    if ('error' in plan) throw new Error(plan.error);
    igual(plan.cantidad, 1, 'pasa una');
    igual(plan.cierra, false, 'el de Juan NO se cierra: le quedan dos');
    const todos = [p, plan.devolucion, plan.nuevo];
    igual(getActiveLoans(todos).map(m => `${m.personnelId}:${m.quantity}`).sort(), ['carlos:1', 'juan:2'],
        'Juan 2, Carlos 1');
});

grupo('lo que no es un traslado se rechaza DICHO', () => {
    const p = prestamo();
    esCierto('error' in armarTraspaso(p, [p], { personnelId: 'juan', projectId: 'bonilla' }, op),
        'mismo origen y destino: no se registra nada');
    esCierto('error' in armarTraspaso({ ...p, isReturned: true }, [p], { personnelId: 'carlos' }, op),
        'un préstamo cerrado no se traslada');
    const dev: Movement = { id: 'd', itemId: 'pulidora', type: MovementType.CHECK_IN, quantity: 1, timestamp: AHORA, devuelveA: 'p1' };
    esCierto('error' in armarTraspaso(p, [p, dev], { personnelId: 'carlos' }, op),
        'uno que ya volvió por devoluciones tampoco');
});

grupo('crear una asignación NO inventa lo que no se dijo', () => {
    const a = crearAsignacion({ descripcion: '  Nivel láser Total ', cantidad: 1, estado: 'posible', posibleResponsable: 'Jesús' },
        { ahora: AHORA, nuevoId });
    if ('error' in a) throw new Error(a.error);
    igual(a.descripcion, 'Nivel láser Total', 'la descripción se limpia');
    igual(a.desde, undefined, 'sin fecha no hay fecha');
    igual(a.desdeDesconocido, true, 'y queda dicho que no se sabe desde cuándo');
    igual(a.condicion, 'no_especificado', 'sin estado físico: no especificado');
    igual(a.entregadoPor, undefined, 'nadie entregó nada que se sepa');
    igual(a.itemId, undefined, 'no se exige clasificar antes de anotar');
    esCierto('error' in crearAsignacion({ descripcion: ' ', cantidad: 1, estado: 'posible' }, { ahora: AHORA, nuevoId }),
        'sin decir qué es, no se anota');
    esCierto('error' in crearAsignacion({ descripcion: 'x', cantidad: 0, estado: 'posible' }, { ahora: AHORA, nuevoId }),
        'cantidad cero, tampoco');
});

const asig = (p: Partial<Asignacion> = {}): Asignacion => ({
    id: 'a1', descripcion: 'Pulidoras pequeñas', cantidad: 7, estado: 'posible',
    posibleResponsable: 'John Jader, Héctor', condicion: 'no_especificado', desdeDesconocido: true,
    procedencia: 'Apéndice B.5', createdAt: AHORA, ...p,
});

grupo('confirmar quién la tiene: entra al libro y sale prestada, juntas', () => {
    const r = resolverAsignacion(asig(), { tipo: 'prestamo', itemId: 'pulidora', personnelId: 'carlos', cantidad: 2 }, { ...op, porQuien: 'Kate' });
    if ('error' in r) throw new Error(r.error);
    igual(r.movimientos.map(m => m.type), [MovementType.CHECK_IN, MovementType.CHECK_OUT],
        'primero la entrada del hallazgo, después la salida del préstamo');
    igual(libro(r.movimientos), 0, 'la bodega no gana ni pierde: nunca estuvo ahí');
    igual(r.movimientos[1].isLoan, true, 'la salida es un préstamo');
    igual(r.movimientos[1].personnelId, 'carlos', 'a quien se confirmó');
    igual(r.cerrada.cantidad, 7, 'LA ORIGINAL NO SE REESCRIBE: sigue diciendo 7');
    igual(r.cerrada.cierreMotivo, 'confirmada_prestamo', 'y se cierra con su motivo');
    esCierto(!!r.cerrada.cerradaEn, 'con fecha');
    igual(r.resto?.cantidad, 5, 'las otras 5 siguen abiertas en una fila nueva');
    igual(r.resto?.cerradaEn, undefined, 'abiertas de verdad');
});

grupo('hallada en bodega: solo la entrada', () => {
    const r = resolverAsignacion(asig({ cantidad: 1 }), { tipo: 'bodega', itemId: 'pulidora' }, op);
    if ('error' in r) throw new Error(r.error);
    igual(r.movimientos.map(m => m.type), [MovementType.CHECK_IN], 'una entrada');
    igual(r.resto, undefined, 'no queda resto');
});

grupo('«encontré el láser Total en Salvador Bahía»: sale de pendientes sin borrar nada', () => {
    const r = resolverAsignacion(asig({ cantidad: 1, estado: 'pendiente_verificar' }),
        { tipo: 'obra', ubicacion: 'Salvador Bahía' }, op);
    if ('error' in r) throw new Error(r.error);
    igual(r.movimientos.length, 0, 'no entra al libro: no volvió a bodega ni se le prestó a nadie');
    igual(r.cerrada.estado, 'pendiente_verificar', 'la original queda como estaba, cerrada');
    igual(r.cerrada.cierreMotivo, 'hallada_obra', 'con el motivo');
    igual(r.hallada?.estado, 'confirmada', 'y nace una CONFIRMADA');
    igual(r.hallada?.ubicacion, 'Salvador Bahía', 'donde está');
    esCierto('error' in resolverAsignacion(asig(), { tipo: 'obra' }, op), 'sin decir dónde, no se cierra');
});

grupo('darla por perdida exige decir por qué, y no toca el libro', () => {
    esCierto('error' in resolverAsignacion(asig(), { tipo: 'perdida', nota: '  ' }, op), 'sin nota: no');
    const r = resolverAsignacion(asig(), { tipo: 'perdida', nota: 'nadie la ha visto desde agosto' }, op);
    if ('error' in r) throw new Error(r.error);
    igual(r.movimientos.length, 0, 'cero movimientos: nunca estuvo en el libro');
    esCierto((r.cerrada.cierreNota ?? '').includes('agosto'), 'el porqué queda escrito');
});

grupo('lo que no se puede resolver, se dice', () => {
    esCierto('error' in resolverAsignacion(asig(), { tipo: 'prestamo', itemId: '', personnelId: 'carlos' }, op),
        'para entrar al libro hace falta el ítem');
    esCierto('error' in resolverAsignacion(asig(), { tipo: 'prestamo', itemId: 'x', personnelId: '' }, op),
        'para confirmar el préstamo hace falta quién');
    esCierto('error' in resolverAsignacion(asig({ cerradaEn: AHORA }), { tipo: 'bodega', itemId: 'x' }, op),
        'una ya cerrada no se vuelve a cerrar');
});

grupo('lo afuera sin confirmar se cuenta aparte, y solo lo abierto', () => {
    const m = afueraSinConfirmar([
        asig({ itemId: 'pulidora', cantidad: 3 }),
        asig({ id: 'a2', itemId: 'pulidora', cantidad: 2, cerradaEn: AHORA }),
        asig({ id: 'a3', cantidad: 4 }),
    ]);
    igual(m.get('pulidora'), 3, 'la cerrada no cuenta');
    igual(m.size, 1, 'la que no tiene ítem no se le carga a ninguno');
});

await cerrar();
