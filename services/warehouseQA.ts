/**
 * services/warehouseQA.ts — Preguntas en texto libre sobre la bodega
 * ==================================================================
 * El chatbot tenía un campo para preguntar, pero siempre respondía lo mismo.
 * La causa: miraba de QUÉ TIPO era la pregunta y botaba el resto. Siete
 * expresiones la clasificaban en una categoría, imprimía la lista completa de
 * esa categoría, y los sustantivos nunca se leían. Preguntar "¿qué tiene Abel?"
 * devolvía TODOS los préstamos de la bodega, con Abel ignorado.
 *
 * Acá se hacen las dos lecturas: QUÉ se pregunta (intención) y DE QUÉ o DE QUIÉN
 * se pregunta (entidad, con el mismo motor tolerante del buscador). Y cuando algo
 * no se entiende, en vez del mensaje de siempre se devuelve la pregunta
 * reformulada con las palabras que el bodeguero escribió.
 *
 * Todas las respuestas se calculan del inventario real. Nada se genera ni se
 * infiere: el bot puede no saber, pero no puede inventar.
 */

import { Item, Movement, MovementType, Personnel, Project, PurchaseOrder, PurchaseOrderStatus } from '../types';
import { normStr } from '../utils/genus';
import { rankMatches } from '../utils/search';
import { isAsset, isConsumable, getActiveLoans, daysSince } from '../utils/inventory';

export interface QAContext {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    projects?: Project[];
    purchaseOrders?: PurchaseOrder[];
}

export interface QAAnswer {
    text: string;
    /** Preguntas que sí sabe responder, armadas con lo que el usuario escribió. */
    suggestions: string[];
}

const DIAS_VENCIDO = 14;

// ── Intención ────────────────────────────────────────────────────────────
type Intent =
    | 'stock' | 'quien_tiene' | 'que_tiene' | 'consumo' | 'alertas'
    | 'movimientos' | 'mermas' | 'gastos' | 'mas_usado' | 'compras'
    | 'recoger' | 'vencidos' | 'proyecto' | null;

// Se evalúa sobre el texto ya normalizado (sin tildes, en minúscula), por eso
// no hacen falta las variantes con acento que tenía la versión anterior.
const INTENT_PATTERNS: Array<[Intent, RegExp]> = [
    ['recoger',     /\brecoger|recogida|pendiente de recog|ir a recoger\b/],
    ['vencidos',    /\bvencid|atrasad|demorad|hace mucho|mas de \d+ dias|cobrar\b/],
    ['alertas',     /\bque falta|hace falta|falta\b|agotad|stock bajo|bajo minimo|reponer|comprar ya|acabando|se acaba|urgente|alerta|mal hoy\b/],
    ['quien_tiene', /\bquien tiene|quien se llevo|con quien|donde esta|quien la tiene|quien lo tiene\b/],
    ['que_tiene',   /\bque tiene|que se llevo|que lleva|que hay con|responsable de\b/],
    ['consumo',     /\bconsum|gasto de material|cuanto se gasto|cuanto gasta|se gasta\b/],
    ['mas_usado',   /\bmas usad|mas consumid|mayor consumo|top|mas sacad|mas pedid\b/],
    ['mermas',      /\bmerma|perdida|desperdicio|dano|danad|roto\b/],
    ['gastos',      /\binversion|costo|cuanto vale|valor del inventario|cuanto cuesta|plata\b/],
    ['movimientos', /\bmovimiento|historial|kardex|ultimo|ultimas|reciente\b/],
    ['compras',     /\bcompra|orden|proveedor|pedido a\b/],
    ['proyecto',    /\bproyecto|obra\b/],
    ['stock',       /\bcuanto|cuantos|cuantas|hay de|queda|quedan|stock|disponible|existencia\b/],
];

const detectIntent = (norm: string): Intent => {
    for (const [intent, re] of INTENT_PATTERNS) if (re.test(norm)) return intent;
    return null;
};

