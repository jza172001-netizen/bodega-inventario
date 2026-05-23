import React, { useMemo } from 'react';
import { Item, Movement, MovementType, InventoryType } from '../types';

interface PrintReportViewProps {
    items: Item[];
    movements: Movement[];
    personnel: Array<{ id: string; name: string; phone?: string }>;
    projects?: Array<{ id: string; name: string }>;
    periodLabel: string;
    fromDate: Date;
    toDate: Date;
}

const fmtLong  = (d: Date) => new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
const fmtShort = (d: Date) => new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

const BLUE = '#1d4ed8';
const DARK = '#111827';
const GRAY = '#6b7280';
const LINE = '#e5e7eb';

const INV_LABEL: Record<string, string> = {
    [InventoryType.HAND_TOOL]: 'H. Manual',
    [InventoryType.ELECTRICAL_TOOL]: 'H. Eléctrica',
    [InventoryType.PPE]: 'Seguridad',
    [InventoryType.SINGLE_USE]: 'Consumible',
};

export const PrintReportView = React.forwardRef<HTMLDivElement, PrintReportViewProps>(
    ({ items, movements, personnel, projects, periodLabel, fromDate, toDate }, ref) => {
        const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);
        const projectMap   = useMemo(() => new Map((projects ?? []).map(p => [p.id, p.name])), [projects]);
        const itemMap      = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

        const filtered = useMemo(() =>
            movements.filter(m => { const t = new Date(m.timestamp); return t >= fromDate && t <= toDate; }),
        [movements, fromDate, toDate]);

        // ── KPIs ──
        const kpis = useMemo(() => {
            const activeLoans = movements.filter(m => m.isLoan && !m.isReturned);
            const checkOuts = filtered.filter(m => m.type === MovementType.CHECK_OUT).reduce((s, m) => s + m.quantity, 0);
            const checkIns  = filtered.filter(m => m.type === MovementType.CHECK_IN || m.type === MovementType.PURCHASE).reduce((s, m) => s + m.quantity, 0);
            const lowStock  = items.filter(i => i.quantity <= i.minStock && i.minStock > 0).length;
            return { totalItems: items.length, activeLoanCount: activeLoans.length, activeLoans, checkOuts, checkIns, lowStock, periodMovements: filtered.length };
        }, [items, movements, filtered]);

        // ── PERSONAL EN PRÉSTAMO ──
        const personnelLoans = useMemo(() => {
            const map = new Map<string, { person: { id: string; name: string; phone?: string }; loans: Movement[] }>();
            kpis.activeLoans.forEach(m => {
                if (!m.personnelId) return;
                const person = personnelMap.get(m.personnelId);
                if (!person) return;
                if (!map.has(m.personnelId)) map.set(m.personnelId, { person, loans: [] });
                map.get(m.personnelId)!.loans.push(m);
            });
            return [...map.values()].sort((a, b) => b.loans.length - a.loans.length);
        }, [kpis.activeLoans, personnelMap]);

        // ── HERRAMIENTAS CAPITAL (HAND + ELECTRICAL) con estado ──
        const capitalItems = useMemo(() =>
            items
                .filter(i => i.inventoryType === InventoryType.HAND_TOOL || i.inventoryType === InventoryType.ELECTRICAL_TOOL)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(item => {
                    const loan = kpis.activeLoans.find(m => m.itemId === item.id);
                    const holder = loan ? personnelMap.get(loan.personnelId ?? '') : null;
                    const days = loan ? Math.floor((Date.now() - new Date(loan.timestamp).getTime()) / 86400000) : 0;
                    return { item, holder, days };
                }),
        [items, kpis.activeLoans, personnelMap]);

        // ── CONSUMIBLES USADOS EN EL PERÍODO ──
        const consumablesUsed = useMemo(() => {
            const map = new Map<string, number>();
            filtered.filter(m => m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE).forEach(m => {
                const item = itemMap.get(m.itemId);
                if (item && (item.inventoryType === InventoryType.SINGLE_USE || item.inventoryType === InventoryType.PPE)) {
                    map.set(m.itemId, (map.get(m.itemId) ?? 0) + m.quantity);
                }
            });
            return [...map.entries()]
                .map(([id, qty]) => ({ item: itemMap.get(id)!, qty }))
                .filter(x => x.item)
                .sort((a, b) => b.qty - a.qty);
        }, [filtered, itemMap]);

        // ── PROYECTOS ──
        const projectActivity = useMemo(() => {
            const map = new Map<string, { checkouts: number; workerIds: Set<string>; itemIds: Set<string> }>();
            filtered.filter(m => m.projectId).forEach(m => {
                const pid = m.projectId!;
                if (!map.has(pid)) map.set(pid, { checkouts: 0, workerIds: new Set(), itemIds: new Set() });
                const p = map.get(pid)!;
                if (m.type === MovementType.CHECK_OUT) { p.checkouts++; p.itemIds.add(m.itemId); }
                if (m.personnelId) p.workerIds.add(m.personnelId);
            });
            return [...map.entries()]
                .sort((a, b) => b[1].checkouts - a[1].checkouts)
                .map(([id, d]) => ({ name: projectMap.get(id) ?? '—', checkouts: d.checkouts, workers: d.workerIds.size, items: d.itemIds.size }));
        }, [filtered, projectMap]);

        // ── RESUMEN EN PROSA ──
        const prose = useMemo(() => {
            const { periodMovements, checkOuts, checkIns, activeLoanCount, lowStock } = kpis;
            const topWorker = personnelLoans[0];
            const topItem = consumablesUsed[0];
            let t = `Durante ${periodLabel.toLowerCase()}, la bodega Montecielo registró un total de ${periodMovements} movimiento${periodMovements !== 1 ? 's' : ''}, `;
            t += `de los cuales ${checkOuts} unidade${checkOuts !== 1 ? 's' : ''} fueron despachadas y ${checkIns} ingresaron al inventario. `;
            if (activeLoanCount > 0) {
                t += `Al cierre del período, ${activeLoanCount} herramienta${activeLoanCount !== 1 ? 's se encuentran' : ' se encuentra'} en préstamo activo`;
                if (topWorker) t += `, siendo ${topWorker.person.name} quien cuenta con el mayor número de ítems asignados (${topWorker.loans.length})`;
                t += '. ';
            } else {
                t += 'No hay herramientas en préstamo activo al cierre del período. ';
            }
            if (topItem?.item) {
                t += `El material con mayor consumo fue "${topItem.item.name}" con ${topItem.qty} ${topItem.item.unit} despachados. `;
            }
            t += lowStock > 0
                ? `Se detectaron ${lowStock} ítem${lowStock !== 1 ? 's' : ''} con stock por debajo del mínimo — se recomienda reposición prioritaria.`
                : 'Los niveles de stock se mantienen dentro de rangos óptimos.';
            return t;
        }, [kpis, periodLabel, personnelLoans, consumablesUsed]);

        // ── ESTILOS ──
        const sH = { fontSize: '8px', fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.14em', color: BLUE, borderBottom: `1.5px solid ${BLUE}`, paddingBottom: '4px', marginBottom: '12px', marginTop: '20px' } as React.CSSProperties;
        const tH = { fontSize: '8px', fontWeight: 700, color: GRAY, textTransform: 'uppercase' as const, letterSpacing: '0.06em', padding: '4px 8px', background: '#f9fafb', borderBottom: `1px solid ${LINE}` } as React.CSSProperties;
        const tR = { fontSize: '10px', color: DARK, padding: '5px 8px', borderBottom: `1px solid ${LINE}` } as React.CSSProperties;

        return (
            <div ref={ref} className="print-only hidden" style={{ fontFamily: "'Arial','Helvetica',sans-serif", color: DARK, background: '#fff', fontSize: '11px' }}>
                <style>{`
                    @media print {
                        .print-only { display: block !important; }
                        body > * { visibility: hidden; }
                        .print-only, .print-only * { visibility: visible; }
                        .print-only { position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; }
                        @page { size: A4; margin: 1.8cm 2.2cm; }
                        tr { page-break-inside: avoid; }
                        .no-break { page-break-inside: avoid; }
                    }
                `}</style>

                {/* ── ENCABEZADO ── */}
                <div style={{ paddingBottom: '14px', borderBottom: `3px solid ${BLUE}`, marginBottom: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: BLUE, letterSpacing: '-0.5px', lineHeight: 1 }}>GRUPO MONTECIELO</p>
                            <p style={{ margin: '2px 0 0', fontSize: '10px', color: GRAY, fontWeight: 600 }}>Informe de Operaciones de Bodega</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 900, color: DARK }}>{periodLabel.toUpperCase()}</p>
                            <p style={{ margin: '2px 0 0', fontSize: '9px', color: GRAY }}>{fmtLong(fromDate)} al {fmtLong(toDate)}</p>
                            <p style={{ margin: '2px 0 0', fontSize: '8px', color: '#9ca3af' }}>Generado: {new Date().toLocaleDateString('es-CO')}</p>
                        </div>
                    </div>
                </div>

                {/* ── INDICADORES EN UNA FILA ── */}
                <div className="no-break" style={{ display: 'flex', gap: '0', margin: '12px 0 0', border: `1px solid ${LINE}`, borderRadius: '4px', overflow: 'hidden' }}>
                    {[
                        { label: 'Ítems en inventario', value: kpis.totalItems },
                        { label: 'Despachos (unidades)', value: kpis.checkOuts },
                        { label: 'Préstamos activos', value: kpis.activeLoanCount },
                        { label: 'Stock bajo mínimo', value: kpis.lowStock },
                    ].map((k, i) => (
                        <div key={i} style={{ flex: 1, padding: '10px 12px', borderRight: i < 3 ? `1px solid ${LINE}` : 'none', textAlign: 'center' }}>
                            <p style={{ margin: 0, fontSize: '8px', color: GRAY, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</p>
                            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: BLUE, lineHeight: 1 }}>{k.value}</p>
                        </div>
                    ))}
                </div>

                {/* ── RESUMEN EJECUTIVO ── */}
                <div className="no-break">
                    <div style={sH}>Resumen ejecutivo</div>
                    <p style={{ fontSize: '11px', lineHeight: '1.8', color: '#374151', margin: 0, textAlign: 'justify' }}>{prose}</p>
                </div>

                {/* ── PERSONAL EN PRÉSTAMO ── */}
                {personnelLoans.length > 0 && (
                    <div className="no-break">
                        <div style={sH}>Personal con herramientas asignadas</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                            <thead>
                                <tr>
                                    <th style={{ ...tH, textAlign: 'left' }}>Trabajador</th>
                                    <th style={{ ...tH, textAlign: 'left' }}>Herramientas en su poder</th>
                                    <th style={{ ...tH, textAlign: 'center', width: '60px' }}>Días</th>
                                </tr>
                            </thead>
                            <tbody>
                                {personnelLoans.map(({ person, loans }) =>
                                    loans.map((loan, li) => {
                                        const item = itemMap.get(loan.itemId);
                                        const days = Math.floor((Date.now() - new Date(loan.timestamp).getTime()) / 86400000);
                                        return (
                                            <tr key={loan.id}>
                                                <td style={{ ...tR, fontWeight: li === 0 ? 700 : 400, color: li === 0 ? DARK : GRAY }}>{li === 0 ? person.name : ''}</td>
                                                <td style={tR}>{item?.name ?? '—'} <span style={{ color: GRAY, fontSize: '9px' }}>({INV_LABEL[item?.inventoryType ?? ''] ?? ''})</span></td>
                                                <td style={{ ...tR, textAlign: 'center', color: days > 14 ? '#dc2626' : days > 7 ? '#f59e0b' : GRAY }}>{days}d</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── ESTADO DE HERRAMIENTAS CAPITAL ── */}
                {capitalItems.length > 0 && (
                    <div className="no-break">
                        <div style={sH}>Estado de herramientas y equipos</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                            <thead>
                                <tr>
                                    <th style={{ ...tH, textAlign: 'left' }}>Herramienta</th>
                                    <th style={{ ...tH, textAlign: 'left', width: '80px' }}>Tipo</th>
                                    <th style={{ ...tH, textAlign: 'center', width: '55px' }}>Stock</th>
                                    <th style={{ ...tH, textAlign: 'left' }}>En poder de</th>
                                    <th style={{ ...tH, textAlign: 'center', width: '60px' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {capitalItems.map(({ item, holder, days }) => {
                                    const estado = holder ? (days > 14 ? 'VENCIDO' : 'PRESTADO') : item.quantity === 0 ? 'AGOTADO' : 'DISPONIBLE';
                                    const estadoColor = holder ? (days > 14 ? '#dc2626' : '#f59e0b') : item.quantity === 0 ? '#dc2626' : '#16a34a';
                                    return (
                                        <tr key={item.id}>
                                            <td style={{ ...tR, fontWeight: 600 }}>{item.name}</td>
                                            <td style={{ ...tR, color: GRAY, fontSize: '9px' }}>{INV_LABEL[item.inventoryType]}</td>
                                            <td style={{ ...tR, textAlign: 'center' }}>{item.quantity} {item.unit}</td>
                                            <td style={tR}>{holder ? <span style={{ fontWeight: 600, color: '#92400e' }}>{holder.name} ({days}d)</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                                            <td style={{ ...tR, textAlign: 'center', fontWeight: 900, fontSize: '8px', color: estadoColor }}>{estado}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── CONSUMIBLES DEL PERÍODO ── */}
                {consumablesUsed.length > 0 && (
                    <div className="no-break">
                        <div style={sH}>Materiales y consumibles despachados en el período</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                            <thead>
                                <tr>
                                    <th style={{ ...tH, textAlign: 'left' }}>Material</th>
                                    <th style={{ ...tH, textAlign: 'left', width: '80px' }}>Categoría</th>
                                    <th style={{ ...tH, textAlign: 'center', width: '80px' }}>Cantidad usada</th>
                                    <th style={{ ...tH, textAlign: 'center', width: '60px' }}>Stock actual</th>
                                </tr>
                            </thead>
                            <tbody>
                                {consumablesUsed.map(({ item, qty }) => (
                                    <tr key={item.id}>
                                        <td style={{ ...tR, fontWeight: 600 }}>{item.name}</td>
                                        <td style={{ ...tR, color: GRAY, fontSize: '9px' }}>{INV_LABEL[item.inventoryType]}</td>
                                        <td style={{ ...tR, textAlign: 'center', fontWeight: 700 }}>{qty} {item.unit}</td>
                                        <td style={{ ...tR, textAlign: 'center', color: item.quantity === 0 ? '#dc2626' : GRAY }}>{item.quantity} {item.unit}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── PROYECTOS ── */}
                {projectActivity.length > 0 && (
                    <div className="no-break">
                        <div style={sH}>Actividad por proyecto / obra</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                            <thead>
                                <tr>
                                    <th style={{ ...tH, textAlign: 'left' }}>Proyecto / Obra</th>
                                    <th style={{ ...tH, textAlign: 'center', width: '90px' }}>Despachos</th>
                                    <th style={{ ...tH, textAlign: 'center', width: '90px' }}>Trabajadores</th>
                                    <th style={{ ...tH, textAlign: 'center', width: '80px' }}>Tipos ítem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projectActivity.map((proj, i) => (
                                    <tr key={i}>
                                        <td style={{ ...tR, fontWeight: 600 }}>{proj.name}</td>
                                        <td style={{ ...tR, textAlign: 'center' }}>{proj.checkouts}</td>
                                        <td style={{ ...tR, textAlign: 'center' }}>{proj.workers}</td>
                                        <td style={{ ...tR, textAlign: 'center' }}>{proj.items}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── FIRMAS ── */}
                <div style={{ marginTop: '32px', paddingTop: '12px', borderTop: `1px solid ${LINE}` }}>
                    <div style={{ display: 'flex', gap: '60px' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ borderBottom: `1px solid ${DARK}`, paddingBottom: '30px', marginBottom: '5px' }} />
                            <p style={{ margin: 0, fontSize: '9px', color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bodeguero responsable</p>
                            <p style={{ margin: '2px 0 0', fontSize: '9px', color: '#9ca3af' }}>Nombre, cédula y firma</p>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ borderBottom: `1px solid ${DARK}`, paddingBottom: '30px', marginBottom: '5px' }} />
                            <p style={{ margin: 0, fontSize: '9px', color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Visto bueno — Dirección</p>
                            <p style={{ margin: '2px 0 0', fontSize: '9px', color: '#9ca3af' }}>Nombre, cargo y firma</p>
                        </div>
                    </div>
                </div>

                {/* ── PIE ── */}
                <div style={{ marginTop: '12px', paddingTop: '6px', borderTop: `2px solid ${BLUE}`, display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ margin: 0, fontSize: '8px', color: '#9ca3af' }}>Grupo Montecielo — Control de Inventario de Bodega</p>
                    <p style={{ margin: 0, fontSize: '8px', color: '#9ca3af' }}>Documento de uso interno · {new Date().toLocaleDateString('es-CO')}</p>
                </div>
            </div>
        );
    }
);

PrintReportView.displayName = 'PrintReportView';
