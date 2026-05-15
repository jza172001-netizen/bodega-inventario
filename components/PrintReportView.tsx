import React, { useMemo } from 'react';
import { Item, Movement, MovementType } from '../types';

interface PrintReportViewProps {
    items: Item[];
    movements: Movement[];
    personnel: Array<{ id: string; name: string }>;
    projects?: Array<{ id: string; name: string }>;
    periodLabel: string;
    fromDate: Date;
    toDate: Date;
}

const fmtLong = (d: Date) =>
    new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);

const fmtShort = (d: Date) =>
    new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

const RED = '#dc2626';
const DARK = '#111827';

export const PrintReportView = React.forwardRef<HTMLDivElement, PrintReportViewProps>(
    ({ items, movements, personnel, projects, periodLabel, fromDate, toDate }, ref) => {
        const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p.name])), [personnel]);
        const projectMap = useMemo(() => new Map((projects ?? []).map(p => [p.id, p.name])), [projects]);

        const filtered = useMemo(() =>
            movements.filter(m => {
                const t = new Date(m.timestamp);
                return t >= fromDate && t <= toDate;
            }),
        [movements, fromDate, toDate]);

        const kpis = useMemo(() => {
            const totalItems = items.length;
            const activeLoans = movements.filter(m => m.isLoan && !m.isReturned).length;
            const periodMovements = filtered.length;
            const lowStock = items.filter(i => i.quantity <= i.minStock && i.minStock > 0).length;
            const checkOuts = filtered.filter(m => m.type === MovementType.CHECK_OUT).length;
            const checkIns = filtered.filter(m =>
                m.type === MovementType.CHECK_IN || m.type === MovementType.PURCHASE
            ).length;
            return { totalItems, activeLoans, periodMovements, lowStock, checkOuts, checkIns };
        }, [items, movements, filtered]);

        const topWorkersByLoans = useMemo(() => {
            const counts: Record<string, number> = {};
            movements
                .filter(m => m.isLoan && !m.isReturned)
                .forEach(m => {
                    if (m.personnelId) counts[m.personnelId] = (counts[m.personnelId] || 0) + 1;
                });
            return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([id, qty]) => ({ name: personnelMap.get(id) ?? '—', qty }));
        }, [movements, personnelMap]);

        const topConsumed = useMemo(() => {
            const totals: Record<string, number> = {};
            filtered
                .filter(m => m.type === MovementType.CHECK_OUT)
                .forEach(m => { totals[m.itemId] = (totals[m.itemId] || 0) + m.quantity; });
            const maxQty = Math.max(...Object.values(totals), 1);
            return Object.entries(totals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([id, qty]) => ({ item: items.find(i => i.id === id), qty, pct: (qty / maxQty) * 100 }))
                .filter(x => x.item);
        }, [filtered, items]);

        const stockAlerts = useMemo(() =>
            items
                .filter(i => i.minStock > 0)
                .map(i => ({ ...i, ratio: i.quantity / i.minStock }))
                .sort((a, b) => a.ratio - b.ratio)
                .slice(0, 8),
        [items]);

        const projectActivity = useMemo(() => {
            const counts: Record<string, { checkouts: number; itemIds: Set<string> }> = {};
            filtered
                .filter(m => m.projectId)
                .forEach(m => {
                    const pid = m.projectId!;
                    if (!counts[pid]) counts[pid] = { checkouts: 0, itemIds: new Set() };
                    if (m.type === MovementType.CHECK_OUT) counts[pid].checkouts++;
                    counts[pid].itemIds.add(m.itemId);
                });
            return Object.entries(counts)
                .sort((a, b) => b[1].checkouts - a[1].checkouts)
                .slice(0, 6)
                .map(([id, data]) => ({
                    name: projectMap.get(id) ?? '—',
                    checkouts: data.checkouts,
                    uniqueItems: data.itemIds.size,
                }));
        }, [filtered, projectMap]);

        const prose = useMemo(() => {
            const period = periodLabel.toLowerCase();
            const { periodMovements, checkOuts, checkIns, activeLoans, lowStock } = kpis;
            const topWorker = topWorkersByLoans[0];
            const topItem = topConsumed[0];

            let text = `Durante ${period}, la bodega registró un total de ${periodMovements} movimiento${periodMovements !== 1 ? 's' : ''}, `;
            text += `de los cuales ${checkOuts} correspondieron a despachos y ${checkIns} a ingresos de material. `;

            if (activeLoans > 0) {
                text += `Al cierre del informe, ${activeLoans} herramienta${activeLoans > 1 ? 's se encuentran' : ' se encuentra'} en préstamo activo`;
                if (topWorker) {
                    text += `, siendo ${topWorker.name} quien cuenta con mayor cantidad asignada (${topWorker.qty} ítem${topWorker.qty > 1 ? 's' : ''})`;
                }
                text += '. ';
            } else {
                text += 'No hay herramientas en préstamo activo al cierre del informe. ';
            }

            if (topItem?.item) {
                text += `El artículo con mayor actividad de despacho en el período fue "${topItem.item.name}" con ${topItem.qty} ${topItem.item.unit} despachados. `;
            }

            if (lowStock > 0) {
                text += `Se detectaron ${lowStock} ítem${lowStock > 1 ? 's' : ''} con stock por debajo del mínimo establecido, requiriendo reposición prioritaria para garantizar la continuidad operativa.`;
            } else {
                text += 'Los niveles de stock se mantienen dentro de los rangos óptimos en todos los ítems registrados.';
            }
            return text;
        }, [kpis, periodLabel, topWorkersByLoans, topConsumed]);

        const sectionTitle = {
            fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' as const,
            letterSpacing: '0.14em', color: RED,
            borderBottom: `2px solid ${RED}`,
            paddingBottom: '4px', marginBottom: '12px',
        } as React.CSSProperties;

        const kpiBox = (color: string) => ({
            borderLeft: `4px solid ${color}`,
            border: `1px solid #e5e7eb`,
            borderRadius: '3px', padding: '10px 12px', background: '#fafafa',
        } as React.CSSProperties);

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
                <div style={{ marginBottom: '20px', position: 'relative' }}>
                    <div style={{
                        position: 'absolute', top: 0, left: '-2.2cm',
                        width: '10px', height: '100%',
                        background: RED,
                    }} />
                    <div style={{ paddingBottom: '14px', borderBottom: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '38px', height: '38px', background: RED, borderRadius: '4px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <span style={{ color: '#fff', fontWeight: 900, fontSize: '20px' }}>B</span>
                                </div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: DARK, letterSpacing: '-0.5px' }}>BODEGA PRO</p>
                                    <p style={{ margin: 0, fontSize: '9px', color: '#6b7280' }}>Sistema de Gestión de Inventario — Construcción</p>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{
                                    display: 'inline-block', background: RED, color: '#fff',
                                    padding: '3px 10px', borderRadius: '2px',
                                    fontSize: '8px', fontWeight: 900, letterSpacing: '0.12em',
                                    textTransform: 'uppercase', marginBottom: '5px',
                                }}>
                                    Informe Ejecutivo
                                </div>
                                <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: DARK }}>{periodLabel.toUpperCase()}</p>
                                <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#6b7280' }}>
                                    {fmtShort(fromDate)} — {fmtShort(toDate)}
                                </p>
                                <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#9ca3af' }}>Generado: {fmtLong(new Date())}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── KPIs ── */}
                <div className="no-break" style={{ marginBottom: '18px' }}>
                    <div style={sectionTitle}>Indicadores Clave</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {([
                            { label: 'Ítems en inventario', value: kpis.totalItems, sub: 'productos registrados', color: '#374151' },
                            { label: 'Herramientas en préstamo', value: kpis.activeLoans, sub: 'actualmente fuera', color: kpis.activeLoans > 0 ? RED : '#16a34a' },
                            { label: 'Movimientos del período', value: kpis.periodMovements, sub: `${kpis.checkOuts} salidas · ${kpis.checkIns} entradas`, color: '#2563eb' },
                            { label: 'Stock bajo mínimo', value: kpis.lowStock, sub: kpis.lowStock > 0 ? 'requieren reposición' : 'todo en orden', color: kpis.lowStock > 0 ? '#f59e0b' : '#16a34a' },
                        ] as const).map(k => (
                            <div key={k.label} style={kpiBox(k.color)}>
                                <p style={{ margin: 0, fontSize: '8px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</p>
                                <p style={{ margin: '4px 0 2px', fontSize: '22px', fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</p>
                                <p style={{ margin: 0, fontSize: '8px', color: '#9ca3af' }}>{k.sub}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── RESUMEN EJECUTIVO ── */}
                <div className="no-break" style={{ marginBottom: '18px' }}>
                    <div style={sectionTitle}>Resumen Ejecutivo</div>
                    <div style={{
                        background: '#fafafa', border: '1px solid #e5e7eb',
                        borderLeft: `4px solid ${RED}`, borderRadius: '3px',
                        padding: '12px 14px', fontSize: '11px', lineHeight: '1.75', color: '#374151',
                    }}>
                        {prose}
                    </div>
                </div>

                {/* ── DOS COLUMNAS: trabajadores + materiales ── */}
                <div className="no-break" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px' }}>
                    <div>
                        <div style={sectionTitle}>Personal — Préstamos Activos</div>
                        {topWorkersByLoans.length === 0 ? (
                            <p style={{ fontSize: '10px', color: '#9ca3af' }}>Sin préstamos activos actualmente.</p>
                        ) : (
                            topWorkersByLoans.map(({ name, qty }, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            width: '20px', height: '20px', borderRadius: '50%',
                                            background: i === 0 ? RED : '#e5e7eb',
                                            color: i === 0 ? '#fff' : '#6b7280',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '9px', fontWeight: 900, flexShrink: 0,
                                        }}>
                                            {i + 1}
                                        </span>
                                        <span style={{ fontSize: '10px', fontWeight: 600, color: DARK }}>{name}</span>
                                    </div>
                                    <span style={{ fontSize: '10px', fontWeight: 900, color: RED }}>{qty} ítem{qty > 1 ? 's' : ''}</span>
                                </div>
                            ))
                        )}
                    </div>

                    <div>
                        <div style={sectionTitle}>Mayor Actividad de Despacho</div>
                        {topConsumed.length === 0 ? (
                            <p style={{ fontSize: '10px', color: '#9ca3af' }}>Sin despachos registrados en este período.</p>
                        ) : (
                            topConsumed.map(({ item, qty, pct }, i) => (
                                <div key={item!.id} style={{ marginBottom: '9px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                                        <span style={{ fontWeight: 600, color: DARK }}>{i + 1}. {item!.name}</span>
                                        <span style={{ fontWeight: 900, color: '#374151' }}>{qty} {item!.unit}</span>
                                    </div>
                                    <div style={{ background: '#e5e7eb', borderRadius: '2px', height: '4px' }}>
                                        <div style={{ background: RED, height: '4px', borderRadius: '2px', width: `${pct}%` }} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ── ALERTAS DE STOCK ── */}
                {stockAlerts.length > 0 && (
                    <div className="no-break" style={{ marginBottom: '18px' }}>
                        <div style={sectionTitle}>Alertas de Stock</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                            {stockAlerts.map(item => {
                                const pct = Math.min(item.ratio * 100, 100);
                                const color = item.quantity <= 0 ? RED : pct < 50 ? '#f59e0b' : '#6b7280';
                                const estado = item.quantity <= 0 ? 'AGOTADO' : pct < 50 ? 'CRÍTICO' : 'BAJO';
                                return (
                                    <div key={item.id} style={{ padding: '7px 9px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '3px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '10px', fontWeight: 600, color: DARK }}>{item.name}</span>
                                            <span style={{ fontSize: '8px', fontWeight: 900, color, letterSpacing: '0.05em' }}>{estado}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ flex: 1, background: '#e5e7eb', borderRadius: '2px', height: '3px' }}>
                                                <div style={{ background: color, height: '3px', borderRadius: '2px', width: `${Math.max(pct, 3)}%` }} />
                                            </div>
                                            <span style={{ fontSize: '9px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{item.quantity}/{item.minStock} {item.unit}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── ACTIVIDAD POR PROYECTO ── */}
                {projectActivity.length > 0 && (
                    <div className="no-break" style={{ marginBottom: '18px' }}>
                        <div style={sectionTitle}>Actividad por Proyecto</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                            {projectActivity.map((proj, i) => (
                                <div key={i} style={{ padding: '8px 10px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '3px' }}>
                                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 700, color: DARK }}>{proj.name}</p>
                                    <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#6b7280' }}>
                                        {proj.checkouts} despacho{proj.checkouts !== 1 ? 's' : ''} · {proj.uniqueItems} ítem{proj.uniqueItems !== 1 ? 's' : ''} dist.
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── FIRMAS ── */}
                <div style={{ marginTop: '28px', paddingTop: '14px', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '50px' }}>
                        <div>
                            <div style={{ borderBottom: '1px solid #374151', marginBottom: '4px', paddingBottom: '28px' }} />
                            <p style={{ margin: 0, fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Firma del Responsable</p>
                            <p style={{ margin: '2px 0 0', fontSize: '9px', color: '#9ca3af' }}>Nombre y cargo</p>
                        </div>
                        <div>
                            <div style={{ borderBottom: '1px solid #374151', marginBottom: '4px', paddingBottom: '28px' }} />
                            <p style={{ margin: 0, fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Visto Bueno / Jefe de Bodega</p>
                            <p style={{ margin: '2px 0 0', fontSize: '9px', color: '#9ca3af' }}>Nombre y cargo</p>
                        </div>
                    </div>
                </div>

                {/* ── PIE DE PÁGINA ── */}
                <div style={{ marginTop: '14px', paddingTop: '8px', borderTop: `2px solid ${RED}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ margin: 0, fontSize: '8px', color: '#9ca3af' }}>BODEGA PRO — Sistema de Gestión de Inventario</p>
                    <p style={{ margin: 0, fontSize: '8px', color: '#9ca3af' }}>Generado: {new Date().toLocaleString('es-CO')} · Documento de uso interno</p>
                </div>
            </div>
        );
    }
);

PrintReportView.displayName = 'PrintReportView';
