// copilotService.ts
import { Item, Movement, InventoryType, MovementType, Personnel, PurchaseOrder, PurchaseOrderStatus, Project } from '../types';
import { rankMatches } from '../utils/search';
import { answerQuestion } from './warehouseQA';

export interface CopilotMessage { role: 'user' | 'assistant'; content: string; timestamp: Date; }
export interface WarehouseContext { items: Item[]; movements: Movement[]; personnel: Personnel[]; purchaseOrders: PurchaseOrder[]; projects?: Project[]; }

let transformersPipeline: any = null;
let modelLoading = false;
let modelLoaded = false;
let modelError: string | null = null;

export const getModelStatus = () => ({ modelLoading, modelLoaded, modelError });

export const initModel = async (onProgress?: (msg: string) => void): Promise<boolean> => {
    if (modelLoaded) return true;
    if (modelLoading) return false;
    modelLoading = true;
    try {
        onProgress?.('Cargando motor IA open-source...');
        // Empaquetado por Vite (chunk aparte vía import dinámico) — sin código remoto de CDN
        const { pipeline, env } = await import('@huggingface/transformers');
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        onProgress?.('Descargando modelo (primera vez ~250MB)...');
        transformersPipeline = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M', {
            progress_callback: (info: any) => { if (info.status === 'downloading') onProgress?.('Descargando: ' + Math.round(info.progress || 0) + '%'); }
        });
        modelLoaded = true; modelLoading = false;
        onProgress?.('Modelo listo.');
        return true;
    } catch (e: any) { modelError = e.message; modelLoading = false; return false; }
};

export const askCopilot = async (message: string, ctx: WarehouseContext): Promise<string> => {
    if (!message.trim()) return 'En que te puedo ayudar?';
    const { text, suggestions } = answerQuestion(message, ctx);
    if (suggestions.length === 0) return text;
    return `${text}\n\n${suggestions.map(s => `• ${s}`).join('\n')}`;
};

export const SUGGESTED_PROMPTS = ['¿Qué falta?','¿Qué hay que recoger?','¿Qué préstamos están vencidos?','¿Cuánto se consumió este mes?','Muestra los últimos movimientos','¿Hay mermas?','¿Órdenes de compra pendientes?'];

export interface PendingMovement {
    rawName: string;
    matchedItem: Item | null;
    candidates: Item[];
    quantity: number;
    unit: string;
}

export interface ParsedExit {
    isExitIntent: boolean;
    movements: PendingMovement[];
    matchedProject: Project | null;
    projectCandidates: Project[];
    rawProject: string;
    matchedPersonnel: Personnel | null;
    personnelCandidates: Personnel[];
    rawPersonnel: string;
}

export type CreationIntent =
    | { type: 'project'; name: string }
    | { type: 'personnel'; name: string }
    | { type: 'item'; name: string; inventoryType?: InventoryType; unit: string };

const CREATION_VERBS = /(?:crea|cre[aá]r?|a[ñn]ade|agrega|registra|nuevo|nueva|a[ñn]adir|agregar)\s+/i;

export function parseCreationIntent(text: string): CreationIntent | null {
    if (!CREATION_VERBS.test(text)) return null;
    const t = text.replace(CREATION_VERBS, '').trim();
    const projM = t.match(/^(?:el\s+|la\s+)?proyecto\s+(.+)/i);
    if (projM) return { type: 'project', name: projM[1].trim() };
    const persM = t.match(/^(?:el\s+|al?\s+)?(?:trabajador|operario|empleado|personal)\s+(.+)/i);
    if (persM) return { type: 'personnel', name: persM[1].trim() };
    const itemM = t.match(/^(?:el\s+|la\s+|un\s+|una\s+)?(?:[íi]tem|material|herramienta|elemento|producto|insumo|equipo)\s+(.+)/i);
    if (itemM) {
        const name = itemM[1].trim();
        return { type: 'item', name, inventoryType: guessInventoryType(name), unit: guessUnit(name) };
    }
    return null;
}

