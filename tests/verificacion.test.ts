/**
 * tests/verificacion.test.ts — El formato del bloque y lo que la app revisa
 * ========================================================================
 * El lector de encabezados `@ obra · hora · lugar`, la marca «(cuadrilla de X)»,
 * mover un elemento a otra persona, y las alertas de `core/verificacion.ts`.
 * Lo que la pantalla hace con esto lo cubre `tests/pantalla.test.ts`.
 */
import { InventoryType, Item, Movement, MovementType, Personnel, Project } from '../types';
import { leerLote, leerHora, partirPersona, moverItem, medidaDicha, leerCategoria } from '../utils/lote';
import { nombreDelDicho } from '../core/crearItem';
import { verificarLote, listoParaRegistrar, resumenDeLinea, huellaDeLinea, Contexto } from '../core/verificacion';
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
    const v4 = verificarLote(r4, ctx({ faltantes: new Map([['pala', 2]]) }));
    igual(tipos(v4.porItem, r4.lineas[0].items[0].id), ['falta_stock'], 'falta stock');
    // Lo normal en esta bodega: no hay existencia, entra y sale. Se AVISA y no
    // frena — ya se consintió con «Lo que no haya, cargalo».
    esCierto(listoParaRegistrar(r4.lineas[0], r4.lineas[0].items[0].id, v4, new Set()), 'falta stock no exige un toque por elemento');
    // LA REGLA DEL CHAT (decisión de Juli, 1-oct): la obra solo es obligatoria
    // para el material de consumo. Unos guantes salen «sin proyecto».
    const epp = leerLote('Juan: 1 guantes', P, I, O);
    igual(tipos(verificarLote(epp, ctx()).porLinea, epp.lineas[0].id), [], 'EPP sin proyecto: pasa, como en el chat');
    const sinNada = leerLote('Juan: 1 pala', P, I, O);
    esCierto(!verificarLote(sinNada, ctx()).porItem.has(sinNada.lineas[0].items[0].id), 'lo normal no levanta nada');
});

// ── El bloque nuevo (5-oct): `=== ENTREGA ===`, uno por trabajador ────────
// Juli lo pidió para que lo lean igual él, el asistente y la app. Tiene que
// dar EXACTAMENTE lo que da el formato viejo: el resto de la app no cambia.
const resumenDe = (r: ReturnType<typeof leerLote>) => r.lineas.map(l => ({
    persona: l.persona?.id, cuadrilla: l.cuadrillaDe?.id, obra: l.obraId,
    hora: l.encabezado?.hora, lugar: l.encabezado?.lugar,
    items: l.items.map(x => [x.cantidad, x.item?.id ?? x.nombre]),
}));

grupo('el bloque NUEVO se lee igual que el viejo', () => {
    const viejo = '@ El Cristo · 07:30 · contenedor\nAlex: 3 palas, 2 cemento\nJuan (cuadrilla de Alex): 2 pares de guantes\n@ sin obra\nJuan: 1 pala';
    const nuevo = [
        '=== ENTREGA ===', 'TRABAJADOR: Alex', 'PROYECTO: El Cristo', 'HORA: 07:30', 'LUGAR: contenedor', '',
        '[HERRAMIENTAS MANUALES]', '- 3 palas', '[CONSUMIBLES]', '- 2 cemento', '=== FIN ===', '',
        '=== ENTREGA ===', 'TRABAJADOR: Juan (cuadrilla de Alex)', 'PROYECTO: El Cristo', 'HORA: 07:30', 'LUGAR: contenedor',
        '[EPP]', '- 2 pares de guantes', '=== FIN ===',
        '=== ENTREGA ===', 'TRABAJADOR: Juan', 'PROYECTO: SIN PROYECTO', '[HERRAMIENTAS MANUALES]', '- 1 pala', '=== FIN ===',
    ].join('\n');
    const a = leerLote(viejo, P, I, O), b = leerLote(nuevo, P, I, O);
    igual(resumenDe(b), resumenDe(a), 'persona, cuadrilla, obra, hora, lugar, cantidades e ítems: lo mismo');
    igual([a.ignoradas, b.ignoradas], [[], []], 'y nada se queda sin leer');
});

