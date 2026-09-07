
import { Item } from '../types';
import { familiaDe, normStr, raizDeFamilia } from './genus';
import { raizDeColor } from './colores';
import { materialDe, medidaDe } from './medida';

/**
 * El árbol de la bodega: familia → variante → ítem.
 *
 * Lo pidió el bodeguero con los clavos: *"abro clavos y me salen las dos
 * familias, y me meto a una y me salen 1 pulgada, 2 pulgadas…"*. Y aclaró que
 * esa lógica la quiere **con todo**, no solo con los clavos.
 *
 *   Clavos          Pulidora                  Lechada
 *    ├ acero         ├ Grande                  ├ gris claro
 *    │   1"          │   Amarillo · Dwalt      └ veige
 *    │   2"          │   Amarillo · Stanley
 *    └ hierro        │   Azul · Makita
 *        2"          └ Pequeña
 *                        Verde · Brickell
 *
 * El orden lo puso el bodeguero: *"pulidoras serían así — pulidoras, grandes y
 * pequeñas, y dentro de grandes los colores y marcas"*. O sea que la rama es lo
 * que él le dice a la herramienta cuando la pide («la pulidora grande»), y el
 * color y la marca son el detalle que distingue una de otra ya adentro.
 *
 * Con los clavos el material va antes que todo, porque un clavo no se pide por
 * tamaño sino por material y pulgada. Y cuando no hay ni material ni nada
 * escrito en el nombre —una radial es solo «Radial»—, entonces sí manda el
 * color: es lo único que queda para distinguirlas.
 */
export interface Rama {
    variante: string;
    items: Item[];
    total: number;
}

export interface Arbol {
    familia: string;
    ramas: Rama[];
    total: number;
    cuantos: number;
}

/** Un texto que de verdad dice algo, o nada. Un color en blanco no es un color. */
const oNada = (s?: string): string | null => {
    const t = s?.trim();
    return t ? t : null;
};

/** El nombre sin el paréntesis de color y marca, que no es parte del nombre. */
const sinParentesis = (n: string): string => n.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

/** Lo que queda del nombre después de quitarle la familia. */
const restoDelNombre = (nombre: string, familia: string): string => {
    const palabras = sinParentesis(nombre).split(/\s+/).filter(Boolean);
    const dela = normStr(familia).split(/\s+/).filter(Boolean);
    let i = 0;
    // Por raíz y no por texto exacto: la familia unida se llama "Extensiones" y
    // el ítem se llama "Extension", así que comparando letra por letra la
    // palabra de la familia NO se descontaba y quedaba como si fuera la
    // descripción. Resultado: dos ramas llamadas "Extension" y "Extensiones",
    // cada una con un solo ítem, en vez de ramificar por color como debe.
    while (i < palabras.length && i < dela.length && raizDeFamilia(palabras[i]) === raizDeFamilia(dela[i])) i++;
    return palabras.slice(i).join(' ');
};

type TipoDeEje = 'material' | 'nombre' | 'color' | 'marca' | 'nada';
type Eje = { valor: string; tipo: TipoDeEje };

/**
 * Palabras que no distinguen nada por sí solas. Sin esto, "Gafas de seguridad"
 * abría una rama llamada «de».
 */
const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'y', 'a']);

/**
 * La palabra con la que se nombra la rama: la PRIMERA que describe algo.
 *
 * Él lo planteó con un nombre raro: *"taladro demoledor ninja — la familia es
 * taladro, uno se mete y salen todos los taladros más este"*. Si la rama fuera
 * la descripción completa, ese ninja abriría su propia rama al lado de
 * «Demoledor» y quedarían dos ramas para la misma cosa. Con la primera palabra,
 * cae dentro de Demoledor y el «ninja» pasa a ser el detalle que lo distingue.
 */
const cabezaDe = (descripcion: string): string => {
    const palabras = descripcion.split(/\s+/).filter(Boolean);
    return palabras.find(p => !RELLENO.has(normStr(p))) ?? palabras[0] ?? '';
};

