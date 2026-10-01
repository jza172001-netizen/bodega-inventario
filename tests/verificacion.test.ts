/**
 * tests/verificacion.test.ts — El formato del bloque y lo que la app revisa
 * ========================================================================
 * El lector de encabezados `@ obra · hora · lugar`, la marca «(cuadrilla de X)»,
 * mover un elemento a otra persona, y las alertas de `core/verificacion.ts`.
 * Lo que la pantalla hace con esto lo cubre `tests/pantalla.test.ts`.
 */
import { InventoryType, Item, Movement, MovementType, Personnel, Project } from '../types';
import { leerLote, leerHora, partirPersona, moverItem } from '../utils/lote';
import { verificarLote, Contexto } from '../core/verificacion';
import { igual, esCierto, grupo, cerrar } from './correr';

const P: Personnel[] = [{ id: 'alex', name: 'Alex Ferreira', isTeamLeader: true }, { id: 'juan', name: 'Juan Puerta', teamLeaderId: 'alex' }];
const O: Project[] = [{ id: 'cristo', name: 'El Cristo', status: 'active' }, { id: 'bonilla', name: 'Bonilla', status: 'active' }] as Project[];
const it = (id: string, name: string, quantity: number, t = InventoryType.HAND_TOOL): Item =>
    ({ id, name, quantity, inventoryType: t, category: 'x', subCategory: '', minStock: 0, unit: 'und' });
const I = [it('pala', 'Pala', 3), it('cemento', 'Cemento', 10, InventoryType.SINGLE_USE), it('guantes', 'Guantes', 10, InventoryType.PPE)];

grupo('un bloque SIN encabezados se lee exactamente como antes', () => {
    const r = leerLote('Alex: 3 palas\nJuan: 1 cemento', P, I, O);
    igual(r.lineas.map(l => [l.persona?.id, l.encabezado, l.obraId]), [['alex', undefined, undefined], ['juan', undefined, undefined]],
        'sin encabezado ni obra decidida');
});

grupo('los encabezados reparten obra, hora y lugar hacia abajo', () => {
    const r = leerLote('@ El Cristo · 7:30 am · contenedor\nAlex: 1 pala\nJuan: 1 pala\n@ Bonilla | 14h05\nJuan: 1 cemento\n@ sin obra\nAlex: 1 pala', P, I, O);
    igual(r.lineas.map(l => l.obraId), ['cristo', 'cristo', 'bonilla', null], 'obra por grupo; «sin obra» es una decisión (null)');
    igual(r.lineas.map(l => l.encabezado?.hora), ['07:30', '07:30', '14:05', undefined], 'la hora, normalizada');
    igual(r.lineas[0].encabezado?.lugar, 'contenedor', 'el lugar');
    igual(r.ignoradas, [], 'un encabezado no es un renglón ignorado');
});

grupo('una obra que no se reconoce NO se adivina', () => {
    const r = leerLote('@ Salvador Bahía\nAlex: 1 pala', P, I, O);
    igual(r.lineas[0].obraId, undefined, 'queda sin decidir');
    igual(r.lineas[0].encabezado?.obraTexto, 'Salvador Bahía', 'pero se guarda cómo la dijeron, para crearla si se quiere');
});

grupo('una obra que se parece a DOS no se escoge', () => {
    const dos = [...O, { id: 'cristo2', name: 'El Cristo II', status: 'active' }] as Project[];
    const r = leerLote('@ Cristo\nAlex: 1 pala', P, I, dos);
    igual(r.lineas[0].encabezado?.obraDudosa, true, 'queda marcada como dudosa');
    igual(r.lineas[0].obraId, undefined, 'y NO se le asigna ninguna de las dos: se pregunta');
});

grupo('la hora: lo que no es hora no se inventa', () => {
    igual([leerHora('7:30'), leerHora('7:30 pm'), leerHora('12 am'), leerHora('07.05')], ['07:30', '19:30', '00:00', '07:05'], 'formatos dictados');
    igual([leerHora('12'), leerHora('25:00'), leerHora('contenedor')], [undefined, undefined, undefined], 'un número suelto no es hora');
});

grupo('«2 pares de guantes», «3 bultos de cemento»: la unidad dicha no tapa el nombre', () => {
    const r = leerLote('Juan: 2 pares de guantes, 3 bultos de cemento, 1 pala', P, I, O);
    igual(r.lineas[0].items.map(x => [x.cantidad, x.item?.id]), [[2, 'guantes'], [3, 'cemento'], [1, 'pala']], 'se reconocen');
});