grupo('«PROYECTO: CRISTO» NUNCA es un trabajador', () => {
    // Con el lector viejo, cada campo era «persona: cosas»: un trabajador
    // llamado «PROYECTO» que se llevaba «CRISTO».
    const r = leerLote('=== ENTREGA ===\nPROYECTO: El Cristo\nHORA: 08:00\nLUGAR: patio\nTRABAJADOR: Juan\n- 1 pala\n=== FIN ===', P, I, O);
    igual(r.lineas.map(l => l.personaTexto), ['Juan'], 'una sola línea, la de Juan (los campos van en cualquier orden)');
    igual([r.lineas[0].obraId, r.lineas[0].encabezado?.hora, r.lineas[0].encabezado?.lugar], ['cristo', '08:00', 'patio'], 'con su obra, hora y lugar');
    const sinFin = leerLote('=== ENTREGA ===\nTRABAJADOR: Juan\n- 1 pala', P, I, O);
    igual(sinFin.lineas.length, 1, 'sin «=== FIN ===» al final, también cuenta');
    const pegadas = leerLote('=== ENTREGA ===\nTRABAJADOR: Juan\n- 1 pala\n=== ENTREGA ===\nTRABAJADOR: Alex\n- 2 cemento', P, I, O);
    igual(pegadas.lineas.map(l => [l.persona?.id, l.items.length]), [['juan', 1], ['alex', 1]], 'dos entregas sin «FIN» entre ellas: las dos');
    const sin = leerLote('=== ENTREGA ===\nTRABAJADOR: Juan\nPROYECTO: SIN PROYECTO\n- 1 pala\n=== ENTREGA ===\nTRABAJADOR: Juan\n- 1 pala', P, I, O);
    igual(sin.lineas.map(l => l.obraId), [null, undefined], '«SIN PROYECTO» es una decisión (null); sin el campo, se pregunta');
});

grupo('las categorías: singular, plural, corchetes, emoji, barras', () => {
    igual(['[CONSUMIBLES]', '🟢 CONSUMIBLE', 'Material de consumo', 'CATEGORIA: CONSUMIBLE'].map(leerCategoria),
        Array(4).fill(InventoryType.SINGLE_USE), 'consumible');
    igual(['[HERRAMIENTAS MANUALES]', '🔧 Herramienta manual', 'MANUALES', '[CATEGORIA: HERRAMIENTA_MANUAL]'].map(leerCategoria),
        Array(4).fill(InventoryType.HAND_TOOL), 'manual');
    igual(['[HERRAMIENTAS ELÉCTRICAS]', '⚡ Herramienta eléctrica', 'ELECTRICAS'].map(leerCategoria), Array(3).fill(InventoryType.ELECTRICAL_TOOL), 'eléctrica');
    igual(['[EPP]', '🦺 EPP', 'Elementos de protección personal'].map(leerCategoria), Array(3).fill(InventoryType.PPE), 'EPP');
    igual(['- 2 Soudal', 'Pala', '[OTROS]'].map(leerCategoria), [undefined, undefined, undefined], 'un elemento no es categoría');
    const r = leerLote('=== ENTREGA ===\n👷 TRABAJADOR: Juan\n[EPP]\n2 | guantes\n• 1 casco\n🔧 HERRAMIENTAS MANUALES\n* 1 pala\n=== FIN ===', P, I, O);
    igual(r.lineas[0].items.map(x => [x.cantidad, x.nombre, x.categoria]),
        [[2, 'guantes', InventoryType.PPE], [1, 'casco', InventoryType.PPE], [1, 'pala', InventoryType.HAND_TOOL]],
        'cada elemento con la categoría de arriba; «2 | guantes» y viñetas sirven');
});

