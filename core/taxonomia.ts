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
 * Ese mismo día Juli pidió el árbol entero (ver abajo): las herramientas, el
 * EPP y los accesorios se ubican por su TIPO; el material de consumo, por su
 * nombre. Solo la tubería se renombra; lo demás conserva nombre y familia.
 *
 * Funciones puras. Las usan: el ítem que nace en el bloque (`fichaDelBloque`)
 * y la sugerencia «Agrupar solo» de Organizar, que muestra la vista previa
 * antes de guardar y nunca toca cantidades.
 */

import { InventoryType, Item } from '../types.js';
import { medidaDe } from '../utils/medida.js';

/**
 * El árbol completo (13-nov, Juli): de lo más grande a lo más específico.
 *
 *   Herramientas › Manuales | Eléctricas | Accesorios (discos de la pulidora)
 *   Materiales de consumo › Tubería y accesorios | Pinturas y líquidos | Polvos
 *                         | Eléctricos | Varios › Brochas y rodillos | Fijaciones
 *                                              | Abrasivos | Adhesivos y selladores | Otros
 *   EPP
 */
export const RAIZ_CONSUMO = 'Materiales de consumo';
export const RAIZ_HERRAMIENTAS = 'Herramientas';
export const RAIZ_TUBERIA = `${RAIZ_CONSUMO} / Tubería y accesorios`;
export const RUTA_TUBOS = `${RAIZ_TUBERIA} / Tubos`;
export const RUTA_ACCESORIOS = `${RAIZ_TUBERIA} / Accesorios`;

/** La unidad del tubo: se cuenta por tubo entero, y un tubo entero son 6 m. */
export const UNIDAD_TUBO = 'tubos (6 m)';
export const METROS_POR_TUBO = 6;
/**
 * El tubo eléctrico (conduit) se despacha por tubo de 2 m. Juli dijo «son como
 * de 2 metros»: si en la bodega miden otra cosa, se cambia SOLO esta línea.
 */
export const UNIDAD_TUBO_ELECTRICO = 'tubos (2 m)';
export const METROS_POR_TUBO_ELECTRICO = 2;

/** Los colores que el asistente ofrece cuando piden un tubo sin decirlo, en el orden de Juli. */
export const COLORES_TUBO = ['verde', 'rojo', 'amarillo', 'azul', 'violeta', 'naranja', 'gris', 'blanco'];

/** El color de la tubería, como se dice en la obra (en femenino: «la amarilla»). */
const COLORES: Record<string, string> = {
    verde: 'verde', amarilla: 'amarilla', amarillo: 'amarilla', naranja: 'naranja', anaranjada: 'naranja',
    gris: 'gris', blanca: 'blanca', blanco: 'blanca', negra: 'negra', negro: 'negra', azul: 'azul',
    roja: 'roja', rojo: 'roja', violeta: 'violeta',
};

/** «tubo eléctrico», «tubo conduit», «tubería EMT»: el de 2 m. */
const ES_ELECTRICO = /\b(?:electric[oa]s?|conduit|emt)\b/;

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

/**
 * `familia` y `nombre` vienen solo cuando la regla los sabe (tubería): en el
 * resto el ítem conserva los suyos y solo se ubica en su rama.
 * `sinColor`: un tubo que no dijo color —no se sabe cuál es, hay que preguntar—.
 */
export interface Lugar { ruta: string; familia?: string; nombre?: string; unidad?: string; sinColor?: boolean }

