/**
 * core/organizar.ts — Reorganizar la bodega sin tocar una sola cantidad
 * =====================================================================
 * Géneros (la ruta: «Tubería / Accesorios»), familias («Codos») y medidas
 * («2"»). Juli quiere poder crear, renombrar y reagrupar todo eso él mismo.
 *
 * Cada función recibe el inventario y devuelve SOLO los ítems que cambian, ya
 * cambiados. La pantalla los guarda uno por uno con `handleEditItem` (cola
 * durable + bitácora). Así se puede probar sin pantalla y se ve, antes de
 * guardar, cuántos ítems toca cada operación.
 *
 * Regla que no se negocia: acá NUNCA se toca `quantity`. Reorganizar no es
 * mover inventario, y un cambio de cantidad deja movimiento de ajuste en el
 * Kardex — que sería mentira.
 */

import { Item } from '../types.js';
import { familiaDe, nombreCorregido, raizDeFamilia } from '../utils/genus.js';
import { medidaDe } from '../utils/medida.js';
import { partirRuta, unirRuta } from '../utils/arbol.js';

/** La familia que el ítem muestra: la confirmada, o la que se deduce del nombre. */
export const familiaEfectiva = (i: Item): string => i.familia?.trim() || familiaDe(i.name);

const mismoTramo = (a: string, b: string) => raizDeFamilia(a) === raizDeFamilia(b);

/** ¿La ruta de este ítem empieza por `camino`? (tramo a tramo, sin tildes ni plural). */
export const estaDebajo = (i: Item, camino: string): boolean => {
    const arriba = partirRuta(camino);
    const suya = partirRuta(i.ruta);
    return arriba.length > 0 && arriba.length <= suya.length && arriba.every((t, k) => mismoTramo(t, suya[k]));
};

/** Solo los que de verdad cambian: guardar un ítem igual es ruido en la bitácora. */
const soloCambiados = (antes: Item[], despues: Item[]): Item[] =>
    despues.filter((d, k) => d.ruta !== antes[k].ruta || d.familia !== antes[k].familia || d.name !== antes[k].name);

/**
 * Renombrar un género: «Accesorios» → «Accesorios de tubería». Cambia ese tramo
 * en todos los ítems que están debajo, a cualquier profundidad, y en ninguno más.
 */
