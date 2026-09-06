
import { normStr, editDistance } from '../utils/genus';
import { scoreMatch } from '../utils/search';

/**
 * La ayuda, en forma de preguntas.
 *
 * Antes la ayuda era un acordeón: para saber cómo se devuelve una herramienta
 * tocaba abrir secciones hasta dar con ella. Pero al lado hay un asistente al
 * que uno ya le pregunta cosas — *"¿quién tiene el taladro?"* — y funciona.
 * Entonces la ayuda se pregunta igual: *"¿cómo devuelvo una herramienta?"*.
 *
 * El emparejamiento NO trae lógica nueva: usa `scoreMatch`, el mismo del
 * buscador universal que ya se usa en toda la app.
 */
export interface ComoSeHace {
    /** La pregunta tal como se muestra y como se manda al chat. */
    pregunta: string;
    /** Otras formas de preguntar lo mismo. */
    claves: string[];
    /** La respuesta, en markdown del que ya pinta el chat. */
    respuesta: string;
    /** Para agrupar la lista de preguntas. */
    tema: string;
}

export const COMO_SE_HACE: ComoSeHace[] = [
    // ── Sacar cosas de la bodega ─────────────────────────────────────────────
    {
        tema: 'Sacar de la bodega',
        pregunta: '¿Cómo le entrego una herramienta a un trabajador?',
        claves: ['prestar herramienta', 'presto una herramienta', 'asignar herramienta', 'entregar herramienta', 'dar herramienta', 'sacar herramienta'],
        respuesta: [
            '**Con el asistente, botón ⚡ Rápido** — es lo de todos los días:',
            '1. Elegís el trabajador. Si es oficial, sale un paso más para decir cuál de su cuadrilla se la lleva.',
            '2. Elegís el tipo (manual, eléctrica, EPP o consumible).',
            '3. Elegís el ítem. Si no existe, "➕ Crear nuevo" lo crea y lo asigna de una.',
            '4. Proyecto, si aplica. Confirmás.',
            '',
            'La herramienta queda como **préstamo**: aparece en Kardex → Préstamos hasta que vuelva.',
        ].join('\n'),
    },
    {
        tema: 'Sacar de la bodega',
        pregunta: '¿Cómo saco varias cosas de una sola vez?',
        claves: ['despacho', 'varios items', 'salida grande', 'muchas herramientas', 'sacar varias'],
        respuesta: [
            '**Asistente → 🚀 Despacho.** Es para cuando sale un combo completo:',
            '1. Marcás los tipos que vas a sacar (podés marcar varios).',
            '2. El trabajador.  3. El proyecto.  4. Los ítems con sus cantidades.',
            '',
            'En la confirmación podés **cambiar la fecha** si estás registrando algo de ayer.',
            'Las herramientas quedan como préstamo; los consumibles y el EPP son salida definitiva.',
        ].join('\n'),
    },
    {
        tema: 'Sacar de la bodega',
        pregunta: '¿Qué diferencia hay entre préstamo y salida?',
        claves: ['prestamo o salida', 'diferencia prestamo salida', 'que es prestamo', 'que es salida'],
        respuesta: [
            '**Préstamo** = herramienta manual o eléctrica. Se espera que vuelva, así que queda en Préstamos con los días contados.',
            '**Salida** = consumible o EPP. Se gastó, no vuelve, y por eso no hay nada que devolver.',
        ].join('\n'),
    },
    // ── Que vuelva ───────────────────────────────────────────────────────────
    {
        tema: 'Que vuelva',
        pregunta: '¿Cómo marco una herramienta como devuelta?',
        claves: ['devolver herramienta', 'devuelvo herramienta', 'devolvi la herramienta', 'marcar devuelta', 'registrar devolucion', 'volvio la herramienta'],
        respuesta: [
            '**Kardex → Préstamos → botón "✓ Devolver"** en la fila del trabajador.',
            'Se abre el formulario para decir **en qué estado volvió** (buena, desgastada, incompleta, dañada) y revisa los accesorios que salieron con ella.',
            '',
            'También podés devolver desde el **Historial** y desde la **ficha del trabajador**: es el mismo formulario.',
        ].join('\n'),
    },
    {
        tema: 'Que vuelva',
        pregunta: '¿Cómo marco algo para ir a recogerlo?',
        claves: ['a recoger', 'marcar recoger', 'ir a recoger', 'recoger herramienta', 'recojo una herramienta'],
        respuesta: [
            'En cualquier préstamo activo, botón **"📍 Recoger"**. Está en Préstamos, en el Historial y en la ficha del trabajador.',
            '',
            'Todo lo marcado se junta en la vista **A Recoger** del menú, con su contador. Ahí elegís a quién mandás a recogerlas y se arma el mensaje de WhatsApp con la lista.',
        ].join('\n'),
    },
    {
        tema: 'Que vuelva',
        pregunta: '¿Cómo le recuerdo a alguien que me devuelva algo?',
        claves: ['whatsapp recordatorio', 'recordar prestamo', 'avisar trabajador', 'mandar whatsapp'],
        respuesta: [
            '**Menú → WhatsApp.** Sale la lista de quién tiene herramientas y hace cuántos días; elegís y se abre el mensaje ya escrito.',
            '',
            'Solo aparecen **herramientas** (manual y eléctrica): un recordatorio es para que algo vuelva, y un consumible no vuelve.',
            'El trabajador tiene que tener el teléfono guardado en su ficha.',
        ].join('\n'),
    },
    // ── Meter cosas ──────────────────────────────────────────────────────────
    {
        tema: 'Meter a la bodega',
        pregunta: '¿Cómo agrego un ítem nuevo al inventario?',
        claves: ['agregar item', 'agrego un item', 'crear item', 'creo un item', 'item nuevo', 'registrar herramienta nueva', 'entro mercancia'],
        respuesta: [
            '**Asistente → ➕ Agregar**, o el botón "+ Añadir" del Inventario.',
            '',
            'Para herramientas se crea primero la **familia** (Pulidora) y después cada una con su **color y marca** — cada color·marca es un ítem aparte, para poder prestarlos por separado.',
            'Los consumibles y el EPP no llevan color ni marca: solo nombre y cantidad.',
        ].join('\n'),
    },
    {
        tema: 'Meter a la bodega',
        pregunta: '¿Qué es la familia de un ítem?',
        claves: ['familia', 'genero', 'arbol', 'agrupar items', 'como se agrupan'],
        respuesta: [
            'La **familia** es el nombre con el que vos pedís la cosa: «pulidora», «taladro», «clavos».',
            '',
            'Dentro de la familia se abre una **rama** por lo que la distingue — «grande» y «pequeña» en las pulidoras, el material en los clavos — y ya adentro va el **color y la marca**.',
            'Por eso al abrir "Clavos" salen las dos familias, y adentro 1 pulgada y 2 pulgadas.',
        ].join('\n'),
    },
    {
        tema: 'Meter a la bodega',
        pregunta: '¿Cómo engancho un accesorio a una herramienta?',
        claves: ['accesorio', 'broca', 'disco', 'accesorios herramienta'],
        respuesta: [
            'En **Préstamos**, en la fila de la herramienta, el selector **"+ Accesorio"**. Arriba salen los que le corresponden a esa familia (brocas para el taladro, discos para la pulidora) y abajo el resto.',
            '',
            'Si el accesorio todavía no existe, "➕ Crear uno nuevo…" lo crea ahí mismo.',
            'Para quitarlo, la **✕** del chip del accesorio.',
        ].join('\n'),
    },
    {
        tema: 'Meter a la bodega',
        pregunta: '¿Para qué sirve la lista de pedidos?',
        claves: ['lista de pedidos', 'pedidos', 'comprar', 'que hay que comprar'],
        respuesta: [
            'Es la libreta de **lo que hay que comprar**. No toca el inventario: acá se anota, nada más.',
            '',
            'Escribís lo que falta, la cantidad y el color si importa. Con el **+** de la izquierda de los colores agregás uno que la bodega todavía no tenga, y queda guardado para la próxima.',
        ].join('\n'),
    },
    // ── Gente ────────────────────────────────────────────────────────────────
    {
        tema: 'La gente',
        pregunta: '¿Cómo marco a alguien como jefe de cuadrilla?',
        claves: ['oficial', 'cuadrilla', 'jefe de cuadrilla', 'sub trabajador'],
        respuesta: [
            '**Personal → ✏️ en su tarjeta → "Es jefe de cuadrilla"**.',
            '',
            'Desde ahí, cuando le asignás una herramienta al oficial, sale un paso extra para decir cuál de sus trabajadores se la lleva. Así se sabe quién la tiene de verdad.',
        ].join('\n'),
    },
    {
        tema: 'La gente',
        pregunta: '¿Cómo paso una herramienta de un trabajador a otro?',
        claves: ['traspasar', 'transferir herramienta', 'cambiar de trabajador', 'pasar herramienta'],
        respuesta: [
            'En la **ficha del trabajador** (tocá su nombre en Personal, o en el detalle de un proyecto), en el préstamo hay la opción de **pasarlo a otro trabajador**.',
            '',
            'No hace falta devolver y volver a sacar: el préstamo sigue siendo el mismo, solo cambia de manos, y queda el registro.',
        ].join('\n'),
    },
    // ── Mirar ────────────────────────────────────────────────────────────────
    {
        tema: 'Mirar y revisar',
        pregunta: '¿Dónde veo todo lo que ha pasado con un ítem?',
        claves: ['historial de un item', 'trazabilidad item', 'quien tuvo', 'historico'],
        respuesta: [
            '**Tocá el nombre del ítem** en cualquier lista — Inventario, Historial, Préstamos o el detalle de un proyecto — y se abre su histórico: cada entrada, salida, préstamo y devolución con fecha y con quién.',
        ].join('\n'),
    },
    {
        tema: 'Mirar y revisar',
        pregunta: '¿Cómo saco el informe en Word?',
        claves: ['informe', 'docx', 'word', 'reporte', 'exportar'],
        respuesta: [
            'Al **final del Resumen**, botón de exportar. Baja un .docx con dos partes: **Inventario** (herramienta manual y eléctrica) y **Consumos** (consumibles y EPP), en orden alfabético.',
        ].join('\n'),
    },
    {
        tema: 'Mirar y revisar',
        pregunta: '¿Qué es el cotejo del Resumen?',
        claves: ['cotejo', 'hallazgos', 'revisar diferencias', 'ya lo revise'],
        respuesta: [
            'Está al **final del Resumen**. Compara lo que dice la bodega contra lo que dicen los movimientos y muestra lo que no cuadra: ítems sin registro de creación, cantidades que no dan, nombres que cambiaron.',
            '',
            'Cuando revisás uno, el botón **"✓ Ya lo revisé"** lo deja marcado con tu nombre y la fecha en la trazabilidad.',
        ].join('\n'),
    },
    {
        tema: 'Mirar y revisar',
        pregunta: '¿Los datos se guardan solos?',
        claves: ['se guarda', 'guardar', 'sincroniza', 'nube', 'otro celular'],
        respuesta: [
            'Sí. Cada cambio se guarda al instante en el celular y en la nube, y se sincroniza **en vivo** con los demás aparatos que tengan la app abierta.',
            '',
            'Sin señal la app sigue funcionando y sube los cambios cuando vuelve.',
        ].join('\n'),
    },
];

