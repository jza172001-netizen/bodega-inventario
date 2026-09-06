import { Item } from '../types';

export const getGenus = (name: string): string =>
    name.replace(/\s*\([^)]+\)\s*$/, '').trim();

/**
 * La familia de un ítem: **la primera palabra** del nombre, sin el paréntesis.
 *
 *   "Lechada gris claro"     → "Lechada"
 *   "Lechada veige"          → "Lechada"
 *   "Gafas de seguridad"     → "Gafas"
 *   "Guantes (Negro · Nn)"   → "Guantes"
 *
 * Antes solo se quitaba lo que va entre paréntesis, así que la app únicamente
 * entendía la convención "Guantes (Negro)". El bodeguero escribe como se habla
 * en la bodega —"Lechada gris claro"— y ahí la familia no se detectaba: ni
 * avisaba de repetidos, ni agrupaba, ni dejaba ver el histórico junto.
 *
 * Se probó primero recortando una lista de colores y calificativos, pero dejaba
 * "Gafas" y "Gafas de seguridad" separadas, y el objetivo es justamente poder
 * abrir "Gafas" y ver adentro todos los tipos. La primera palabra es más simple
 * y más predecible: el bodeguero sabe de antemano dónde va a caer cada cosa.
 *
 * Si la primera palabra es muy corta para identificar algo (una inicial suelta,
 * como en "G plac polvo"), se toman dos.
 */
export const familiaDe = (name: string): string => {
    const palabras = getGenus(name).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return name.trim();
    const cuantas = palabras[0].length >= 3 ? 1 : Math.min(2, palabras.length);
    return palabras.slice(0, cuantas).join(' ');
};

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

/**
 * ¿Estas dos familias son la misma? La agrupación del inventario se apoya acá.
 *
 * Usa la regla del buscador universal, igual que `esParecido`: una sola forma de
 * decidir si dos palabras son la misma en toda la app. Antes tenía su propia
 * copia con margen de una letra, y por eso el inventario mostraba "Extension" y
 * "Extensiones" como dos familias, y no habría juntado nunca un "Peludora".
 *
 * `looseMatch` está definido más abajo; en tiempo de ejecución ya existe cuando
 * esto se llama, porque solo corre al agrupar.
 */
export const sameGenus = (a: string, b: string): boolean => {
    const na = normStr(a), nb = normStr(b);
    if (na === nb) return true;
    return looseMatch(na, nb) || looseMatch(nb, na);
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

/**
 * Candidatos a ser la misma familia que `nombre`.
 *
 * Es DELIBERADAMENTE generoso, y puede serlo porque cada candidato se confirma
 * antes de agrupar: un falso positivo cuesta un toque, y un duplicado que nadie
 * detecta cuesta una bodega desordenada. Un detector prudente sería lo correcto
 * si agrupara solo; acá no agrupa solo.
 *
 * Entra por cualquiera de estos caminos:
 *  · la familia ya confirmada coincide;
 *  · comparten la primera palabra ("Lechada gris claro" / "Lechada veige",
 *    que por puntaje de texto daba CERO);
 *  · la primera palabra está a un error de dedo ("Palustre" / "Palustra").
 *
 * El puntaje de texto del buscador lo aporta quien llama, con scoreMatch.
 */
export const esParecido = (nombre: string, otro: Item, familiaConfirmada?: string): boolean => {
    const fa = (familiaConfirmada?.trim() || familiaDe(nombre));
    const fb = (otro.familia?.trim() || familiaDe(otro.name));
    const a = normStr(fa), b = normStr(fb);
    if (!a || !b) return false;
    if (a === b) return true;
    // Una sola regla de parecido en toda la app, y es la del buscador universal.
    //
    // Acá había una copia: distancia de edición ≤ 1. Con ese margen fijo, el
    // error que Juli tuvo de verdad —"Peludora" por "Pulidora"— no se pillaba,
    // porque son DOS letras cambiadas (e→u, u→i). `looseMatch` ya resolvía
    // exactamente eso ("una palabra corta admite un error; una larga, dos"), así
    // que lo que se buscaba escribiendo se junta también al agrupar. Si mañana
    // se afina el buscador, la autocorrección se afina con él.
    //
    // Probado contra las 40 familias de la bodega: el único par que junta de más
    // es "extension" con "extensiones", que en efecto son lo mismo. Y sigue
    // separando lo que debe: "pala" de "palustre", "martillo" de "tornillo".
    return looseMatch(a, b) || looseMatch(b, a);
};

/**
 * La familia de un ítem, escrita como YA está escrita en la bodega.
 *
 * Sin esto, `"clavos"` y `"Clavos"` conviven como dos familias distintas —y ya
 * pasó: quedaron las dos en la base—. Basta con que alguien escriba una en
 * minúscula un martes para partir en dos algo que el bodeguero ve como uno solo.
 * La primera forma que se escribió manda; las siguientes se le suman.
 */
export const familiaCanonica = (familia: string, items: Item[]): string => {
    const q = normStr(familia);
    if (!q) return familia.trim();
    for (const i of items) {
        const f = i.familia?.trim();
        if (f && normStr(f) === q) return f;
    }
    return familia.trim();
};

/**
 * Las familias que ya existen y se parecen a lo que se está escribiendo.
 * Es la lista que Juli quiere ver al escribir "lechada": las lechadas que ya
 * tiene, para decidir si la nueva es una de ellas o algo aparte.
 */
export const familiasParecidas = (nombre: string, items: Item[]): string[] => {
    const q = nombre.trim();
    if (q.length < 3) return [];
    const vistas = new Map<string, string>();
    for (const i of items) {
        const f = (i.familia?.trim() || familiaDe(i.name)).trim();
        if (!f) continue;
        const k = normStr(f);
        if (vistas.has(k)) continue;
        if (looseMatch(f, q) || looseMatch(q, f) || normStr(familiaDe(q)) === k) vistas.set(k, f);
    }
    return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'es'));
};

