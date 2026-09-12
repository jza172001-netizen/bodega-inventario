
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
 *
 * LAS FRACCIONES NO SON UN DETALLE. Toda la tubería se mide en fracciones —
 * 1/2, 3/4, 1 1/2— y antes esta función no las entendía: agarraba el primer
 * número y botaba el resto. "Codo PVC 3/4" devolvía 3" y el codo entraba al
 * inventario archivado como codo de tres pulgadas, que es otra pieza. Y como
 * `denominacionesDe` arma con esto la lista de medidas que el asistente ofrece,
 * y `nombreCompuesto` rearma el nombre con lo que salga, el error no se quedaba
 * quieto: la próxima vez la app ofrecía 3" como medida existente de la familia.
 * Se propagaba solo.
 *
 * No devolver nada es mejor que devolver un número equivocado: un ítem sin
 * medida se ve vacío y alguien lo completa; un ítem con la medida errada se ve
 * correcto y nadie lo vuelve a mirar.
 */

/**
 * El número de una medida, para poder ordenarlas: `1/2"` → 0.5, `1 1/2"` → 1.5.
 *
 * `parseFloat` no sirve acá —con "1/2" devuelve 1— y ese era justo el orden con
 * el que media pulgada quedaba revuelta con una pulgada en la lista.
 */