/** Todas las preguntas, agrupadas por tema, para pintarlas como botones. */
export const TEMAS_DE_AYUDA = (): Array<{ tema: string; preguntas: ComoSeHace[] }> => {
    const orden: string[] = [];
    const porTema = new Map<string, ComoSeHace[]>();
    for (const c of COMO_SE_HACE) {
        if (!porTema.has(c.tema)) { porTema.set(c.tema, []); orden.push(c.tema); }
        porTema.get(c.tema)!.push(c);
    }
    return orden.map(tema => ({ tema, preguntas: porTema.get(tema)! }));
};

/**
 * Las palabras con las que arranca una pregunta de uso.
 *
 * No van en una expresión regular porque él escribe rápido y en el celular:
 * "comoo", "cmo", "donde" sin tilde. Se comparan con la misma distancia de
 * edición que usa el buscador para las herramientas mal escritas.
 */
const ABRE_PREGUNTA = ['como', 'donde', 'cuando', 'cual', 'sirve', 'diferencia', 'puedo', 'explica', 'ensename', 'ayuda'];

const FRASES_DE_USO = /para que sirve|que diferencia|se hace|se puede|se guarda|no se como|que es (la|el|un|una) /;

/** ¿Alguna palabra de la frase es un «cómo», aunque venga con dedazos? */
const suenaAComo = (q: string): boolean => {
    if (FRASES_DE_USO.test(q)) return true;
    for (const p of q.split(/\s+/).filter(Boolean)) {
        for (const abre of ABRE_PREGUNTA) {
            if (p === abre) return true;
            // Un error de dedo en una palabra corta: "comoo", "cmo", "donde"→"dnde".
            if (Math.abs(p.length - abre.length) <= 2 && editDistance(p, abre) <= 1) return true;
        }
    }
    return false;
};

