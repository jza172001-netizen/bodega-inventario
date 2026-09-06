
import { normStr } from './genus';

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
    return c.replace(/a$/, 'o');
};

/** El tono para pintar el punto del chip, o null si no se reconoce. */
export const tonoDe = (color: string): string | null =>
    TONOS[raizDeColor(color)] ?? null;

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
