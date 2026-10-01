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

import { Item, Personnel, Project } from '../types.js';
import { rankMatches, Scored } from './search.js';
import { normStr, raizDeFamilia } from './genus.js';

/** Un ítem pedido dentro de un renglón. */
export interface ItemLote {
    /**
     * Identidad ESTABLE de este ítem dentro del lote.
     *
     * Existe por un bug: las decisiones de la pantalla —qué ítem se eligió, de
     * qué tipo nace el que se va a crear— se guardaban bajo claves de posición
     * (`0:1`). Al quitar un renglón, los siguientes se corrían y **heredaban
     * las decisiones del vecino**: un ítem marcado «Consumo» se creaba como
     * «Eléctrica», y con eso volvía por otra puerta el error de préstamo vs.
     * gasto que ya se había arreglado.
     *
     * Con un id que no depende del índice, borrar un renglón no le mueve nada a
     * los demás.
     */
    id: string;
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

/**
 * Lo que dice un encabezado `@ El Cristo · 07:30 · contenedor`, y que heredan
 * los renglones que tiene debajo hasta el siguiente encabezado.
 *
 * Existe porque una mañana real no es UNA obra a UNA hora: a las 7:30 sale
 * cemento para El Cristo y a las 7:35 una pulidora para Bonilla. Con una sola
 * obra por bloque, unificar la mañana mandaba todo a la obra que se eligiera,
 * con la misma hora: un registro limpio y equivocado, el que nadie nota.
 */
export interface Encabezado {
    /** La obra como la escribieron. Vacía: el encabezado no dijo obra. */
    obraTexto?: string;
    obra?: Project;
    obraDudosa: boolean;
    candidatosObra: Project[];
    /** «sin obra» / «sin proyecto» dicho a propósito: es una decisión, no un olvido. */
    sinObra: boolean;
    /** HH:MM, ya normalizada. */
    hora?: string;
    /** Lo que no es obra ni hora: «contenedor», «segundo piso». */
    lugar?: string;
}

/** Un renglón: una persona y lo que se lleva. */
export interface LineaLote {
    /** Identidad estable del renglón, por lo mismo que la de sus ítems. */
    id: string;
    /** El nombre tal cual lo escribieron, para mostrarlo si no se resolvió. */
    personaTexto: string;
    persona?: Personnel;
    candidatosPersona: Personnel[];
    dudosa: boolean;
    items: ItemLote[];
    /** El encabezado `@` que tenía encima, si había. */
    encabezado?: Encabezado;
    /** «Juan (cuadrilla de Alex)»: el nombre del oficial, tal cual. */
    cuadrillaTexto?: string;
    /** Ese oficial, si se reconoció. */
    cuadrillaDe?: Personnel;