const UMBRAL = 55;

/** Palabras que no distinguen nada: si cuentan, todo se parece a todo. */
const VACIAS = new Set(['de','del','la','el','los','las','un','una','unos','unas','y','a','al','en','con','para','que','se','me','mi','le','lo','es','esta','este','como','donde','cual','cuando','hay','por','o','u','ya','todo','cosa','cosas','app']);

/** Dos palabras son la misma con un dedazo de por medio. */
const mismaPalabra = (a: string, b: string): boolean => {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 2) return false;
    const tolerancia = a.length >= 6 ? 2 : a.length >= 4 ? 1 : 0;
    return editDistance(a, b) <= tolerancia;
};

/**
 * Qué tanto de la clave aparece en la pregunta, palabra por palabra.
 *
 * `scoreMatch` pide que TODAS las palabras enganchen y por eso "comoo devulvo
 * una erramienta" —tres dedazos en cuatro palabras— se le escapaba. Acá cada
 * palabra de la clave busca su pareja con la misma distancia de edición que usa
 * el buscador para "pulidora" escrita "pulidra", y lo que manda es la fracción
 * que sí encontró.
 */
const cobertura = (clave: string, pregunta: string): number => {
    const suyas = normStr(clave).split(/\s+/).filter(p => p && !VACIAS.has(p));
    if (!suyas.length) return 0;
    const dichas = normStr(pregunta).split(/\s+/).filter(p => p && !VACIAS.has(p));
    if (!dichas.length) return 0;
    const pegaron = suyas.filter(s => dichas.some(d => mismaPalabra(s, d))).length;
    return Math.round((pegaron / suyas.length) * 100);
};

/**
 * La respuesta de «cómo se hace» que mejor pegue, o nada.
 *
 * Puntúa con `scoreMatch` —el del buscador universal— y lo hace en LOS DOS
 * SENTIDOS, igual que `looseMatch` en el buscador de herramientas: la pregunta
 * contra la clave y la clave contra la pregunta. Sin el segundo sentido,
 * "¿dónde veo el historial de un ítem?" no pegaba con la clave "historial de un
 * item", porque las palabras de más —"dónde", "veo"— tumbaban el puntaje.
 */
export const comoSeHace = (mensaje: string): ComoSeHace | null => {
    const q = normStr(mensaje);
    if (!q) return null;
    if (!suenaAComo(q)) return null;

    let mejor: ComoSeHace | null = null;
    let mejorPuntaje = 0;
    for (const c of COMO_SE_HACE) {
        const textos = [c.pregunta, ...c.claves];
        const puntaje = Math.max(
            ...textos.map(t => scoreMatch(t, mensaje)),
            ...textos.map(t => scoreMatch(mensaje, t)),
            ...textos.map(t => cobertura(t, mensaje)),
        );
        if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = c; }
    }
    return mejorPuntaje >= UMBRAL ? mejor : null;
};
