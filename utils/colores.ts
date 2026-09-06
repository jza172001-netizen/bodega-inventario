
import { normStr, looseMatch } from './genus';

/**
 * Los colores de la bodega, con su color de verdad.
 *
 * Los chips salían todos iguales y el elegido en negro, así que elegir "Azul"
 * o "Verde" era leer, no mirar. En una lista de nueve, mirar es más rápido.
 *
 * Están los que existen en el inventario, no una paleta genérica.
 */
const TONOS: Record<string, string> = {
    amarillo:  '#facc15',
    azul:      '#2563eb',
    negro:     '#1f2937',
    verde:     '#16a34a',
    gris:      '#9ca3af',
    naranja:   '#f97316',
    rojo:      '#dc2626',
    blanco:    '#f9fafb',
    beige:     '#e7d8b7',
    cafe:      '#78350f',
    marron:    '#78350f',
    morado:    '#7c3aed',
    violeta:   '#7c3aed',
    rosado:    '#ec4899',
    celeste:   '#38bdf8',
    dorado:    '#d4af37',
    plateado:  '#c0c0c0',
    transparente: '#e5e7eb',
};

/**
 * "Amarilla" y "Amarillo" son el mismo color: cambia el género, no el tono.
 *
 * En la bodega quedaron los dos como colores distintos —Amarillo en 12 ítems y
 * Amarilla en 8, lo mismo con Negro/Negra y Rojo/Roja—, así que al ofrecerlos
 * salían duplicados y había que elegir a cuál de los dos apuntarle.
 */
export const raizDeColor = (color: string): string => {
    const c = normStr(color);
    // Ojo: la regla es de GÉNERO, no de terminación. "Naranja" y "violeta"
    // terminan en a y no son femeninos de nada — convertirlas daba "naranjo" y
    // "violeto", que no son colores y se quedaban sin su punto. Por eso primero
    // se mira si la palabra ya es un color conocida tal cual.
    if (TONOS[c]) return c;
    return c.replace(/a$/, 'o');
};

/**
 * Los colores que la app sabe pintar, como se leen y sin repetir tono.
 *
 * `TONOS` tiene sinónimos que comparten color —café y marrón, morado y
 * violeta—: ofrecer los dos sería pedirle al bodeguero que escoja entre dos
 * nombres del mismo color. Esta lista es para OFRECER; los tonos siguen
 * saliendo de `TONOS`.
 */
export const PALETA = [
    'Amarillo', 'Azul', 'Negro', 'Verde', 'Gris', 'Naranja', 'Rojo', 'Blanco',
    'Beige', 'Café', 'Morado', 'Rosado', 'Celeste', 'Dorado', 'Plateado', 'Transparente',
];

/**
 * El tono para pintar el punto del chip, o null si no se reconoce.
 *
 * El último recurso es un dedazo: en la bodega hay una "Lechada veige" y por
 * una letra se quedaba sin su punto, al lado de un "gris" que sí lo tenía. Se
 * busca el color conocido que se le parezca con `looseMatch` — la misma regla
 * del buscador universal que usa el resto de la app, no una copia. Va DESPUÉS
 * de la búsqueda exacta, nunca por encima.
 */
export const tonoDe = (color: string): string | null => {
    const exacto = TONOS[raizDeColor(color)];
    if (exacto) return exacto;
    const c = normStr(color);
    if (c.length < 4) return null;   // con tres letras todo se parece a todo
    const parecido = Object.keys(TONOS).find(k => looseMatch(k, c) || looseMatch(c, k));
    return parecido ? TONOS[parecido] : null;
};

/**
 * Unifica una lista de colores por raíz, conservando la forma que más se usa.
 * Con "Amarillo" (12) y "Amarilla" (8) queda "Amarillo".
 */
export const coloresUnificados = (colores: string[]): string[] => {
    const cuenta = new Map<string, Map<string, number>>();
    for (const c of colores) {
        const raiz = raizDeColor(c);
        if (!cuenta.has(raiz)) cuenta.set(raiz, new Map());
        const formas = cuenta.get(raiz)!;
        formas.set(c, (formas.get(c) ?? 0) + 1);
    }
    return [...cuenta.values()]
        .map(formas => [...formas.entries()].sort((a, b) => b[1] - a[1])[0][0])
        .sort((a, b) => a.localeCompare(b, 'es'));
};
