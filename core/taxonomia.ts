/**
 * core/taxonomia.ts — La bodega se agrupa sola
 * =============================================
 * Juli, 13-nov-2026: «la familia grande es Tubería y accesorios; después salen
 * tubos y accesorios por separado; en tubos salen los colores —verde, amarilla,
 * naranja, gris—; en accesorios, codos, T, Y, bujes, uniones; y al final de
 * todas, las pulgadas. Después la cantidad. Y que todo se agrupe solo.»
 *
 *   Tubería y accesorios                     ← género (ruta, nivel 1)
 *   ├── Tubos                                ← género (ruta, nivel 2)
 *   │   └── Tubería amarilla                 ← familia (el color)
 *   │       └── 2"                           ← la especie: el ítem con su medida
 *   └── Accesorios
 *       └── Codos → 1/2" · 1" · 1 1/2" · 2"…
 *
 * Hasta hoy ningún ítem de producción tenía `ruta`: el árbol existía pero
 * nada caía en él, porque ubicar cada ítem era trabajo a mano en «Organizar».
 * Esto decide el lugar a partir del NOMBRE, con una lista corta y explícita
 * —no una regla de parecido—: un nombre con número no se vuelve tubería, y
 * una «llave» puede ser inglesa. Lo que no está en la lista no se toca.
 *
 * Solo el material de consumo: las herramientas y los accesorios de herramienta
 * (discos) viven en otro mundo y no se ubican aquí.
 *
 * Funciones puras. Las usan: el ítem que nace en el bloque (`fichaDelBloque`)
 * y la sugerencia «Agrupar solo» de Organizar, que muestra la vista previa
 * antes de guardar y nunca toca cantidades.
 */

import { InventoryType, Item } from '../types.js';
import { medidaDe } from '../utils/medida.js';

export const RAIZ_TUBERIA = 'Tubería y accesorios';
export const RUTA_TUBOS = `${RAIZ_TUBERIA} / Tubos`;
export const RUTA_ACCESORIOS = `${RAIZ_TUBERIA} / Accesorios`;

/** La unidad del tubo: se cuenta por tubo entero, y un tubo entero son 6 m. */
export const UNIDAD_TUBO = 'tubos (6 m)';
export const METROS_POR_TUBO = 6;

/** El color de la tubería, como se dice en la obra (en femenino: «la amarilla»). */
const COLORES: Record<string, string> = {
    verde: 'verde', amarilla: 'amarilla', amarillo: 'amarilla', naranja: 'naranja', anaranjada: 'naranja',
    gris: 'gris', blanca: 'blanca', blanco: 'blanca', negra: 'negra', negro: 'negra', azul: 'azul',
};

/** El accesorio, por la raíz de su primera palabra, con el nombre de su familia. */
const ACCESORIOS: Record<string, string> = {
    codo: 'Codos', semicodo: 'Semicodos', t: 'T', te: 'T', tee: 'T', y: 'Y', ye: 'Y', yee: 'Y',
    buje: 'Bujes', union: 'Uniones', sifon: 'Sifones', reduccion: 'Reducciones', adaptador: 'Adaptadores',
    niple: 'Niples', tapon: 'Tapones', registro: 'Registros', valvula: 'Válvulas', brida: 'Bridas',
    racor: 'Racores', collarin: 'Collarines',
};

const sinTilde = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** «Codos» → codo, «Uniones» → union, «Tubería» → tuberia. */
const raiz = (palabra: string): string => {
    const r = sinTilde(palabra);
    for (const f of [r, r.endsWith('es') ? r.slice(0, -2) : r, r.endsWith('s') ? r.slice(0, -1) : r]) {
        if (f === 'tubo' || f === 'tuberia' || f in ACCESORIOS) return f;
    }
    return r;
};

/**
 * Las medidas como las escribe la bodega: `4"`, una reducción `4"-2"`, y la
 * misma medida dos veces —«Y 4_4», «Y 6"-6" 6"-6"»— queda una sola.
 */