function guessInventoryType(name: string): InventoryType | undefined {
    const n = name.toLowerCase();
    if (/taladro|esmeril|sierra|amoladora|compresor|vibrador|pulidora/.test(n)) return InventoryType.ELECTRICAL_TOOL;
    if (/llave|martillo|destornillador|alicate|cincel|pala|serrucho|palustre/.test(n)) return InventoryType.HAND_TOOL;
    if (/casco|guante|gafa|arn[eé]s|chaleco|tapaoido|botas?\s+de\s+seguridad|overol/.test(n)) return InventoryType.PPE;
    return undefined;
}

function guessUnit(name: string): string {
    const n = name.toLowerCase();
    if (/metro|tuber|cable|manguera/.test(n)) return 'm';
    if (/bolsa|saco|bulto/.test(n)) return 'bolsa';
    if (/litro|gal[oó]n/.test(n)) return 'lt';
    if (/kg|kilo/.test(n)) return 'kg';
    return 'und';
}

const EXIT_VERBS = /\b(saq[uú][eé]|sali[oó]|salio|sacamos|sacaron|llev[oó]|llevamos|retir[eé]|retire|retiramos|gastamos|gast[oó]|us[eé]|usamos|entreg[oó]|entregamos|salida[s]?)\b/i;
const UNIT_PAT = /^(.+?)\s+(und|kg|m|bolsas?|pares?|cajas?|litros?|lt|gl|rollos?|metros?|baldes?|canecas?|sacos?|paq(?:uetes?)?|uni(?:dades?)?|lb|ton|ml|cm|mm|hojas?)$/i;

function normalize(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
    const dp = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[a.length][b.length];
}

