import {
    Document, Packer, Paragraph, TextRun, ImageRun,
    Header, Footer, PageNumber, NumberFormat, SimpleField,
    AlignmentType, WidthType,
    Table, TableRow, TableCell, VerticalAlign,
    BorderStyle, ShadingType,
    SectionType, PageBreak,
    FileChild,
} from 'docx';
import { Item, Movement, MovementType, InventoryType } from '../types';

// ── Palette matching the MONTECIELO VERDE template ────────────────────
const NAVY   = '1F3864'; // dark navy — main headings
const BLUE   = '2E75B6'; // medium blue — borders, accents
const AMBER  = 'D97706'; // amber — "BODEGA INVENTARIO" title
const GRAY   = '595959'; // body text gray
const LGRAY  = 'E5E7EB'; // light gray — table borders
const WHITE  = 'FFFFFF';

const noBorder = { style: BorderStyle.NIL, size: 0, color: WHITE };
const blueBorder = { style: BorderStyle.SINGLE, size: 6, color: BLUE };

// ── Typography helpers ────────────────────────────────────────────────
const run = (text: string, opts: {
    bold?: boolean; size?: number; color?: string; italics?: boolean;
} = {}) => new TextRun({
    text,
    bold: opts.bold,
    size: (opts.size ?? 22) * 2,          // docx uses half-points
    color: opts.color ?? GRAY,
    italics: opts.italics,
    font: 'Arial',
});

const para = (children: TextRun | TextRun[] | (TextRun | ImageRun)[], opts: {
    align?: string; spaceBefore?: number; spaceAfter?: number;
    borderBottom?: typeof blueBorder; borderTop?: typeof blueBorder;
} = {}) => new Paragraph({
    children: (Array.isArray(children) ? children : [children]) as TextRun[],
    alignment: opts.align as typeof AlignmentType[keyof typeof AlignmentType],
    spacing: { before: opts.spaceBefore ?? 0, after: opts.spaceAfter ?? 0 },
    border: {
        bottom: opts.borderBottom,
        top: opts.borderTop,
    },
});

const sectionHeading = (text: string) => new Paragraph({
    children: [run(text, { bold: true, size: 10, color: NAVY })],
    spacing: { before: 400, after: 120 },
    border: { bottom: blueBorder },
    alignment: AlignmentType.LEFT,
});

const tableHeader = (cells: string[], widths: number[]) => new TableRow({
    tableHeader: true,
    children: cells.map((text, i) => new TableCell({
        children: [new Paragraph({
            children: [run(text, { bold: true, size: 8, color: NAVY })],
            alignment: AlignmentType.LEFT,
        })],
        shading: { fill: 'F3F4F6', type: ShadingType.CLEAR, color: 'auto' },
        width: { size: widths[i], type: WidthType.PERCENTAGE },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: LGRAY },
            bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE },
            left: noBorder, right: noBorder,
        },
        verticalAlign: VerticalAlign.CENTER,
    })),
});

const tableRow = (cells: string[], widths: number[], shade = false) => new TableRow({
    children: cells.map((text, i) => new TableCell({
        children: [new Paragraph({
            children: [run(text, { size: 9, color: '374151' })],
            alignment: AlignmentType.LEFT,
        })],
        shading: shade ? { fill: 'F9FAFB', type: ShadingType.CLEAR, color: 'auto' } : undefined,
        width: { size: widths[i], type: WidthType.PERCENTAGE },
        margins: { top: 50, bottom: 50, left: 80, right: 80 },
        borders: {
            top: noBorder,
            bottom: { style: BorderStyle.SINGLE, size: 2, color: LGRAY },
            left: noBorder, right: noBorder,
        },
        verticalAlign: VerticalAlign.CENTER,
    })),
});

// ── Fetch logo from public folder ─────────────────────────────────────
async function fetchLogo(): Promise<ArrayBuffer | null> {
    try {
        const res = await fetch('/montecielo-logo.png');
        if (!res.ok) return null;
        return await res.arrayBuffer();
    } catch { return null; }
}