// Palabras que jamás son el nombre de una herramienta o de una persona. Sin esto,
// "que tiene abel" intentaría buscar un ítem llamado "que".
const STOPWORDS = new Set([
    'que','quien','cuanto','cuantos','cuantas','cual','cuales','donde','como','cuando','porque','por','para',
    'el','la','los','las','un','una','unos','unas','de','del','al','a','en','con','sin','y','o','se','su','sus',
    'me','mi','tu','le','lo','me','nos','hay','tiene','tienen','esta','estan','fue','son','es','ser','hace',
    'dias','dia','semana','mes','ano','hoy','ayer','ahora','todavia','aun','mas','menos','muy','ya','tambien',
    'bodega','inventario','stock','falta','faltan','queda','quedan','disponible','disponibles','llevo','llevar',
    'prestado','prestados','prestamo','prestamos','consumo','consumido','gasto','gastado','recoger','vencido',
    'movimiento','movimientos','historial','kardex','ultimo','ultimos','ultima','ultimas','reciente','recientes',
    'merma','mermas','compra','compras','orden','ordenes','proveedor','proyecto','obra','total','valor',
]);

const contentWords = (norm: string): string[] =>
    norm.split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

/**
 * Umbral para responder directamente sobre una entidad.
 *
 * Se fija en 420 y no más arriba porque una palabra con UN error de escritura
 * puntúa 470 ("hektor" → Héctor): con el umbral en 600, el bodeguero escribía
 * un nombre casi bien y el bot le contestaba la lista general. Por debajo de
 * 420 quedan las coincidencias por prefijo aproximado y por letras sueltas,
 * que sí son corazonadas y por eso se ofrecen como sugerencia en vez de
 * responderse como un hecho.
 */
const STRONG = 420;
const WEAK   = 300;

interface Found<T> { value: T; score: number }

/** "martillos" → "martillo". El plural del español, sin diccionario. */
const singular = (w: string): string | null => {
    if (w.length > 4 && /(ces)$/.test(w)) return w.slice(0, -3) + 'z';  // lapices → lapiz
    if (w.length > 4 && /(es)$/.test(w))  return w.slice(0, -2);        // destornilladores
    if (w.length > 3 && /s$/.test(w))     return w.slice(0, -1);        // martillos, clavos
    return null;
};

const findBest = <T,>(list: T[], words: string[], textsOf: (x: T) => string[]): Found<T> | null => {
    if (words.length === 0 || list.length === 0) return null;
    // Se prueba la frase completa, cada palabra suelta y su singular: "martillo
    // de goma" debe ganarle a "martillo" cuando se escribieron las tres palabras,
    // y "cuantos martillos hay" tiene que llegar a "Martillo".
    const queries = [words.join(' '), ...words];
    for (const w of words) { const s = singular(w); if (s && s.length >= 3) queries.push(s); }

    let best: Found<T> | null = null;
    for (const q of queries) {
        const hit = rankMatches(list, q, textsOf, 1)[0];
        if (hit && (!best || hit.score > best.score)) best = { value: hit.value, score: hit.score };
    }
    return best && best.score >= WEAK ? best : null;
};

// ── Formateo ─────────────────────────────────────────────────────────────
const nombreDe = (ctx: QAContext, id?: string) =>
    ctx.personnel.find(p => p.id === id)?.name ?? 'Sin asignar';

const fecha = (d: Date | string) => new Date(d).toLocaleDateString('es-CO');

const plural = (n: number, sing: string, plu: string) => `${n} ${n === 1 ? sing : plu}`;

