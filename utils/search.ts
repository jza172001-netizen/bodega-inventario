/**
 * utils/search.ts — Buscador predictivo
 * =====================================
 * El buscador era un filtro: cada cosa coincidía o no coincidía. Para que un
 * filtro no traiga basura hay que apretarlo, y apretado se le escapa justo lo
 * que uno buscaba cuando escribe mal.
 *
 * Acá el criterio se invierte, porque esto ya no filtra: SUGIERE. En una lista
 * de sugerencias, mostrar de más cuesta un renglón que el bodeguero descarta de
 * un vistazo; no mostrar lo que buscaba lo deja tirado. Entonces la tolerancia
 * es amplia y lo que ordena el resultado es el PUNTAJE: lo más parecido arriba.
 */

import { normStr, editDistance } from './genus';

// Capas de coincidencia, de mejor a peor. Los saltos son grandes a propósito:
// una coincidencia exacta siempre debe ganarle a una adivinada, sin importar
// cuántos ajustes finos se sumen después.
const S_EXACT     = 1000;
const S_PREFIX    = 900;  // empieza por lo escrito
const S_CONTAINS  = 700;  // lo contiene en alguna parte
const S_WORD_PRE  = 600;  // una palabra empieza así
const S_WORD_FUZZ = 500;  // una palabra a pocos errores (incluye desorden)
const S_PRE_FUZZ  = 400;  // el arranque de una palabra, con errores
const S_SUBSEQ    = 300;  // las letras aparecen en orden, salteadas

/** Cuántos errores se le perdonan a una palabra según su largo. */
const tolerance = (len: number): number => (len <= 4 ? 1 : len <= 8 ? 2 : 3);

/** ¿Están las letras de `q` dentro de `target`, en orden aunque salteadas? */
const isSubsequence = (target: string, q: string): boolean => {
    let ti = 0;
    for (let qi = 0; qi < q.length; qi++) {
        while (ti < target.length && target[ti] !== q[qi]) ti++;
        if (ti >= target.length) return false;
        ti++;
    }
    return true;
};

/** Puntaje de UNA palabra escrita contra un texto completo. 0 = no aparece. */
const scoreToken = (hay: string, q: string): number => {
    if (!q) return 0;
    if (hay === q) return S_EXACT;
    if (hay.startsWith(q)) return S_PREFIX;
    if (hay.includes(q)) return S_CONTAINS;

    const words = hay.split(/\s+/).filter(Boolean);
    if (words.some(w => w.startsWith(q))) return S_WORD_PRE;

    // Con una o dos letras no se puede adivinar nada: todo se parece a todo.
    if (q.length < 3) return 0;

    const maxEdits = tolerance(q.length);

    let best = 0;
    for (const w of words) {
        if (Math.abs(w.length - q.length) <= maxEdits) {
            const d = editDistance(w, q);
            // Se descuenta por cada error, para que "a un error" gane a "a tres".
            if (d <= maxEdits) best = Math.max(best, S_WORD_FUZZ - d * 30);
        }
        if (w.length > q.length) {
            const d = editDistance(w.slice(0, q.length), q);
            if (d <= maxEdits) best = Math.max(best, S_PRE_FUZZ - d * 30);
        }
    }
    if (best > 0) return best;

    if (isSubsequence(hay, q)) return S_SUBSEQ;
    return 0;
};

/**
 * Puntaje de lo que el usuario escribió contra un texto.
 *
 * Se parte en palabras y NO importa el orden: "acero clavos" encuentra
 * "Clavos 2 acero" igual que "clavos acero". Cada palabra escrita tiene que
 * enganchar con algo; si una no engancha, no es este resultado.
 */
export const scoreMatch = (haystack: string, needle: string): number => {
    const hay = normStr(haystack);
    const q   = normStr(needle);
    if (!hay || !q) return 0;

    // La consulta entera contra el texto entero: es el caso más común y el que
    // mejor discrimina, así que manda.
    const whole = scoreToken(hay, q);

    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) return whole;

    let sum = 0;
    for (const t of tokens) {
        const s = scoreToken(hay, t);
        if (s === 0) return whole;   // una palabra suelta sin enganche: no cuenta como multi-palabra
        sum += s;
    }
    // Promedio de las palabras, más un premio si además pegó el texto completo.
    return Math.max(whole, Math.round(sum / tokens.length) + (whole > 0 ? 50 : 0));
};

export interface Scored<T> { value: T; score: number }

/**
 * Ordena por puntaje y corta. `textsOf` devuelve los textos por los que se puede
 * encontrar un elemento (nombre, género, subcategoría...); gana el mejor de ellos.
 */
export const rankMatches = <T,>(
    list: T[],
    query: string,
    textsOf: (item: T) => string[],
    limit: number,
): Scored<T>[] => {
    const out: Scored<T>[] = [];
    for (const value of list) {
        let score = 0;
        for (const text of textsOf(value)) {
            const s = scoreMatch(text, query);
            if (s > score) score = s;
        }
        if (score > 0) out.push({ value, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
};
