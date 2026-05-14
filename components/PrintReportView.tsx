import React, { useMemo } from 'react';
import { Item, Movement, MovementType, InventoryType } from '../types';

interface PrintReportViewProps {
    items: Item[];
    movements: Movement[];
    personnel: Array<{ id: string; name: string }>;
    periodLabel: string;
    fromDate: Date;
    toDate: Date;
}

const formatCOP = (v: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

const fmtLong = (d: Date) =>
    new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);

const fmtShort = (d: Date) =>
    new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

const TYPE_META: Record<string, { label: string; bg: string; color: string }> = {
    PURCHASE:  { label: 'Compra',  bg: '#f0fdf4', color: '#16a34a' },
    CHECK_IN:  { label: 'Entrada', bg: '#eff6ff', color: '#2563eb' },
    CHECK_OUT: { label: 'Salida',  bg: '#fff7ed', color: '#ea580c' },
    WASTE:     { label: 'Merma',   bg: '#fef2f2', color: '#dc2626' },
};

export const PrintReportView = React.forwardRef<HTMLDivElement, PrintReportViewProps>(
    ({ items, movements, personnel, periodLabel, fromDate, toDate }, ref) => {
        const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p.name])), [personnel]);

        const filtered = useMemo(() =>
            movements.filter(m => {
                const t = new Date(m.timestamp);
                return t >= fromDate && t <= toDate;
            }),
        [movements, fromDate, toDate]);

        const kpis = useMemo(() => {
            const assetsValue = items.reduce((s, i) =>
                (i.inventoryType === InventoryType.HAND_TOOL || i.inventoryType === InventoryType.ELECTRICAL_TOOL)
                    ? s + i.quantity * i.price : s, 0);
            const inventoryValue = items.reduce((s, i) =>
                (i.inventoryType === InventoryType.SINGLE_USE || i.inventoryType === InventoryType.PPE)
                    ? s + i.quantity * i.price : s, 0);
            const lowStock = items.filter(i => i.quantity <= i.minStock && i.minStock > 0).length;
            const checkOuts = filtered.filter(m => m.type === MovementType.CHECK_OUT).length;
            const checkIns  = filtered.filter(m => m.type === MovementType.CHECK_IN || m.type === MovementType.PURCHASE).length;
            const waste = filtered.filter(m => m.type === MovementType.WASTE).reduce((s, m) => {
                const it = items.find(i => i.id === m.itemId);
                return s + (it ? it.price * m.quantity : 0);
            }, 0);
            return { assetsValue, inventoryValue, lowStock, checkOuts, checkIns, waste, total: filtered.length };
        }, [items, filtered]);

        const topConsumed = useMemo(() => {
            const totals: Record<string, number> = {};
            filtered.filter(m => m.type === MovementType.CHECK_OUT)
                .forEach(m => { totals[m.itemId] = (totals[m.itemId] || 0) + m.quantity; });
            const max = Math.max(...Object.values(totals), 1);
            return Object.entries(totals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([id, qty]) => ({ item: items.find(i => i.id === id), qty, pct: (qty / max) * 100 }))
                .filter(x => x.item);
        }, [filtered, items]);

        const lowStockItems = useMemo(() =>
            items.filter(i => i.minStock > 0).map(i => ({ ...i, ratio: i.quantity / i.minStock }))
                .sort((a, b) => a.ratio - b.ratio).slice(0, 10),
        [items]);

        const s = {
            page: { fontFamily: "'Georgia', 'Times New Roman', serif", color: '#1a1a2e', background: '#fff', fontSize: '11px' } as React.CSSProperties,
            sectionTitle: {
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const,
                letterSpacing: '0.12em', color: '#fff', background: '#1e3a8a',
                padding: '5px 12px', marginBottom: '10px', borderRadius: '2px',
            } as React.CSSProperties,
            kpiBox: (color: string) => ({
                border: `1px solid ${color}`, borderTop: `4px solid ${color}`,
                borderRadius: '4px', padding: '10px 12px', background: '#fff',
            } as React.CSSProperties),
            th: {
                padding: '5px 8px', textAlign: 'left' as const, fontSize: '9px',
                fontWeight: 700, color: '#fff', textTransform: 'uppercase' as const,
                background: '#1e3a8a', letterSpacing: '0.05em',
            } as React.CSSProperties,
            td: (idx: number) => ({
                padding: '5px 8px', fontSize: '10px', color: '#374151',
                background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
            } as React.CSSProperties),
        };

        return (
            <div ref={ref} className="print-only hidden" style={s.page}>
                <style>{`
                    @media print {
                        .print-only { display: block !important; }
                        body > * { visibility: hidden; }
                        .print-only, .print-only * { visibility: visible; }
                        .print-only { position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; }
                        @page { size: A4; margin: 2cm 2.5cm; }
                        table { page-break-inside: auto; }
                        tr { page-break-inside: avoid; }
                        .no-break { page-break-inside: avoid; }
                    }
                `}</style>

                {/* ── MEMBRETE / ENCABEZADO ── */}
                <div style={{ borderBottom: '4px solid #1e3a8a', paddingBottom: '14px', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        {/* Logo / Nombre */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                <div style={{ width: '40px', height: '40px', background: '#1e3a8a', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: '#fff', fontWeight: 900, fontSize: '18px', fontFamily: 'Arial' }}>B</span>
                                </div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#1e3a8a', letterSpacing: '-0.5px', fontFamily: 'Arial, sans-serif' }}>BODEGA PRO</p>
                                    <p style={{ margin: 0, fontSize: '10px', color: '#6b7280', fontFamily: 'Arial, sans-serif' }}>Sistema de Gestión de Inventario</p>
                                </div>
                            </div>
                        </div>
                        {/* Info del documento */}
                        <div style={{ textAlign: 'right', fontFamily: 'Arial, sans-serif' }}>
                            <p style={{ margin: 0, fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Informe de Inventario</p>
                            <p style={{ margin: '2px 0 0', fontSize: '11px', fontWeight: 700, color: '#1e3a8a' }}>{periodLabel.toUpperCase()}</p>
                            <p style={{ margin: '4px 0 0', fontSize: '9px', color: '#6b7280' }}>Fecha de generación:</p>
                            <p style={{ margin: '1px 0 0', fontSize: '10px', color: '#374151', fontWeight: 600 }}>{fmtLong(new Date())}</p>
                        </div>
                    </div>
                </div>

                {/* ── IDENTIFICACIÓN DEL DOCUMENTO ── */}
                <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px 14px', marginBottom: '18px', fontFamily: 'Arial, sans-serif' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Período cubierto</p>
                            <p style={{ margin: '2px 0 0', fontSize: '10px', fontWeight: 700, color: '#1e3a8a' }}>{fmtShort(fromDate)} — {fmtShort(toDate)}</p>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total ítems en inventario</p>
                            <p style={{ margin: '2px 0 0', fontSize: '10px', fontWeight: 700, color: '#1e3a8a' }}>{items.length} productos registrados</p>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Movimientos del período</p>
                            <p style={{ margin: '2px 0 0', fontSize: '10px', fontWeight: 700, color: '#1e3a8a' }}>{kpis.total} transacciones</p>
                        </div>
                    </div>
                </div>

                {/* ── 1. RESUMEN EJECUTIVO (KPIs) ── */}
                <div className="no-break" style={{ marginBottom: '18px' }}>
                    <div style={s.sectionTitle}>1. Resumen Ejecutivo</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontFamily: 'Arial, sans-serif' }}>
                        {[
                            { label: 'Valor en Activos', sub: 'Herramientas', value: formatCOP(kpis.assetsValue), color: '#1d4ed8' },
                            { label: 'Valor Consumibles', sub: 'EPP y materiales', value: formatCOP(kpis.inventoryValue), color: '#059669' },
                            { label: 'Salidas del período', sub: `${kpis.checkOuts} despachos`, value: String(kpis.checkIns + kpis.checkOuts), color: '#7c3aed' },
                            { label: 'Costo en Mermas', sub: 'Materiales dados de baja', value: formatCOP(kpis.waste), color: '#dc2626' },
                        ].map(k => (
                            <div key={k.label} style={s.kpiBox(k.color)}>
                                <p style={{ margin: 0, fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</p>
                                <p style={{ margin: '3px 0 1px', fontSize: '14px', fontWeight: 900, color: k.color }}>{k.value}</p>
                                <p style={{ margin: 0, fontSize: '8px', color: '#9ca3af' }}>{k.sub}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── 2. ANÁLISIS DE CONSUMO + STOCK CRÍTICO ── */}
                <div className="no-break" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
                    {/* Top consumidos */}
                    <div>
                        <div style={s.sectionTitle}>2. Materiales más Consumidos</div>
                        {topConsumed.length === 0
                            ? <p style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'Arial, sans-serif' }}>Sin salidas registradas en este período.</p>
                            : topConsumed.map(({ item, qty, pct }, i) => (
                            <div key={item!.id} style={{ marginBottom: '8px', fontFamily: 'Arial, sans-serif' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                                    <span style={{ fontWeight: 600, color: '#111827' }}>{i + 1}. {item!.name}</span>
                                    <span style={{ color: '#6b7280', fontWeight: 700 }}>{qty} {item!.unit}</span>
                                </div>
                                <div style={{ background: '#e2e8f0', borderRadius: '2px', height: '5px' }}>
                                    <div style={{ background: '#1d4ed8', height: '5px', borderRadius: '2px', width: `${pct}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Stock crítico */}
                    <div>
                        <div style={s.sectionTitle}>3. Alertas de Stock Crítico</div>
                        {lowStockItems.length === 0
                            ? <p style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'Arial, sans-serif' }}>Todos los ítems están sobre el stock mínimo.</p>
                            : lowStockItems.map(item => {
                                const pct = Math.min(item.ratio * 100, 100);
                                const color = item.quantity <= 0 ? '#dc2626' : pct < 50 ? '#f59e0b' : '#10b981';
                                const estado = item.quantity <= 0 ? 'AGOTADO' : pct < 50 ? 'CRÍTICO' : 'BAJO';
                                return (
                                    <div key={item.id} style={{ marginBottom: '8px', fontFamily: 'Arial, sans-serif' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '10px', marginBottom: '3px' }}>
                                            <span style={{ fontWeight: 600, color: '#111827' }}>{item.name}</span>
                                            <span style={{ color, fontWeight: 700, fontSize: '9px' }}>{item.quantity}/{item.minStock} {item.unit} · {estado}</span>
                                        </div>
                                        <div style={{ background: '#e2e8f0', borderRadius: '2px', height: '5px' }}>
                                            <div style={{ background: color, height: '5px', borderRadius: '2px', width: `${Math.max(pct, 2)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>

                {/* ── 4. REGISTRO DE MOVIMIENTOS ── */}
                <div>
                    <div style={s.sectionTitle}>4. Registro de Movimientos del Período ({filtered.length} registros)</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif' }}>
                        <thead>
                            <tr>
                                {['#', 'Fecha', 'Artículo', 'Tipo', 'Cantidad', 'Responsable', 'Notas'].map(h => (
                                    <th key={h} style={s.th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.slice(0, 150).map((m, idx) => {
                                const item = items.find(i => i.id === m.itemId);
                                const meta = TYPE_META[m.type] ?? { label: m.type, bg: '#f9fafb', color: '#374151' };
                                return (
                                    <tr key={m.id}>
                                        <td style={{ ...s.td(idx), color: '#9ca3af', width: '24px' }}>{idx + 1}</td>
                                        <td style={{ ...s.td(idx), whiteSpace: 'nowrap' as const }}>{fmtShort(new Date(m.timestamp))}</td>
                                        <td style={{ ...s.td(idx), fontWeight: 600, color: '#111827' }}>{item?.name ?? '—'}</td>
                                        <td style={{ ...s.td(idx) }}>
                                            <span style={{ background: meta.bg, color: meta.color, fontWeight: 700, fontSize: '9px', padding: '1px 6px', borderRadius: '10px', border: `1px solid ${meta.color}30` }}>
                                                {meta.label}
                                            </span>
                                        </td>
                                        <td style={{ ...s.td(idx), fontWeight: 600 }}>{m.quantity} {item?.unit ?? ''}</td>
                                        <td style={{ ...s.td(idx), color: '#6b7280' }}>{m.personnelId ? (personnelMap.get(m.personnelId) ?? '—') : '—'}</td>
                                        <td style={{ ...s.td(idx), color: '#9ca3af', maxWidth: '100px' }}>{m.notes ?? ''}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filtered.length > 150 && (
                        <p style={{ fontSize: '9px', color: '#9ca3af', marginTop: '6px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
                            Mostrando los primeros 150 de {filtered.length} movimientos totales.
                        </p>
                    )}
                </div>

                {/* ── SECCIÓN DE FIRMA ── */}
                <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', fontFamily: 'Arial, sans-serif' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                        <div>
                            <div style={{ borderBottom: '1px solid #374151', marginBottom: '4px', paddingBottom: '24px' }} />
                            <p style={{ margin: 0, fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Firma del Responsable</p>
                            <p style={{ margin: '2px 0 0', fontSize: '9px', color: '#94a3b8' }}>Nombre y cargo</p>
                        </div>
                        <div>
                            <div style={{ borderBottom: '1px solid #374151', marginBottom: '4px', paddingBottom: '24px' }} />
                            <p style={{ margin: 0, fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Visto Bueno / Jefe de Bodega</p>
                            <p style={{ margin: '2px 0 0', fontSize: '9px', color: '#94a3b8' }}>Nombre y cargo</p>
                        </div>
                    </div>
                </div>

                {/* ── PIE DE PÁGINA ── */}
                <div style={{ marginTop: '16px', paddingTop: '8px', borderTop: '2px solid #1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Arial, sans-serif' }}>
                    <p style={{ margin: 0, fontSize: '8px', color: '#94a3b8' }}>
                        BODEGA PRO — Sistema de Gestión de Inventario
                    </p>
                    <p style={{ margin: 0, fontSize: '8px', color: '#94a3b8' }}>
                        Generado: {new Date().toLocaleString('es-CO')} · Documento de uso interno
                    </p>
                </div>
            </div>
        );
    }
);

PrintReportView.displayName = 'PrintReportView';