grupo('lo que no se entiende en una entrega NO se bota', () => {
    const r = leerLote('=== ENTREGA ===\nPROYECTO: El Cristo\n- 1 pala\n=== FIN ===\n=== ENTREGA ===\nTRABAJADOR: Juan\n=== FIN ===', P, I, O);
    igual(r.lineas.length, 0, 'sin trabajador o sin elementos no hay línea');
    igual(r.ignoradas.length, 2, 'pero las dos quedan a la vista como no leídas');
});

grupo('la mañana del 3-oct: «lija 180» no es pulgadas, «10 kg lechada» se encuentra', () => {
    igual(medidaDicha('lija 180'), { base: 'lija', medida: '180' }, 'el grano no es pulgada');
    igual([medidaDicha('codos de 4')?.medida, medidaDicha('Brocha 2"')?.medida, medidaDicha('broca 3 pulgadas')?.medida], ['4"', '2"', '3"'],
        'la tubería y lo que se DIJO en pulgadas, sí');
    const L = [it('l240', 'Lija 240', 5, InventoryType.SINGLE_USE), it('l150', 'Lijas 150', 5, InventoryType.SINGLE_USE),
        it('lech', 'Lechada veige [Kg]', 20, InventoryType.SINGLE_USE)];
    const r = leerLote('Juan: 5 lija 180, 10 kg lechada veige', P, L, O);
    igual(r.lineas[0].items.map(x => [x.cantidad, x.item?.id]), [[5, undefined], [10, 'lech']],
        'la 180 no se cambia por la 240; la lechada aparece con el «kg» delante');
    igual([nombreDelDicho('lija 180'), nombreDelDicho('kg lechada gris'), nombreDelDicho('codos de 5')], ['Lija 180', 'Lechada gris', 'Codos 5"'],
        'y lo que nace se llama bien');
});

grupo('la categoría del bloque contra la de la BODEGA: la bodega manda y se avisa', () => {
    const r = leerLote('=== ENTREGA ===\nTRABAJADOR: Juan\nPROYECTO: El Cristo\n[CONSUMIBLES]\n- 1 pala\n- 2 cemento\n=== FIN ===', P, I, O);
    const v = verificarLote(r, ctx());
    const [pala, cemento] = r.lineas[0].items;
    igual(v.porItem.get(pala.id)?.map(a => [a.tipo, a.nivel]), [['categoria', 'mirar']], 'la pala es herramienta: se avisa, no se frena');
    esCierto(/sale como Préstamo/.test(v.porItem.get(pala.id)?.[0].texto ?? ''), 'y se dice cómo sale');
    igual(v.porItem.get(cemento.id), undefined, 'si coincide, nada');
    const disco = leerLote('=== ENTREGA ===\nTRABAJADOR: Juan\nPROYECTO: El Cristo\n[CONSUMIBLES]\n- 1 disco diamante\n=== FIN ===', P,
        [it('disco', 'Disco diamante', 4, InventoryType.ACCESSORY)], O);
    igual(verificarLote(disco, ctx({ items: [it('disco', 'Disco diamante', 4, InventoryType.ACCESSORY)] })).porItem.get(disco.lineas[0].items[0].id), undefined,
        'un disco (Accesorio) dicho como consumible no es una contradicción');
    const res = resumenDeLinea(r.lineas[0], v, new Map(), x => !!x.item);
    igual(res.sale.map(x => [x.nombre, x.prestamo, x.tipo]), [['Pala', true, InventoryType.HAND_TOOL], ['Cemento', false, InventoryType.SINGLE_USE]],
        'en el resumen sale con el tipo de la bodega');
});

// ── Primero el accesorio, después la pulgada ─────────────────────────────
// Los nombres de tubería que hay en producción (1-oct), tal cual.
const TUB = ['Codos 2"', 'Codos 4"', 'Codos 6"', 'Codos 1/2"', 'Codos 4"-2"', 'Semicodos 6"', 'Y 2"', 'Y 4"', 'Unión 2"', 'Galón 3 en 1', 'Pulidora grande', 'Pulidora pequeña']
    .map((n, k) => it(`t${k}`, n, 5, n.startsWith('Pulidora') ? InventoryType.ELECTRICAL_TOOL : InventoryType.SINGLE_USE));