// ── Main export function ───────────────────────────────────────────────
export async function exportReportAsDocx(opts: {
    items: Item[];
    movements: Movement[];
    personnel: Array<{ id: string; name: string; phone?: string }>;
    projects?: Array<{ id: string; name: string }>;
    periodLabel: string;
    fromDate: Date;
    toDate: Date;
}) {
    const { items, movements, personnel, projects, periodLabel, fromDate, toDate } = opts;
    const fmtLong  = (d: Date) => new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
    const fmtShort = (d: Date) => new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    const today = new Date().toLocaleDateString('es-CO');

    const logoBuffer = await fetchLogo();
    const logoRunLg: ImageRun | null = logoBuffer
        ? new ImageRun({ data: logoBuffer, transformation: { width: 90, height: 35 }, type: 'png' })
        : null;
    const logoRunSm: ImageRun | null = logoBuffer
        ? new ImageRun({ data: logoBuffer, transformation: { width: 55, height: 22 }, type: 'png' })
        : null;

    // ── Data prep ────────────────────────────────────────────────────
    const itemMap = new Map(items.map(i => [i.id, i]));
    const pMap    = new Map(personnel.map(p => [p.id, p]));
    const pjMap   = new Map((projects ?? []).map(p => [p.id, p.name]));
    const filtered = movements.filter(m => { const t = new Date(m.timestamp); return t >= fromDate && t <= toDate; });
    const activeLoans = movements.filter(m => m.isLoan && !m.isReturned);
    const checkOuts = filtered.filter(m => m.type === MovementType.CHECK_OUT).reduce((s, m) => s + m.quantity, 0);
    const checkIns  = filtered.filter(m => m.type === MovementType.CHECK_IN || m.type === MovementType.PURCHASE).reduce((s, m) => s + m.quantity, 0);
    const lowStock  = items.filter(i => i.quantity <= i.minStock && i.minStock > 0).length;

    // Personnel loans
    const pLoansMap = new Map<string, { name: string; loans: Movement[] }>();
    activeLoans.forEach(m => {
        if (!m.personnelId) return;
        const p = pMap.get(m.personnelId);
        if (!p) return;
        if (!pLoansMap.has(m.personnelId)) pLoansMap.set(m.personnelId, { name: p.name, loans: [] });
        pLoansMap.get(m.personnelId)!.loans.push(m);
    });
    const personnelLoans = [...pLoansMap.values()].sort((a, b) => b.loans.length - a.loans.length);

    // Capital items
    const capitalItems = items
        .filter(i => i.inventoryType === InventoryType.HAND_TOOL || i.inventoryType === InventoryType.ELECTRICAL_TOOL)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(item => {
            const loan = activeLoans.find(m => m.itemId === item.id);
            const holder = loan ? pMap.get(loan.personnelId ?? '')?.name : null;
            const days = loan ? Math.floor((Date.now() - new Date(loan.timestamp).getTime()) / 86400000) : 0;
            return { item, holder, days };
        });

    // Consumables
    const consMap = new Map<string, number>();
    filtered.filter(m => m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE).forEach(m => {
        const item = itemMap.get(m.itemId);
        if (item && (item.inventoryType === InventoryType.SINGLE_USE || item.inventoryType === InventoryType.PPE))
            consMap.set(m.itemId, (consMap.get(m.itemId) ?? 0) + m.quantity);
    });
    const consumables = [...consMap.entries()]
        .map(([id, qty]) => ({ item: itemMap.get(id)!, qty }))
        .filter(x => x.item)
        .sort((a, b) => b.qty - a.qty);

    // Prose summary
    const topWorker = personnelLoans[0];
    let prose = `Durante ${periodLabel.toLowerCase()}, la bodega registró ${filtered.length} movimiento${filtered.length !== 1 ? 's' : ''}: `;
    prose += `${checkOuts} unidade${checkOuts !== 1 ? 's' : ''} despachadas y ${checkIns} ingresadas. `;
    if (activeLoans.length > 0) {
        prose += `Al cierre del período, ${activeLoans.length} herramienta${activeLoans.length !== 1 ? 's se encuentran' : ' se encuentra'} en préstamo activo`;
        if (topWorker) prose += `, siendo ${topWorker.name} quien cuenta con el mayor número de ítems (${topWorker.loans.length})`;
        prose += '. ';
    } else {
        prose += 'No hay herramientas en préstamo activo. ';
    }
    prose += lowStock > 0
        ? `Se detectaron ${lowStock} ítem${lowStock !== 1 ? 's' : ''} con stock por debajo del mínimo — se recomienda reposición prioritaria.`
        : 'Los niveles de stock se mantienen dentro de rangos óptimos.';

    // ── Header (every page after cover) ─────────────────────────────
    const docHeader = new Header({
        children: [
            new Paragraph({
                children: [
                    ...(logoRunSm ? [logoRunSm] : []),
                    run('   BODEGA INVENTARIO  ·  ', { bold: true, size: 9, color: NAVY }),
                    run('Informe de Operaciones de Bodega', { italics: true, size: 9, color: GRAY }),
                ],
                alignment: AlignmentType.RIGHT,
                border: { bottom: blueBorder },
            }),
        ],
    });

    // ── Footer ───────────────────────────────────────────────────────
    const docFooter = new Footer({
        children: [
            new Paragraph({
                children: [
                    run('Grupo Montecielo — Bodega Inventario  ·  Página ', { size: 8, color: GRAY }),
                    new SimpleField('PAGE'),
                ],
                alignment: AlignmentType.CENTER,
                border: { top: blueBorder },
            }),
        ],
    });

    // ── Cover page ────────────────────────────────────────────────────
    const coverChildren = [
        para(run(''), { spaceAfter: 1200 }),                       // top spacer
        ...(logoRunLg
            ? [new Paragraph({ children: [logoRunLg], alignment: AlignmentType.CENTER, spacing: { after: 240 } })]
            : []),
        para([
            run('GRUPO ', { bold: true, size: 36, color: NAVY }),
            run('MONTECIELO', { bold: true, size: 36, color: NAVY }),
        ], { align: AlignmentType.CENTER, spaceAfter: 80 }),
        para(run('BODEGA INVENTARIO', { bold: true, size: 36, color: AMBER }), { align: AlignmentType.CENTER, spaceAfter: 320 }),
        para(run('Informe de Operaciones de Bodega', { italics: true, size: 13, color: GRAY }), { align: AlignmentType.CENTER, spaceAfter: 80 }),
        para(run(`${fmtShort(fromDate)} — ${fmtShort(toDate)}`, { size: 11, color: GRAY }), { align: AlignmentType.CENTER, spaceAfter: 600 }),
        para(run('Generado automáticamente por Bodega Pro', { bold: true, size: 10, color: NAVY }), { align: AlignmentType.CENTER, spaceAfter: 80 }),
        para(run(`Fecha de generación: ${today}`, { size: 9, color: GRAY }), { align: AlignmentType.CENTER }),
        new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }),
    ];

    // ── Tabla de contenido (manual) ───────────────────────────────────
    const tocEntries = [
        ['1.', 'Resumen Ejecutivo'],
        ['2.', 'Personal con Herramientas Asignadas'],
        ['3.', 'Inventario de Herramientas (Capital)'],
        ['4.', 'Materiales de Consumo del Período'],
        ...(consumables.length > 0 ? [] : []),
        ['5.', 'Indicadores Generales'],
    ];

    const tocChildren = [
        sectionHeading('Tabla de contenido'),
        ...tocEntries.map(([num, title]) =>
            new Paragraph({
                children: [
                    run(`${num}  `, { bold: true, size: 11, color: NAVY }),
                    run(title, { size: 11, color: GRAY }),
                ],
                spacing: { before: 80, after: 80 },
            })
        ),
        new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }),
    ];

    // ── 1. Resumen ejecutivo ──────────────────────────────────────────
    const execChildren: FileChild[] = [
        sectionHeading('1. Resumen Ejecutivo'),
        para(run(prose, { size: 11, color: '374151' }), { spaceAfter: 200 }),

        // KPI mini-table
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                tableHeader(['Ítems en inventario', 'Despachos (ud)', 'Préstamos activos', 'Stock bajo mínimo'], [25, 25, 25, 25]),
                tableRow([
                    String(items.length),
                    String(checkOuts),
                    String(activeLoans.length),
                    String(lowStock),
                ], [25, 25, 25, 25]),
            ],
        }),
        new Paragraph({ children: [new PageBreak()], spacing: { before: 600, after: 0 } }),
    ];

    // ── 2. Personal ───────────────────────────────────────────────────
    const personnelChildren: FileChild[] = [
        sectionHeading('2. Personal con Herramientas Asignadas'),
    ];

    if (personnelLoans.length === 0) {
        personnelChildren.push(para(run('No hay herramientas en préstamo activo.', { size: 10, color: GRAY })));
    } else {
        personnelLoans.forEach(({ name, loans }, idx) => {
            if (idx > 0) personnelChildren.push(para(run(''), { spaceBefore: 80 }));
            personnelChildren.push(
                para(run(name, { bold: true, size: 11, color: NAVY }), { spaceBefore: 200 })
            );
            const pRows = loans.map((loan, li) => {
                const item = itemMap.get(loan.itemId);
                const days = Math.floor((Date.now() - new Date(loan.timestamp).getTime()) / 86400000);
                return tableRow([
                    item?.name ?? '—',
                    item?.inventoryType === InventoryType.HAND_TOOL ? 'H. Manual' :
                    item?.inventoryType === InventoryType.ELECTRICAL_TOOL ? 'H. Eléctrica' :
                    item?.inventoryType === InventoryType.PPE ? 'EPP' : 'Consumible',
                    `${days}d`,
                ], [60, 25, 15], li % 2 === 1);
            });
            personnelChildren.push(
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [tableHeader(['Herramienta', 'Tipo', 'Días fuera'], [60, 25, 15]), ...pRows],
                })
            );
        });
    }

    personnelChildren.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 600, after: 0 } }));

    // ── 3. Capital items ──────────────────────────────────────────────
    const capitalChildren: FileChild[] = [
        sectionHeading('3. Inventario de Herramientas (Capital)'),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                tableHeader(['Herramienta', 'Tipo', 'Cantidad', 'Estado', 'Responsable', 'Días'], [32, 15, 10, 12, 22, 9]),
                ...capitalItems.map((ci, idx) => tableRow([
                    ci.item.name,
                    ci.item.inventoryType === InventoryType.HAND_TOOL ? 'Manual' : 'Eléctrica',
                    String(ci.item.quantity),
                    ci.holder ? 'Prestado' : ci.item.quantity <= 0 ? 'Agotado' : 'Disponible',
                    ci.holder ?? '—',
                    ci.holder ? `${ci.days}d` : '—',
                ], [32, 15, 10, 12, 22, 9], idx % 2 === 1)),
            ],
        }),
        new Paragraph({ children: [new PageBreak()], spacing: { before: 600, after: 0 } }),
    ];

    // ── 4. Consumables ────────────────────────────────────────────────
    const consChildren: FileChild[] = [
        sectionHeading('4. Materiales de Consumo del Período'),
    ];

    if (consumables.length === 0) {
        consChildren.push(para(run('Sin consumos registrados en el período seleccionado.', { size: 10, color: GRAY })));
    } else {
        consChildren.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    tableHeader(['Material', 'Categoría', 'Cantidad consumida', 'Unidad'], [45, 25, 20, 10]),
                    ...consumables.map((c, i) => tableRow([
                        c.item.name,
                        c.item.inventoryType === InventoryType.PPE ? 'EPP / Seguridad' : 'Consumible',
                        String(c.qty),
                        c.item.unit,
                    ], [45, 25, 20, 10], i % 2 === 1)),
                ],
            })
        );
    }
    consChildren.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 600, after: 0 } }));

    // ── 5. Indicators ─────────────────────────────────────────────────
    const indChildren: FileChild[] = [
        sectionHeading('5. Indicadores Generales'),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                tableHeader(['Indicador', 'Valor'], [70, 30]),
                tableRow(['Período analizado', `${fmtLong(fromDate)} al ${fmtLong(toDate)}`], [70, 30]),
                tableRow(['Total ítems en inventario', String(items.length)], [70, 30], true),
                tableRow(['Herramientas en préstamo activo', String(activeLoans.length)], [70, 30]),
                tableRow(['Despachos en el período', String(checkOuts)], [70, 30], true),
                tableRow(['Ingresos en el período', String(checkIns)], [70, 30]),
                tableRow(['Ítems con stock bajo mínimo', String(lowStock)], [70, 30], true),
                tableRow(['Trabajadores con herramientas', String(personnelLoans.length)], [70, 30]),
            ],
        }),
    ];

    // ── Build document ────────────────────────────────────────────────
    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font: 'Arial', size: 22, color: GRAY },
                },
            },
        },
        sections: [
            // Cover page — no header/footer
            {
                properties: {
                    type: SectionType.ODD_PAGE,
                    page: {
                        margin: { top: 1440, bottom: 1440, left: 1800, right: 1800 },
                    },
                },
                children: coverChildren,
            },
            // TOC + body — with header/footer
            {
                properties: {
                    page: {
                        margin: { top: 1008, bottom: 1008, left: 1440, right: 1440 },
                        pageNumbers: { start: 2, formatType: NumberFormat.DECIMAL },
                    },
                },
                headers: { default: docHeader },
                footers: { default: docFooter },
                children: [
                    ...tocChildren,
                    ...execChildren,
                    ...personnelChildren,
                    ...capitalChildren,
                    ...consChildren,
                    ...indChildren,
                ],
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bodega_Informe_${periodLabel.replace(/\s+/g, '_')}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
