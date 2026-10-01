/**
 * tests/organizar.test.ts — Géneros, familias y pulgadas
 * ======================================================
 * Juli: «tubería, y me salen accesorios y tubos; me meto a accesorios y me
 * salen cuáles accesorios hay; me meto al accesorio y ya sí las pulgadas».
 *
 * Cubre el árbol de géneros (`construirRuta`), el editor (`core/organizar.ts`)
 * y la regla que no se negocia: reorganizar NUNCA toca una cantidad.
 */
import { InventoryType, Item } from '../types';
import { construirArbol, construirRuta, caminosDe, partirRuta } from '../utils/arbol';
import {
    estaDebajo, moverGenero, ponerFamilia, ponerMedida, ponerRuta, quitarGenero,
    renombrarFamilia, renombrarGenero,
} from '../core/organizar';
import { rutaSugerida, seMideEnPulgadas, medidaDe } from '../utils/medida';
import { igual, esCierto, grupo, cerrar } from './correr';

const it = (id: string, name: string, familia?: string, ruta?: string, quantity = 5): Item =>
    ({ id, name, familia, ruta, quantity, inventoryType: InventoryType.SINGLE_USE, category: 'x', subCategory: '', minStock: 0, price: 0, unit: 'und' });

// Los nombres de tubería que HAY en producción (leídos el 1-oct), más una pala.
const BODEGA = (): Item[] => [
    it('c2', 'Codos 2"', 'Codos', 'Tubería / Accesorios'),
    it('c4', 'Codos 4"', 'Codos', 'tuberia / accesorios'),
    it('c6', 'Codos 6"', 'Codos', 'Tubería/Accesorios'),
    it('y2', 'Y 2"', 'Y', 'Tubería / Accesorios'),
    it('t2', 'Tubos Naranja 2"', 'Tubos', 'Tubería'),
    it('ts', 'Tubos sanitario 3"', 'Tubos', 'Tubería'),
    it('pala', 'Pala', undefined, undefined, 7),
    it('pg', 'Pala grande', undefined, undefined, 2),
];

/** Lo que se ve en el árbol: «Tubería>Accesorios>[Codos,Y]» etc. */
const forma = (n: ReturnType<typeof construirRuta>): unknown => ({
    g: n.nombre, fam: n.familias.map(f => f.familia), hijos: n.hijos.map(forma),
});

grupo('sin géneros, el árbol es EXACTAMENTE el de antes', () => {
    const sin = BODEGA().map(i => ({ ...i, ruta: undefined }));
    const r = construirRuta(sin);
    igual(r.hijos.length, 0, 'ni un nivel extra');
    igual(JSON.stringify(r.familias), JSON.stringify(construirArbol(sin)), 'mismas familias, mismas ramas, mismo orden');
});

grupo('Tubería → Accesorios → Codos → pulgadas', () => {
    const r = construirRuta(BODEGA());
    igual(forma(r), {
        g: '', fam: ['Pala'], hijos: [
            { g: 'Tubería', fam: ['Tubos'], hijos: [{ g: 'Accesorios', fam: ['Codos', 'Y'], hijos: [] }] },
        ],
    }, 'géneros anidados; tildes, mayúsculas y espacios del « / » no parten el género');
    const acc = r.hijos[0].hijos[0];
    igual(acc.camino, 'Tubería / Accesorios', 'el camino completo, en su forma más usada');
    const codos = acc.familias.find(f => f.familia === 'Codos')!;
    igual(codos.ramas.length, 1, 'adentro del accesorio no hay nivel vacío...');
    igual(codos.ramas[0].items.map(i => medidaDe(i.name)), ['2"', '4"', '6"'], '...salen de una las pulgadas');
    igual(r.hijos[0].total, 30, 'el género suma lo de adentro');
    igual(caminosDe(r), ['Tubería', 'Tubería / Accesorios'], 'los caminos, para ofrecerlos como destino');
});

grupo('la profundidad no es fija', () => {
    const r = construirRuta([it('a', 'Codos 2"', 'Codos', 'Obra blanca / Tubería / Accesorios / PVC')]);
    igual(caminosDe(r).length, 4, 'cuatro niveles, sin tocar nada');
    igual(partirRuta(' A /  / B '), ['A', 'B'], 'los tramos vacíos no cuentan');
});

grupo('renombrar un género cambia los de abajo y NINGUNO más', () => {
    const b = BODEGA();
    const c = renombrarGenero(b, 'Tubería / Accesorios', 'Accesorios PVC');
    igual(c.map(i => i.id).sort(), ['c2', 'c4', 'c6', 'y2'], 'solo los de Accesorios (no los tubos de Tubería)');
    esCierto(c.every(i => i.ruta === 'Tubería / Accesorios PVC'), 'el tramo cambia en su nivel');
    const t = renombrarGenero(b, 'Tubería', 'Plomería');
    igual(t.length, 6, 'el de arriba arrastra a todos los de adentro');
    esCierto(t.some(i => i.ruta === 'Plomería / Accesorios'), 'y respeta el nivel de abajo');
});

