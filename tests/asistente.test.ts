/**
 * tests/asistente.test.ts — Lo que el asistente pregunta y registra
 * =================================================================
 * Las reglas del prompt de Juli (8-sep), fijadas contra el código que se
 * despliega: `core/consultas.ts`, `core/registro.ts` y `api/_comun.ts`.
 *
 *  · Actual, histórico y devuelto son tres preguntas distintas (punto 16).
 *  · Una posible asignación se dice «→ verificar», nunca «la tiene».
 *  · Lo que no se sabe sale «No especificado»; no se rellena (punto 6).
 *  · Si hay dos lecturas, se pregunta: no se escoge una por la residente.
 *  · El movimiento va primero; si falla, no se escribe nada más.
 */
import { Asignacion, InventoryType, Item, Movement, MovementType, Personnel, Project } from '../types';
import { consultar, Bodega } from '../core/consultas';
import { planearRegistro, PlanRegistro, leerEstado } from '../core/registro';
import { aplicarPlan, generadorDeIds, Cliente } from '../api/_comun';
import { NO_ESPECIFICADO } from '../core/custodia';
import { igual, esCierto, grupo, cerrar } from './correr';

const AHORA = new Date('2026-09-28T15:00:00Z');                 // 10:00 en Bogotá
const it = (id: string, name: string, quantity = 0, extra: Partial<Item> = {}): Item => ({
    id, name, quantity, inventoryType: InventoryType.ELECTRICAL_TOOL,
    category: 'x', subCategory: '', minStock: 0, unit: 'und', ...extra,
});
const PER: Personnel[] = [{ id: 'abel', name: 'Abel' }, { id: 'jesus', name: 'Jesús Vázquez' }, { id: 'carlos', name: 'Carlos Torrealba' }];
const OBRAS: Project[] = [{ id: 'cristo', name: 'El Cristo', status: 'active' }, { id: 'bonilla', name: 'Bonilla', status: 'active' }];
const prestamo = (id: string, itemId: string, personnelId: string, quantity = 1, extra: Partial<Movement> = {}): Movement => ({
    id, itemId, personnelId, quantity, type: MovementType.CHECK_OUT, isLoan: true, isReturned: false,
    timestamp: new Date('2026-09-10T13:00:00Z'), projectId: 'cristo', ...extra,
});

const bodega = (b: Partial<Bodega> = {}): Bodega => ({
    items: [it('mak', 'Pulidora Grande (Azul · Makita)', 0, { brand: 'Makita', color: 'Azul' }),
            it('dw', 'Pulidora Grande (Amarillo · Dwalt)', 1),
            it('laser', 'Nivel laser (Amarillo · Dwalt)', 3)],
    movements: [], personnel: PER, projects: OBRAS, asignaciones: [], ...b,
});

let n = 0;
const op = () => ({ ahora: AHORA, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, porQuien: 'Asistente' });

// ── Consultas ────────────────────────────────────────────────────────

grupo('«¿qué tiene Abel?» — HOY, y lo posible dicho como posible', () => {
    const asig: Asignacion = { id: 'a', descripcion: 'Nivel láser Total', cantidad: 1, estado: 'posible', posibleResponsable: 'Abel',
        condicion: 'no_especificado', desdeDesconocido: true, createdAt: AHORA };
    const r = consultar(bodega({ movements: [prestamo('p1', 'mak', 'abel')], asignaciones: [asig] }), { pregunta: 'que_tiene', persona: 'abel' }, AHORA);
    esCierto(r.texto.includes('1 × Pulidora Grande (Azul · Makita)'), 'lo que tiene hoy');
    esCierto(r.texto.includes('posible asignación: Abel → verificar'), 'lo posible, con la frase de Juli');
    esCierto(!/tiene hoy:[^]*Nivel láser/.test(r.texto.split('Sin confirmar')[0]), 'el láser NO aparece como que lo tiene');
});

