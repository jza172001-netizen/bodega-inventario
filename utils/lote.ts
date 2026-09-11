/**
 * utils/lote.ts — El bloque pegado
 * ================================
 * En la mañana real llegan diez trabajadores y piden sesenta cosas en media
 * hora. El asistente despacha muchas cosas a UNA persona bien, pero para diez
 * personas hay que correrlo diez veces, con sus pasos cada vez. Eso es lo que
 * convierte media hora en un infierno: no es la velocidad de tecleo, es que la
 * puerta de entrada es de a una persona.
 *
 * Acá entra el bloque completo de una:
 *
 *     Alex: 3 palas, 1 martillo y una pica
 *     Juan: 2 palas, 1 palín
 *     Pedro: 1 escalera, 2 rodilleras
 *
 * Este archivo SOLO LEE TEXTO. No registra nada, no toca stock, no crea nada.
 * Devuelve lo que entendió para que una pantalla lo muestre y un humano lo
 * apruebe. Esa separación es a propósito: el texto lo produce un GPT de afuera
 * a partir del voz-a-texto, y un GPT se equivoca interpretando. La pantalla de
 * confirmación es donde eso se atrapa, antes de que toque el inventario.
 *
 * Está aparte de React para poder probarlo sin navegador — y porque
 * FloatingChat.tsx ya tiene 2.300 líneas.
 */

import { Item, Personnel } from '../types';
import { rankMatches, Scored } from './search';
import { normStr, raizDeFamilia } from './genus';

/** Un ítem pedido dentro de un renglón. */
export interface ItemLote {
    /** El pedazo de texto tal cual venía, para poder mostrarlo si algo falla. */
    texto: string;
    cantidad: number;
    /** El nombre pedido, ya sin la cantidad ni el artículo. */
    nombre: string;
    /** El ítem del inventario al que se resolvió, si se encontró. */
    item?: Item;
    /** Otras opciones parecidas, cuando la resolución no fue clara. */
    candidatos: Item[];
    /**
     * No hay coincidencia, o hay dos igual de buenas. No frena el lote: se
     * marca para que el humano decida en la confirmación.
     */
    dudoso: boolean;
}

/** Un renglón: una persona y lo que se lleva. */
export interface LineaLote {
    /** El nombre tal cual lo escribieron, para mostrarlo si no se resolvió. */
    personaTexto: string;
    persona?: Personnel;
    candidatosPersona: Personnel[];
    dudosa: boolean;
    items: ItemLote[];
}

export interface LoteParseado {
    lineas: LineaLote[];
    /**
     * Renglones que no se pudieron leer como "persona: cosas". No se botan: se
     * devuelven para mostrarlos, porque un renglón perdido en silencio es un
     * despacho perdido, y la regla de la bodega es que el movimiento no se
     * pierda.
     */
    ignoradas: string[];
}

/**
 * Cómo se dicen las cantidades cuando se habla, no cuando se digita.
 *
 * El bloque sale de un dictado: nadie dice "1 martillo", dice "un martillo".
 * Sin esto, "una pica" quedaría como un ítem llamado "una pica" y no se
 * encontraría nunca.
 */
const NUMEROS: Record<string, number> = {
    un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
    siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
    catorce: 14, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
};

/** Artículos y muletillas que sobran al principio del nombre. */
const RELLENO = /^(?:unos|unas|los|las|el|la|de|del)\s+/i;

/**
 * El puntaje mínimo para dar una coincidencia por buena.
 *
 * `rankMatches` puntúa por capas (exacto 1000, prefijo 900, contiene 700,
 * palabra parecida 500). Por debajo de 500 ya es adivinanza, y adivinar a quién
 * se le entregó una herramienta es peor que preguntar.
 */
const MINIMO = 500;
/** Si el segundo candidato viene pisándole los talones al primero, no hay ganador. */
const MARGEN = 100;

const limpiar = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Separa "3 palas" en cantidad y nombre. Sin número, es uno.
 *
 * Acepta decimales —"1,5 metros de manguera"— porque no todo se cuenta en
 * unidades enteras: la manguera se mide en metros y el cemento en kilos. Antes
 * "1,5 palas" devolvía cantidad 1 y nombre ",5 palas", o sea que perdía el
 * decimal Y ensuciaba el nombre.
 */
export const partirCantidad = (texto: string): { cantidad: number; nombre: string } => {
    const t = limpiar(texto);
    const conDigito = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(.+)$/);
    if (conDigito) return { cantidad: Number(conDigito[1].replace(',', '.')), nombre: limpiar(conDigito[2]) };
    const palabras = t.split(/\s+/);
    const n = NUMEROS[normStr(palabras[0] ?? '')];
    if (n !== undefined && palabras.length > 1) return { cantidad: n, nombre: limpiar(palabras.slice(1).join(' ')) };
    return { cantidad: 1, nombre: limpiar(t.replace(RELLENO, '')) };
};

/**
 * Escoge entre los candidatos, o se abstiene.
 *
 * Se abstiene en dos casos y los dos importan: cuando nada se parece lo
 * suficiente, y cuando hay dos cosas igual de parecidas —"pulidora grande" y
 * "pulidora pequeña"—. En ese segundo caso elegir al azar es peor que no
 * elegir, porque el error queda registrado con cara de correcto.
 */
