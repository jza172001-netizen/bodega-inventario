
/**
 * De un nombre de la bodega saca el MATERIAL y la MEDIDA.
 *
 * Los clavos no se compran "por clavos": se compran de acero o de hierro, y de
 * dos, tres o cuatro pulgadas. Ver "Clavos: 500 unidades" no sirve para pedir
 * nada; ver "Clavos → acero → 2\" : 300" sí.
 *
 * El número del nombre es la MEDIDA, no la cantidad — que es justo la confusión
 * que había: "Clavos acero 1" no es un clavo, es un clavo de una pulgada.
 */
// Los clavos se cuentan siempre por LIBRAS. Una caja puede traer 50 clavos,
// pero sacar una caja es sacar una libra. Lo que cambia entre uno y otro es la
// PULGADA: de una, de dos, de tres. Por eso se agrupa por pulgada y se mide en
// libras — no al revés.
const MATERIALES = [
    'acero', 'hierro', 'galvanizado', 'inoxidable', 'cobre', 'aluminio',
    'bronce', 'plástico', 'plastico', 'pvc', 'madera', 'concreto', 'nylon',
];

export const materialDe = (nombre: string): string | null => {
    const n = nombre.toLowerCase();
    return MATERIALES.find(m => n.includes(m)) ?? null;
};

/**
 * La medida en pulgadas, si el nombre trae un número suelto.
 *
 * Se ignoran los números pegados a una unidad ("500g", "2kg", "3m") y los que
 * van dentro del paréntesis de color y marca, que no son medidas.
 */
export const medidaDe = (nombre: string): string | null => {
    const sinParentesis = nombre.replace(/\s*\([^)]*\)\s*/g, ' ');
    const m = sinParentesis.match(/(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(?:"|''|pulg\w*)?(?![\w.,])/i);
    if (!m) return null;
    const num = m[1].replace(',', '.');
    // Un número pegado a una unidad de peso o largo no es una medida en pulgadas.
    const despues = sinParentesis.slice(m.index! + m[0].length).trimStart().toLowerCase();
    // `libra` va acá y no es un detalle: los clavos se piden POR LIBRA, y la
    // pulgada solo sirve para distinguir el tamaño. Sin esto, "Clavos 2 libras"
    // daría medida 2" — y ese 2 son las libras, no las pulgadas.
    if (/^(kg|kilos?|g|gr|gramos?|ml|mililitros?|l|lt|litros?|m|cm|mm|km|lb|lbs|libras?)\b/.test(despues)) return null;
    return `${num}"`;
};

/**
 * Los GÉNEROS que una familia ya tiene en la bodega, sin repetir.
 *
 * Juli lo dijo con su ejemplo: «clavos familia, hierro género, 2" denominación,
 * 20 cantidad». El género es de qué está hecha la cosa —acero, hierro— y la
 * denominación es la medida. Hasta hoy los dos vivían escondidos dentro del
 * nombre y solo se leían para dibujar el árbol; nadie los ofrecía al crear.
 *
 * `items` se filtra por familia antes de entrar, para que el que llama decida
 * cómo se compara la familia y no haya dos reglas de eso en la app.
 */
export const generosDe = (deLaFamilia: { name: string }[]): string[] => {
    const vistos = new Map<string, string>();
    for (const i of deLaFamilia) {
        const g = materialDe(i.name);
        if (g && !vistos.has(g.toLowerCase())) vistos.set(g.toLowerCase(), g);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
};

/** Las DENOMINACIONES (medidas) que ya existen, opcionalmente solo las de un género. */
export const denominacionesDe = (
    deLaFamilia: { name: string }[],
    genero?: string,
): string[] => {
    const g = genero?.trim().toLowerCase();
    const vistas = new Set<string>();
    for (const i of deLaFamilia) {
        if (g && materialDe(i.name)?.toLowerCase() !== g) continue;
        const m = medidaDe(i.name);
        if (m) vistas.add(m);
    }
    // Por número, no alfabético: 1" antes que 10", y 2" antes que 10".
    return [...vistas].sort((a, b) => parseFloat(a) - parseFloat(b));
};

/**
 * Arma el nombre con las cuatro piezas, en el orden en que la bodega las dice:
 * familia, género, denominación. La cantidad no va en el nombre — es del ítem.
 *
 *   ("Clavos", "hierro", "2\"") → «Clavos hierro 2"»
 *   ("Polvo enchape", "", "")   → «Polvo enchape»
 *
 * Es la forma que `familiaDe`, `materialDe` y `medidaDe` ya saben descomponer,
 * así que el árbol lo agrupa solo sin tocar nada más.
 */
export const nombreCompuesto = (familia: string, genero?: string, denominacion?: string): string =>
    [familia, genero, denominacion].map(p => (p ?? '').trim()).filter(Boolean).join(' ');