grupo('«Juan (cuadrilla de Alex)»', () => {
    igual(partirPersona('Juan (cuadrilla de Alex)'), { nombre: 'Juan', cuadrilla: 'Alex' }, 'nombre y cuadrilla');
    igual(partirPersona('Alex (oficial)'), { nombre: 'Alex', cuadrilla: undefined }, 'otro paréntesis se quita');
    const r = leerLote('Pedro (cuadrilla de Alex): 1 pala', P, I, O);
    igual([r.lineas[0].persona, r.lineas[0].cuadrillaDe?.id], [undefined, 'alex'], 'Pedro no existe; su oficial sí');
});

grupo('mover un elemento a otra persona: ni se pierde ni se duplica', () => {
    const r = leerLote('@ El Cristo · 07:30\nAlex: 1 pala, 1 cemento', P, I, O);
    const cemento = r.lineas[0].items[1];
    const m = moverItem(r, cemento.id, P[1], 'nueva');
    igual(m.lineas.map(l => [l.persona?.id, l.items.map(x => x.nombre)]), [['alex', ['pala']], ['juan', ['cemento']]], 'el cemento pasó a Juan');
    igual([m.lineas[1].obraId, m.lineas[1].encabezado?.hora], ['cristo', '07:30'], 'con la obra y la hora de donde venía');
    const de_vuelta = moverItem(moverItem(m, m.lineas[0].items[0].id, P[1], 'otra'), cemento.id, P[0], 'x');
    igual(de_vuelta.lineas.flatMap(l => l.items).length, 2, 'ida y vuelta: siguen siendo dos cosas');
});

const ctx = (extra: Partial<Contexto> = {}): Contexto => ({
    items: I, movements: [], personnel: P, nuevos: new Map(), obraGeneral: null, faltantes: new Map(),
    fecha: '2026-09-12', nombreDe: id => P.find(p => p.id === id)?.name ?? '?', ...extra,
});
const tipos = (m: Map<string, Array<{ tipo: string }>>, id: string) => (m.get(id) ?? []).map(a => a.tipo);

grupo('las alertas de la app contra la BODEGA', () => {
    const r = leerLote('Juan: 1 pala, 1 pala\nJuan: 2 cemento', P, I, O);
    const v = verificarLote(r, ctx());
    igual(tipos(v.porItem, r.lineas[0].items[0].id), ['duplicado'], 'la misma cosa dos veces a la misma persona');
    igual(tipos(v.porLinea, r.lineas[1].id), ['obra_obligatoria'], 'cemento «sin proyecto»: no se puede');

    const hoy: Movement = { id: 'h', itemId: 'pala', type: MovementType.CHECK_OUT, quantity: 1, timestamp: new Date('2026-09-12T15:00:00Z'), personnelId: 'juan' };
    const r2 = leerLote('Juan: 1 pala', P, I, O);
    igual(tipos(verificarLote(r2, ctx({ movements: [hoy] })).porItem, r2.lineas[0].items[0].id), ['duplicado'], 'ya le salió hoy');

    const r3 = leerLote('Alex: 1 pala', P, I, O);
    igual(tipos(verificarLote(r3, ctx()).porLinea, r3.lineas[0].id), ['oficial'], 'oficial: ¿para quién?');
    igual(tipos(verificarLote(r3, ctx({ obraGeneral: undefined })).porLinea, r3.lineas[0].id), ['oficial', 'obra'], 'y la obra, si nadie la contestó');

    const r4 = leerLote('Juan: 3 palas', P, I, O);
    igual(tipos(verificarLote(r4, ctx({ faltantes: new Map([['pala', 2]]) })).porItem, r4.lineas[0].items[0].id), ['falta_stock'], 'falta stock');
    // LA REGLA DEL CHAT (decisión de Juli, 1-oct): la obra solo es obligatoria
    // para el material de consumo. Unos guantes salen «sin proyecto».
    const epp = leerLote('Juan: 1 guantes', P, I, O);
    igual(tipos(verificarLote(epp, ctx()).porLinea, epp.lineas[0].id), [], 'EPP sin proyecto: pasa, como en el chat');
    const sinNada = leerLote('Juan: 1 pala', P, I, O);
    esCierto(!verificarLote(sinNada, ctx()).porItem.has(sinNada.lineas[0].items[0].id), 'lo normal no levanta nada');
});

await cerrar();