const escoger = <T,>(rank: { value: T; score: number }[]): { elegido?: T; dudoso: boolean } => {
    const [primero, segundo] = rank;
    if (!primero || primero.score < MINIMO) return { dudoso: true };
    if (segundo && primero.score - segundo.score < MARGEN) return { elegido: primero.value, dudoso: true };
    return { elegido: primero.value, dudoso: false };
};

/**
 * Busca el ítem por lo que escribieron y, si eso no alcanza, por la raíz.
 *
 * Nadie pide "una pala": pide "tres palas". Y "palas" contra "Pala" no le pega
 * a ninguna capa del buscador —no es prefijo, no la contiene, y el largo no
 * cuadra para la capa difusa—, así que la cosa más pedida de la bodega no se
 * encontraba.
 *
 * La segunda pasada usa `raizDeFamilia`, que es la regla de singular/plural que
 * la app YA tiene y que ya decidió qué se perdona (el plural y las tildes) y
 * qué no ("broca" nunca se junta con "brocha"). Escribir acá una segunda regla
 * de plural sería exactamente el error que el resto del código evitó.
 */
const buscarItem = (items: Item[], nombre: string): Scored<Item>[] => {
    const textos = (i: Item) => [i.name, i.familia ?? '', i.subCategory ?? ''];
    const directo = rankMatches(items, nombre, textos, 4);
    if (directo[0] && directo[0].score >= MINIMO) return directo;
    const raiz = raizDeFamilia(nombre);
    if (raiz === normStr(nombre)) return directo;
    const porRaiz = rankMatches(items, raiz, textos, 4);
    return (porRaiz[0]?.score ?? 0) > (directo[0]?.score ?? 0) ? porRaiz : directo;
};

/**
 * Parte la lista de cosas: por coma, por punto y coma, y por la "y" de
 * "3 palas y un martillo".
 *
 * LA COMA TIENE DOS OFICIOS Y CHOCAN. Separa ítems ("3 palas, 1 martillo") y
 * también es la coma decimal de "1,5 metros". Partir a ciegas por toda coma
 * rompía el renglón en dos y fabricaba una línea fantasma:
 *
 *     "Alex: 1,5 metros de manguera, 2 palas"
 *        →  1 x "1"                    (basura)
 *        →  5 x "metros de manguera"   (cantidad inventada)
 *        →  2 x "palas"
 *
 * La regla que los distingue es simple y no necesita adivinar: una coma
 * ENTRE DOS DÍGITOS es decimal; cualquier otra separa. Por eso el corte pide
 * que la coma no tenga dígito antes o no tenga dígito después.
 */
const partirItems = (resto: string): string[] =>
    resto
        .split(/\s*;\s*|\s*(?:(?<!\d),|,(?!\d))\s*|\s+y\s+|\s+e\s+/i)
        .map(limpiar)
        .filter(Boolean);

/**
 * Lee el bloque completo.
 *
 * No crea trabajadores ni ítems, ni siquiera cuando está seguro. Solo dice qué
 * entendió. Crear a alguien en silencio en mitad de un despacho ya pasó una vez
 * —así quedó Rafael en la cuadrilla de Alex sin que nadie lo decidiera— y no se
 * repite.
 */
export const leerLote = (texto: string, personnel: Personnel[], items: Item[]): LoteParseado => {
    const lineas: LineaLote[] = [];
    const ignoradas: string[] = [];

    for (const cruda of texto.split(/\r?\n/)) {
        const renglon = limpiar(cruda);
        if (!renglon) continue;

        // Los dos puntos mandan. El guion es el respaldo, y solo si no hay dos
        // puntos, porque hay nombres con guion y partir por ahí los rompería.
        const corte = renglon.includes(':')
            ? renglon.indexOf(':')
            : renglon.search(/\s+[-–—]\s+/);
        if (corte <= 0) { ignoradas.push(renglon); continue; }

        const personaTexto = limpiar(renglon.slice(0, corte));
        const resto = limpiar(renglon.slice(corte).replace(/^[:\s\-–—]+/, ''));
        if (!personaTexto || !resto) { ignoradas.push(renglon); continue; }

        const rp = rankMatches(personnel, personaTexto, p => [p.name], 4);
        const { elegido: persona, dudoso: dudosa } = escoger(rp);

        const itemsLinea: ItemLote[] = partirItems(resto).map(trozo => {
            const { cantidad, nombre } = partirCantidad(trozo);
            const ri = buscarItem(items, nombre);
            const { elegido: item, dudoso } = escoger(ri);
            return { texto: trozo, cantidad, nombre, item, candidatos: ri.map(r => r.value), dudoso };
        });

        if (itemsLinea.length === 0) { ignoradas.push(renglon); continue; }

        lineas.push({
            personaTexto,
            persona,
            candidatosPersona: rp.map(r => r.value),
            dudosa,
            items: itemsLinea,
        });
    }

    return { lineas, ignoradas };
};

/** Cuántas cosas hay que revisar antes de poder registrar sin miedo. */
export const contarDudas = (lote: LoteParseado): number =>
    lote.lineas.reduce(
        (n, l) => n + (l.dudosa ? 1 : 0) + l.items.filter(i => i.dudoso).length,
        0,
    ) + lote.ignoradas.length;
