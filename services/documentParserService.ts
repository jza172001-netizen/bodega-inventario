/**
 * documentParserService.ts
 * Parsea facturas/documentos de inventario localmente en el navegador.
 * Sin API keys. Sin llamadas externas.
 *
 * Soporta: PDF, JPG/PNG (OCR), TXT, DOCX, CSV, XLSX/XLS, texto directo
 */

import { InventoryType } from '../types';

export interface ParsedRow {
    name: string;
    quantity: number;
    unit: string;
}

export type ParseProgress = (pct: number, message: string) => void;

export interface ParseResult {
    rows: ParsedRow[];
    rawText: string;
    detectedInventoryType?: InventoryType;
}

// Detecta tipo de inventario leyendo las primeras 5 líneas (título/encabezado)
const TYPE_PATTERNS: Array<[RegExp, InventoryType]> = [
    [/herramienta[s]?\s+el[eé]ctrica[s]?|taladro[s]?|esmeril|sierra\s+circular|amoladora|compresor|vibrador|equipo\s+el[eé]ctrico/i, InventoryType.ELECTRICAL_TOOL],
    [/herramienta[s]?\s+manual|llave[s]?|martillo[s]?|destornillador|alicate[s]?|cincel|pala[s]?|herramienta\s+menor/i, InventoryType.HAND_TOOL],
    [/epp|elementos?\s+de\s+protecci[oó]n|protecci[oó]n\s+personal|seguridad\s+industrial|casco[s]?|guante[s]?|gafa[s]?|arn[eé]s|chaleco[s]?|tapaoido/i, InventoryType.PPE],
    [/consumo|un\s+solo\s+uso|material(?:es)?\s+de\s+obra|insumo|tornillo|cemento|pvc|tuberia|pegante|pintura|cable|formaleta/i, InventoryType.SINGLE_USE],
];

export function detectInventoryType(text: string): InventoryType | undefined {
    const header = text.split('\n').slice(0, 5).join(' ');
    for (const [pattern, type] of TYPE_PATTERNS) {
        if (pattern.test(header)) return type;
    }
    return undefined;
}

/** Parsea texto pegado directamente (sin archivo) */
export function parseTextContent(text: string): ParseResult {
    return {
        rawText: text.trim(),
        rows: extractProductLines(text),
        detectedInventoryType: detectInventoryType(text),
    };
}

export async function parseDocument(
    file: File,
    onProgress?: ParseProgress
): Promise<ParseResult> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'pdf') return parsePdf(file, onProgress);
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(ext)) return parseImage(file, onProgress);
    if (ext === 'txt') return parsePlainText(file);
    if (ext === 'docx') return parseDocx(file, onProgress);
    if (['xlsx', 'xls', 'csv'].includes(ext)) return parseSpreadsheet(file, onProgress);
    throw new Error(`Formato "${ext}" no soportado. Usa PDF, DOCX, JPG, PNG, TXT, CSV o XLSX.`);
}

function withType(result: { rows: ParsedRow[]; rawText: string }): ParseResult {
    return { ...result, detectedInventoryType: detectInventoryType(result.rawText) };
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

async function parsePdf(file: File, onProgress?: ParseProgress): Promise<ParseResult> {
    onProgress?.(5, 'Cargando PDF…');
    const pdfjsLib = await import('pdfjs-dist');

    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(20, 'Leyendo páginas…');

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let lastY: number | null = null;
        let pageText = '';
        for (const item of content.items as Array<{ str: string; transform: number[] }>) {
            const y = Math.round(item.transform[5]);
            if (lastY !== null && Math.abs(y - lastY) > 5) pageText += '\n';
            pageText += item.str + ' ';
            lastY = y;
        }
        fullText += pageText + '\n';
        onProgress?.(20 + Math.round((i / pdf.numPages) * 60), `Página ${i} de ${pdf.numPages}…`);
    }

    onProgress?.(90, 'Extrayendo productos…');
    return withType({ rawText: fullText.trim(), rows: extractProductLines(fullText) });
}

// ─── IMAGEN (OCR con Tesseract.js) ───────────────────────────────────────────

async function parseImage(file: File, onProgress?: ParseProgress): Promise<ParseResult> {
    onProgress?.(5, 'Iniciando motor OCR…');
    const { createWorker } = await import('tesseract.js');

    const worker = await createWorker('spa', 1, {
        logger: (m: { progress: number; status: string }) => {
            if (m.status === 'recognizing text') {
                onProgress?.(10 + Math.round(m.progress * 75), `OCR: ${Math.round(m.progress * 100)}%`);
            } else if (m.status === 'loading language traineddata') {
                onProgress?.(5, 'Descargando datos de idioma (primera vez)…');
            }
        },
    });

    onProgress?.(85, 'Procesando texto…');
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();

    onProgress?.(95, 'Extrayendo productos…');
    return withType({ rawText: text.trim(), rows: extractProductLines(text) });
}

// ─── TEXTO PLANO ─────────────────────────────────────────────────────────────