function fuzzyMatchItems(query: string, items: Item[]): { matched: Item | null; candidates: Item[] } {
    const q = normalize(query);
    const qWords = q.split(' ').filter(w => w.length > 2);
    const exact = items.find(i => normalize(i.name) === q);
    if (exact) return { matched: exact, candidates: [] };
    const scored = items.map(item => {
        const n = normalize(item.name);
        const nWords = n.split(' ').filter(w => w.length > 2);
        let score = 0;
        if (n.includes(q)) score += 100;
        if (qWords.length && qWords.every(w => nWords.some(nw => nw.includes(w) || w.includes(nw)))) score += 60;
        if (nWords.length && nWords.every(w => q.includes(w))) score += 40;
        const fuzzy = qWords.filter(w => nWords.some(nw => levenshtein(w, nw) <= 2)).length;
        score += fuzzy * 15;
        return { item, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) return { matched: null, candidates: [] };
    if (scored.length === 1) return { matched: scored[0].item, candidates: [] };
    if (scored[0].score >= 60 && scored[0].score > scored[1].score * 1.4) return { matched: scored[0].item, candidates: [] };
    return { matched: null, candidates: scored.slice(0, 3).map(s => s.item) };
}

function fuzzyMatchList<T extends { name: string }>(query: string, list: T[]): { matched: T | null; candidates: T[] } {
    if (!query.trim()) return { matched: null, candidates: [] };
    const q = normalize(query);
    const exact = list.find(x => normalize(x.name) === q);
    if (exact) return { matched: exact, candidates: [] };
    // Antes solo `includes`, exacto: un nombre con una letra cambiada ("hektor")
    // no encontraba a nadie. Se usa el mismo motor del buscador global, para que
    // las dos superficies se comporten igual — y ORDENADO, porque si el copiloto
    // ofrece tres opciones, la correcta tiene que salir de primera.
    const hits = rankMatches(list, query, x => [x.name], 3).map(r => r.value);
    if (hits.length === 1) return { matched: hits[0], candidates: [] };
    if (hits.length > 1) return { matched: null, candidates: hits };
    return { matched: null, candidates: [] };
}

export interface BulkAddItem {
    rawName: string;
    quantity: number;
    unit: string;
    guessedType: InventoryType;
    matchedItem: Item | null;
    candidates: Item[];
}

export interface ParsedBulkAdd {
    isBulkAdd: boolean;
    items: BulkAddItem[];
    matchedPersonnel: Personnel | null;
    rawPersonnel: string;
    personnelCandidates: Personnel[];
    matchedProject: Project | null;
    rawProject: string;
    projectCandidates: Project[];
}

const ADD_VERBS = /\b(recib[ií]|lleg[oó]|entraron|tenemos|hay|subir|ingresa|compr[eé]|compramos)\b/i;

function guessInventoryTypeFull(name: string): InventoryType {
    const n = name.toLowerCase();
    if (/taladro|esmeril|sierra|amoladora|compresor|vibrador|pulidora|soldador|generador|cortador|rotomartillo|hidrolavador/.test(n)) return InventoryType.ELECTRICAL_TOOL;
    if (/llave|martillo|destornillador|alicate|cincel|pala|pico|pica|serrucho|palustre|barra|hacha|pal[ií]n|rastrillo|carretilla|flex[oó]metro|plomada|nivel|tenaza/.test(n)) return InventoryType.HAND_TOOL;
    if (/casco|guante|gafa|arn[eé]s|chaleco|tapaoido|bota.*seguridad|overol|mascarilla|respirador|careta|rodillera|faja/.test(n)) return InventoryType.PPE;
    return InventoryType.SINGLE_USE;
}

export function parseBulkAddIntent(text: string, items: Item[], projects: Project[], personnel: Personnel[]): ParsedBulkAdd {
    const noResult: ParsedBulkAdd = { isBulkAdd: false, items: [], matchedPersonnel: null, rawPersonnel: '', personnelCandidates: [], matchedProject: null, rawProject: '', projectCandidates: [] };
    if (EXIT_VERBS.test(text)) return noResult;
    const hasList = /\b\d+\s+\w{3,}.*(?:,|\s+y\s+)\s*\d+\s+\w{3,}/i.test(text);
    const hasAdd = ADD_VERBS.test(text);
    if (!hasList && !hasAdd) return noResult;

    let body = text;
    let rawProject = '';
    let rawPerson = '';

    body = body.replace(/(?:para\s+(?:el\s+)?proyectos?\s+|en\s+(?:el\s+)?proyectos?\s+)([^,\n]+?)(?=\s+(?:trabajador|operario)|,|\s*$)/i,
        (_, p) => { rawProject = p.trim(); return ''; });
    body = body.replace(/(?:(?:al?\s+)?(?:trabajador|operario)\s+)([A-Za-záéíóúÁÉÍÓÚñÑ]+(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑ]+)?)/i,
        (_, p) => { rawPerson = p.trim(); return ''; });
    body = body.replace(ADD_VERBS, '').replace(/[:;]/g, ' ').trim();

    const parts = body.split(/\s+(?:y|e)\s+|,\s*/).map(p => p.trim()).filter(Boolean);
    const bulkItems: BulkAddItem[] = [];

    for (const part of parts) {
        const numMatch = part.match(/^(\d+(?:[.,]\d+)?|un[ao]?)\s+(.{2,})/i);
        if (!numMatch) continue;
        const qStr = numMatch[1].trim();
        const quantity = /^un[ao]?$/i.test(qStr) ? 1 : parseFloat(qStr.replace(',', '.')) || 1;
        let namePart = numMatch[2].trim();
        let unit = 'und';
        const unitM = namePart.match(UNIT_PAT);
        if (unitM) { namePart = unitM[1].trim(); unit = unitM[2].toLowerCase(); }
        if (namePart.length < 2) continue;
        const { matched, candidates } = fuzzyMatchItems(namePart, items);
        bulkItems.push({ rawName: namePart, quantity, unit, guessedType: guessInventoryTypeFull(namePart), matchedItem: matched, candidates });
    }

    if (bulkItems.length === 0) return noResult;

    const projResult = fuzzyMatchList(rawProject, projects);
    const persResult = fuzzyMatchList(rawPerson, personnel);

    return { isBulkAdd: true, items: bulkItems, matchedPersonnel: persResult.matched, rawPersonnel: rawPerson, personnelCandidates: persResult.candidates, matchedProject: projResult.matched, rawProject, projectCandidates: projResult.candidates };
}

export interface ParsedEdit {
    item: Item;
    field: 'brand' | 'color';
    newValue: string;
}

export function parseEditIntent(text: string, items: Item[]): ParsedEdit | null {
    if (!/\b(pon(?:le)?|cambia|actualiz[a]|modifica|edita)\b/i.test(text)) return null;

    let field: 'brand' | 'color' | null = null;
    if (/\bmarca\b|\bbrand\b/i.test(text)) field = 'brand';
    else if (/\bcolor\b/i.test(text)) field = 'color';
    if (!field) return null;

    const electricItems = items.filter(i => i.inventoryType === InventoryType.ELECTRICAL_TOOL);
    if (electricItems.length === 0) return null;

    // Strip verbs, field keyword, and articles to isolate the two parts around "a"
    let body = text
        .replace(/\b(pon(?:le)?|cambia|actualiz[a]|modifica|edita)\b/gi, '')
        .replace(/\b(marca|brand|color)\b/gi, '')
        .replace(/\b(el|la|los|las|del|de)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const aIdx = body.search(/\s+a\s+/i);
    if (aIdx < 0) return null;

    const part1 = body.slice(0, aIdx).trim();
    const part2 = body.slice(aIdx).replace(/^\s+a\s+/i, '').trim();

    // Case B: "<item> a <value>" — item in part1
    const m1 = fuzzyMatchItems(part1, electricItems);
    if (m1.matched) return { item: m1.matched, field, newValue: part2 };

    // Case A: "<value> a <item>" — item in part2
    const m2 = fuzzyMatchItems(part2, electricItems);
    if (m2.matched) return { item: m2.matched, field, newValue: part1 };

    return null;
}


export function parseExitIntent(text: string, items: Item[], projects: Project[], personnel: Personnel[]): ParsedExit {
    if (!EXIT_VERBS.test(text)) {
        return { isExitIntent: false, movements: [], matchedProject: null, projectCandidates: [], rawProject: '', matchedPersonnel: null, personnelCandidates: [], rawPersonnel: '' };
    }

    let body = text;
    let rawProject = '';
    let rawPerson = '';

    body = body.replace(/(?:para\s+(?:el\s+)?proyectos?\s+|en\s+(?:el\s+)?proyectos?\s+)([^,\n]+?)(?=\s+(?:trabajador|operario)|,|\s*$)/i,
        (_, p) => { rawProject = p.trim(); return ''; });
    body = body.replace(/(?:(?:al?\s+)?trabajador\s+|(?:al?\s+)?operario\s+)([A-Za-záéíóúÁÉÍÓÚñÑ]+(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑ]+)?)/i,
        (_, p) => { rawPerson = p.trim(); return ''; });
    body = body.replace(EXIT_VERBS, '').replace(/[:;]/g, ' ').trim();

    const parts = body.split(/\s+(?:y|e)\s+|,\s*/).map(p => p.trim()).filter(Boolean);
    const movements: PendingMovement[] = [];

    for (const part of parts) {
        const numMatch = part.match(/^(\d+(?:[.,]\d+)?|un[ao]?)\s+(.{2,})/i);
        let quantity = 1;
        let namePart = part;
        if (numMatch) {
            const qStr = numMatch[1].trim();
            quantity = /^un[ao]?$/i.test(qStr) ? 1 : parseFloat(qStr.replace(',', '.')) || 1;
            namePart = numMatch[2].trim();
        }
        let unit = 'und';
        const unitM = namePart.match(UNIT_PAT);
        if (unitM) { namePart = unitM[1].trim(); unit = unitM[2].toLowerCase(); }
        if (namePart.length < 2) continue;
        const { matched, candidates } = fuzzyMatchItems(namePart, items);
        movements.push({ rawName: namePart, matchedItem: matched, candidates, quantity, unit });
    }

    const projResult = fuzzyMatchList(rawProject, projects);
    const persResult = fuzzyMatchList(rawPerson, personnel);

    return { isExitIntent: true, movements, matchedProject: projResult.matched, projectCandidates: projResult.candidates, rawProject, matchedPersonnel: persResult.matched, personnelCandidates: persResult.candidates, rawPersonnel: rawPerson };
}