    // ── Decisiones de la verificación (las toma quien mira, no el lector) ──
    /**
     * La obra decidida para este renglón. `undefined`: nadie decidió todavía.
     * `null`: «sin obra», decidido. Igual que el chat, se pregunta siempre.
     */
    obraId?: string | null;
    /** Obra nueva a crear al registrar, como el «+ Nuevo proyecto» del chat. */
    obraNueva?: string;
    /**
     * Cuando la persona es OFICIAL: para quién de su cuadrilla es. El id del
     * propio oficial = «sin especificar», la misma salida que ofrece el chat.
     */
    paraId?: string;
    /**
     * Persona que no existe y se va a CREAR al registrar, con su cuadrilla.
     * Nunca en silencio: así quedó Rafael en la cuadrilla de Alex sin que nadie
     * lo decidiera. Acá se crea solo si alguien lo confirma en pantalla.
     */
    crear?: { nombre: string; liderId?: string };
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
/**
 * Las unidades con que se DICE una cantidad: «2 pares de guantes», «3 bultos de
 * cemento». Tapan el nombre: el buscador comparaba «pares de guantes» contra
 * «Guantes» y no encontraba nada, y lo que más se pide en la obra quedaba sin
 * reconocer.
 */
const UNIDAD_DICHA = /^(?:pares?|bultos?|metros?|galones?|kilos?|kg|libras?|cajas?|rollos?|unidades?|paquetes?|cuñetes?|bolsas?|tarros?|latas?|varillas?|tubos?)\s+de\s+/i;

const buscarItem = (items: Item[], nombre: string): Scored<Item>[] => {
    // Primero como se dijo (puede haber un ítem que se llame «Metros de
    // manguera»); si no aparece nada bueno, sin la unidad delante.
    const tal = buscarItemCrudo(items, nombre);
    const sinUnidad = nombre.replace(UNIDAD_DICHA, '');
    if ((tal[0]?.score ?? 0) >= MINIMO || sinUnidad === nombre) return tal;
    const otra = buscarItemCrudo(items, sinUnidad);
    return (otra[0]?.score ?? 0) > (tal[0]?.score ?? 0) ? otra : tal;
};

const buscarItemCrudo = (items: Item[], nombre: string): Scored<Item>[] => {
    const textos = (i: Item) => [i.name, i.familia ?? '', i.subCategory ?? ''];
    const directo = rankMatches(items, nombre, textos, 4);
    if (directo[0] && directo[0].score >= MINIMO) return directo;
    const raiz = raizDeFamilia(nombre);
    if (raiz === normStr(nombre)) return directo;
    const porRaiz = rankMatches(items, raiz, textos, 4);
    return (porRaiz[0]?.score ?? 0) > (directo[0]?.score ?? 0) ? porRaiz : directo;
};

/**
 * Resolver una persona o un ítem sueltos, con la MISMA regla del bloque.
 *
 * El endpoint de consulta y el de registro tienen que reconocer a «Abel» y a
 * «la pulidora» igual que el bloque pegado: si cada puerta tuviera su propio
 * buscador, la misma frase encontraría cosas distintas según por dónde entre.
 */
export const resolverPersona = (texto: string, personnel: Personnel[]): { elegido?: Personnel; dudoso: boolean; candidatos: Personnel[] } => {
    const r = rankMatches(personnel, texto, p => [p.name], 4);
    return { ...escoger(r), candidatos: r.map(x => x.value) };
};

export const resolverItem = (texto: string, items: Item[]): { elegido?: Item; dudoso: boolean; candidatos: Item[] } => {
    const { cantidad: _c, nombre } = partirCantidad(texto);
    const r = buscarItem(items, nombre);
    return { ...escoger(r), candidatos: r.map(x => x.value) };
};

/**
 * TODOS los ítems que responden a un nombre, no uno solo.
 *
 * «¿Dónde están las pulidoras?» no pregunta por una: pregunta por la familia
 * entera —grandes, pequeñas, de cada marca—. Elegir la mejor coincidencia
 * contestaría por una y callaría las otras cinco.
 */
export const itemsQueResponden = (texto: string, items: Item[], tope = 25): Item[] => {
    const { nombre } = partirCantidad(texto);
    const textos = (i: Item) => [i.name, i.familia ?? '', i.subCategory ?? ''];
    const buenos = (t: string) => rankMatches(items, t, textos, tope).filter(x => x.score >= MINIMO).map(x => x.value);
    const directos = buenos(nombre);
    const raiz = raizDeFamilia(nombre);
    const porRaiz = raiz === normStr(nombre) ? [] : buenos(raiz);
    return [...new Map([...directos, ...porRaiz].map(i => [i.id, i])).values()];
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
/**
 * Normaliza una hora dictada: «7:30», «07.30», «7h30», «7:30 pm», «14:05».
 * Lo que no se entiende como hora devuelve `undefined`: se trata como lugar, no
 * se adivina una hora.
 */
export const leerHora = (t: string): string | undefined => {
    const m = normStr(t).replace(/\s+/g, ' ').match(/^(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(am|pm|a\.? ?m\.?|p\.? ?m\.?)?$/);
    if (!m || (!m[2] && !m[3])) return undefined;
    let h = Number(m[1]);
    const min = Number(m[2] ?? '0');
    const pm = !!m[3] && m[3].startsWith('p');
    const am = !!m[3] && m[3].startsWith('a');
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
    if (h > 23 || min > 59) return undefined;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

/** Lee un encabezado `@ obra · hora · lugar`. Las tres partes son opcionales. */
export const leerEncabezado = (renglon: string, projects: Project[]): Encabezado => {
    const partes = renglon.replace(/^@\s*/, '').split(/\s*[·|]\s*|\s+[-–—]\s+/).map(limpiar).filter(Boolean);
    const enc: Encabezado = { obraDudosa: false, candidatosObra: [], sinObra: false };
    const lugares: string[] = [];
    for (const p of partes) {
        const hora = leerHora(p);
        if (hora && !enc.hora) { enc.hora = hora; continue; }
        if (enc.obraTexto === undefined && !enc.sinObra && lugares.length === 0) {
            if (/^sin (obra|proyecto)$/.test(normStr(p))) { enc.sinObra = true; continue; }
            enc.obraTexto = p;
            continue;
        }
        lugares.push(p);
    }
    if (lugares.length) enc.lugar = lugares.join(' · ');
    if (enc.obraTexto) {
        const r = rankMatches(projects, enc.obraTexto, x => [x.name], 4);
        const { elegido, dudoso } = escoger(r);
        enc.obra = elegido;
        enc.obraDudosa = dudoso;
        enc.candidatosObra = r.map(x => x.value);
    }
    return enc;
};

/**
 * «Juan (cuadrilla de Alex)» → persona «Juan», cuadrilla «Alex». Cualquier otro
 * paréntesis («Alex (oficial)») se quita del nombre: es una aclaración, no
 * parte de cómo se llama.
 */
export const partirPersona = (texto: string): { nombre: string; cuadrilla?: string } => {
    const m = texto.match(/\(\s*(?:de\s+la\s+)?cuadrilla\s+(?:de\s+)?([^)]+)\)/i);
    const nombre = limpiar(texto.replace(/\([^)]*\)/g, ' '));
    return { nombre, cuadrilla: m ? limpiar(m[1]) : undefined };
};

export const leerLote = (texto: string, personnel: Personnel[], items: Item[], projects: Project[] = []): LoteParseado => {
    const lineas: LineaLote[] = [];
    const ignoradas: string[] = [];
    /**
     * Un contador, no el índice del arreglo. Ese es todo el punto: el índice se
     * corre cuando alguien borra un renglón; este número ya no vuelve a salir.
     */
    let siguiente = 0;
    const nuevoId = (): string => `L${++siguiente}`;

    let encabezado: Encabezado | undefined;
    for (const cruda of texto.split(/\r?\n/)) {
        const renglon = limpiar(cruda);
        if (!renglon) continue;
        // Un encabezado no es un renglón: cambia la obra, la hora y el lugar de
        // los que vienen debajo, hasta el próximo encabezado.
        if (renglon.startsWith('@')) { encabezado = leerEncabezado(renglon, projects); continue; }

        // Los dos puntos mandan. El guion es el respaldo, y solo si no hay dos
        // puntos, porque hay nombres con guion y partir por ahí los rompería.
        const corte = renglon.includes(':')
            ? renglon.indexOf(':')
            : renglon.search(/\s+[-–—]\s+/);
        if (corte <= 0) { ignoradas.push(renglon); continue; }

        const personaTexto = limpiar(renglon.slice(0, corte));
        const resto = limpiar(renglon.slice(corte).replace(/^[:\s\-–—]+/, ''));
        if (!personaTexto || !resto) { ignoradas.push(renglon); continue; }

        const { nombre: nombrePersona, cuadrilla } = partirPersona(personaTexto);
        const rp = rankMatches(personnel, nombrePersona, p => [p.name], 4);
        const { elegido: persona, dudoso: dudosa } = escoger(rp);
        const rc = cuadrilla ? escoger(rankMatches(personnel.filter(p => p.isTeamLeader), cuadrilla, p => [p.name], 4)) : undefined;

        const itemsLinea: ItemLote[] = partirItems(resto).map(trozo => {
            const { cantidad, nombre } = partirCantidad(trozo);
            const ri = buscarItem(items, nombre);
            const { elegido: item, dudoso } = escoger(ri);
            return { id: nuevoId(), texto: trozo, cantidad, nombre, item, candidatos: ri.map(r => r.value), dudoso };
        });

        if (itemsLinea.length === 0) { ignoradas.push(renglon); continue; }

        lineas.push({
            id: nuevoId(),
            personaTexto: nombrePersona,
            persona,
            candidatosPersona: rp.map(r => r.value),
            dudosa,
            items: itemsLinea,
            encabezado,
            cuadrillaTexto: cuadrilla,
            cuadrillaDe: rc && !rc.dudoso ? rc.elegido : undefined,
            // La obra del encabezado ya es una decisión si se reconoció sin
            // duda, o si dijo «sin obra» a propósito. Si no, se pregunta.
            obraId: encabezado?.sinObra ? null : (encabezado?.obra && !encabezado.obraDudosa ? encabezado.obra.id : undefined),
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

/**
 * Pasa UN elemento a otra persona, sin rehacer nada.
 *
 * «La pulidora no era para Alex, era para Juan.» Antes había que borrarla de
 * Alex y escribirla de nuevo en Juan, y en ese ir y venir es donde se pierden
 * cosas. Si ya hay un renglón de esa persona con la misma obra y hora, se suma
 * ahí; si no, nace un renglón nuevo que hereda el encabezado del de origen.
 */
export const moverItem = (lote: LoteParseado, itemLoteId: string, persona: Personnel, nuevoId: string): LoteParseado => {
    const origen = lote.lineas.find(l => l.items.some(it => it.id === itemLoteId));
    if (!origen) return lote;
    const it = origen.items.find(x => x.id === itemLoteId)!;
    if (origen.persona?.id === persona.id) return lote;
    const mismaObraYHora = (l: LineaLote) =>
        l.persona?.id === persona.id && l.obraId === origen.obraId
        && l.encabezado?.hora === origen.encabezado?.hora && l.id !== origen.id;
    let lineas = lote.lineas
        .map(l => (l.id === origen.id ? { ...l, items: l.items.filter(x => x.id !== itemLoteId) } : l));
    const destino = lineas.find(mismaObraYHora);
    if (destino) {
        lineas = lineas.map(l => (l.id === destino.id ? { ...l, items: [...l.items, it] } : l));
    } else {
        const i = lineas.findIndex(l => l.id === origen.id);
        const nueva: LineaLote = {
            id: nuevoId, personaTexto: persona.name, persona, candidatosPersona: [], dudosa: false,
            items: [it], encabezado: origen.encabezado, obraId: origen.obraId, obraNueva: origen.obraNueva,
        };
        lineas = [...lineas.slice(0, i + 1), nueva, ...lineas.slice(i + 1)];
    }
    return { ...lote, lineas: lineas.filter(l => l.items.length > 0) };
};