// ── Respuestas por entidad ───────────────────────────────────────────────
const fichaItem = (item: Item, ctx: QAContext): string => {
    const prestamos = getActiveLoans(ctx.movements).filter(m => m.itemId === item.id);
    const fuera = prestamos.reduce((s, m) => s + m.quantity, 0);
    const historial = ctx.movements
        .filter(m => m.itemId === item.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const L: string[] = [`**${item.name}**`];
    L.push(`- En bodega: **${item.quantity} ${item.unit}**${item.quantity === 0 ? ' — AGOTADO' : item.minStock > 0 && item.quantity <= item.minStock ? ' — bajo el mínimo' : ''}`);

    if (isAsset(item)) {
        if (prestamos.length === 0) {
            L.push('- No hay ninguna prestada.');
        } else {
            L.push(`- Prestadas: **${fuera}**`);
            for (const m of prestamos) {
                L.push(`   · ${nombreDe(ctx, m.personnelId)} ×${m.quantity} — ${plural(daysSince(m.timestamp), 'día', 'días')}${daysSince(m.timestamp) > DIAS_VENCIDO ? ' ⚠️' : ''}${m.pendingPickup ? ' 📍 a recoger' : ''}`);
            }
        }
    } else {
        const consumido = historial
            .filter(m => m.type === MovementType.CHECK_OUT && !m.isLoan)
            .reduce((s, m) => s + m.quantity, 0);
        L.push(`- Consumido en total: **${consumido} ${item.unit}** (es material de gasto, no vuelve)`);
    }

    if (historial[0]) {
        const u = historial[0];
        L.push(`- Último movimiento: ${u.type} de ${u.quantity} el ${fecha(u.timestamp)}${u.personnelId ? ` — ${nombreDe(ctx, u.personnelId)}` : ''}`);
    }
    return L.join('\n');
};

const fichaPersona = (person: Personnel, ctx: QAContext): string => {
    const prestamos = getActiveLoans(ctx.movements).filter(m => m.personnelId === person.id);
    const itemDe = (id: string) => ctx.items.find(i => i.id === id);

    const hace30 = new Date(Date.now() - 30 * 86400000);
    const consumos = ctx.movements.filter(m =>
        m.personnelId === person.id && m.type === MovementType.CHECK_OUT && !m.isLoan &&
        new Date(m.timestamp) > hace30 && isConsumable(itemDe(m.itemId))
    );

    const L: string[] = [`**${person.name}**`];

    if (prestamos.length === 0) {
        L.push('- Sin herramientas prestadas.');
    } else {
        const unidades = prestamos.reduce((s, m) => s + m.quantity, 0);
        L.push(`- Tiene **${plural(unidades, 'herramienta', 'herramientas')}** afuera:`);
        for (const m of prestamos) {
            const d = daysSince(m.timestamp);
            L.push(`   · ${itemDe(m.itemId)?.name ?? '?'} ×${m.quantity} — ${plural(d, 'día', 'días')}${d > DIAS_VENCIDO ? ' ⚠️ vencido' : ''}${m.pendingPickup ? ' 📍 a recoger' : ''}`);
        }
    }

    if (consumos.length > 0) {
        const porItem = new Map<string, number>();
        for (const m of consumos) porItem.set(m.itemId, (porItem.get(m.itemId) ?? 0) + m.quantity);
        L.push(`- Consumió estos últimos 30 días:`);
        for (const [id, qty] of [...porItem.entries()].sort((a, b) => b[1] - a[1])) {
            const it = itemDe(id);
            L.push(`   · ${qty} ${it?.unit ?? 'ud'} de ${it?.name ?? '?'}`);
        }
    }
    if (person.phone) L.push(`- Teléfono: ${person.phone}`);
    return L.join('\n');
};

const fichaProyecto = (project: Project, ctx: QAContext): string => {
    const movs = ctx.movements.filter(m => m.projectId === project.id);
    const itemDe = (id: string) => ctx.items.find(i => i.id === id);
    const prestados = movs.filter(m => m.isLoan && !m.isReturned);
    const consumidos = movs.filter(m => m.type === MovementType.CHECK_OUT && !m.isLoan);

    const L: string[] = [`**${project.name}** (${project.status === 'active' ? 'activo' : 'terminado'})`];
    if (movs.length === 0) return L.concat('- Todavía no tiene movimientos.').join('\n');

    if (prestados.length > 0) {
        L.push(`- Herramientas en la obra:`);
        for (const m of prestados) L.push(`   · ${itemDe(m.itemId)?.name ?? '?'} ×${m.quantity} — con ${nombreDe(ctx, m.personnelId)}`);
    }
    if (consumidos.length > 0) {
        const porItem = new Map<string, number>();
        for (const m of consumidos) porItem.set(m.itemId, (porItem.get(m.itemId) ?? 0) + m.quantity);
        const total = consumidos.reduce((s, m) => s + m.quantity, 0);
        L.push(`- Material consumido (**${total} unidades** en total):`);
        for (const [id, qty] of [...porItem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
            const it = itemDe(id);
            L.push(`   · ${qty} ${it?.unit ?? 'ud'} de ${it?.name ?? '?'}`);
        }
    }
    return L.join('\n');
};

// ── Respuestas generales (sin entidad) ───────────────────────────────────
const listaAlertas = (ctx: QAContext): string => {
    const bajos = ctx.items.filter(i => i.minStock > 0 && i.quantity <= i.minStock);
    const vencidos = getActiveLoans(ctx.movements).filter(m => daysSince(m.timestamp) > DIAS_VENCIDO);
    const recoger = getActiveLoans(ctx.movements).filter(m => m.pendingPickup);
    const itemDe = (id: string) => ctx.items.find(i => i.id === id);

    const L: string[] = [];
    if (bajos.length === 0 && vencidos.length === 0 && recoger.length === 0) return '✅ Todo en orden: sin stock bajo, sin préstamos vencidos y nada pendiente de recoger.';

    if (bajos.length > 0) {
        L.push(`**Hay que reponer (${bajos.length}):**`);
        for (const i of bajos.slice(0, 10)) L.push(`- ${i.name}: ${i.quantity}/${i.minStock} ${i.unit}${i.quantity === 0 ? ' — AGOTADO' : ''}`);
    }
    if (vencidos.length > 0) {
        L.push(`\n**Prestados hace más de ${DIAS_VENCIDO} días (${vencidos.length}):**`);
        for (const m of vencidos.slice(0, 10)) L.push(`- ${itemDe(m.itemId)?.name ?? '?'} ×${m.quantity} — ${nombreDe(ctx, m.personnelId)}, ${plural(daysSince(m.timestamp), 'día', 'días')}`);
    }
    if (recoger.length > 0) {
        L.push(`\n**Marcados para recoger (${recoger.length}):**`);
        for (const m of recoger.slice(0, 10)) L.push(`- ${itemDe(m.itemId)?.name ?? '?'} ×${m.quantity} — con ${nombreDe(ctx, m.personnelId)}`);
    }
    return L.join('\n');
};

const listaPrestamos = (ctx: QAContext): string => {
    const loans = getActiveLoans(ctx.movements).filter(m => isAsset(ctx.items.find(i => i.id === m.itemId)));
    if (loans.length === 0) return 'No hay herramientas prestadas.';
    const unidades = loans.reduce((s, m) => s + m.quantity, 0);
    const L = [`**${plural(unidades, 'herramienta', 'herramientas')} fuera de bodega:**`];
    for (const m of loans.slice(0, 15)) {
        const d = daysSince(m.timestamp);
        L.push(`- ${ctx.items.find(i => i.id === m.itemId)?.name ?? '?'} ×${m.quantity} → ${nombreDe(ctx, m.personnelId)} (${plural(d, 'día', 'días')})${d > DIAS_VENCIDO ? ' ⚠️' : ''}`);
    }
    return L.join('\n');
};

const listaConsumo = (ctx: QAContext, dias = 30): string => {
    const desde = new Date(Date.now() - dias * 86400000);
    const movs = ctx.movements.filter(m =>
        m.type === MovementType.CHECK_OUT && !m.isLoan &&
        new Date(m.timestamp) > desde && isConsumable(ctx.items.find(i => i.id === m.itemId))
    );
    if (movs.length === 0) return `Sin consumo de material en los últimos ${dias} días.`;
    const porItem = new Map<string, number>();
    for (const m of movs) porItem.set(m.itemId, (porItem.get(m.itemId) ?? 0) + m.quantity);
    const total = movs.reduce((s, m) => s + m.quantity, 0);
    const L = [`**Consumo de los últimos ${dias} días: ${total} unidades**`];
    for (const [id, qty] of [...porItem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        const it = ctx.items.find(i => i.id === id);
        L.push(`- ${it?.name ?? '?'}: ${qty} ${it?.unit ?? 'ud'}`);
    }
    return L.join('\n');
};

const listaMovimientos = (ctx: QAContext): string => {
    const recientes = [...ctx.movements].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);
    if (recientes.length === 0) return 'Todavía no hay movimientos registrados.';
    return '**Últimos movimientos:**\n' + recientes.map(m =>
        `- ${fecha(m.timestamp)} · ${m.type} · ${ctx.items.find(i => i.id === m.itemId)?.name ?? '?'} ×${m.quantity}${m.personnelId ? ` · ${nombreDe(ctx, m.personnelId)}` : ''}`
    ).join('\n');
};

const listaMermas = (ctx: QAContext): string => {
    const mermas = ctx.movements.filter(m => m.type === MovementType.WASTE);
    const danados = ctx.movements.filter(m => m.isReturned && (m.returnCondition === 'damaged' || m.returnCondition === 'incomplete'));
    if (mermas.length === 0 && danados.length === 0) return 'No hay mermas ni devoluciones con daño registradas.';
    const L: string[] = [];
    if (mermas.length > 0) {
        L.push(`**Mermas: ${mermas.length}**`);
        for (const m of mermas.slice(0, 8)) L.push(`- ${ctx.items.find(i => i.id === m.itemId)?.name ?? '?'} ×${m.quantity} · ${fecha(m.timestamp)}`);
    }
    if (danados.length > 0) {
        L.push(`\n**Devueltas con problema: ${danados.length}**`);
        for (const m of danados.slice(0, 8)) L.push(`- ${ctx.items.find(i => i.id === m.itemId)?.name ?? '?'} — ${m.returnCondition === 'damaged' ? 'dañada' : 'incompleta'} · ${nombreDe(ctx, m.personnelId)}`);
    }
    return L.join('\n');
};

const listaMasUsado = (ctx: QAContext): string => listaConsumo(ctx, 30);

const listaCompras = (ctx: QAContext): string => {
    const ordenes = ctx.purchaseOrders ?? [];
    const pend = ordenes.filter(o => o.status === PurchaseOrderStatus.ORDERED || o.status === PurchaseOrderStatus.SHIPPED);
    if (pend.length === 0) return 'No hay órdenes de compra pendientes.';
    return `**Órdenes pendientes: ${pend.length}**\n` + pend.slice(0, 8).map(o => `- ${o.supplier} · ${o.status}`).join('\n');
};

const listaRecoger = (ctx: QAContext): string => {
    const recoger = getActiveLoans(ctx.movements).filter(m => m.pendingPickup);
    if (recoger.length === 0) return 'No hay nada marcado para recoger.';
    return `**Para recoger (${recoger.length}):**\n` + recoger.map(m =>
        `- ${ctx.items.find(i => i.id === m.itemId)?.name ?? '?'} ×${m.quantity} — con ${nombreDe(ctx, m.personnelId)}`
    ).join('\n');
};

const listaVencidos = (ctx: QAContext): string => {
    const vencidos = getActiveLoans(ctx.movements)
        .filter(m => daysSince(m.timestamp) > DIAS_VENCIDO)
        .sort((a, b) => daysSince(b.timestamp) - daysSince(a.timestamp));
    if (vencidos.length === 0) return `Ningún préstamo pasa de ${DIAS_VENCIDO} días. Todo al día.`;
    return `**Hay que cobrar (${vencidos.length}):**\n` + vencidos.slice(0, 12).map(m =>
        `- ${ctx.items.find(i => i.id === m.itemId)?.name ?? '?'} ×${m.quantity} — ${nombreDe(ctx, m.personnelId)}, ${plural(daysSince(m.timestamp), 'día', 'días')}`
    ).join('\n');
};

const listaStockGeneral = (ctx: QAContext): string => {
    const total = ctx.items.length;
    const agotados = ctx.items.filter(i => i.quantity === 0).length;
    const fuera = getActiveLoans(ctx.movements).reduce((s, m) => s + m.quantity, 0);
    return `**Resumen de bodega**\n- ${total} referencias en inventario\n- ${agotados} agotadas\n- ${fuera} unidades prestadas afuera\n- ${ctx.personnel.length} personas registradas\n\nPreguntá por una herramienta o por una persona para el detalle.`;
};

// ── Motor ────────────────────────────────────────────────────────────────
export const answerQuestion = (message: string, ctx: QAContext): QAAnswer => {
    if (!ctx?.items || !ctx?.movements) return { text: 'Cargando datos, intentá de nuevo en un momento.', suggestions: [] };

    const norm = normStr(message);
    if (!norm) return { text: '¿En qué te puedo ayudar?', suggestions: ejemplos(ctx) };

    const intent = detectIntent(norm);
    const words = contentWords(norm);

    const item    = findBest(ctx.items, words, i => [i.name, i.subCategory]);
    const persona = findBest(ctx.personnel, words, p => [p.name]);
    const proyecto = findBest(ctx.projects ?? [], words, p => [p.name]);

    // Gana la entidad con mejor puntaje: si escribiste "abel", es la persona;
    // si escribiste "martillo", es el ítem.
    const mejor = [
        item     ? { tipo: 'item' as const,     score: item.score }     : null,
        persona  ? { tipo: 'persona' as const,  score: persona.score }  : null,
        proyecto ? { tipo: 'proyecto' as const, score: proyecto.score } : null,
    ].filter(Boolean).sort((a, b) => b!.score - a!.score)[0];

    // ── Entidad reconocida con confianza: se responde sobre ELLA ──
    if (mejor && mejor.score >= STRONG) {
        if (mejor.tipo === 'item')     return { text: fichaItem(item!.value, ctx), suggestions: [] };
        if (mejor.tipo === 'persona')  return { text: fichaPersona(persona!.value, ctx), suggestions: [] };
        if (mejor.tipo === 'proyecto') return { text: fichaProyecto(proyecto!.value, ctx), suggestions: [] };
    }

    // ── Sin entidad clara, pero sí se entendió el tipo de pregunta ──
    if (intent) {
        const general: Record<string, () => string> = {
            alertas:     () => listaAlertas(ctx),
            quien_tiene: () => listaPrestamos(ctx),
            que_tiene:   () => listaPrestamos(ctx),
            consumo:     () => listaConsumo(ctx),
            mas_usado:   () => listaMasUsado(ctx),
            mermas:      () => listaMermas(ctx),
            movimientos: () => listaMovimientos(ctx),
            compras:     () => listaCompras(ctx),
            recoger:     () => listaRecoger(ctx),
            vencidos:    () => listaVencidos(ctx),
            gastos:      () => listaConsumo(ctx),
            proyecto:    () => listaProyectos(ctx),
            stock:       () => listaStockGeneral(ctx),
        };
        const fn = general[intent];
        if (fn) {
            // Si además hubo una corazonada de entidad, se ofrece por si era eso.
            const sug = mejor ? sugerenciasDe(item, persona, proyecto) : [];
            return { text: fn(), suggestions: sug };
        }
    }

    // ── No se entendió: se enseña a preguntar CON SUS PALABRAS ──
    const sug = sugerenciasDe(item, persona, proyecto);
    if (sug.length > 0) {
        return {
            text: `No entendí bien la pregunta, pero reconocí algo de lo que escribiste. ¿Era alguna de estas?`,
            suggestions: sug,
        };
    }
    return {
        text: `No encontré nada que se parezca a «${message.trim()}» en la bodega.\n\nPreguntame así:`,
        suggestions: ejemplos(ctx),
    };
};

const listaProyectos = (ctx: QAContext): string => {
    const activos = (ctx.projects ?? []).filter(p => p.status === 'active');
    if (activos.length === 0) return 'No hay proyectos activos.';
    return `**Proyectos activos (${activos.length}):**\n` + activos.map(p => {
        const movs = ctx.movements.filter(m => m.projectId === p.id);
        return `- ${p.name} — ${plural(movs.length, 'movimiento', 'movimientos')}`;
    }).join('\n') + '\n\nPreguntá por el nombre de un proyecto para el detalle.';
};

/** Reformula la pregunta con lo que sí se reconoció — el "quizás quisiste decir". */
const sugerenciasDe = (
    item: Found<Item> | null,
    persona: Found<Personnel> | null,
    proyecto: Found<Project> | null,
): string[] => {
    const s: string[] = [];
    if (item)     s.push(`¿Cuántos ${item.value.name} hay?`, `¿Quién tiene ${item.value.name}?`);
    if (persona)  s.push(`¿Qué tiene ${persona.value.name}?`);
    if (proyecto) s.push(`¿Qué hay en ${proyecto.value.name}?`);
    return s.slice(0, 4);
};

/** Ejemplos armados con datos reales de la bodega, no genéricos. */
const ejemplos = (ctx: QAContext): string[] => {
    const s: string[] = [];
    const conPrestamo = getActiveLoans(ctx.movements)[0];
    const item = conPrestamo ? ctx.items.find(i => i.id === conPrestamo.itemId) : ctx.items[0];
    const persona = conPrestamo?.personnelId
        ? ctx.personnel.find(p => p.id === conPrestamo.personnelId)
        : ctx.personnel[0];
    if (item)    s.push(`¿Cuántos ${item.name} hay?`);
    if (persona) s.push(`¿Qué tiene ${persona.name}?`);
    s.push('¿Qué falta?', '¿Qué hay que recoger?');
    return s.slice(0, 4);
};