grupo('mover y quitar un género no pierde a nadie', () => {
    const b = BODEGA();
    const m = moverGenero(b, 'Tubería / Accesorios', '');
    igual(m.map(i => i.ruta), ['Accesorios', 'Accesorios', 'Accesorios', 'Accesorios'], 'a la raíz, con lo de adentro');
    igual(moverGenero(b, 'Tubería', 'Tubería / Accesorios'), [], 'meterlo dentro de sí mismo no hace nada');
    const q = quitarGenero(b, 'Tubería');
    igual(q.length, 6, 'lo de adentro sube un nivel');
    igual(q.filter(i => i.id === 't2')[0].ruta, undefined, 'los tubos quedan en la raíz');
    igual(q.filter(i => i.id === 'c2')[0].ruta, 'Accesorios', 'los codos quedan en Accesorios');
    esCierto(!estaDebajo(it('z', 'Tuberías raras', undefined, 'Tuberías raras'), 'Tubería / Accesorios'), 'un prefijo de texto no es estar debajo');
});

grupo('familias: renombrar, pasar ítems, crear', () => {
    const b = [...BODEGA(), it('c1', 'Codo 1/2"')];
    const r = renombrarFamilia(b, 'Codos', 'Codo', false);
    igual(r.map(i => i.id).sort(), ['c1', 'c2', 'c4', 'c6'], '«Codo» y «Codos» son la misma familia; la Y no');
    esCierto(r.every(i => i.familia === 'Codo'), 'todos quedan con el nombre nuevo');
    const n = renombrarFamilia(b, 'Codos', 'Codo', true);
    igual(n.find(i => i.id === 'c2')!.name, 'Codo 2"', 'corregir el nombre: solo la primera palabra');

    const p = ponerFamilia(b, ['y2'], 'Codos', { ruta: 'Tubería / Accesorios' });
    igual(p.map(i => [i.id, i.familia, i.ruta]), [['y2', 'Codos', 'Tubería / Accesorios']], 'pasa a la familia y a su género');
    igual(ponerFamilia(b, ['y2'], '   '), [], 'una familia en blanco no es una familia');
    const nueva = ponerRuta(b, ['pala', 'pg'], 'Herramienta manual / Excavación');
    igual(nueva.map(i => i.ruta), ['Herramienta manual / Excavación', 'Herramienta manual / Excavación'], 'crear un género es ponerlo');
    igual(ponerRuta(b, ['c2'], 'Tubería / Accesorios'), [], 'lo que ya está así no se guarda otra vez');
});

grupo('REORGANIZAR NUNCA TOCA UNA CANTIDAD', () => {
    const b = BODEGA();
    const todo = [
        ...renombrarGenero(b, 'Tubería', 'X'), ...moverGenero(b, 'Tubería / Accesorios', ''),
        ...quitarGenero(b, 'Tubería'), ...ponerRuta(b, ['pala'], 'Y'),
        ...ponerFamilia(b, ['pala', 'pg'], 'Palas', { corregirNombre: true }), ...renombrarFamilia(b, 'Codos', 'Codo', true),
    ];
    const antes = new Map(b.map(i => [i.id, i.quantity]));
    esCierto(todo.length > 10, 'se probaron todas las operaciones');
    esCierto(todo.every(i => i.quantity === antes.get(i.id)), 'ni una cantidad distinta');
});

grupo('poner la medida: solo al que no la tiene', () => {
    igual(ponerMedida(it('c', 'Codos'), '3/4"')?.name, 'Codos 3/4"', 'se agrega al final');
    igual(ponerMedida(it('c', 'Codos'), '2')?.name, 'Codos 2"', 'con las comillas que faltan');
    igual(ponerMedida(it('c', 'Codos 2"'), '4"'), null, 'un codo de 2" NO se vuelve de 4" con la cantidad del de 2"');
});

grupo('pulgadas: las familias de la bodega están en PLURAL', () => {
    for (const f of ['Codos', 'Semicodos', 'Tubos', 'Unión', 'Uniones', 'Bujes', 'Y', 'T', 'Tees', 'Tapones'])
        esCierto(seMideEnPulgadas(f), `${f} se mide en pulgadas`);
    for (const f of ['Pala', 'Taladro', 'Teja', 'Yeso'])
        esCierto(!seMideEnPulgadas(f), `${f} no`);
    igual(rutaSugerida('Codos'), 'Tubería / Accesorios', 'el accesorio va en Accesorios');
    igual(rutaSugerida('Tubos'), 'Tubería', 'los tubos YA son el subgénero');
    igual(rutaSugerida('Llaves'), null, 'una llave también es herramienta: no se adivina');
    igual(medidaDe('Codos 4"-2"'), null, 'la reducción con guion no es de 4"');
});

await cerrar();