export const renombrarGenero = (items: Item[], camino: string, nuevoNombre: string): Item[] => {
    const nombre = nuevoNombre.trim().replace(/\//g, '-');
    const nivel = partirRuta(camino).length - 1;
    if (!nombre || nivel < 0) return [];
    const debajo = items.filter(i => estaDebajo(i, camino));
    // El tramo de arriba se escribe como lo dice `camino` (la forma que muestra
    // el árbol): un «tuberia» suelto queda «Tubería» de paso.
    const arriba = partirRuta(camino).slice(0, nivel);
    return soloCambiados(debajo, debajo.map(i =>
        ({ ...i, ruta: unirRuta([...arriba, nombre, ...partirRuta(i.ruta).slice(nivel + 1)]) })));
};

/**
 * Mover un género entero adentro de otro: «Accesorios» a «Plomería». Lo que
 * tenía debajo se va con él. `nuevoPadre` vacío lo sube a la raíz.
 * Meterlo dentro de sí mismo no tiene sentido y no hace nada.
 */
export const moverGenero = (items: Item[], camino: string, nuevoPadre: string): Item[] => {
    const tramos = partirRuta(camino);
    if (tramos.length === 0) return [];
    if (nuevoPadre && estaDebajo({ ruta: nuevoPadre } as Item, camino)) return [];
    const debajo = items.filter(i => estaDebajo(i, camino));
    const suNombre = tramos[tramos.length - 1];
    return soloCambiados(debajo, debajo.map(i => {
        const resto = partirRuta(i.ruta).slice(tramos.length);
        return { ...i, ruta: unirRuta([...partirRuta(nuevoPadre), suNombre, ...resto]) || undefined };
    }));
};

/**
 * Deshacer un género: lo que tenía adentro sube un nivel. No se pierde nada —
 * ni un ítem ni un subgénero—, solo desaparece ese nivel.
 */
export const quitarGenero = (items: Item[], camino: string): Item[] => {
    const tramos = partirRuta(camino);
    if (tramos.length === 0) return [];
    const debajo = items.filter(i => estaDebajo(i, camino));
    return soloCambiados(debajo, debajo.map(i => {
        const nueva = [...tramos.slice(0, -1), ...partirRuta(i.ruta).slice(tramos.length)];
        return { ...i, ruta: unirRuta(nueva) || undefined };
    }));
};

/**
 * Poner estos ítems en un género (crearlo es esto mismo con un nombre nuevo).
 * `ruta` vacía los saca a la raíz.
 */
export const ponerRuta = (items: Item[], ids: Iterable<string>, ruta: string): Item[] => {
    const cuales = new Set(ids);
    const destino = unirRuta(partirRuta(ruta)) || undefined;
    const estos = items.filter(i => cuales.has(i.id));
    return soloCambiados(estos, estos.map(i => ({ ...i, ruta: destino })));
};

/**
 * Pasar estos ítems a una familia —existente o nueva—, y opcionalmente al
 * género donde vive esa familia, para que no queden partidos en dos sitios.
 *
 * `corregirNombre`: «Codo 2"» que pasa a «Codos» queda «Codos 2"». Se ofrece en
 * pantalla con la vista previa, porque cambiar un nombre a espaldas del que lo
 * escribió es peor que el error que se arregla.
 */
export const ponerFamilia = (
    items: Item[], ids: Iterable<string>, familia: string,
    opciones: { ruta?: string; corregirNombre?: boolean } = {},
): Item[] => {
    const fam = familia.trim();
    if (!fam) return [];
    const cuales = new Set(ids);
    const estos = items.filter(i => cuales.has(i.id));
    return soloCambiados(estos, estos.map(i => ({
        ...i,
        familia: fam,
        name: opciones.corregirNombre ? nombreCorregido(i.name, fam) : i.name,
        ...(opciones.ruta !== undefined ? { ruta: unirRuta(partirRuta(opciones.ruta)) || undefined } : {}),
    })));
};

/**
 * Renombrar una familia entera: todos sus ítems, en toda la bodega —
 * «Codo» y «Codos» son la misma familia— y ninguno de otra.
 */
export const renombrarFamilia = (items: Item[], familia: string, nueva: string, corregirNombre = false): Item[] => {
    const clave = raizDeFamilia(familia);
    const ids = items.filter(i => raizDeFamilia(familiaEfectiva(i)) === clave).map(i => i.id);
    return ponerFamilia(items, ids, nueva, { corregirNombre });
};

/**
 * Ponerle la medida a un ítem que no la tiene: «Codos» → «Codos 2"».
 *
 * Solo si NO tiene medida. Cambiarle la medida a un ítem que ya la tiene sería
 * convertir un codo de 2" en uno de 4" con la cantidad del de 2", y eso no es
 * organizar: es mentirle al inventario. Eso se hace creando el otro ítem.
 */
export const ponerMedida = (item: Item, medida: string): Item | null => {
    const m = medida.trim();
    if (!m || medidaDe(item.name)) return null;
    const conComillas = /["']$/.test(m) ? m : `${m}"`;
    return { ...item, name: `${item.name.trim()} ${conComillas}` };
};

/** Qué cambia, en una línea por ítem, para la vista previa y la bitácora. */
export const describir = (antes: Item[], despues: Item[]): string[] => {
    const porId = new Map(antes.map(i => [i.id, i]));
    return despues.map(d => {
        const a = porId.get(d.id);
        const partes: string[] = [];
        if (a?.name !== d.name) partes.push(`«${a?.name}» → «${d.name}»`);
        else partes.push(`«${d.name}»`);
        if ((a?.ruta ?? '') !== (d.ruta ?? '')) partes.push(`género: ${a?.ruta || 'ninguno'} → ${d.ruta || 'ninguno'}`);
        if ((a?.familia ?? '') !== (d.familia ?? '')) partes.push(`familia: ${a?.familia || familiaEfectiva(a!)} → ${d.familia}`);
        return partes.join(' · ');
    });
};
