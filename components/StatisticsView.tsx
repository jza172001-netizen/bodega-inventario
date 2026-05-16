
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { Item, Movement, MovementType, InventoryType, Personnel, Project } from '../types';
import { generateRotationAnalysis } from '../services/geminiService';
import { PrintReportView } from './PrintReportView';

interface StatisticsViewProps {
    items: Item[];
    movements: Movement[];
    personnel?: Personnel[];
    projects?: Project[];
}

const timeAgo = (date: Date): string => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'ayer';
    return `hace ${days}d`;
};

const TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    'COMPRA':  { label: 'Compra',  color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
    'ENTRADA': { label: 'Entrada', color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
    'SALIDA':  { label: 'Salida',  color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    'MERMA':   { label: 'Merma',   color: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
};

const getTypeConfig = (type: string) =>
    TYPE_CONFIG[type] ?? { label: type, color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' };

type PrintPeriod = 'week' | 'month' | 'quarter' | null;

const StatisticsView: React.FC<StatisticsViewProps> = ({ items, movements, personnel = [], projects = [] }) => {
    const [rotationRecs, setRotationRecs] = useState<Record<string, { recommendation: string; severity: string }>>({});
    const [printPeriod, setPrintPeriod] = useState<PrintPeriod>(null);
    const [showPeriodModal, setShowPeriodModal] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    const getPeriodRange = useCallback((period: NonNullable<PrintPeriod>): { fromDate: Date; toDate: Date; label: string } => {
        const now = new Date();
        const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
        const from = new Date(now);
        from.setDate(from.getDate() - days);
        const labels: Record<NonNullable<PrintPeriod>, string> = { week: 'Últimos 7 días', month: 'Último mes', quarter: 'Último trimestre' };
        return { fromDate: from, toDate: now, label: labels[period] };
    }, []);

    const handlePrint = useCallback((period: NonNullable<PrintPeriod>) => {
        setPrintPeriod(period);
        setShowPeriodModal(false);
        // Dar tiempo al DOM para renderizar el componente antes de imprimir
        setTimeout(() => window.print(), 200);
    }, []);

    const thirtyDaysAgo = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d;
    }, []);

    const recentMovements = useMemo(
        () => movements.filter(m => new Date(m.timestamp) > thirtyDaysAgo),
        [movements, thirtyDaysAgo]
    );

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const kpis = useMemo(() => {
        const checkouts30d = recentMovements.filter(m => m.type === MovementType.CHECK_OUT);
        const totalSalidas = checkouts30d.reduce((s, m) => s + m.quantity, 0);
        const totalItems = items.length;
        const activeLoanCount = movements.filter(m => m.isLoan && !m.isReturned).length;
        const pendingPickupCount = movements.filter(m => m.isLoan && !m.isReturned && m.pendingPickup).length;
        const lowStockItems = items.filter(i => i.quantity <= i.minStock && i.minStock > 0).length;
        return { totalSalidas, totalItems, activeLoanCount, pendingPickupCount, lowStockItems };
    }, [items, movements, recentMovements]);

    // ── TOP 8 CONSUMIDOS ──────────────────────────────────────────────────────
    const topConsumed = useMemo(() => {
        const totals: Record<string, number> = {};
        recentMovements
            .filter(m => m.type === MovementType.CHECK_OUT)
            .forEach(m => { totals[m.itemId] = (totals[m.itemId] || 0) + m.quantity; });
        return Object.entries(totals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([id, qty]) => ({ item: items.find(i => i.id === id), qty }))
            .filter(x => x.item);
    }, [recentMovements, items]);

    // ── TORTA: salidas por tipo de inventario ─────────────────────────────────
    const typeBreakdown = useMemo(() => {
        const counts: Record<string, number> = {
            [InventoryType.HAND_TOOL]: 0,
            [InventoryType.ELECTRICAL_TOOL]: 0,
            [InventoryType.PPE]: 0,
            [InventoryType.SINGLE_USE]: 0,
        };
        recentMovements
            .filter(m => m.type === MovementType.CHECK_OUT)
            .forEach(m => {
                const item = items.find(i => i.id === m.itemId);
                if (item) counts[item.inventoryType] = (counts[item.inventoryType] || 0) + m.quantity;
            });
        const total = Object.values(counts).reduce((s, v) => s + v, 0);
        const COLORS = [
            { type: InventoryType.HAND_TOOL, color: '#3b82f6', label: 'H. Manual' },
            { type: InventoryType.ELECTRICAL_TOOL, color: '#f59e0b', label: 'H. Eléctrica' },
            { type: InventoryType.PPE, color: '#10b981', label: 'Seguridad' },
            { type: InventoryType.SINGLE_USE, color: '#ef4444', label: 'Consumibles' },
        ];
        let cumPct = 0;
        return COLORS.map(c => {
            const qty = counts[c.type] || 0;
            const pct = total > 0 ? (qty / total) * 100 : 0;
            const from = cumPct;
            cumPct += pct;
            return { ...c, qty, pct, from };
        }).filter(c => c.qty > 0);
    }, [items, recentMovements]);

    // ── SALUD DEL STOCK ───────────────────────────────────────────────────────
    const stockHealth = useMemo(() => {
        return items
            .filter(i => i.minStock > 0)
            .map(i => ({ ...i, ratio: i.quantity / i.minStock }))
            .sort((a, b) => a.ratio - b.ratio)
            .slice(0, 6);
    }, [items]);

    // ── ROTACIÓN (automático al cargar) ───────────────────────────────────────
    const subCategoryRotation = useMemo(() => {
        const stats: Record<string, { category: string; totalOut: number; frequency: number }> = {};
        recentMovements.forEach(m => {
            if (m.type === MovementType.CHECK_OUT) {
                const item = items.find(i => i.id === m.itemId);
                if (item) {
                    if (!stats[item.subCategory]) stats[item.subCategory] = { category: item.category, totalOut: 0, frequency: 0 };
                    stats[item.subCategory].totalOut += m.quantity;
                    stats[item.subCategory].frequency += 1;
                }
            }
        });
        return Object.entries(stats)
            .map(([subCategory, data]) => ({ subCategory, ...data }))
            .sort((a, b) => b.totalOut - a.totalOut);
    }, [items, recentMovements]);

    useEffect(() => {
        if (subCategoryRotation.length === 0) return;
        generateRotationAnalysis(subCategoryRotation).then(setRotationRecs).catch(() => {});
    }, [subCategoryRotation]);

    // ── ACTIVIDAD RECIENTE ────────────────────────────────────────────────────
    const recentActivity = useMemo(() => {
        const itemMap = new Map(items.map(i => [i.id, i]));
        return [...movements]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 8)
            .map(m => ({ ...m, itemName: itemMap.get(m.itemId)?.name ?? '—', unit: itemMap.get(m.itemId)?.unit ?? '' }));
    }, [movements, items]);

    const maxConsumed = topConsumed[0]?.qty ?? 1;

    const periodRange = printPeriod ? getPeriodRange(printPeriod) : null;

    return (
        <div className="space-y-6">
            {/* Modal selector de período */}
            {showPeriodModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Exportar informe PDF</h3>
                        <p className="text-sm text-gray-500 mb-5">Selecciona el período del informe</p>
                        <div className="space-y-2">
                            {([
                                { key: 'week', label: 'Esta semana', sub: 'Últimos 7 días' },
                                { key: 'month', label: 'Este mes', sub: 'Últimos 30 días' },
                                { key: 'quarter', label: 'Este trimestre', sub: 'Últimos 90 días' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => handlePrint(opt.key)}
                                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
                                >
                                    <p className="font-semibold text-gray-800 text-sm">{opt.label}</p>
                                    <p className="text-xs text-gray-400">{opt.sub}</p>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setShowPeriodModal(false)} className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 py-2">Cancelar</button>
                    </div>
                </div>
            )}

            {/* Componente de impresión — oculto en pantalla, visible al imprimir */}
            {periodRange && (
                <PrintReportView
                    ref={printRef}
                    items={items}
                    movements={movements}
                    personnel={personnel}
                    projects={projects}
                    periodLabel={periodRange.label}
                    fromDate={periodRange.fromDate}
                    toDate={periodRange.toDate}
                />
            )}

            {/* Botón exportar PDF */}
            <div className="flex justify-end">
                <button
                    onClick={() => setShowPeriodModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700 font-semibold rounded-xl text-sm transition-all shadow-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Exportar informe PDF
                </button>
            </div>

            {/* ── KPI CARDS ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-1">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Salidas (30 días)</span>
                    <span className="text-2xl font-black text-gray-800">{kpis.totalSalidas}</span>
                    <span className="text-xs text-gray-400">unidades despachadas</span>
                    <div className="mt-2 h-1 rounded-full bg-blue-100"><div className="h-1 rounded-full bg-blue-500" style={{ width: '100%' }} /></div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-1">
                    <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Ítems en inventario</span>
                    <span className="text-2xl font-black text-gray-800">{kpis.totalItems}</span>
                    <span className="text-xs text-gray-400">productos registrados</span>
                    <div className="mt-2 h-1 rounded-full bg-green-100"><div className="h-1 rounded-full bg-green-500" style={{ width: '100%' }} /></div>
                </div>
                <div className={`p-5 rounded-2xl shadow-sm border flex flex-col gap-1 ${kpis.activeLoanCount > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
                    <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">Préstamos activos</span>
                    <span className={`text-2xl font-black ${kpis.activeLoanCount > 0 ? 'text-yellow-600' : 'text-gray-800'}`}>{kpis.activeLoanCount}</span>
                    <span className="text-xs text-gray-400">{kpis.activeLoanCount === 0 ? '✅ Todo devuelto' : 'herramientas fuera'}</span>
                    <div className="mt-2 h-1 rounded-full bg-yellow-100"><div className="h-1 rounded-full bg-yellow-500" style={{ width: kpis.activeLoanCount > 0 ? '70%' : '0%' }} /></div>
                </div>
                <div className={`p-5 rounded-2xl shadow-sm border flex flex-col gap-1 ${kpis.lowStockItems > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}>
                    <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Stock Bajo / Agotado</span>
                    <span className={`text-2xl font-black ${kpis.lowStockItems > 0 ? 'text-orange-600' : 'text-gray-800'}`}>{kpis.lowStockItems} ítems</span>
                    <span className="text-xs text-gray-400">{kpis.lowStockItems === 0 ? '✅ Todo OK' : '⚠️ Requiere atención'}</span>
                    <div className="mt-2 h-1 rounded-full bg-orange-100"><div className="h-1 rounded-full bg-orange-500" style={{ width: kpis.lowStockItems > 0 ? '70%' : '0%' }} /></div>
                </div>
            </div>

            {/* ── ALERTA: HERRAMIENTAS PENDIENTES DE RECOGER ── */}
            {kpis.pendingPickupCount > 0 && (
                <div className="bg-orange-50 border border-orange-300 rounded-2xl p-4 flex items-center gap-3">
                    <span className="text-2xl">📍</span>
                    <div>
                        <p className="text-sm font-black text-orange-800">
                            {kpis.pendingPickupCount} herramienta{kpis.pendingPickupCount > 1 ? 's' : ''} pendiente{kpis.pendingPickupCount > 1 ? 's' : ''} de recoger
                        </p>
                        <p className="text-xs text-orange-600 mt-0.5">Ir a Préstamos para ver el detalle y coordinar la recolección.</p>
                    </div>
                </div>
            )}

            {/* ── FILA: TORTA + TOP CONSUMIDOS ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Torta de salidas por tipo */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Salidas por tipo — últimos 30 días</h2>
                    {typeBreakdown.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">Sin salidas registradas.</p>
                    ) : (
                        <div className="flex items-center gap-6">
                            <div
                                className="flex-shrink-0 w-32 h-32 rounded-full"
                                style={{
                                    background: `conic-gradient(${typeBreakdown.map(c => `${c.color} ${c.from}% ${c.from + c.pct}%`).join(', ')})`
                                }}
                            />
                            <div className="space-y-2 flex-1">
                                {typeBreakdown.map(c => (
                                    <div key={c.type} className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                                            <span className="text-xs font-semibold text-gray-700">{c.label}</span>
                                        </div>
                                        <span className="text-xs font-black text-gray-500">{c.qty} <span className="font-normal text-gray-400">({Math.round(c.pct)}%)</span></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Top consumidos */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Top 8 consumidos — últimos 30 días</h2>
                    {topConsumed.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">Sin salidas registradas.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {topConsumed.map(({ item, qty }, i) => (
                                <div key={item!.id}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm font-semibold text-gray-800 truncate max-w-[70%]">
                                            <span className="text-xs font-black text-blue-400 mr-2">#{i + 1}</span>
                                            {item!.name}
                                        </span>
                                        <span className="text-xs font-black text-gray-600">{qty} {item!.unit}</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-1.5 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
                                            style={{ width: `${Math.round((qty / maxConsumed) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── ACTIVIDAD RECIENTE ── */}
            <div className="grid grid-cols-1 gap-6">
                {/* Actividad reciente */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Actividad reciente</h2>
                    {recentActivity.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">Sin movimientos.</p>
                    ) : (
                        <div className="space-y-2">
                            {recentActivity.map(m => {
                                const cfg = getTypeConfig(m.type);
                                return (
                                    <div key={m.id} className="flex items-center gap-3">
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-gray-800 truncate">
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded mr-1.5 ${cfg.color}`}>{m.type}</span>
                                                {m.itemName}
                                                <span className="text-gray-400 ml-1">×{m.quantity} {m.unit}</span>
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(new Date(m.timestamp))}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── SALUD DEL STOCK ── */}
            {stockHealth.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Salud del stock — ítems críticos primero</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {stockHealth.map(item => {
                            const pct = Math.min(100, Math.round(item.ratio * 100));
                            const color = item.quantity === 0 ? 'bg-red-500' : pct <= 100 ? 'bg-orange-400' : 'bg-green-500';
                            const label = item.quantity === 0 ? '🔴 AGOTADO' : pct <= 100 ? '🟠 BAJO' : '🟢 OK';
                            return (
                                <div key={item.id} className="space-y-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-semibold text-gray-700 truncate max-w-[65%]">{item.name}</span>
                                        <span className="text-[10px] font-black text-gray-500">{label}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-400">{item.quantity} / {item.minStock} {item.unit} mín.</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── INVENTARIO COMPLETO ── */}
            {items.length > 0 && (() => {
                const TYPE_ORDER = [
                    { type: InventoryType.HAND_TOOL,       label: '🔨 Herramienta Manual',   dot: '#3b82f6' },
                    { type: InventoryType.ELECTRICAL_TOOL, label: '⚡ Herramienta Eléctrica', dot: '#f59e0b' },
                    { type: InventoryType.PPE,             label: '🦺 Seguridad / EPP',       dot: '#10b981' },
                    { type: InventoryType.SINGLE_USE,      label: '📦 Consumibles',           dot: '#ef4444' },
                ];
                return (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                        <div className="mb-4">
                            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Inventario completo</h2>
                            <p className="text-[10px] text-gray-400 mt-0.5">{items.length} ítems registrados</p>
                        </div>
                        <div className="space-y-6">
                            {TYPE_ORDER.map(({ type, label, dot }) => {
                                const group = items
                                    .filter(i => i.inventoryType === type)
                                    .sort((a, b) => a.name.localeCompare(b.name));
                                if (group.length === 0) return null;
                                return (
                                    <div key={type}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
                                            <span className="text-[10px] text-gray-400">({group.length})</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-50">
                                                <thead>
                                                    <tr>
                                                        <th className="pb-1.5 text-left text-[9px] font-black text-gray-300 uppercase tracking-wider">Ítem</th>
                                                        <th className="pb-1.5 text-center text-[9px] font-black text-gray-300 uppercase tracking-wider w-16">Stock</th>
                                                        <th className="pb-1.5 text-center text-[9px] font-black text-gray-300 uppercase tracking-wider w-14">Mín.</th>
                                                        <th className="pb-1.5 text-right text-[9px] font-black text-gray-300 uppercase tracking-wider w-20">Estado</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {group.map(item => {
                                                        const ok = item.minStock === 0 || item.quantity > item.minStock;
                                                        const low = item.minStock > 0 && item.quantity > 0 && item.quantity <= item.minStock;
                                                        const empty = item.quantity === 0;
                                                        const badge = empty
                                                            ? 'bg-red-100 text-red-600'
                                                            : low
                                                            ? 'bg-orange-100 text-orange-600'
                                                            : 'bg-green-100 text-green-700';
                                                        const badgeLabel = empty ? 'AGOTADO' : low ? 'BAJO' : 'OK';
                                                        return (
                                                            <tr key={item.id} className="hover:bg-gray-50">
                                                                <td className="py-2 text-sm font-medium text-gray-800">{item.name}</td>
                                                                <td className="py-2 text-center text-sm font-black text-gray-700">
                                                                    {item.quantity}
                                                                    <span className="text-[10px] font-normal text-gray-400 ml-0.5">{item.unit}</span>
                                                                </td>
                                                                <td className="py-2 text-center text-xs text-gray-400">{item.minStock > 0 ? item.minStock : '—'}</td>
                                                                <td className="py-2 text-right">
                                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${badge}`}>
                                                                        {badgeLabel}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default StatisticsView;