grupo('actual, histórico y devuelto son tres preguntas distintas', () => {
    const p1 = prestamo('p1', 'mak', 'abel', 1, { isReturned: true, returnedAt: new Date('2026-09-20T14:00:00Z') });
    const p2 = prestamo('p2', 'dw', 'abel', 1);
    const dev: Movement = { id: 'd2', itemId: 'dw', type: MovementType.CHECK_IN, quantity: 1, timestamp: AHORA, devuelveA: 'p2', returnCondition: 'worn', returnedAt: AHORA };
    const p3 = prestamo('p3', 'laser', 'abel', 1, { isReturned: true });
    const tr: Movement = { id: 't', itemId: 'laser', type: MovementType.CHECK_IN, quantity: 1, timestamp: AHORA, devuelveA: 'p3', esTraslado: true };
    const p4 = prestamo('p4', 'laser', 'carlos', 1, { vieneDe: 'p3', esTraslado: true });
    const b = bodega({ movements: [p1, p2, dev, p3, tr, p4] });

    igual((consultar(b, { pregunta: 'que_tiene', persona: 'Abel' }, AHORA).datos as { hoy: unknown[] }).hoy.length, 0, 'hoy: nada');
    const tenia = consultar(b, { pregunta: 'que_tenia', persona: 'Abel' }, AHORA);
    esCierto(tenia.texto.includes('pasó a Carlos Torrealba'), 'lo que tenía dice a quién pasó');
    igual((tenia.datos as { cerrados: unknown[] }).cerrados.length, 3, 'tres préstamos cerrados');
    const devolvio = consultar(b, { pregunta: 'que_devolvio', persona: 'Abel' }, AHORA);
    const dv = (devolvio.datos as { devoluciones: Array<{ elemento: string }> }).devoluciones;
    igual(dv.length, 2, 'devolvió dos: una nueva y una del camino viejo');
    esCierto(!dv.some(d => d.elemento.includes('Nivel')), 'el traslado NO cuenta como devolución');
    esCierto(devolvio.texto.includes('Desgaste normal') || devolvio.texto.includes('worn'), 'con su estado');
});

grupo('«¿dónde están las pulidoras?» contesta por TODAS, no por una', () => {
    const r = consultar(bodega({ movements: [prestamo('p1', 'mak', 'abel')] }), { pregunta: 'donde_esta', elemento: 'pulidoras' }, AHORA);
    esCierto(r.texto.includes('Makita') && r.texto.includes('Dwalt'), 'las dos');
    esCierto(r.texto.includes('1 con Abel'), 'la prestada, con quién');
    esCierto(r.texto.includes('1 en bodega'), 'la de la bodega');
});

grupo('lo que no se sabe sale «No especificado», no inventado', () => {
    const r = consultar(bodega({ movements: [prestamo('p1', 'mak', 'abel', 1, { projectId: undefined })] }),
        { pregunta: 'que_tiene', persona: 'Abel' }, AHORA);
    esCierto(r.texto.includes(`obra: ${NO_ESPECIFICADO}`), 'sin obra: No especificado');
});

grupo('«¿qué pasó hoy?» cuenta el día de Bogotá, no el de Londres', () => {
    // 23:30 en Bogotá del 27 es 04:30 UTC del 28: es del 27.
    const tarde: Movement = prestamo('p1', 'mak', 'abel', 1, { timestamp: new Date('2026-09-28T04:30:00Z') });
    const b = bodega({ movements: [tarde] });
    igual((consultar(b, { pregunta: 'que_paso', fecha: '2026-09-27' }, AHORA).datos as { salieron: unknown[] }).salieron.length, 1, 'es del 27');
    igual((consultar(b, { pregunta: 'que_paso' }, AHORA).datos as { salieron: unknown[] }).salieron.length, 0, 'no del 28');
});