const elegido = (texto: string) => leerLote(`Juan: ${texto}`, P, TUB, O).lineas[0].items.map(x => [x.item?.name, x.dudoso]);

grupo('la medida DICHA lleva al ítem de esa medida', () => {
    igual(elegido('2 codos de 4'), [['Codos 4"', false]], '«codos de 4» (antes: nada)');
    igual(elegido('1 codo de media'), [['Codos 1/2"', false]], '«de media» es 1/2"');
    igual(elegido('1 unión 2 pulgadas'), [['Unión 2"', false]], '«2 pulgadas»');
    igual(elegido('1 galón 3 en 1'), [['Galón 3 en 1', false]], 'un número que NO es medida no estorba');
    igual(medidaDicha('tubo de tres cuartos'), { base: 'tubo', medida: '3/4"' }, 'tres cuartos');
    igual(medidaDicha('3 palas'), null, 'sin medida, nada');
    // Codos de 5" no hay: NO se elige el de 4" ni el de 6" por parecido.
    esCierto(leerLote('Juan: 2 codos de 5', P, TUB, O).lineas[0].items[0].dudoso, 'una medida que no existe queda por decidir');
    // El caso traicionero: UN solo ítem parecido, de otra medida. Es «claro»
    // para el buscador, y aun así no es lo que pidieron.
    const unaTee = [it('tee6', 'Tee 6"', 5, InventoryType.SINGLE_USE)];
    esCierto(leerLote('Juan: 1 tee de 4', P, unaTee, O).lineas[0].items[0].dudoso, 'la única tee es de 6": pedir de 4 NO la elige');
    // Y el revés: el número no es medida y el nombre completo es inequívoco.
    const galones = [it('g31', 'Galón 3 en 1', 5), it('gp', 'Galón pintura', 5)];
    igual(leerLote('Juan: 1 galón 3 en 1', P, galones, O).lineas[0].items.map(x => [x.item?.name, x.dudoso]), [['Galón 3 en 1', false]],
        'con otro galón al lado, «3 en 1» sigue siendo ese');
});

grupo('«Y» es un accesorio, no siempre la conjunción', () => {
    igual(elegido('2 Y de 2'), [['Y 2"', false]], '«2 Y de 2» es una pieza');
    igual(elegido('2 codos de 2 y 1 Y de 4').map(x => x[0]), ['Codos 2"', 'Y 4"'], 'la «y» del medio sí separa');
});

grupo('lo DUDOSO se decide, no se registra con el primero que salió', () => {
    const tub = ctx({ items: TUB, obraGeneral: 'cristo' });   // los codos son consumo: con obra
    const r = leerLote('Juan: 3 codos', P, TUB, O);
    const x = r.lineas[0].items[0];
    esCierto(x.dudoso, '«3 codos» con varias medidas es dudoso');
    const v = verificarLote(r, tub);
    const a = v.porItem.get(x.id) ?? [];
    igual(a.map(y => [y.tipo, y.nivel]), [['elemento', 'decidir']], 'y eso es una DECISIÓN pendiente');
    esCierto(!listoParaRegistrar(r.lineas[0], x.id, v, new Set([x.id])), 'ni marcándolo «mirado» pasa');
    igual(a[0].medidas?.map(m => m.etiqueta), ['1/2"', '2"', '4"', '6"'],
        'las medidas como botones, en orden (la reducción 4"-2" no tiene UNA medida: va por la lista)');
    // Al escoger la medida, queda listo.
    const fijo = { ...r, lineas: [{ ...r.lineas[0], items: [{ ...x, item: TUB.find(i => i.name === 'Codos 2"'), dudoso: false }] }] };
    esCierto(listoParaRegistrar(fijo.lineas[0], x.id, verificarLote(fijo, tub), new Set()), 'escogida la medida, listo');

    const pul = leerLote('Juan: 1 pulidora', P, TUB, O);
    const vp = verificarLote(pul, tub).porItem.get(pul.lineas[0].items[0].id) ?? [];
    igual(vp.map(y => y.tipo), ['elemento'], 'grande o pequeña: se pregunta (antes salía la primera, callada)');
    igual(vp[0].medidas, undefined, 'y sin botones de medida: no es una duda de medida');

    const dos: Personnel[] = [...P, { id: 'juanp', name: 'Juan Pablo' }];
    const rp = leerLote('Juan: 1 pala', dos, I, O);
    esCierto(rp.lineas[0].dudosa && !!rp.lineas[0].persona, '«Juan» con dos Juan: escoge uno pero DUDA');
    igual(tipos(verificarLote(rp, ctx({ personnel: dos })).porLinea, rp.lineas[0].id), ['persona'], 'y eso se pregunta, no se registra callado');
});