export const valorDeMedida = (medida: string): number => {
    const m = medida.replace(/["']/g, '').trim();
    const mixta = m.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixta) return Number(mixta[1]) + Number(mixta[2]) / Number(mixta[3]);
    const frac = m.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (frac) return Number(frac[1]) / Number(frac[2]);
    return parseFloat(m.replace(',', '.')) || 0;
};

/**
 * Las fracciones que vienen en UN solo carácter: ½, ¾, ⅜…
 *
 * "Tornillos 1½"" es un nombre real de la bodega y devolvía 1", perdiendo la
 * media pulgada igual que las fracciones escritas con barra. El símbolo se
 * cambia por su forma larga antes de leer nada, y así hay una sola regla de
 * fracciones en vez de dos.
 */
const FRACCIONES_SIMBOLO: Array<[RegExp, string]> = [
    [/⅛/g, ' 1/8'], [/¼/g, ' 1/4'], [/⅜/g, ' 3/8'], [/½/g, ' 1/2'],
    [/⅝/g, ' 5/8'], [/⅔/g, ' 2/3'], [/¾/g, ' 3/4'], [/⅞/g, ' 7/8'], [/⅓/g, ' 1/3'],
];

export const medidaDe = (nombre: string): string | null => {
    let sinParentesis = nombre.replace(/\s*\([^)]*\)\s*/g, ' ');
    for (const [simbolo, largo] of FRACCIONES_SIMBOLO) sinParentesis = sinParentesis.replace(simbolo, largo);
    /**
     * Un número con almohadilla es una REFERENCIA, no una medida.
     *
     * "Lija #2000" devolvía 2000" — una lija de dos mil pulgadas. El 2000 es el
     * grano, que es un código, no un tamaño. Y al ofrecer las medidas de toda la
     * bodega esa mentira se hubiera regado a todas las familias.
     */
    sinParentesis = sinParentesis.replace(/#\s*\d+(?:[.,]\d+)?/g, ' ');
    // Las tres formas, de la más específica a la más general: si "1 1/2" se
    // probara después de "1", la entera ganaría y la fracción se perdería —
    // que es exactamente el bug que había.
    const m = sinParentesis.match(
        /(?<![\w.,/])(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*(?:"|''|pulg\w*)?(?![\w.,/])/i,
    );
    if (!m) return null;
    // Espacios de sobra adentro de la fracción: "3 / 4" y "3/4" son la misma cosa.
    const num = m[1].replace(',', '.').replace(/\s*\/\s*/, '/').replace(/\s+/, ' ');
    const despues = sinParentesis.slice(m.index! + m[0].length).trimStart().toLowerCase();
    // Un número pegado a una unidad de peso o largo no es una medida en pulgadas.
    // `libra` va acá y no es un detalle: los clavos se piden POR LIBRA, y la
    // pulgada solo sirve para distinguir el tamaño. Sin esto, "Clavos 2 libras"
    // daría medida 2" — y ese 2 son las libras, no las pulgadas.
    if (/^(kg|kilos?|g|gr|gramos?|ml|mililitros?|l|lt|litros?|m|cm|mm|km|lb|lbs|libras?)\b/.test(despues)) return null;
    // Dos números unidos por una palabra NO son una medida.
    //
    // Una reducción trae DOS medidas ("Reduccion 2 a 1", "Buje 2 x 1") y ninguna
    // de las dos sola describe la pieza. Y "Galón 3 en 1" —nombre real de la
    // bodega— no trae ninguna: el "3 en 1" es cómo se llama el aceite. Antes se
    // quedaba con el primer número y el galón entraba como pieza de 3".
    // Mientras no haya campo para una segunda medida, no se inventa.
    if (/^(a|x|×|por|en)\s*\d/.test(despues)) return null;
    return `${num}"`;
};

/**
 * Las pulgadas que existen de verdad en ferretería, en orden.
 *
 * Sirve para las familias de tubería y sus accesorios, donde `denominacionesDe`
 * no tiene nada que ofrecer hasta que alguien cargue el primer ítem — y ese
 * primero es justo el que se escribe a mano y sale mal. Un codo se pide de
 * media, de tres cuartos o de una; ofrecer la escalera evita que cada quien
 * invente su forma de escribirla.
 */
export const PULGADAS_ESTANDAR = ['1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"', '2"', '2 1/2"', '3"', '4"', '6"'];

/**
 * Familias que se miden en pulgadas: el tubo y todo lo que se le enrosca.
 *
 * Es a propósito una lista corta y explícita, no una regla de parecido. Que un
 * nombre traiga un número no lo vuelve tubería, y ofrecerle pulgadas a una
 * familia de palas sería ruido en la pantalla del que está despachando.
 */
const FAMILIAS_EN_PULGADAS = [
    'tubo', 'tuberia', 'codo', 'tee', 'te', 'union', 'reduccion', 'adaptador',
    'buje', 'niple', 'tapon', 'yee', 'sifon', 'registro', 'llave', 'valvula',
    'abrazadera', 'soldadura', 'manguera', 'brida', 'copa', 'racor',
];

export const seMideEnPulgadas = (familia: string): boolean => {
    const f = familia.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return FAMILIAS_EN_PULGADAS.some(x => f === x || f.startsWith(x + ' '));
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

/**
 * Las DENOMINACIONES (medidas) que ya existen, opcionalmente solo las de un género.
 *
 * `familia` es opcional y solo sirve para una cosa: si la familia se mide en
 * pulgadas (tubo, codo, unión…), se le suma la escalera estándar a lo que ya
 * haya. Así el primer codo de la bodega tiene de dónde escoger en vez de tener
 * que escribir la medida a mano, que es donde se cuelan los "3/4" mal puestos.
 */
export const denominacionesDe = (
    deLaFamilia: { name: string }[],
    genero?: string,
    familia?: string,
): string[] => {
    const g = genero?.trim().toLowerCase();
    const vistas = new Set<string>();
    for (const i of deLaFamilia) {
        if (g && materialDe(i.name)?.toLowerCase() !== g) continue;
        const m = medidaDe(i.name);
        if (m) vistas.add(m);
    }
    if (familia && seMideEnPulgadas(familia)) for (const p of PULGADAS_ESTANDAR) vistas.add(p);
    // Por número, no alfabético: 1" antes que 10", y 1/2" antes que 1".
    return [...vistas].sort((a, b) => valorDeMedida(a) - valorDeMedida(b));
};

/**
 * TODAS las medidas que la bodega ya usa, vengan de la familia que vengan.
 *
 * «Tres pulgadas» es la misma medida así sea un clavo, un tubo o un codo. La
 * medida es un vocabulario de toda la bodega, no una propiedad de cada familia:
 * si la bodega ya conoce 3" por los clavos, esa medida debería poderse ofrecer
 * al cargar tubos — no porque un clavo sea un tubo, sino porque la pulgada es
 * la misma pulgada.
 *
 * Para qué sirve de verdad: es lo que evita que alguien escriba `3"`, otro
 * `3 pulg` y otro `3 pulgadas` y terminen siendo tres medidas que son una. La
 * app propone lo que ya existe; nadie inventa una forma nueva de escribirlo.
 */
export const todasLasMedidas = (items: { name: string }[]): string[] => {
    const vistas = new Set<string>();
    for (const i of items) {
        const m = medidaDe(i.name);
        if (m) vistas.add(m);
    }
    return [...vistas].sort((a, b) => valorDeMedida(a) - valorDeMedida(b));
};

/**
 * Las medidas de OTRAS familias: las que existen en la bodega y esta familia
 * todavía no tiene.
 *
 * Van aparte y no revueltas con las propias porque no valen lo mismo: las de la
 * familia son lo que esta cosa ya ha sido, y estas son una sugerencia prestada.
 * Mostrarlas juntas haría parecer que la bodega ya tiene codos de 6" cuando
 * nunca ha tenido uno.
 */
export const medidasPrestadas = (
    todosLosItems: { name: string }[],
    yaOfrecidas: string[],
): string[] => {
    const propias = new Set(yaOfrecidas);
    return todasLasMedidas(todosLosItems).filter(m => !propias.has(m));
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