/** Los colores que esa familia ya tiene en la bodega, sin repetir. */
export const coloresDeFamilia = (familia: string, items: Item[]): string[] => {
    const q = normStr(familia);
    const vistos = new Map<string, string>();
    for (const i of items) {
        const f = i.familia?.trim() || familiaDe(i.name);
        if (normStr(f) !== q) continue;
        const c = i.color?.trim();
        if (c && !vistos.has(normStr(c))) vistos.set(normStr(c), c);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
};

/** Las marcas que esa familia ya tiene. Falta la otra mitad del par: el botón
 *  de guardar exige color Y marca, y solo se ofrecían los colores. */
export const marcasDeFamilia = (familia: string, items: Item[]): string[] => {
    const q = normStr(familia);
    const vistas = new Map<string, string>();
    for (const i of items) {
        const f = i.familia?.trim() || familiaDe(i.name);
        if (normStr(f) !== q) continue;
        const m = i.brand?.trim();
        if (m && !vistas.has(normStr(m))) vistas.set(normStr(m), m);
    }
    return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'es'));
};

/**
 * El nombre corregido con la ortografía de la familia elegida.
 *
 *   "Peludora"       + familia "Pulidora" → "Pulidora"
 *   "lechada beige"  + familia "Lechada"  → "Lechada beige"
 *
 * Si el bodeguero eligió la familia Pulidora habiendo escrito "Peludora", ya
 * dijo cuál es la palabra buena. Guardar el error de dedo después de eso es
 * quedarse con la peor de las dos versiones.
 */
export const nombreCorregido = (nombre: string, familia: string): string => {
    const fam = familia.trim();
    if (!fam || fam.includes(' · ')) return nombre.trim();
    const palabras = nombre.trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return fam;
    // Solo se toca la primera palabra: el resto es lo que distingue a este ítem
    // de sus hermanos y no hay por qué tocarlo.
    //
    // La comparación es EXACTA, no normalizada. Si fuera normalizada, "lechada
    // beige" con familia "Lechada" se daría por bueno y quedaría en minúscula —
    // y la mayúscula también es ortografía de la familia.
    if (palabras[0] === fam) return nombre.trim();
    return [fam, ...palabras.slice(1)].join(' ');
};

/**
 * Qué accesorio le corresponde a esta familia de herramienta.
 *
 * Lo dijo el bodeguero: "para los taladros son casi todos brocas, de diferentes
 * tipos; y pulidoras, todo discos de diferentes tipos". El accesorio es
 * predecible por la familia, y hoy el selector muestra la lista completa de
 * consumibles sin orden — para engancharle una broca a un taladro hay que
 * buscarla entre lechadas, clavos y bombillos.
 *
 * Manda lo APRENDIDO: lo que ya tienen enganchado las otras herramientas de la
 * misma familia. La lista de abajo es solo el arranque, para el primer día en
 * que todavía no hay nada que aprender.
 */
const ARRANQUE: Record<string, string> = {
    taladro:  'broca',
    pulidora: 'disco',
    radial:   'disco',
    lijadora: 'lija',
    soldador: 'electrodo',
    tronzadora: 'disco',
    sierra:   'disco',
};

export const accesorioDeFamilia = (familia: string, items: Item[]): string[] => {
    const fam = normStr(familia);

    // 1) Lo que ya engancharon las hermanas de esta misma familia.
    const aprendidos = new Set<string>();
    for (const i of items) {
        const f = normStr(i.familia?.trim() || familiaDe(i.name));
        if (f !== fam) continue;
        for (const a of i.accessories ?? []) if (a.itemId) aprendidos.add(a.itemId);
    }
    if (aprendidos.size > 0) return [...aprendidos];

    // 2) Primer día: se siembra con la palabra que usa la bodega.
    const palabra = ARRANQUE[fam];
    if (!palabra) return [];
    return items.filter(i => normStr(i.name).startsWith(palabra)).map(i => i.id);
};

/** La palabra con la que arranca un accesorio nuevo de esta familia. */
export const palabraDeAccesorio = (familia: string): string => {
    const p = ARRANQUE[normStr(familia)];
    return p ? p.charAt(0).toUpperCase() + p.slice(1) + ' ' : '';
};

export const clusterGenera = (items: Item[]): GenusCluster[] => {
    // familiaDe y no getGenus: así "Lechada gris claro" y "Lechada veige"
    // caen en el mismo grupo, no solo las que traen paréntesis.
    // La familia CONFIRMADA manda sobre la sugerida: la app propone, el
    // bodeguero decide, y esa decisión no se vuelve a discutir.
    const rawGenera = items.map(i => i.familia?.trim() || familiaDe(i.name));

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
            // La familia y no el nombre entero: si no, el encabezado de las tres
            // lechadas decía "Lechada gris claro", que es solo una de ellas.
            const freq = new Map<string, number>();
            for (const item of clItems) {
                const g = item.familia?.trim() || familiaDe(item.name);
                freq.set(g, (freq.get(g) ?? 0) + 1);
            }
            const dominant = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
            return { canonical: dominant, species: clItems };
        })
        .sort((a, b) => a.canonical.localeCompare(b.canonical, 'es'));
};