grupo('el resumen del trabajador dice lo mismo que el «Confirmar» del chat', () => {
    const r = leerLote('Juan Puerta: 3 palas, 2 cemento, 1 zorbex', P, I, O);
    const l = r.lineas[0];
    const v = verificarLote(r, ctx({ obraGeneral: 'cristo' }));
    const res = resumenDeLinea(l, v, new Map(), it => !!it.item);
    igual(res.sale.map(x => [x.nombre, x.cantidad, x.unidad, x.prestamo]), [['Pala', 3, 'und', true], ['Cemento', 2, 'und', false]],
        'cantidad, unidad, y Préstamo (herramienta) o Gasto (consumo)');
    igual(res.seQueda.map(x => x.nombre), ['zorbex'], 'lo que no se sabe qué es se queda, nombrado');
    const sinObra = resumenDeLinea(l, verificarLote(r, ctx({ obraGeneral: null })), new Map(), it => !!it.item);
    igual(sinObra.sale.map(x => x.nombre), [], 'con consumo y sin obra, el renglón entero espera la decisión');
    esCierto(sinObra.seQueda.every(x => x.porque.length > 0), 'y cada uno dice por qué');
});

grupo('la huella cambia con lo que se confirma: fecha, hora, trabajador nuevo y nombre del ítem que nace', () => {
    const r = leerLote('@ Cristo · 7:30\nAlex: 1 zorbex', P, I, O);
    const l = r.lineas[0];
    const nuevos = new Map([[l.items[0].id, InventoryType.HAND_TOOL]]);
    const base = huellaDeLinea(l, null, nuevos, { fecha: '2026-10-03' });
    esCierto(huellaDeLinea(l, null, nuevos, { fecha: '2026-10-04' }) !== base, 'otra fecha: hay que volver a confirmar');
    esCierto(huellaDeLinea({ ...l, encabezado: { ...l.encabezado!, hora: '08:00' } }, null, nuevos, { fecha: '2026-10-03' }) !== base, 'otra hora, también');
    const conCrear = { ...l, paraId: '__crear__', crear: { nombre: 'Rafa', liderId: 'alex' } };
    esCierto(huellaDeLinea({ ...conCrear, crear: { nombre: 'Rafael', liderId: 'alex' } }, null, nuevos) !== huellaDeLinea(conCrear, null, nuevos),
        'cambiar el nombre del trabajador nuevo de la cuadrilla desconfirma');
    esCierto(huellaDeLinea(l, null, nuevos, { nombreNuevo: () => 'Zorbex 2"' }) !== huellaDeLinea(l, null, nuevos, { nombreNuevo: () => 'Zorbex' }),
        'y el nombre con que nace el ítem');
});

grupo('el resumen nombra al ítem nuevo como VA A QUEDAR', () => {
    const r = leerLote('Juan Puerta: 3 codos de 5', P, I, O);
    const l = r.lineas[0];
    const nuevos = new Map([[l.items[0].id, InventoryType.SINGLE_USE]]);
    const v = verificarLote(r, ctx({ obraGeneral: 'cristo', nuevos }));
    const res = resumenDeLinea(l, v, nuevos, () => true, () => ({ name: 'Codos 5"', unit: 'und' }));
    igual(res.sale.map(x => [x.nombre, x.unidad]), [['Codos 5"', 'und']], 'el nombre de la ficha, no lo dictado');
});

await cerrar();