async function parsePlainText(file: File): Promise<ParseResult> {
    const text = await file.text();
    return withType({ rawText: text.trim(), rows: extractProductLines(text) });
}

// ─── WORD (.docx) ────────────────────────────────────────────────────────────

async function parseDocx(file: File, onProgress?: ParseProgress): Promise<ParseResult> {
    onProgress?.(20, 'Leyendo documento Word…');
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(60, 'Extrayendo texto…');
    const result = await mammoth.extractRawText({ arrayBuffer });
    onProgress?.(90, 'Extrayendo productos…');
    return withType({ rawText: result.value.trim(), rows: extractProductLines(result.value) });
}

// ─── EXCEL / CSV ──────────────────────────────────────────────────────────────

async function parseSpreadsheet(file: File, onProgress?: ParseProgress): Promise<ParseResult> {
    onProgress?.(20, 'Leyendo hoja de cálculo…');
    const XLSX = await import('xlsx');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
    if (raw.length < 2) return { rawText: '', rows: [] };

    onProgress?.(60, 'Detectando columnas…');

    const headers = (raw[0] as unknown[]).map(h => String(h ?? '').toLowerCase().trim());
    const nameIdx = headers.findIndex(h => /nombre|name|artículo|articulo|descripci[oó]n|producto|item|material/.test(h));
    const qtyIdx  = headers.findIndex(h => /cantidad|qty|quantity|cant\.?|unidades/.test(h));
    const unitIdx = headers.findIndex(h => /unidad|unit|und\.?|medida/.test(h));

    const rows: ParsedRow[] = [];
    let rawText = '';

    for (let i = 1; i < raw.length; i++) {
        const row = raw[i] as unknown[];
        const name = nameIdx >= 0 ? String(row[nameIdx] ?? '').trim() : '';
        if (!name) continue;
        const qty = qtyIdx >= 0 ? parseFloat(String(row[qtyIdx] ?? '').replace(',', '.')) || 0 : 0;
        const unit = (unitIdx >= 0 ? String(row[unitIdx] ?? '').trim() : '') || 'und';
        rows.push({ name, quantity: qty, unit });
        rawText += `${qty} ${name} ${unit}\n`;
    }

    if (rows.length === 0) {
        for (let i = 0; i < raw.length; i++) {
            const row = raw[i] as unknown[];
            const line = row.map(c => String(c ?? '').trim()).filter(Boolean).join(' ');
            if (line) rawText += line + '\n';
        }
        return withType({ rawText: rawText.trim(), rows: extractProductLines(rawText) });
    }

    onProgress?.(95, 'Listo');
    return withType({ rawText: rawText.trim(), rows });
}

// ─── EXTRACTOR DE LÍNEAS DE PRODUCTOS ────────────────────────────────────────

const SKIP_PATTERNS = [
    /^(factura|nit|tel[eé]f|fecha|total|subtotal|iva|remi[s]?i[oó]n|cliente|vendedor|direcci[oó]n|ciudad|pago|valor|son:|señor|cc:|precio|descripci[oó]n|cant\.|und\.|item\s*#?|código|cod\.)/i,
    /^(página|page|gracias|thanks|observa|nota:|terms|condici)/i,
];

const UNIT_WORDS = '(?:und|kg|m|bolsa[s]?|par[es]?|caja[s]?|litro[s]?|lt|gl|rollo[s]?|metro[s]?|balde[s]?|caneca[s]?|saco[s]?|paq(?:uete[s]?)?|uni(?:dad(?:es)?)?|lb|ton|ml|cm|mm|hoja[s]?)';

function extractProductLines(text: string): ParsedRow[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    const results: ParsedRow[] = [];

    for (const line of lines) {
        if (SKIP_PATTERNS.some(p => p.test(line))) continue;
        if (/^[\d\s.,$/€]+$/.test(line)) continue;

        const p1 = line.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s+(.{3,50?})(?:\\s+(${UNIT_WORDS}))?$`, 'i'));
        if (p1) {
            results.push({ name: cleanName(p1[2]), quantity: toNum(p1[1]), unit: (p1[3] ?? 'und').toLowerCase() });
            continue;
        }

        const p2 = line.match(new RegExp(`^(.{3,50?})\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORDS})?$`, 'i'));
        if (p2) {
            results.push({ name: cleanName(p2[1]), quantity: toNum(p2[2]), unit: (p2[3] ?? 'und').toLowerCase() });
            continue;
        }

        if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]{4,}/.test(line) && !/\$|#|@/.test(line)) {
            results.push({ name: cleanName(line), quantity: 0, unit: 'und' });
        }
    }

    const seen = new Set<string>();
    return results.filter(r => {
        if (seen.has(r.name.toLowerCase())) return false;
        seen.add(r.name.toLowerCase());
        return true;
    });
}

function cleanName(raw: string): string {
    return raw.replace(/\s+/g, ' ').replace(/[*|_#\\/<>{}[\]]/g, '').trim()
        .replace(/^[-.,;:]+|[-.,;:]+$/g, '').trim();
}

function toNum(s: string): number {
    return parseFloat(s.replace(',', '.')) || 0;
}
