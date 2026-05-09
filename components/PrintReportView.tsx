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

const fmt = (d: Date) =>
    new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);

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

        const TYPE_LABELS: Record<string, string> = {
            PURCHASE: 'Compra', CHECK_IN: 'Entrada', CHECK_OUT: 'Salida', WASTE: 'Merma'
        };

        return (
            <div ref={ref} className="print-only hidden bg-white text-gray-900 font-sans" style={{ fontFamily: 'Arial, sans-serif' }}>
                <style>{`
                    @media print {
                        .print-only { display: block !important; }
                        body > * { visibility: hidden; }
                        .print-only, .print-only * { visibility: visible; }
                        .print-only { position: fixed; top: 0; left: 0; width: 100%; z-index: 9999; }
                        @page { size: A4; margin: 1.5cm; }
                    }
                `}</style>

                {/* Encabezado */}
                <div style={{ borderBottom: '3px solid #1d4ed8', paddingBottom: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                            <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#1e3a8a', margin: 0, textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                                Bodega Pro
                            </h1>
                            <p style={{ fontSize: '14px', color: '#6b7280', margin: '2px 0 0' }}>
                                Informe de Inventario — {periodLabel}
                            </p>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
                            <p style={{ margin: 0 }}><strong>Período:</strong> {fmt(fromDate)} — {fmt(toDate)}</p>
                            <p style={{ margin: '2px 0 0' }}><strong>Generado:</strong> {fmt(new Date())}</p>
                        </div>
                    </div>
                </div>

                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                    {[
                        { label: 'Valor Activos', value: formatCOP(kpis.assetsValue), color: '#1d4ed8' },
                        { label: 'Valor Consumibles', value: formatCOP(kpis.inventoryValue), color: '#059669' },
                        { label: 'Movimientos', value: String(kpis.total), color: '#7c3aed' },
                        { label: 'Mermas (período)', value: formatCOP(kpis.waste), color: '#dc2626' },
                    ].map(k => (
                        <div key={k.label} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', borderTop: `3px solid ${k.color}` }}>
                            <p style={{ fontSize: '10px', color: '#6b7280', margin: '0 0 4px', textTransform: 'uppercase', fontWeight: 700 }}>{k.label}</p>
                            <p style={{ fontSize: '16px', fontWeight: 900, color: k.color, margin: 0 }}>{k.value}</p>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                    {/* Top consumidos */}
                    <div>
                        <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '10px' }}>
                            Top {topConsumed.length} consumidos en el período
                        </h2>
                        {topConsumed.length === 0
                            ? <p style={{ fontSize: '11px', color: '#9ca3af' }}>Sin salidas en este período</p>
                            : topConsumed.map(({ item, qty, pct }) => (
                            <div key={item!.id} style={{ marginBottom: '7px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                                    <span style={{ fontWeight: 600, color: '#111827' }}>{item!.name}</span>
                                    <span style={{ color: '#6b7280' }}>{qty} {item!.unit}</span>
                                </div>
                                <div style={{ background: '#e5e7eb', borderRadius: '4px', height: '6px' }}>
                                    <div style={{ background: '#2563eb', height: '6px', borderRadius: '4px', width: `${pct}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Stock crítico */}
                    <div>
                        <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '10px' }}>
                            Stock crítico (bajo mínimo)
                        </h2>
                        {lowStockItems.length === 0
                            ? <p style={{ fontSize: '11px', color: '#9ca3af' }}>Todos los ítems están sobre el mínimo</p>
                            : lowStockItems.map(item => {
                                const pct = Math.min(item.ratio * 100, 100);
                                const color = item.quantity <= 0 ? '#dc2626' : pct < 50 ? '#f59e0b' : '#10b981';
                                return (
                                    <div key={item.id} style={{ marginBottom: '7px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                                            <span style={{ fontWeight: 600, color: '#111827' }}>{item.name}</span>
                                            <span style={{ color }}>{item.quantity}/{item.minStock} {item.unit}</span>
                                        </div>
                                        <div style={{ background: '#e5e7eb', borderRadius: '4px', height: '6px' }}>
                                            <div style={{ background: color, height: '6px', borderRadius: '4px', width: `${Math.max(pct, 2)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>

                {/* Tabla de movimientos */}
                <div>
                    <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '10px' }}>
                        Movimientos del período ({filtered.length} registros)
                    </h2>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                        <thead>
                            <tr style={{ background: '#f9fafb' }}>
                                {['Fecha', 'Artículo', 'Tipo', 'Cantidad', 'Responsable', 'Notas'].map(h => (
                                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', fontSize: '9px' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.slice(0, 150).map((m, idx) => {
                                const item = items.find(i => i.id === m.itemId);
                                return (
                                    <tr key={m.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                                        <td style={{ padding: '5px 8px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                            {new Date(m.timestamp).toLocaleDateString('es-CO')}
                                        </td>
                                        <td style={{ padding: '5px 8px', fontWeight: 600, color: '#111827' }}>{item?.name ?? '—'}</td>
                                        <td style={{ padding: '5px 8px', color: '#374151' }}>{TYPE_LABELS[m.type] ?? m.type}</td>
                                        <td style={{ padding: '5px 8px', color: '#374151' }}>{m.quantity} {item?.unit ?? ''}</td>
                                        <td style={{ padding: '5px 8px', color: '#6b7280' }}>{m.personnelId ? personnelMap.get(m.personnelId) ?? '—' : '—'}</td>
                                        <td style={{ padding: '5px 8px', color: '#9ca3af', maxWidth: '120px', overflow: 'hidden' }}>{m.notes ?? ''}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filtered.length > 150 && (
                        <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '8px', textAlign: 'center' }}>
                            Mostrando los primeros 150 de {filtered.length} movimientos
                        </p>
                    )}
                </div>

                <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '1px solid #e5e7eb', fontSize: '9px', color: '#9ca3af', textAlign: 'center' }}>
                    Bodega Pro — Informe generado automáticamente el {new Date().toLocaleString('es-CO')}
                </div>
            </div>
        );
    }
);

PrintReportView.displayName = 'PrintReportView';