grupo('por ubicar y en obra', () => {
    const asigs: Asignacion[] = [
        { id: 'a', descripcion: 'Pulidoras pequeñas', cantidad: 7, estado: 'posible', condicion: 'no_especificado', desdeDesconocido: true, createdAt: AHORA },
        { id: 'b', descripcion: 'Tronzadora', cantidad: 1, estado: 'pendiente_verificar', condicion: 'mala', desdeDesconocido: true, createdAt: AHORA },
        { id: 'c', descripcion: 'Mezcladora', cantidad: 1, estado: 'confirmada', projectId: 'cristo', condicion: 'buena', desdeDesconocido: true, createdAt: AHORA },
    ];
    const b = bodega({ asignaciones: asigs, movements: [prestamo('p1', 'mak', 'abel')] });
    igual((consultar(b, { pregunta: 'por_ubicar' }, AHORA).datos as { unidades: number }).unidades, 8, '7 + 1: la confirmada no está por ubicar');
    const obra = consultar(b, { pregunta: 'que_hay_en_obra', obra: 'el cristo' }, AHORA);
    esCierto(obra.texto.includes('Makita') && obra.texto.includes('Mezcladora'), 'lo prestado y lo confirmado allá');
    esCierto(consultar(b, { pregunta: 'que_esta_malo' }, AHORA).texto.includes('Tronzadora'), 'lo que está malo');
});

// ── Registros ────────────────────────────────────────────────────────

const plan = (r: ReturnType<typeof planearRegistro>): PlanRegistro => {
    if ('error' in r) throw new Error(`se esperaba un plan: ${r.error}`);
    return r;
};

grupo('devolución parcial: 3 afuera, vuelve 1', () => {
    const b = bodega({ movements: [prestamo('p1', 'mak', 'abel', 3)] });
    const r = plan(planearRegistro(b, { operacion: 'devolucion', persona: 'Abel', elemento: 'pulidora makita', cantidad: 1, estado: 'bueno' }, op()));
    igual(r.movimientos.map(m => [m.type, m.quantity, m.devuelveA]), [[MovementType.CHECK_IN, 1, 'p1']], 'una entrada de 1, enlazada');
    igual(r.cerrarPrestamos.length, 0, 'el préstamo NO se cierra: quedan 2');
    esCierto(r.resumen.includes('le quedan 2'), 'y se dice');
    igual(r.movimientos[0].returnCondition, 'good', 'estado: bueno');
});

grupo('la ficha trae los quince campos, y lo no dicho sale «No especificado»', () => {
    const b = bodega({ movements: [prestamo('p1', 'mak', 'abel', 1, { projectId: undefined })] });
    const r = plan(planearRegistro(b, { operacion: 'devolucion', persona: 'Abel', elemento: 'pulidora makita' }, op()));
    const f = r.fichas[0];
    igual(Object.keys(f).length, 15, 'quince campos');
    igual(f.quienEntrega, NO_ESPECIFICADO, 'quién la trajo no se supone');
    igual(f.estado, NO_ESPECIFICADO, 'sin estado dicho, no hay estado');
    igual(f.observacion, NO_ESPECIFICADO, 'sin observación');
    igual(f.origen, NO_ESPECIFICADO, 'sin obra');
    igual(f.marca, 'Makita', 'lo que SÍ se sabe, sale');
    igual(r.movimientos[0].returnCondition, undefined, 'y en la fila tampoco se rellena nada');
    igual(r.movimientos[0].entregadoPor, undefined, 'ni quién entregó');
});

grupo('dos lecturas: se pregunta, no se escoge', () => {
    const b = bodega({ movements: [prestamo('p1', 'mak', 'abel'), prestamo('p2', 'dw', 'abel')] });
    const r = planearRegistro(b, { operacion: 'devolucion', persona: 'Abel', elemento: 'pulidora', cantidad: 1 }, op());
    esCierto('error' in r, 'no registra');
    esCierto('error' in r && (r.dudas ?? []).length === 2, 'y devuelve las dos opciones');
    const todas = planearRegistro(b, { operacion: 'devolucion', persona: 'Abel', elemento: 'pulidora' }, op());
    esCierto(!('error' in todas) && todas.movimientos.length === 2, 'si vuelven TODAS, no hay duda que resolver');
});

