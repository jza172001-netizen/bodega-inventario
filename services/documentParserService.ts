/**
 * documentParserService.ts
 * Parsea facturas/documentos de inventario localmente en el navegador.
 * Sin API keys. Sin llamadas externas.
 *
 * Soporta: PDF, JPG/PNG (OCR), TXT, DOCX, CSV, XLSX/XLS, texto directo
 */

export interface ParsedRow {
    name: string;
    quantity: number;
    unit: string;
}

export type ParseProgress = (pct: number, message: string) => void;

/** Parsea texto pegado directamente (sin archivo) */
export function parseTextContent(text: string): { rows: ParsedRow[]; rawText: string } {
    return { rawText: text.trim(), rows: extractProductLines(text) };
}

export async function parseDocument(
    file: File,
    onProgress?: ParseProgress
): Promise<{ rows: ParsedRow[]; rawText: string }> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'pdf') {
        return parsePdf(file, onProgress);
    }
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(ext)) {
        return parseImage(file, onProgress);
    }
    if (ext === 'txt') {
        return parsePlainText(file);
    }
    if (ext === 'docx') {
        return parseDocx(file, onProgress);
    }
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
        return parseSpreadsheet(file, onProgress);
    }
    throw new Error(`Formato "${ext}" no soportado. Usa PDF, DOCX, JPG, PNG, TXT, CSV o XLSX.`);
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

async function parsePdf(file: File, onProgress?: ParseProgress): Promise<{ rows: ParsedRow[]; rawText: string }> {
    onProgress?.(5, 'Cargando PDF…');
    const pdfjsLib = await import('pdfjs-dist');

    // Usar el worker local empaquetado por Vite
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
        // Preservar saltos de línea usando la posición Y del texto
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
    return { rawText: fullText.trim(), rows: extractProductLines(fullText) };
}

// ─── IMAGEN (OCR con Tesseract.js) ───────────────────────────────────────────

async function parseImage(file: File, onProgress?: ParseProgress): Promise<{ rows: ParsedRow[]; rawText: string }> {
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
    return { rawText: text.trim(), rows: extractProductLines(text) };
}

// ─── TEXTO PLANO ─────────────────────────────────────────────────────────────

async function parsePlainText(file: File): Promise<{ rows: ParsedRow[]; rawText: string }> {
    const text = await file.text();
    return { rawText: text.trim(), rows: extractProductLines(text) };
}

// ─── WORD (.docx) ────────────────────────────────────────────────────────────

async function parseDocx(file: File, onProgress?: ParseProgress): Promise<{ rows: ParsedRow[]; rawText: string }> {
    onProgress?.(20, 'Leyendo documento Word…');
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(60, 'Extrayendo texto…');
    const result = await mammoth.extractRawText({ arrayBuffer });
    onProgress?.(90, 'Extrayendo productos…');
    return { rawText: result.value.trim(), rows: extractProductLines(result.value) };
}

// ─── EXCEL / CSV ──────────────────────────────────────────────────────────────

async function parseSpreadsheet(file: File, onProgress?: ParseProgress): Promise<{ rows: ParsedRow[]; rawText: string }> {
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

    // Si no encontramos columnas con headers conocidos, intentar parseo heurístico
    if (rows.length === 0) {
        for (let i = 0; i < raw.length; i++) {
            const row = raw[i] as unknown[];
            const line = row.map(c => String(c ?? '').trim()).filter(Boolean).join(' ');
            if (line) rawText += line + '\n';
        }
        return { rawText: rawText.trim(), rows: extractProductLines(rawText) };
    }

    onProgress?.(95, 'Listo');
    return { rawText: rawText.trim(), rows };
}

// ─── EXTRACTOR DE LÍNEAS DE PRODUCTOS ────────────────────────────────────────

const SKIP_PATTERNS = [
    /^(factura|nit|tel[eé]f|fecha|total|subtotal|iva|remi[s]?i[oó]n|cliente|vendedor|direcci[oó]n|ciudad|pago|valor|son:|señor|cc:|precio|descripci[oó]n|cant\.|und\.|item\s*#?|código|código|cod\.)/i,
    /^(página|page|gracias|thanks|observa|nota:|terms|condici)/i,
];

const UNIT_WORDS = '(?:und|kg|m|bolsa[s]?|par[es]?|caja[s]?|litro[s]?|lt|gl|rollo[s]?|metro[s]?|balde[s]?|caneca[s]?|saco[s]?|paq(?:uete[s]?)?|uni(?:dad(?:es)?)?|lb|ton|ml|cm|mm|hoja[s]?)';

function extractProductLines(text: string): ParsedRow[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    const results: ParsedRow[] = [];

    for (const line of lines) {
        if (SKIP_PATTERNS.some(p => p.test(line))) continue;
        // Ignorar líneas que son solo números o caracteres especiales
        if (/^[\d\s.,$/€]+$/.test(line)) continue;

        // Patrón 1: número al inicio  → "50 cemento gris bolsas"
        const p1 = line.match(
            new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s+(.{3,50?})(?:\\s+(${UNIT_WORDS}))?$`, 'i')
        );
        if (p1) {
            results.push({ name: cleanName(p1[2]), quantity: toNum(p1[1]), unit: (p1[3] ?? 'und').toLowerCase() });
            continue;
        }

        // Patrón 2: nombre + número al final → "cemento gris 50 bolsas"
        const p2 = line.match(
            new RegExp(`^(.{3,50?})\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORDS})?$`, 'i')
        );
        if (p2) {
            results.push({ name: cleanName(p2[1]), quantity: toNum(p2[2]), unit: (p2[3] ?? 'und').toLowerCase() });
            continue;
        }

        // Patrón 3: solo texto (sin número) — agregar con cantidad 0 para que el usuario la llene
        if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]{4,}/.test(line) && !/\$|#|@/.test(line)) {
            results.push({ name: cleanName(line), quantity: 0, unit: 'und' });
        }
    }

    // Deduplicar por nombre exacto
    const seen = new Set<string>();
    return results.filter(r => {
        if (seen.has(r.name.toLowerCase())) return false;
        seen.add(r.name.toLowerCase());
        return true;
    });
}

function cleanName(raw: string): string {
    return raw
        .replace(/\s+/g, ' ')
        .replace(/[*|_#\\/<>{}[\]]/g, '')
        .trim()
        .replace(/^[-.,;:]+|[-.,;:]+$/g, '')
        .trim();
}

function toNum(s: string): number {
    return parseFloat(s.replace(',', '.')) || 0;
}