/** Las ramas del material de consumo que no son tubería, por la primera palabra (o una frase). */
const RAMAS: Array<{ ruta: string; re: RegExp; unidad?: string }> = [
    { ruta: `${RAIZ_CONSUMO} / Pinturas y líquidos`, re: /^(?:pinturas?|estucos?|masillas?|vinilos?|hiperciclyl|impermeabilizante)\b/, unidad: 'cuñete' },
    { ruta: `${RAIZ_CONSUMO} / Pinturas y líquidos`, re: /^(?:thinner|tiner|varsol|secador|gasolina|acpm)\b/, unidad: 'galón' },
    { ruta: `${RAIZ_CONSUMO} / Pinturas y líquidos`, re: /^(?:barniz|laca|esmalte|anticorrosivo|epoxic[oa]|limpiador|aceite)\b|\b3 en (?:en )?1\b/ },
    { ruta: `${RAIZ_CONSUMO} / Polvos`, re: /^(?:polvo|lechadas?|cemento|pegacor|yeso|cal|arena)\b|\bpolvo\b/ },
    { ruta: `${RAIZ_CONSUMO} / Eléctricos`, re: /^(?:cables?|clabe|encauchetado|alambre|tomas?|interruptor(?:es)?|bombillos?|conector(?:es)?|breakers?|plafon(?:es)?|led)\b|^cinta (?:\(?negra|aislante)/ },
    { ruta: `${RAIZ_CONSUMO} / Varios / Brochas y rodillos`, re: /^(?:brochas?|rodillos?|bandejas?)\b/ },
    { ruta: `${RAIZ_CONSUMO} / Varios / Fijaciones`, re: /^(?:clavos?|puntillas?|tornillos?|chazos?|tiros?|pernos?|tuercas?|arandelas?|grapas?|remaches?)\b/ },
    { ruta: `${RAIZ_CONSUMO} / Varios / Abrasivos`, re: /^(?:lijas?|discos?)\b/ },
    { ruta: `${RAIZ_CONSUMO} / Varios / Adhesivos y selladores`, re: /^(?:pegas?|silicona|sellador|teflon|soldadura)\b/ },
];
export const RUTA_OTROS = `${RAIZ_CONSUMO} / Varios / Otros`;

/** La rama de lo que no es material de consumo: va por su tipo, no por su nombre. */
const POR_TIPO: Partial<Record<InventoryType, string>> = {
    [InventoryType.HAND_TOOL]: `${RAIZ_HERRAMIENTAS} / Manuales`,
    [InventoryType.ELECTRICAL_TOOL]: `${RAIZ_HERRAMIENTAS} / Eléctricas`,
    [InventoryType.ACCESSORY]: `${RAIZ_HERRAMIENTAS} / Accesorios`,
    [InventoryType.PPE]: 'EPP',
};

/**
 * Dónde va un ítem y cómo se llama, o `null` si no es de tubería.
 * El nombre solo se reescribe cuando se puede reescribir sin perder nada.
 */
export const clasificar = (item: Pick<Item, 'name' | 'inventoryType'>): Lugar | null => {
    if (item.inventoryType !== InventoryType.SINGLE_USE) {
        const ruta = POR_TIPO[item.inventoryType];
        return ruta ? { ruta } : null;
    }
    const palabras = item.name.trim().split(/\s+/);
    const r = raiz(palabras[0] ?? '');
    const plano = sinTilde(item.name.trim());

    if (r === 'tubo' || r === 'tuberia') {
        const medida = medidaDe(item.name);
        if (ES_ELECTRICO.test(plano)) {
            const familia = 'Tubería eléctrica';
            return { ruta: RUTA_TUBOS, familia, nombre: medida ? `${familia} ${medida}` : familia, unidad: UNIDAD_TUBO_ELECTRICO };
        }
        const color = palabras.map(p => COLORES[sinTilde(p)]).find(Boolean);
        const familia = color ? `Tubería ${color}` : 'Tubería';
        // «Tubos amarillo sanitario 2" enteros 6 m» → «Tubería amarilla 2"»:
        // la amarilla ES la sanitaria, y el largo es la unidad, no el nombre.
        return {
            ruta: RUTA_TUBOS, familia, nombre: medida ? `${familia} ${medida}` : (color ? familia : item.name), unidad: UNIDAD_TUBO,
            ...(color ? {} : { sinColor: true }),
        };
    }

    const familia = ACCESORIOS[r];
    if (familia) {
        const resto = normalizarMedidas(palabras.slice(1).join(' '));
        return { ruta: RUTA_ACCESORIOS, familia, nombre: [familia, resto].filter(Boolean).join(' ') };
    }

    const rama = RAMAS.find(x => x.re.test(plano));
    // Lo que no cae en ninguna rama va a «Varios › Otros»: se ve, y Juli lo
    // mueve. No se le adivina una rama a un nombre que la lista no conoce.
    return rama ? { ruta: rama.ruta, ...(rama.unidad ? { unidad: rama.unidad } : {}) } : { ruta: RUTA_OTROS };
};

/** Un tubo dicho sin color (y que no es eléctrico): hay que preguntar cuál. */
export const tuboSinColor = (nombre: string): boolean =>
    !!clasificar({ name: nombre, inventoryType: InventoryType.SINGLE_USE })?.sinColor;

/** Cuántos metros trae un tubo de este ítem (6, o 2 el eléctrico); null si no es tubo. */
export const metrosPorTubo = (nombre: string): number | null => {
    const l = clasificar({ name: nombre, inventoryType: InventoryType.SINGLE_USE });
    if (l?.ruta !== RUTA_TUBOS) return null;
    return l.unidad === UNIDAD_TUBO_ELECTRICO ? METROS_POR_TUBO_ELECTRICO : METROS_POR_TUBO;
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
    const finalDe = (x: { i: Item; l: Lugar }) => clave(x.l.nombre ?? x.i.name);
    for (const x of propuestas) cuenta.set(finalDe(x), (cuenta.get(finalDe(x)) ?? 0) + 1);
    const ocupados = new Set(items.filter(i => !propuestas.some(x => x.i.id === i.id)).map(i => clave(i.name)));

    return propuestas
        .map(({ i, l }) => {
            const n = l.nombre ?? i.name;
            const choca = (cuenta.get(clave(n)) ?? 0) > 1 || ocupados.has(clave(n));
            return { ...i, ruta: l.ruta, familia: l.familia ?? i.familia, name: choca || !l.nombre ? i.name : l.nombre };
        })
        .filter((n) => {
            const v = items.find(i => i.id === n.id)!;
            return v.ruta !== n.ruta || v.familia !== n.familia || v.name !== n.name;
        });
};