grupo('no se devuelve más de lo que salió', () => {
    const b = bodega({ movements: [prestamo('p1', 'mak', 'abel', 1)] });
    esCierto('error' in planearRegistro(b, { operacion: 'devolucion', persona: 'Abel', elemento: 'pulidora makita', cantidad: 2 }, op()), 'rechazado');
    esCierto('error' in planearRegistro(b, { operacion: 'devolucion', persona: 'Carlos', elemento: 'pulidora makita' }, op()), 'Carlos no la tiene');
});

grupo('devolver MALA abre la reparación', () => {
    const b = bodega({ movements: [prestamo('p1', 'mak', 'abel')] });
    const r = plan(planearRegistro(b, { operacion: 'devolucion', persona: 'Abel', elemento: 'pulidora makita', estado: 'dañada', observacion: 'no prende' }, op()));
    igual(r.reparaciones.map(x => x.itemId), ['mak'], 'la Makita a reparación');
    igual(leerEstado('le falta el disco'), 'incomplete', 'incompleta');
    igual(leerEstado('más o menos'), undefined, 'lo que no se reconoce, no se adivina');
});

grupo('traslado «de Bonilla para El Cristo», con responsable anterior', () => {
    const b = bodega({ movements: [prestamo('p1', 'mak', 'abel', 1, { projectId: 'bonilla' })] });
    const r = plan(planearRegistro(b, { operacion: 'traslado', elemento: 'pulidora makita', aPersona: 'Carlos', aObra: 'El Cristo', entregadoPor: 'Kate' }, op()));
    igual(r.movimientos.map(m => m.type), [MovementType.CHECK_IN, MovementType.CHECK_OUT], 'salda y abre');
    igual(r.movimientos[1].vieneDe, 'p1', 'el nuevo viene del de Abel');
    igual(r.fichas[0].responsableAnterior, 'Abel', 'responsable anterior: Abel');
    igual(r.fichas[0].responsableNuevo, 'Carlos Torrealba', 'nuevo: Carlos');
    igual(r.fichas[0].origen, 'Bonilla', 'de Bonilla');
    igual(r.fichas[0].destino, 'El Cristo', 'a El Cristo');
    igual(r.fichas[0].quienEntrega, 'Kate', 'entregó Kate');
    igual(r.cerrarPrestamos.map(c => c.id), ['p1'], 'el de Abel se cierra');
});

grupo('hallazgo: «encontré el láser Total en Salvador Bahía»', () => {
    const asig: Asignacion = { id: 'a', descripcion: 'Nivel láser Total', cantidad: 1, estado: 'posible', posibleResponsable: 'Jesús',
        condicion: 'no_especificado', desdeDesconocido: true, procedencia: 'Apéndice B.5', createdAt: AHORA };
    const b = bodega({ asignaciones: [asig] });
    const r = plan(planearRegistro(b, { operacion: 'hallazgo', elemento: 'láser Total', lugar: 'Salvador Bahía' }, op()));
    igual(r.movimientos.length, 0, 'no entra al libro');
    igual(r.asignaciones.map(a => a.cierreMotivo ?? a.estado), ['hallada_obra', 'confirmada'], 'se cierra la vieja y nace una confirmada');
    // Con persona hace falta el ÍTEM para entrar al libro. Si el inventario no
    // tiene un láser Total, NO se mete en el láser DeWalt: se pregunta.
    const sinItem = planearRegistro(b, { operacion: 'hallazgo', elemento: 'láser Total', persona: 'Jesús' }, op());
    esCierto('error' in sinItem, 'sin ítem que calce, pregunta cuál es en vez de escoger el DeWalt');
    const conItem = bodega({ asignaciones: [asig], items: [...bodega().items, it('total', 'Nivel láser Total')] });
    const conJesus = plan(planearRegistro(conItem, { operacion: 'hallazgo', elemento: 'láser Total', persona: 'Jesús' }, op()));
    igual(conJesus.movimientos.map(m => m.type), [MovementType.CHECK_IN, MovementType.CHECK_OUT], 'con ítem y persona: hallazgo + préstamo');
    igual(conJesus.movimientos[1].personnelId, 'jesus', 'a Jesús, porque ALGUIEN lo confirmó');
    esCierto('error' in planearRegistro(b, { operacion: 'hallazgo', elemento: 'compresor', enBodega: true }, op()),
        'lo que no está pendiente no se «halla»');
});