export const normalizarMedidas = (resto: string): string => {
    let t = resto.replace(/(\d+(?:\s+\d+\/\d+|\/\d+)?)\s*"?\s*[_x×-]\s*(\d+(?:\s+\d+\/\d+|\/\d+)?)\s*"?/gi,
        (_, a: string, b: string) => (a === b ? `${a}"` : `${a}"-${b}"`));
    // Un número suelto en un accesorio de tubería es pulgada; «1 1/2» va junto.
    const w = t.split(/\s+/).filter(Boolean);
    const out: string[] = [];
    for (let k = 0; k < w.length; k++) {
        if (/^\d+$/.test(w[k]) && /^\d+\/\d+"?$/.test(w[k + 1] ?? '')) {
            out.push(`${w[k]} ${w[k + 1].replace(/"?$/, '"')}`); k++;
        } else if (/^\d+(?:\/\d+)?$/.test(w[k])) out.push(`${w[k]}"`);
        else out.push(w[k]);
    }
    // Lo repetido una vez basta.
    const vistos = new Set<string>();
    return out.filter(x => !vistos.has(x) && (vistos.add(x), true)).join(' ');
};

export interface Lugar { ruta: string; familia: string; nombre: string; unidad?: string }

/**
 * Dónde va un ítem y cómo se llama, o `null` si no es de tubería.
 * El nombre solo se reescribe cuando se puede reescribir sin perder nada.
 */
export const clasificar = (item: Pick<Item, 'name' | 'inventoryType'>): Lugar | null => {
    if (item.inventoryType !== InventoryType.SINGLE_USE) return null;
    const palabras = item.name.trim().split(/\s+/);
    const r = raiz(palabras[0] ?? '');

    if (r === 'tubo' || r === 'tuberia') {
        const color = palabras.map(p => COLORES[sinTilde(p)]).find(Boolean);
        const familia = color ? `Tubería ${color}` : 'Tubería';
        const medida = medidaDe(item.name);
        // «Tubos amarillo sanitario 2" enteros 6 m» → «Tubería amarilla 2"»:
        // la amarilla ES la sanitaria, y el largo es la unidad, no el nombre.
        return { ruta: RUTA_TUBOS, familia, nombre: medida ? `${familia} ${medida}` : (color ? familia : item.name), unidad: UNIDAD_TUBO };
    }

    const familia = ACCESORIOS[r];
    if (!familia) return null;
    const resto = normalizarMedidas(palabras.slice(1).join(' '));
    return { ruta: RUTA_ACCESORIOS, familia, nombre: [familia, resto].filter(Boolean).join(' ') };
};

/**
 * «Agrupar solo»: lo que cambiaría en cada ítem para quedar en su lugar.
 * Devuelve SOLO los ítems que cambian, con nombre, familia y ruta nuevos —la
 * cantidad, el precio y todo lo demás quedan como estaban—. Si dos ítems
 * terminarían con el mismo nombre, ninguno se renombra: se ubican igual, pero
 * juntarlos es una decisión de Juli, no de la app.
 */
export const sugerenciasDeOrden = (items: Item[]): Item[] => {
    const propuestas = items
        .map(i => ({ i, l: clasificar(i) }))
        .filter((x): x is { i: Item; l: Lugar } => !!x.l);

    const clave = (n: string) => sinTilde(n).replace(/\s+/g, ' ').trim();
    const cuenta = new Map<string, number>();
    const finalDe = (x: { i: Item; l: Lugar }) => clave(x.l.nombre);
    for (const x of propuestas) cuenta.set(finalDe(x), (cuenta.get(finalDe(x)) ?? 0) + 1);
    const ocupados = new Set(items.filter(i => !propuestas.some(x => x.i.id === i.id)).map(i => clave(i.name)));

    return propuestas
        .map(({ i, l }) => {
            const choca = (cuenta.get(clave(l.nombre)) ?? 0) > 1 || ocupados.has(clave(l.nombre));
            return { ...i, ruta: l.ruta, familia: l.familia, name: choca ? i.name : l.nombre };
        })
        .filter((n) => {
            const v = items.find(i => i.id === n.id)!;
            return v.ruta !== n.ruta || v.familia !== n.familia || v.name !== n.name;
        });
};