/** El nombre sin la familia y sin la medida: lo que de verdad describe la cosa. */
const descripcionDe = (nombre: string, familia: string): string => {
    const resto = restoDelNombre(nombre, familia);
    const medida = medidaDe(nombre);
    if (!medida) return resto;
    // "Clavos acero 2" → el 2 es la pulgada, no una descripción.
    return resto.split(/\s+/).filter(p => p.replace(/["']|pulg\w*/gi, '').replace(',', '.') !== medida.replace('"', '')).join(' ');
};

/**
 * Con qué se distingue este ítem de sus hermanos de familia.
 *
 * La palabra escrita en el nombre gana sobre el color porque es la que usa el
 * bodeguero cuando pide: nadie pide «la pulidora amarilla», pide «la grande».
 * El color entra cuando no hay nada más —la radial, la lijadora—, y ahí sí es
 * lo único que las separa.
 *
 * Y el último recurso resuelve la lechada: "Lechada veige" no tiene el color en
 * su campo, lo tiene escrito en el nombre, que es justo lo que él señaló:
 * *"lechada beige, el beige es el color"*.
 */
const ejeDe = (i: Item, familia: string, ejeFamiliar?: TipoDeEje): Eje => {
    // El eje es UNO SOLO por familia. Sin esto, la "Concretadora" se ramificaba
    // por color y la "Concretadora Electrica" por nombre — dos criterios en el
    // mismo árbol, que es no tener árbol. El que no tenga la palabra se queda en
    // la rama de la familia a secas, que es como se pide: «la concretadora».
    const eje = ejeFamiliar ?? ejeDeLaFamilia([i], familia);
    if (eje === 'material') {
        const material = materialDe(i.name);
        if (material) return { valor: material, tipo: 'material' };
    }
    if (eje === 'material' || eje === 'nombre') {
        const descripcion = descripcionDe(i.name, familia);
        return descripcion && eje === 'nombre'
            ? { valor: cabezaDe(descripcion), tipo: 'nombre' }
            : { valor: '—', tipo: 'nada' };
    }
    if (eje === 'color') {
        const color = oNada(i.color);
        if (color) return { valor: color, tipo: 'color' };
    }
    const marca = oNada(i.brand);
    if (marca) return { valor: marca, tipo: 'marca' };
    return { valor: '—', tipo: 'nada' };
};

/**
 * Por qué se ramifica ESTA familia. Gana el criterio más específico que al
 * menos un miembro tenga: el material de los clavos, la palabra del nombre de
 * las pulidoras, y si no hay ninguna de las dos, el color de las radiales.
 */
const ejeDeLaFamilia = (deLaFamilia: Item[], familia: string): TipoDeEje => {
    if (deLaFamilia.some(i => materialDe(i.name))) return 'material';
    if (deLaFamilia.some(i => descripcionDe(i.name, familia))) return 'nombre';
    if (deLaFamilia.some(i => oNada(i.color))) return 'color';
    if (deLaFamilia.some(i => oNada(i.brand))) return 'marca';
    return 'nada';
};

export const varianteDe = (i: Item, hermanos?: Item[]): string => {
    const familia = i.familia?.trim() || familiaDe(i.name);
    return ejeDe(i, familia, ejeDeLaFamilia(hermanos ?? [i], familia)).valor;
};

/**
 * El detalle de un ítem dentro de su rama.
 *
 * La rama ya dice «Grande», así que repetir "Pulidora Grande (Amarillo · Dwalt)"
 * debajo de Grande no informa nada. Lo que falta es el color y la marca, que es
 * lo que separa una pulidora grande de la otra pulidora grande.
 */
export const detalleDe = (i: Item, familia: string, hermanos?: Item[]): string => {
    const eje = ejeDe(i, familia, ejeDeLaFamilia(hermanos ?? [i], familia));
    const trozos: string[] = [];
    const medida = medidaDe(i.name);
    if (medida) trozos.push(medida);
    // Si la rama salió del material, lo escrito en el nombre ya está dicho
    // entre el material y la medida.
    if (eje.tipo !== 'material') {
        const d = descripcionDe(i.name, familia);
        // La rama ya se llevó la primera palabra; acá va lo que sobró — el
        // «ninja» de "Taladro demoledor ninja".
        const sobra = eje.tipo === 'nombre'
            ? d.split(/\s+/).filter(p => normStr(p) !== normStr(eje.valor) && !RELLENO.has(normStr(p))).join(' ')
            : d;
        if (sobra && normStr(sobra) !== normStr(eje.valor)) trozos.push(sobra);
    }
    for (const campo of [i.color, i.brand]) {
        const v = oNada(campo);
        if (v && normStr(v) !== normStr(eje.valor)) trozos.push(v);
    }
    return trozos.join(' · ');
};

export const construirArbol = (items: Item[]): Arbol[] => {
    const porFamilia = new Map<string, Item[]>();
    for (const i of items) {
        const f = (i.familia?.trim() || familiaDe(i.name)).trim();
        // Singular y plural son la misma cesta: la bodega tenía "Extension" y
        // "Extensiones" como dos familias, así que la segunda no salía junto a
        // la primera y se volvía a crear. Es la misma idea de `raizDeColor` unas
        // líneas más abajo, donde Amarillo y Amarilla ya eran un solo color.
        const clave = raizDeFamilia(f);
        if (!porFamilia.has(clave)) porFamilia.set(clave, []);
        porFamilia.get(clave)!.push(i);
    }

    return [...porFamilia.values()]
        .map(losDeLaFamilia => {
            // La forma que más se repite manda, igual que con los colores. Con
            // el primero de la lista el nombre de la familia dependía del orden
            // alfabético: dos "Extensiones" y una "Extension" se llamaban
            // "Extension" solo porque va antes en el abecedario.
            const familia = masUsada(losDeLaFamilia.map(i => i.familia?.trim() || familiaDe(i.name)));
            const suEje = ejeDeLaFamilia(losDeLaFamilia, familia);
            const porVariante = new Map<string, Item[]>();
            for (const i of losDeLaFamilia) {
                const eje = ejeDe(i, familia, suEje);
                // Amarillo y Amarilla son el mismo color: cambia el género, no
                // el tono. Sin esto la pulidora salía con siete ramas para ocho
                // ítems, que es no tener árbol.
                const clave = eje.tipo === 'color' ? raizDeColor(eje.valor) : normStr(eje.valor);
                if (!porVariante.has(clave)) porVariante.set(clave, []);
                porVariante.get(clave)!.push(i);
            }
            const ramas: Rama[] = [...porVariante.values()]
                .map(deLaRama => ({
                    // La forma que más se repite manda: con seis "Amarillo" y
                    // dos "Amarilla", la rama se llama Amarillo.
                    variante: masUsada(deLaRama.map(i => ejeDe(i, familia, suEje).valor)),
                    items: [...deLaRama].sort((a, b) => a.name.localeCompare(b.name, 'es')),
                    total: deLaRama.reduce((s, i) => s + i.quantity, 0),
                }))
                .sort((a, b) => (a.variante === '—' ? 1 : 0) - (b.variante === '—' ? 1 : 0)
                             || a.variante.localeCompare(b.variante, 'es'));
            return {
                familia,
                ramas,
                total: losDeLaFamilia.reduce((s, i) => s + i.quantity, 0),
                cuantos: losDeLaFamilia.length,
            };
        })
        .sort((a, b) => a.familia.localeCompare(b.familia, 'es'));
};

const masUsada = (valores: string[]): string => {
    const cuenta = new Map<string, number>();
    for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
    const enMayuscula = (v: string) => (v[0] && v[0] === v[0].toUpperCase() ? 0 : 1);
    return [...cuenta.entries()]
        .sort((a, b) => b[1] - a[1] || enMayuscula(a[0]) - enMayuscula(b[0]) || a[0].localeCompare(b[0], 'es'))[0][0];
};
