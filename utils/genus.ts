import { Item } from '../types';

export const getGenus = (name: string): string =>
    name.replace(/\s*\([^)]+\)\s*$/, '').trim();

export const normStr = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Distancia de edición Damerau-Levenshtein: cuántos errores separan dos palabras.
 *
 * A diferencia del Levenshtein clásico, cuenta el CAMBIO DE PUESTO de dos letras
 * vecinas como UN error, no dos. Para un dedo en un teclado, "amrtillo" es un
 * solo resbalón sobre "martillo"; sin esta regla el buscador lo veía tan lejos
 * como si fueran dos errores distintos y no lo sugería.
 */
export const editDistance = (a: string, b: string): number => {
    if (a === b) return 0;
    if (a.length > 40 || b.length > 40) return Math.abs(a.length - b.length);
    const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            // Transposición: "ab" ↔ "ba" cuesta 1, no 2.
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
            }
        }
    }
    return dp[a.length][b.length];
};

export const sameGenus = (a: string, b: string): boolean => {
    const na = normStr(a), nb = normStr(b);
    if (na === nb) return true;
    if (Math.abs(na.length - nb.length) > 2) return false;
    return editDistance(na, nb) === 1;
};

/**
 * ¿`haystack` se parece a lo que el usuario escribió en `needle`?
 *
 * `normStr` ya resolvía tildes y mayúsculas, así que "hector" encontraba a
 * "Héctor". Lo que faltaba era tolerar una letra CAMBIADA: "hektor" no
 * encontraba a nadie, porque las búsquedas usaban `includes`, que es exacto.
 *
 * `sameGenus` no sirve acá: compara las cadenas enteras, así que un nombre
 * completo ("Héctor Pérez") queda descartado por diferencia de largo antes de
 * mirar las letras. Por eso este compara palabra por palabra.
 */
export const looseMatch = (haystack: string, needle: string): boolean => {
    const hay = normStr(haystack);
    const q   = normStr(needle);
    if (!q) return false;
    if (hay.includes(q)) return true;              // el caso normal, y el más barato

    // Con menos de 3 letras todo se parece a todo: "ab" traería media bodega.
    if (q.length < 3) return false;

    // Una palabra corta admite un error; una larga, dos. Más que eso deja de ser
    // un typo y empieza a ser otra palabra ("martillo" no debe traer "tornillo").
    const maxEdits = q.length >= 7 ? 2 : 1;

    return hay.split(/\s+/).some(word => {
        if (!word) return false;
        if (Math.abs(word.length - q.length) <= maxEdits && editDistance(word, q) <= maxEdits) return true;
        // Comparar también el arranque de la palabra, para que sirva mientras se
        // teclea: "hekto" alcanza a "hector".
        //
        // Desde 5 letras y no antes: con 4, "pala" alcanzaba a "palustre" (el
        // prefijo "palu" está a una edición) y confundía dos ítems distintos de
        // la bodega. Por debajo de 5 queda solo la coincidencia exacta, que para
        // una palabra corta ya alcanza.
        return q.length >= 5 && word.length > q.length
            && editDistance(word.slice(0, q.length), q) <= maxEdits;
    });
};

export interface GenusCluster {
    canonical: string;
    species: Item[];
}

export const clusterGenera = (items: Item[]): GenusCluster[] => {
    const rawGenera = items.map(i => getGenus(i.name));

    const canonicalOf = new Map<string, string>();
    const clusterMap = new Map<string, Item[]>();

    for (let i = 0; i < items.length; i++) {
        const g = rawGenera[i];
        let found = canonicalOf.get(g);
        if (!found) {
            for (const key of clusterMap.keys()) {
                if (sameGenus(g, key)) { found = key; break; }
            }
        }
        if (!found) {
            canonicalOf.set(g, g);
            clusterMap.set(g, [items[i]]);
        } else {
            canonicalOf.set(g, found);
            clusterMap.get(found)!.push(items[i]);
        }
    }

    return [...clusterMap.entries()]
        .map(([, clItems]) => {
            const freq = new Map<string, number>();
            for (const item of clItems) {
                const g = getGenus(item.name);
                freq.set(g, (freq.get(g) ?? 0) + 1);
            }
            const dominant = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
            return { canonical: dominant, species: clItems };
        })
        .sort((a, b) => a.canonical.localeCompare(b.canonical, 'es'));
};