grupo('daño cambia el estado, no borra; pedido va a la lista', () => {
    const r = plan(planearRegistro(bodega(), { operacion: 'dano', elemento: 'nivel laser', observacion: 'se cayó' }, op()));
    igual(r.reparaciones[0].reparacion.estado, 'dañada', 'dañada');
    igual(r.movimientos.length, 0, 'sin movimiento: sigue en el inventario');
    const p = plan(planearRegistro(bodega(), { operacion: 'pedido', texto: 'lechada gris', cantidad: 3, unidad: 'bultos' }, op()));
    igual(p.pedidos[0].texto, 'lechada gris', 'anotado');
    esCierto('error' in planearRegistro(bodega(), { operacion: 'pedido', texto: '  ' }, op()), 'vacío no');
});

// ── El orden de las escrituras ───────────────────────────────────────

const falso = (falla: string[] = []) => {
    const orden: string[] = [];
    const resultado = (que: string) => ({ error: falla.includes(que) ? { message: `falló ${que}` } : null });
    const cadena = (que: string) => {
        const c: Record<string, unknown> = {};
        const fin = () => Promise.resolve(resultado(que));
        c.eq = () => Object.assign(fin(), c);
        return c;
    };
    const sb: Cliente = {
        rpc: (fn) => { orden.push(`rpc:${fn}`); return Promise.resolve(resultado('rpc')); },
        from: (t: string) => ({
            update: () => { orden.push(`update:${t}`); return cadena(`update:${t}`); },
            upsert: () => { orden.push(`upsert:${t}`); return Promise.resolve(resultado(`upsert:${t}`)); },
            insert: () => { orden.push(`insert:${t}`); return Promise.resolve(resultado(`insert:${t}`)); },
        }),
    };
    return { sb, orden };
};

grupo('el movimiento va PRIMERO, y si falla no se escribe nada más', async () => {
    const b = bodega({ movements: [prestamo('p1', 'mak', 'abel')] });
    const p = plan(planearRegistro(b, { operacion: 'devolucion', persona: 'Abel', elemento: 'pulidora makita', estado: 'malo' }, op()));

    const bien = falso();
    const r = await aplicarPlan(bien.sb, p, { operacionId: 'x', accion: 'LOAN_RETURNED', actor: 'Asistente' });
    igual(r.ok, true, 'se aplicó');
    igual(bien.orden, ['rpc:log_movements_and_update_stock', 'update:movements', 'update:items', 'upsert:audit_logs'],
        'lote → cerrar préstamo → reparación → bitácora');

    const mal = falso(['rpc']);
    const r2 = await aplicarPlan(mal.sb, p, { operacionId: 'x', accion: 'LOAN_RETURNED', actor: 'Asistente' });
    igual(r2.ok, false, 'falló');
    igual(mal.orden, ['rpc:log_movements_and_update_stock'], 'NADA después del lote fallido: ni cierre, ni reparación, ni bitácora');
});

grupo('los identificadores se repiten en el reintento', () => {
    const a = generadorDeIds('op-1'); const b = generadorDeIds('op-1'); const c = generadorDeIds('op-2');
    const sa = [a(), a()]; const sb = [b(), b()];
    igual(sa, sb, 'mismo operacionId, misma secuencia');
    esCierto(sa[0] !== c(), 'otro operacionId, otra');
});

await cerrar();
