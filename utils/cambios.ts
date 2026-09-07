/**
 * Qué cambió, en una línea.
 *
 * La bitácora tenía 87 renglones que decían `Se editó "Taladro inhalámbrico"` y
 * ahí se acababan. Siete veces seguidas ese mismo texto. Si alguien le bajaba la
 * cantidad de 3 a 1, la bitácora no lo sabía: registraba QUE se editó, nunca QUÉ.
 * Eso no permite auditar a nadie, que es justo para lo que existe.
 *
 * Este es el único sitio donde se arma esa frase — igual que `utils/genus.ts` es
 * el único sitio de la regla de parecido. No se escribe una segunda versión.
 *
 * El patrón ya existía bien hecho en la lista de pedidos («3 bultos → 5 bultos»);
 * esto lo generaliza para que sirva en ítems, personal, proyectos y accesos.
 */

/** Cómo se llama cada campo en la pantalla. Lo que no esté acá no se compara. */
export type Etiquetas<T> = Partial<Record<keyof T, string>>;

/** Un valor vacío y uno ausente son lo mismo para el bodeguero. */
const vacio = (v: unknown): boolean =>
    v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

const comoTexto = (v: unknown): string => {
    if (vacio(v)) return '—';
    if (typeof v === 'boolean') return v ? 'sí' : 'no';
    if (typeof v === 'number') return v.toLocaleString('es-CO');
    if (v instanceof Date) return v.toLocaleDateString('es-CO');
    return String(v).trim();
};

/** Dos valores son iguales si se leen igual. Evita reportar 0 → "0". */
const igual = (a: unknown, b: unknown): boolean => {
    if (vacio(a) && vacio(b)) return true;
    return comoTexto(a) === comoTexto(b);
};

/**
 * Compara dos versiones de la misma cosa y devuelve algo como
 * `cantidad 3 → 1 · precio 0 → 12.000`.
 *
 * Devuelve cadena vacía si no cambió nada que se esté mirando — el que llama
 * decide entonces si vale la pena escribir un renglón o no.
 */
export function describirCambios<T extends object>(
    antes: T | undefined,
    despues: T,
    etiquetas: Etiquetas<T>,
): string {
    if (!antes) return '';
    const partes: string[] = [];
    for (const clave of Object.keys(etiquetas) as (keyof T)[]) {
        const a = antes[clave];
        const d = despues[clave];
        if (igual(a, d)) continue;
        partes.push(`${etiquetas[clave]} ${comoTexto(a)} → ${comoTexto(d)}`);
    }
    return partes.join(' · ');
}

/**
 * Lo que traía puesto algo que se va a la papelera.
 *
 * Es la otra mitad del mismo problema: `Se eliminó "Pala"` tampoco dice si
 * tenía 1 o tenía 40. Con esto la bitácora y la papelera cuentan lo mismo.
 */
export function describirEstado<T extends object>(
    cosa: T,
    etiquetas: Etiquetas<T>,
): string {
    const partes: string[] = [];
    for (const clave of Object.keys(etiquetas) as (keyof T)[]) {
        const v = cosa[clave];
        if (vacio(v)) continue;
        partes.push(`${etiquetas[clave]} ${comoTexto(v)}`);
    }
    return partes.join(' · ');
}
