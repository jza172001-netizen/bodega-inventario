
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { Item, Movement, MovementType, InventoryType, Personnel, Project } from '../types';
import { generateRotationAnalysis } from '../services/geminiService';
import { PrintReportView } from './PrintReportView';

interface StatisticsViewProps {
    items: Item[];
    movements: Movement[];
    personnel?: Personnel[];
    projects?: Project[];
    onNavigate?: (view: string, tab?: string) => void;
}

interface DetailRow {
    label: string;
    sub?: string;
    value?: string;
    badge?: string;
    badgeColor?: string;
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

const INV_TYPE_LABEL: Record<string, string> = {
    [InventoryType.HAND_TOOL]: '🔨 H. Manual',
    [InventoryType.ELECTRICAL_TOOL]: '⚡ H. Eléctrica',
    [InventoryType.PPE]: '🦺 Seguridad',
    [InventoryType.SINGLE_USE]: '📦 Consumibles',
};

const StatisticsView: React.FC<StatisticsViewProps> = ({ items, movements, personnel = [], projects = [], onNavigate }) => {
    const [rotationRecs, setRotationRecs] = useState<Record<string, { recommendation: string; severity: string }>>({});
    const [printPeriod, setPrintPeriod] = useState<PrintPeriod>(null);
    const [showPeriodModal, setShowPeriodModal] = useState(false);
    const [activeDetail, setActiveDetail] = useState<{ title: string; rows: DetailRow[]; navigateTo?: { view: string; tab?: string } } | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    const getPeriodRange = useCallback((period: NonNullable<PrintPeriod>): { fromDate: Date; toDate: Date; label: string } => {
        const now = new Date();
        const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
        const from = new Date(now);
        from.setDate(from.getDate() - days);
        const labels: Record<NonNullable<PrintPeriod>, string> = { week: 'Últimos 7 días', month: 'Último mes', quarter: 'Últimos 90 días' };
        return { fromDate: from, toDate: now, label: labels[period] };
    }, []);

    const handlePrint = useCallback((period: NonNullable<PrintPeriod>) => {
        setPrintPeriod(period);
        setShowPeriodModal(false);
        setTimeout(() => window.print(), 200);
    }, []);

    // Date boundaries
    const thirtyDaysAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; }, []);
    const sevenDaysAgo  = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 7);  return d; }, []);
    const fourteenDaysAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 14); return d; }, []);

    const recentMovements   = useMemo(() => movements.filter(m => new Date(m.timestamp) > thirtyDaysAgo), [movements, thirtyDaysAgo]);
    const thisWeekCheckouts = useMemo(() => movements.filter(m => new Date(m.timestamp) > sevenDaysAgo && m.type === MovementType.CHECK_OUT), [movements, sevenDaysAgo]);
    const lastWeekCheckouts = useMemo(() => movements.filter(m => new Date(m.timestamp) > fourteenDaysAgo && new Date(m.timestamp) <= sevenDaysAgo && m.type === MovementType.CHECK_OUT), [movements, sevenDaysAgo, fourteenDaysAgo]);

    // Maps
    const itemMap      = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const kpis = useMemo(() => {
        const checkouts30d = recentMovements.filter(m => m.type === MovementType.CHECK_OUT);
        const totalSalidas = checkouts30d.reduce((s, m) => s + m.quantity, 0);
        const totalItems = items.length;
        const activeLoans = movements.filter(m => m.isLoan && !m.isReturned);
        const activeLoanCount = activeLoans.length;
        const pendingPickupCount = activeLoans.filter(m => m.pendingPickup).length;
        const lowStockItems = items.filter(i => i.quantity <= i.minStock && i.minStock > 0).length;
        return { totalSalidas, totalItems, activeLoanCount, pendingPickupCount, lowStockItems, activeLoans, checkouts30d };
    }, [items, movements, recentMovements]);

    // ── TOP 8 CONSUMIDOS ─────────────────────────────────────────────────────
    const topConsumed = useMemo(() => {
        const totals: Record<string, number> = {};
        recentMovements.filter(m => m.type === MovementType.CHECK_OUT).forEach(m => { totals[m.itemId] = (totals[m.itemId] || 0) + m.quantity; });
        return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, qty]) => ({ item: itemMap.get(id), qty })).filter(x => x.item);
    }, [recentMovements, itemMap]);

    // ── TORTA: salidas por tipo ───────────────────────────────────────────────
    const typeBreakdown = useMemo(() => {
        const counts: Record<string, number> = { [InventoryType.HAND_TOOL]: 0, [InventoryType.ELECTRICAL_TOOL]: 0, [InventoryType.PPE]: 0, [InventoryType.SINGLE_USE]: 0 };
        recentMovements.filter(m => m.type === MovementType.CHECK_OUT).forEach(m => { const item = itemMap.get(m.itemId); if (item) counts[item.inventoryType] = (counts[item.inventoryType] || 0) + m.quantity; });
        const total = Object.values(counts).reduce((s, v) => s + v, 0);
        const COLORS = [
            { type: InventoryType.HAND_TOOL, color: '#3b82f6', label: 'H. Manual' },
            { type: InventoryType.ELECTRICAL_TOOL, color: '#f59e0b', label: 'H. Eléctrica' },
            { type: InventoryType.PPE, color: '#10b981', label: 'Seguridad' },
            { type: InventoryType.SINGLE_USE, color: '#ef4444', label: 'Consumibles' },
        ];
        let cumPct = 0;
        return COLORS.map(c => { const qty = counts[c.type] || 0; const pct = total > 0 ? (qty / total) * 100 : 0; const from = cumPct; cumPct += pct; return { ...c, qty, pct, from }; }).filter(c => c.qty > 0);
    }, [itemMap, recentMovements]);

    // ── ALERTAS DE CONSUMO (reemplaza "salud del stock") ─────────────────────
    const consumptionInsights = useMemo(() => {
        const types = [
            { type: InventoryType.HAND_TOOL, label: 'Herramientas manuales' },
            { type: InventoryType.ELECTRICAL_TOOL, label: 'Herramientas eléctricas' },
            { type: InventoryType.PPE, label: 'Elementos de seguridad' },
            { type: InventoryType.SINGLE_USE, label: 'Consumibles' },
        ];
        const insights: Array<{ label: string; pct: number; thisQty: number; lastQty: number; recommend: boolean }> = [];
        for (const { type, label } of types) {
            const thisQty = thisWeekCheckouts.filter(m => itemMap.get(m.itemId)?.inventoryType === type).reduce((s, m) => s + m.quantity, 0);
            const lastQty = lastWeekCheckouts.filter(m => itemMap.get(m.itemId)?.inventoryType === type).reduce((s, m) => s + m.quantity, 0);
            if (thisQty === 0 && lastQty === 0) continue;
            const pct = lastQty > 0 ? Math.round(((thisQty - lastQty) / lastQty) * 100) : (thisQty > 0 ? 100 : 0);
            if (Math.abs(pct) >= 15 || (thisQty > 0 && lastQty === 0)) {
                insights.push({ label, pct, thisQty, lastQty, recommend: pct >= 30 });
            }
        }
        // Top item spikes
        const itemSpikes: Array<{ name: string; pct: number; thisQty: number; unit: string }> = [];
        for (const { item, qty } of topConsumed.slice(0, 5)) {
            if (!item) continue;
            const lastQty = lastWeekCheckouts.filter(m => m.itemId === item.id).reduce((s, m) => s + m.quantity, 0);
            if (qty > 0 && lastQty > 0) {
                const pct = Math.round(((qty - lastQty) / lastQty) * 100);
                if (pct >= 50) itemSpikes.push({ name: item.name, pct, thisQty: qty, unit: item.unit });
            }
        }
        return { insights, itemSpikes };
    }, [thisWeekCheckouts, lastWeekCheckouts, itemMap, topConsumed]);

    // ── ROTACIÓN (auto al cargar) ─────────────────────────────────────────────
    const subCategoryRotation = useMemo(() => {
        const stats: Record<string, { category: string; totalOut: number; frequency: number }> = {};
        recentMovements.forEach(m => {
            if (m.type === MovementType.CHECK_OUT) {
                const item = itemMap.get(m.itemId);
                if (item) {
                    if (!stats[item.subCategory]) stats[item.subCategory] = { category: item.category, totalOut: 0, frequency: 0 };
                    stats[item.subCategory].totalOut += m.quantity;
                    stats[item.subCategory].frequency += 1;
                }
            }
        });
        return Object.entries(stats).map(([subCategory, data]) => ({ subCategory, ...data })).sort((a, b) => b.totalOut - a.totalOut);
    }, [itemMap, recentMovements]);

    useEffect(() => {
        if (subCategoryRotation.length === 0) return;
        generateRotationAnalysis(subCategoryRotation).then(setRotationRecs).catch(() => {});
    }, [subCategoryRotation]);

    // ── ACTIVIDAD RECIENTE ────────────────────────────────────────────────────
    const recentActivity = useMemo(() => {
        return [...movements]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 8)
            .map(m => ({ ...m, itemName: itemMap.get(m.itemId)?.name ?? '—', unit: itemMap.get(m.itemId)?.unit ?? '' }));
    }, [movements, itemMap]);

    const maxConsumed = topConsumed[0]?.qty ?? 1;
    const periodRange = printPeriod ? getPeriodRange(printPeriod) : null;

    // ── DETAIL PANEL HELPERS ──────────────────────────────────────────────────
    const showSalidasDetail = () => {
        const rows: DetailRow[] = kpis.checkouts30d
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 40)
            .map(m => ({
                label: itemMap.get(m.itemId)?.name ?? '—',
                sub: `${personnelMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar'} · ${new Date(m.timestamp).toLocaleDateString('es-CO')}`,
                value: `${m.quantity} ${itemMap.get(m.itemId)?.unit ?? ''}`,
                badge: m.isLoan ? 'Préstamo' : undefined,
                badgeColor: 'bg-yellow-100 text-yellow-700',
            }));
        setActiveDetail({ title: 'Salidas últimos 30 días', rows, navigateTo: { view: 'kardex', tab: 'movements' } });
    };

    const showPrestamosDetail = () => {
        const rows: DetailRow[] = kpis.activeLoans.map(m => {
            const days = Math.floor((Date.now() - new Date(m.timestamp).getTime()) / 86400000);
            return {
                label: itemMap.get(m.itemId)?.name ?? '—',
                sub: personnelMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar',
                value: `${days} día${days !== 1 ? 's' : ''}`,
                badge: days > 14 ? '+14d' : days > 7 ? '+7d' : 'Reciente',
                badgeColor: days > 14 ? 'bg-red-100 text-red-600' : days > 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700',
            };
        });
        setActiveDetail({ title: 'Préstamos activos', rows, navigateTo: { view: 'kardex', tab: 'loans' } });
    };

    const showStockDetail = () => {
        const rows: DetailRow[] = items
            .filter(i => i.quantity <= i.minStock && i.minStock > 0)
            .sort((a, b) => a.quantity - b.quantity)
            .map(i => ({
                label: i.name,
                sub: INV_TYPE_LABEL[i.inventoryType],
                value: `${i.quantity} / ${i.minStock} ${i.unit}`,
                badge: i.quantity === 0 ? 'Agotado' : 'Bajo',
                badgeColor: i.quantity === 0 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600',
            }));
        setActiveDetail({ title: 'Stock bajo / agotado', rows, navigateTo: { view: 'kardex', tab: 'inventory' } });
    };

    const showTipoDetail = (type: string, label: string) => {
        const rows: DetailRow[] = recentMovements
            .filter(m => m.type === MovementType.CHECK_OUT && itemMap.get(m.itemId)?.inventoryType === type)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map(m => ({
                label: itemMap.get(m.itemId)?.name ?? '—',
                sub: personnelMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar',
                value: `${m.quantity} ${itemMap.get(m.itemId)?.unit ?? ''}`,
            }));
        setActiveDetail({ title: `Salidas — ${label} (30 días)`, rows, navigateTo: { view: 'kardex', tab: 'inventory' } });
    };

    const showItemConsumoDetail = (itemId: string, itemName: string) => {
        const rows: DetailRow[] = recentMovements
            .filter(m => m.itemId === itemId && m.type === MovementType.CHECK_OUT)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map(m => ({
                label: personnelMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar',
                sub: new Date(m.timestamp).toLocaleDateString('es-CO'),
                value: `${m.quantity} ${itemMap.get(itemId)?.unit ?? ''}`,
            }));
        setActiveDetail({ title: `¿Quién usó ${itemName}?`, rows, navigateTo: { view: 'kardex', tab: 'movements' } });
    };

    const showActividadDetail = (movId: string, itemId: string, itemName: string) => {
        const rows: DetailRow[] = [...movements]
            .filter(m => m.itemId === itemId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 10)
            .map(m => ({
                label: m.type + (m.isLoan ? (m.isReturned ? ' ↩ devuelto' : ' → préstamo') : ''),
                sub: `${personnelMap.get(m.personnelId ?? '')?.name ?? '—'} · ${new Date(m.timestamp).toLocaleDateString('es-CO')}`,
                value: `${m.quantity} ${itemMap.get(itemId)?.unit ?? ''}`,
            }));
        setActiveDetail({ title: `Historial: ${itemName}`, rows, navigateTo: { view: 'kardex', tab: 'movements' } });
    };

    const showInventarioDetail = (item: Item) => {
        const loans = kpis.activeLoans.filter(m => m.itemId === item.id);
        const lastMovements = [...movements].filter(m => m.itemId === item.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);
        const rows: DetailRow[] = [];
        if (loans.length > 0) {
            loans.forEach(m => {
                const days = Math.floor((Date.now() - new Date(m.timestamp).getTime()) / 86400000);
                rows.push({
                    label: `📤 Con ${personnelMap.get(m.personnelId ?? '')?.name ?? 'desconocido'}`,
                    sub: `Préstamo desde hace ${days} día${days !== 1 ? 's' : ''}`,
                    badge: days > 7 ? 'Vencido' : 'Activo',
                    badgeColor: days > 7 ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700',
                });
            });
        }
        lastMovements.forEach(m => {
            rows.push({
                label: m.type,
                sub: `${personnelMap.get(m.personnelId ?? '')?.name ?? '—'} · ${new Date(m.timestamp).toLocaleDateString('es-CO')}`,
                value: `${m.quantity} ${item.unit}`,
            });
        });
        const hasLoans = loans.length > 0;
        setActiveDetail({ title: item.name, rows, navigateTo: { view: 'kardex', tab: hasLoans ? 'loans' : 'inventory' } });
    };

    return (
        <div className="space-y-6">
            {/* Detail drawer */}
            {activeDetail && (
                <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center" onClick={() => setActiveDetail(null)}>
                    <div className="absolute inset-0 bg-black/40" />
                    <div
                        className="relative w-full max-w-lg bg-white rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[70vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                            <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">{activeDetail.title}</h3>
                            <button onClick={() => setActiveDetail(null)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1">
                            {activeDetail.rows.length === 0 ? (
                                <p className="text-center py-10 text-gray-400 text-sm">Sin datos para mostrar.</p>
                            ) : activeDetail.rows.map((row, i) => (
                                <div key={i} className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{row.label}</p>
                                        {row.sub && <p className="text-xs text-gray-400 mt-0.5">{row.sub}</p>}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                        {row.value && <span className="text-sm font-black text-gray-700">{row.value}</span>}
                                        {row.badge && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${row.badgeColor ?? 'bg-gray-100 text-gray-600'}`}>{row.badge}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {activeDetail.navigateTo && onNavigate && (
                            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100">
                                <button
                                    onClick={() => { onNavigate(activeDetail.navigateTo!.view, activeDetail.navigateTo!.tab); setActiveDetail(null); }}
                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl transition-colors"
                                >
                                    Ir al Kardex →
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal selector de período PDF */}
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
                                <button key={opt.key} onClick={() => handlePrint(opt.key)}
                                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all">
                                    <p className="font-semibold text-gray-800 text-sm">{opt.label}</p>
                                    <p className="text-xs text-gray-400">{opt.sub}</p>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setShowPeriodModal(false)} className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 py-2">Cancelar</button>
                    </div>
                </div>
            )}

            {/* Componente de impresión */}
            {periodRange && (
                <PrintReportView ref={printRef} items={items} movements={movements} personnel={personnel} projects={projects} periodLabel={periodRange.label} fromDate={periodRange.fromDate} toDate={periodRange.toDate} />
            )}

            {/* Botón exportar PDF */}
            <div className="flex justify-end">
                <button onClick={() => setShowPeriodModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700 font-semibold rounded-xl text-sm transition-all shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Exportar informe PDF
                </button>
            </div>

            {/* ── KPI CARDS ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button onClick={showSalidasDetail}
                    className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-1 text-left hover:border-blue-300 hover:shadow-md transition-all active:scale-95">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Salidas (30 días)</span>
                    <span className="text-2xl font-black text-gray-800">{kpis.totalSalidas}</span>
                    <span className="text-xs text-gray-400">unidades despachadas</span>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-blue-400 font-semibold">
                        <span>Ver lista →</span>
                    </div>
                </button>
                <button onClick={() => onNavigate?.('kardex', 'inventory')}
                    className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-1 text-left hover:shadow-md hover:border-green-300 transition-all active:scale-95">
                    <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Ítems en inventario</span>
                    <span className="text-2xl font-black text-gray-800">{kpis.totalItems}</span>
                    <span className="text-xs text-gray-400">productos registrados</span>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-green-500 font-semibold">
                        <span>Ver inventario →</span>
                    </div>
                </button>
                <button onClick={showPrestamosDetail}
                    className={`p-5 rounded-2xl shadow-sm border flex flex-col gap-1 text-left hover:shadow-md transition-all active:scale-95 ${kpis.activeLoanCount > 0 ? 'bg-yellow-50 border-yellow-200 hover:border-yellow-400' : 'bg-white border-gray-100 hover:border-blue-300'}`}>
                    <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">Préstamos activos</span>
                    <span className={`text-2xl font-black ${kpis.activeLoanCount > 0 ? 'text-yellow-600' : 'text-gray-800'}`}>{kpis.activeLoanCount}</span>
                    <span className="text-xs text-gray-400">{kpis.activeLoanCount === 0 ? '✅ Todo devuelto' : 'herramientas fuera'}</span>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-yellow-500 font-semibold">
                        <span>Ver quién los tiene →</span>
                    </div>
                </button>
            </div>

            {/* Alerta pendientes de recoger — eliminada, ya aparece en el Dashboard */}

            {/* ── TORTA + TOP CONSUMIDOS ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Torta */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Salidas por tipo — últimos 30 días</h2>
                    {typeBreakdown.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">Sin salidas registradas.</p>
                    ) : (
                        <div className="flex items-center gap-6">
                            <div className="flex-shrink-0 w-32 h-32 rounded-full" style={{ background: `conic-gradient(${typeBreakdown.map(c => `${c.color} ${c.from}% ${c.from + c.pct}%`).join(', ')})` }} />
                            <div className="space-y-2 flex-1">
                                {typeBreakdown.map(c => (
                                    <button key={c.type} onClick={() => showTipoDetail(c.type, c.label)}
                                        className="w-full flex items-center justify-between gap-2 hover:bg-gray-50 rounded-lg px-1 py-0.5 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                                            <span className="text-xs font-semibold text-gray-700">{c.label}</span>
                                        </div>
                                        <span className="text-xs font-black text-gray-500">{c.qty} <span className="font-normal text-gray-400">({Math.round(c.pct)}%) →</span></span>
                                    </button>
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
                                <button key={item!.id} onClick={() => showItemConsumoDetail(item!.id, item!.name)} className="w-full text-left hover:bg-gray-50 rounded-lg px-1 transition-colors">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm font-semibold text-gray-800 truncate max-w-[70%]">
                                            <span className="text-xs font-black text-blue-400 mr-2">#{i + 1}</span>
                                            {item!.name}
                                        </span>
                                        <span className="text-xs font-black text-gray-600">{qty} {item!.unit} →</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-1.5 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500" style={{ width: `${Math.round((qty / maxConsumed) * 100)}%` }} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── ACTIVIDAD RECIENTE ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Actividad reciente</h2>
                {recentActivity.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Sin movimientos.</p>
                ) : (
                    <div className="space-y-1">
                        {recentActivity.map(m => {
                            const cfg = getTypeConfig(m.type);
                            return (
                                <button key={m.id} onClick={() => showActividadDetail(m.id, m.itemId, m.itemName)}
                                    className="w-full flex items-center gap-3 hover:bg-gray-50 rounded-xl px-2 py-2 transition-colors text-left">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-800 truncate">
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded mr-1.5 ${cfg.color}`}>{m.type}</span>
                                            {m.itemName}
                                            <span className="text-gray-400 ml-1">×{m.quantity} {m.unit}</span>
                                        </p>
                                    </div>
                                    <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(new Date(m.timestamp))} →</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── ALERTAS DE CONSUMO (reemplaza "salud del stock") ── */}
            {(consumptionInsights.insights.length > 0 || consumptionInsights.itemSpikes.length > 0) && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Alertas de consumo esta semana</h2>
                    <div className="space-y-3">
                        {consumptionInsights.insights.map((ins, i) => (
                            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${ins.pct >= 0 ? 'bg-orange-50 border border-orange-100' : 'bg-blue-50 border border-blue-100'}`}>
                                <span className="text-lg flex-shrink-0">{ins.pct >= 0 ? '📈' : '📉'}</span>
                                <div>
                                    <p className="text-sm font-bold text-gray-800">
                                        {ins.pct >= 0 ? `↑ ${ins.pct}% más` : `↓ ${Math.abs(ins.pct)}% menos`} en {ins.label}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {ins.thisQty} und esta semana vs {ins.lastQty} und la semana pasada
                                        {ins.recommend && ' — se recomienda revisar inventario'}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {consumptionInsights.itemSpikes.map((s, i) => (
                            <div key={`spike-${i}`} className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
                                <span className="text-lg flex-shrink-0">🚨</span>
                                <div>
                                    <p className="text-sm font-bold text-gray-800">Incremento en {s.name}: +{s.pct}%</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{s.thisQty} {s.unit} esta semana — considerar compra</p>
                                </div>
                            </div>
                        ))}
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
                const activeLoansByItem = new Map<string, Movement[]>();
                kpis.activeLoans.forEach(m => { if (!activeLoansByItem.has(m.itemId)) activeLoansByItem.set(m.itemId, []); activeLoansByItem.get(m.itemId)!.push(m); });

                return (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                        <div className="mb-4">
                            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Inventario completo</h2>
                            <p className="text-[10px] text-gray-400 mt-0.5">{items.length} ítems · toca cualquier fila para ver detalle</p>
                        </div>
                        <div className="space-y-6">
                            {TYPE_ORDER.map(({ type, label, dot }) => {
                                const group = items.filter(i => i.inventoryType === type).sort((a, b) => a.name.localeCompare(b.name));
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
                                                        <th className="pb-1.5 text-left text-[9px] font-black text-gray-300 uppercase tracking-wider">Con quién</th>
                                                        <th className="pb-1.5 text-right text-[9px] font-black text-gray-300 uppercase tracking-wider w-20">Estado</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {group.map(item => {
                                                        const loans = activeLoansByItem.get(item.id) ?? [];
                                                        const holder = loans.length > 0 ? personnelMap.get(loans[0].personnelId ?? '')?.name ?? 'Desconocido' : null;
                                                        const multiHolder = loans.length > 1 ? `+${loans.length - 1} más` : null;
                                                        const ok = item.minStock === 0 || item.quantity > item.minStock;
                                                        const low = item.minStock > 0 && item.quantity > 0 && item.quantity <= item.minStock;
                                                        const empty = item.quantity === 0;
                                                        const badge = empty ? 'AGOTADO' : low ? 'BAJO' : loans.length > 0 ? 'PRESTADO' : 'OK';
                                                        const badgeClass = empty ? 'bg-red-100 text-red-600' : low ? 'bg-orange-100 text-orange-600' : loans.length > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
                                                        return (
                                                            <tr key={item.id} onClick={() => showInventarioDetail(item)} className="hover:bg-blue-50 cursor-pointer transition-colors">
                                                                <td className="py-2 text-sm font-medium text-gray-800">{item.name}</td>
                                                                <td className="py-2 text-center text-sm font-black text-gray-700">
                                                                    {item.quantity}<span className="text-[10px] font-normal text-gray-400 ml-0.5">{item.unit}</span>
                                                                </td>
                                                                <td className="py-2 text-xs text-gray-500">
                                                                    {holder ? <span className="font-semibold text-yellow-700">{holder}{multiHolder ? ` ${multiHolder}` : ''}</span> : <span className="text-gray-300">—</span>}
                                                                </td>
                                                                <td className="py-2 text-right">
                                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${badgeClass}`}>{badge}</span>
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
