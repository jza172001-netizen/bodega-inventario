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
import {
    getActiveLoans, getActiveLoansByItem, getLoansByPerson,
    summarizeLoanItems, daysSince, getConsumption, isAsset,
} from '../utils/inventory';

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

// DXA units (1/20th of a point). Content width = 9360 DXA (Letter minus 1440 margins each side)
const tableHeader = (cells: string[], widths: number[]) => new TableRow({
    tableHeader: true,
    children: cells.map((text, i) => new TableCell({
        children: [new Paragraph({
            children: [run(text, { bold: true, size: 8, color: NAVY })],
            alignment: AlignmentType.LEFT,
        })],
        shading: { fill: 'F3F4F6', type: ShadingType.CLEAR, color: 'auto' },
        width: { size: widths[i], type: WidthType.DXA },
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
        width: { size: widths[i], type: WidthType.DXA },
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
    const activeLoans = getActiveLoans(movements);
    const checkOuts = filtered.filter(m => m.type === MovementType.CHECK_OUT).reduce((s, m) => s + m.quantity, 0);
    const checkIns  = filtered.filter(m => m.type === MovementType.CHECK_IN || m.type === MovementType.PURCHASE).reduce((s, m) => s + m.quantity, 0);
    const lowStock  = items.filter(i => i.quantity <= i.minStock && i.minStock > 0).length;
    const itemNameOf   = (id: string)  => itemMap.get(id)?.name ?? '—';
    const personNameOf = (id?: string) => pMap.get(id ?? '')?.name ?? 'Desconocido';

    // Un préstamo de 2 martillos son 2 unidades fuera de bodega, no 1.
    // Contar movimientos era lo que hacía que el informe reportara menos de lo que había afuera.
    const activeLoanUnits = activeLoans.reduce((s, m) => s + m.quantity, 0);

    // Personnel loans — se descartan los préstamos sin persona o de personas ya borradas
    const personnelLoans = getLoansByPerson(movements, personNameOf)
        .filter(p => p.personnelId && pMap.has(p.personnelId));

    // Capital items — TODOS los tenedores de cada herramienta, no solo el primero
    const loansByItem = getActiveLoansByItem(movements);
    const capitalItems = items
        .filter(i => isAsset(i))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(item => {
            const loans = loansByItem.get(item.id) ?? [];
            const unidadesFuera = loans.reduce((s, m) => s + m.quantity, 0);
            // "Abel ×2 (5d), Alexander ×1 (3d)" — un palustre repartido ya no esconde al segundo
            const holders = loans
                .map(l => `${personNameOf(l.personnelId)} ×${l.quantity} (${daysSince(l.timestamp)}d)`)
                .join(', ');
            const maxDays = loans.length > 0 ? Math.max(...loans.map(l => daysSince(l.timestamp))) : 0;
            return { item, loans, unidadesFuera, holders, maxDays };
        });

    // Consumo del período — la lente que le faltaba al informe
    const consumption = getConsumption(movements, itemMap, { from: fromDate, to: toDate }, personNameOf);
    const consumables = consumption.porItem.map(r => ({ item: r.key, qty: r.unidades }));

    // Ventana previa del mismo largo, para saber si el gasto subió o bajó
    const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000));
    const prevFrom = new Date(fromDate.getTime() - periodDays * 86400000);
    const prevConsumption = getConsumption(movements, itemMap, { from: prevFrom, to: fromDate }, personNameOf);
    // Sin período previo no hay variación que calcular: "100% más que 0" no significa nada.
    const consumoVarPct = prevConsumption.totalUnidades > 0
        ? Math.round(((consumption.totalUnidades - prevConsumption.totalUnidades) / prevConsumption.totalUnidades) * 100)
        : null;

    // Prose summary
    const topWorker = personnelLoans[0];
    let prose = `Durante ${periodLabel.toLowerCase()}, la bodega registró ${filtered.length} movimiento${filtered.length !== 1 ? 's' : ''}: `;
    prose += `${checkOuts} unidade${checkOuts !== 1 ? 's' : ''} despachadas y ${checkIns} ingresadas. `;
    if (activeLoanUnits > 0) {
        prose += `Al cierre del período, ${activeLoanUnits} herramienta${activeLoanUnits !== 1 ? 's se encuentran' : ' se encuentra'} en préstamo activo`;
        if (topWorker) prose += `, siendo ${topWorker.nombre} quien tiene la mayor cantidad de unidades (${topWorker.unidades})`;
        prose += '. ';
    } else {
        prose += 'No hay herramientas en préstamo activo. ';
    }
    if (consumption.totalUnidades > 0) {
        prose += `Se consumieron ${consumption.totalUnidades} unidades de EPP y material de consumo `;
        prose += `(promedio de ${consumption.promedioSemanal} por semana)`;
        if (consumoVarPct !== null) {
            prose += consumoVarPct >= 0
                ? `, ${consumoVarPct}% más que el período anterior`
                : `, ${Math.abs(consumoVarPct)}% menos que el período anterior`;
        }
        prose += '. ';
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

    // Fix 2 — Cover footer
    const coverFooter = new Footer({
        children: [
            new Paragraph({
                children: [
                    run('Bodega Pro — Sistema de Trazabilidad de Inventarios  ·  Documento de uso corporativo', { size: 8, color: GRAY }),
                ],
                alignment: AlignmentType.CENTER,
                border: { top: blueBorder },
            }),
        ],
    });

    // Fix 5 — Cover page redesign
    const coverChildren = [
        para(run(''), { spaceAfter: 2000 }),                       // big top spacer (~1.4 inches)
        ...(logoRunLg
            ? [new Paragraph({ children: [logoRunLg], alignment: AlignmentType.CENTER, spacing: { after: 240 } })]
            : []),
        para([
            run('GRUPO ', { bold: true, size: 36, color: AMBER }),
            run('MONTECIELO', { bold: true, size: 36, color: AMBER }),
        ], { align: AlignmentType.CENTER, spaceAfter: 80 }),
        para(run('BODEGA INVENTARIO', { bold: true, size: 36, color: AMBER }), { align: AlignmentType.CENTER, spaceAfter: 320 }),
        para(run('Sistema de Trazabilidad de Inventarios', { italics: true, size: 13, color: GRAY }), { align: AlignmentType.CENTER, spaceAfter: 80 }),
        para(run(periodLabel, { size: 11, color: GRAY }), { align: AlignmentType.CENTER, spaceAfter: 80 }),
        para(run(`${fmtShort(fromDate)} — ${fmtShort(toDate)}`, { size: 11, color: GRAY }), { align: AlignmentType.CENTER, spaceAfter: 600 }),
        para(run(`Generado: ${today}`, { bold: true, size: 10, color: NAVY }), { align: AlignmentType.CENTER, spaceAfter: 80 }),
        para(run('Preparado por Bodega Pro  ·  Uso interno corporativo', { size: 9, color: GRAY }), { align: AlignmentType.CENTER }),
        new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }),
    ];

    // ── Tabla de contenido (manual) ───────────────────────────────────
    const tocEntries = [
        ['1.', 'Resumen Ejecutivo'],
        ['2.', 'Personal con Herramientas Asignadas'],
        ['3.', 'Inventario de Herramientas (Capital)'],
        ['4.', 'Materiales de Consumo del Período'],
        ['5.', 'Análisis de Consumo'],
        ['6.', 'Indicadores Generales'],
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
    // Content width = 9360 DXA (US Letter 12240 − margins 1440×2)
    // KPI: 4×2340  Personal: [2808,5148,1404]  Capital: [2995,1404,936,1123,2059,843]
    // Consumables: [4212,2340,1872,936]  Indicators: [6552,2808]
    const KPI_W  = [2340, 2340, 2340, 2340] as const;
    const PER_W  = [2400, 4700, 900, 1360]  as const;
    const CAP_W  = [2100, 800, 900, 700, 800, 900, 2360, 800] as const;
    const CONS_W = [4212, 2340, 1872, 936]  as const;
    const IND_W  = [6552, 2808]             as const;
    // Análisis de consumo: [ítem/persona, tipo, unidades] y [métrica, valor]
    const ANC_W  = [4680, 2340, 2340]       as const;

    const execChildren: FileChild[] = [
        sectionHeading('1. Resumen Ejecutivo'),
        para(run(prose, { size: 11, color: '374151' }), { spaceAfter: 200 }),

        // KPI mini-table
        new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [...KPI_W],
            rows: [
                tableHeader(['Ítems en inventario', 'Despachos (ud)', 'Prestado afuera (ud)', 'Stock bajo mínimo'], [...KPI_W]),
                tableRow([
                    String(items.length),
                    String(checkOuts),
                    String(activeLoanUnits),
                    String(lowStock),
                ], [...KPI_W]),
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
        const pRows = personnelLoans.map(({ nombre, unidades, movs }, idx) => {
            // Con la cantidad: "Martillo ×2", no "Martillo, Martillo".
            const toolNames = summarizeLoanItems(movs, itemNameOf);
            const maxDays = Math.max(...movs.map(l => daysSince(l.timestamp)));
            return tableRow([nombre, toolNames, String(unidades), `${maxDays}d`], [...PER_W], idx % 2 === 1);
        });
        personnelChildren.push(
            new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [...PER_W],
                rows: [tableHeader(['Trabajador', 'Herramientas asignadas', 'Unidades', 'Días max'], [...PER_W]), ...pRows],
            })
        );
    }

    personnelChildren.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 600, after: 0 } }));

    // ── 3. Capital items ──────────────────────────────────────────────
    const capitalChildren: FileChild[] = [
        sectionHeading('3. Inventario de Herramientas (Capital)'),
        new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [...CAP_W],
            rows: [
                // "En bodega" es el stock; "Prestado" son las unidades afuera. Antes solo
                // se imprimía el stock, así que no había forma de leer cuánto estaba fuera.
                tableHeader(['Herramienta', 'Tipo', 'Marca', 'En bodega', 'Prestado', 'Estado', 'Responsable(s)', 'Días max'], [...CAP_W]),
                ...capitalItems.map((ci, idx) => tableRow([
                    ci.item.name,
                    ci.item.inventoryType === InventoryType.HAND_TOOL ? 'Manual' : 'Eléctrica',
                    ci.item.inventoryType === InventoryType.ELECTRICAL_TOOL ? (ci.item.brand ?? '—') : '—',
                    String(ci.item.quantity),
                    ci.unidadesFuera > 0 ? String(ci.unidadesFuera) : '—',
                    ci.loans.length > 0 ? 'Prestado' : ci.item.quantity <= 0 ? 'Agotado' : 'Disponible',
                    ci.holders || '—',
                    ci.loans.length > 0 ? `${ci.maxDays}d` : '—',
                ], [...CAP_W], idx % 2 === 1)),
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
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [...CONS_W],
                rows: [
                    tableHeader(['Material', 'Categoría', 'Cantidad consumida', 'Unidad'], [...CONS_W]),
                    ...consumables.map((c, i) => tableRow([
                        c.item.name,
                        c.item.inventoryType === InventoryType.PPE ? 'EPP / Seguridad' : 'Consumible',
                        String(c.qty),
                        c.item.unit,
                    ], [...CONS_W], i % 2 === 1)),
                    tableRow(['TOTAL DEL PERÍODO', '', String(consumption.totalUnidades), 'ud'], [...CONS_W], true),
                ],
            })
        );
    }
    consChildren.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 600, after: 0 } }));

    // ── 5. Análisis de consumo ────────────────────────────────────────
    // Una herramienta se rastrea ("¿dónde está?"); un consumible se analiza
    // ("¿cuánto se gastó y en qué se va?"). El informe solo respondía la primera.
    const TIPO_LABEL: Partial<Record<InventoryType, string>> = {
        [InventoryType.PPE]: 'EPP / Seguridad',
        [InventoryType.SINGLE_USE]: 'Consumible',
    };

    const analysisChildren: FileChild[] = [
        sectionHeading('5. Análisis de Consumo'),
    ];

    if (consumption.totalUnidades === 0) {
        analysisChildren.push(para(run('Sin consumo de EPP ni material en el período seleccionado.', { size: 10, color: GRAY })));
    } else {
        const varLabel = consumoVarPct === null
            ? 'Sin período previo para comparar'
            : consumoVarPct >= 0
                ? `+${consumoVarPct}% vs. período anterior (${prevConsumption.totalUnidades} ud)`
                : `${consumoVarPct}% vs. período anterior (${prevConsumption.totalUnidades} ud)`;

        analysisChildren.push(
            para(run('Resumen del gasto', { bold: true, size: 11, color: NAVY }), { spaceBefore: 120, spaceAfter: 100 }),
            new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [...IND_W],
                rows: [
                    tableHeader(['Métrica de consumo', 'Valor'], [...IND_W]),
                    tableRow(['Total consumido en el período', `${consumption.totalUnidades} ud`], [...IND_W]),
                    tableRow(['Promedio semanal', `${consumption.promedioSemanal} ud/semana`], [...IND_W], true),
                    tableRow(['Variación', varLabel], [...IND_W]),
                    tableRow(['Referencias distintas consumidas', String(consumption.porItem.length)], [...IND_W], true),
                    tableRow(['Trabajadores que consumieron', String(consumption.porPersona.length)], [...IND_W]),
                ],
            }),

            para(run('Más consumidos', { bold: true, size: 11, color: NAVY }), { spaceBefore: 300, spaceAfter: 100 }),
            new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [...ANC_W],
                rows: [
                    tableHeader(['Material', 'Categoría', 'Consumido'], [...ANC_W]),
                    ...consumption.porItem.slice(0, 10).map((r, i) => tableRow([
                        r.key.name,
                        TIPO_LABEL[r.key.inventoryType] ?? '—',
                        `${r.unidades} ${r.key.unit}`,
                    ], [...ANC_W], i % 2 === 1)),
                ],
            }),

            para(run('Consumo por trabajador', { bold: true, size: 11, color: NAVY }), { spaceBefore: 300, spaceAfter: 100 }),
            new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [...ANC_W],
                rows: [
                    tableHeader(['Trabajador', 'Movimientos', 'Unidades consumidas'], [...ANC_W]),
                    ...consumption.porPersona.map((r, i) => tableRow([
                        r.key,
                        String(r.movs.length),
                        String(r.unidades),
                    ], [...ANC_W], i % 2 === 1)),
                ],
            }),

            para(run('Consumo por categoría', { bold: true, size: 11, color: NAVY }), { spaceBefore: 300, spaceAfter: 100 }),
            new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [...ANC_W],
                rows: [
                    tableHeader(['Categoría', 'Participación', 'Unidades'], [...ANC_W]),
                    ...consumption.porTipo.map((r, i) => tableRow([
                        TIPO_LABEL[r.key] ?? String(r.key),
                        `${Math.round((r.unidades / consumption.totalUnidades) * 100)}%`,
                        String(r.unidades),
                    ], [...ANC_W], i % 2 === 1)),
                ],
            }),
        );
    }
    analysisChildren.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 600, after: 0 } }));

    // ── 6. Indicators ─────────────────────────────────────────────────
    const indChildren: FileChild[] = [
        sectionHeading('6. Indicadores Generales'),
        new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [...IND_W],
            rows: [
                tableHeader(['Indicador', 'Valor'], [...IND_W]),
                tableRow(['Período analizado', `${fmtLong(fromDate)} al ${fmtLong(toDate)}`], [...IND_W]),
                tableRow(['Total ítems en inventario', String(items.length)], [...IND_W], true),
                tableRow(['Unidades en préstamo activo', String(activeLoanUnits)], [...IND_W]),
                tableRow(['Despachos en el período', String(checkOuts)], [...IND_W], true),
                tableRow(['Ingresos en el período', String(checkIns)], [...IND_W]),
                tableRow(['Ítems con stock bajo mínimo', String(lowStock)], [...IND_W], true),
                tableRow(['Trabajadores con herramientas', String(personnelLoans.length)], [...IND_W]),
                tableRow(['Consumo del período (EPP + material)', `${consumption.totalUnidades} ud`], [...IND_W], true),
                tableRow(['Promedio semanal de consumo', `${consumption.promedioSemanal} ud`], [...IND_W]),
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
            // Fix 3: SectionType.NEXT_PAGE; Fix 2: add header/footer to cover
            {
                properties: {
                    type: SectionType.NEXT_PAGE,
                    page: {
                        margin: { top: 1440, bottom: 1440, left: 1800, right: 1800 },
                    },
                },
                headers: { default: docHeader },
                footers: { default: coverFooter },
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
                    ...analysisChildren,
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
