
import React, { useMemo, useEffect, useState } from 'react';
import { Item, Movement, MovementType, InventoryType } from '../types';
import { generateRotationAnalysis } from '../services/geminiService';

interface StatisticsViewProps {
    items: Item[];
    movements: Movement[];
}

const formatCOP = (val: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);

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

const StatisticsView: React.FC<StatisticsViewProps> = ({ items, movements }) => {
    const [rotationRecs, setRotationRecs] = useState<Record<string, { recommendation: string; severity: string }>>({});

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
        const assetsValue = items.reduce((s, i) =>
            (i.inventoryType === InventoryType.HAND_TOOL || i.inventoryType === InventoryType.ELECTRICAL_TOOL)
                ? s + i.quantity * i.price : s, 0);
        const inventoryValue = items.reduce((s, i) =>
            (i.inventoryType === InventoryType.SINGLE_USE || i.inventoryType === InventoryType.PPE)
                ? s + i.quantity * i.price : s, 0);
        const lowStockItems = items.filter(i => i.quantity <= i.minStock && i.minStock > 0).length;
        const wasteValue = recentMovements
            .filter(m => m.type === MovementType.WASTE)
            .reduce((s, m) => {
                const item = items.find(i => i.id === m.itemId);
                return s + (item ? item.price * m.quantity : 0);
            }, 0);
        const totalMovements = recentMovements.length;
        return { assetsValue, inventoryValue, lowStockItems, wasteValue, totalMovements };
    }, [items, recentMovements]);

    // ── TOP 5 CONSUMIDOS ──────────────────────────────────────────────────────
    const topConsumed = useMemo(() => {
        const totals: Record<string, number> = {};
        recentMovements
            .filter(m => m.type === MovementType.CHECK_OUT)
            .forEach(m => { totals[m.itemId] = (totals[m.itemId] || 0) + m.quantity; });
        return Object.entries(totals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id, qty]) => ({ item: items.find(i => i.id === id), qty }))
            .filter(x => x.item);
    }, [recentMovements, items]);

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

    return (
        <div className="space-y-6">
            {/* ── KPI CARDS ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-1">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Activos (Herramientas)</span>
                    <span className="text-2xl font-black text-gray-800">{formatCOP(kpis.assetsValue)}</span>
                    <span className="text-xs text-gray-400">{items.filter(i => i.inventoryType === InventoryType.HAND_TOOL || i.inventoryType === InventoryType.ELECTRICAL_TOOL).length} ítems</span>
                    <div className="mt-2 h-1 rounded-full bg-blue-100"><div className="h-1 rounded-full bg-blue-500" style={{ width: '100%' }} /></div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-1">
                    <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Materiales en Bodega</span>
                    <span className="text-2xl font-black text-gray-800">{formatCOP(kpis.inventoryValue)}</span>
                    <span className="text-xs text-gray-400">{items.filter(i => i.inventoryType === InventoryType.SINGLE_USE || i.inventoryType === InventoryType.PPE).length} ítems</span>
                    <div className="mt-2 h-1 rounded-full bg-green-100"><div className="h-1 rounded-full bg-green-500" style={{ width: '100%' }} /></div>
                </div>
                <div className={`p-5 rounded-2xl shadow-sm border flex flex-col gap-1 ${kpis.lowStockItems > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}>
                    <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Stock Bajo / Agotado</span>
                    <span className={`text-2xl font-black ${kpis.lowStockItems > 0 ? 'text-orange-600' : 'text-gray-800'}`}>{kpis.lowStockItems} ítems</span>
                    <span className="text-xs text-gray-400">{kpis.lowStockItems === 0 ? '✅ Todo OK' : '⚠️ Requiere atención'}</span>
                    <div className="mt-2 h-1 rounded-full bg-orange-100"><div className="h-1 rounded-full bg-orange-500" style={{ width: kpis.lowStockItems > 0 ? '70%' : '0%' }} /></div>
                </div>
                <div className={`p-5 rounded-2xl shadow-sm border flex flex-col gap-1 ${kpis.wasteValue > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
                    <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Mermas (30 días)</span>
                    <span className={`text-2xl font-black ${kpis.wasteValue > 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatCOP(kpis.wasteValue)}</span>
                    <span className="text-xs text-gray-400">{kpis.totalMovements} movimientos este mes</span>
                    <div className="mt-2 h-1 rounded-full bg-red-100"><div className="h-1 rounded-full bg-red-500" style={{ width: kpis.wasteValue > 0 ? '60%' : '0%' }} /></div>
                </div>
            </div>

            {/* ── FILA: TOP CONSUMIDOS + ACTIVIDAD RECIENTE ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top consumidos */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Top consumidos — últimos 30 días</h2>
                    {topConsumed.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center">Sin salidas registradas.</p>
                    ) : (
                        <div className="space-y-3">
                            {topConsumed.map(({ item, qty }, i) => (
                                <div key={item!.id}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm font-semibold text-gray-800 truncate max-w-[70%]">
                                            <span className="text-xs font-black text-blue-400 mr-2">#{i + 1}</span>
                                            {item!.name}
                                        </span>
                                        <span className="text-xs font-black text-gray-600">{qty} {item!.unit}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
                                            style={{ width: `${Math.round((qty / maxConsumed) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

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

            {/* ── ANÁLISIS DE ROTACIÓN ── */}
            {subCategoryRotation.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <div className="mb-4">
                        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Análisis de Rotación</h2>
                        <p className="text-[10px] text-gray-400 mt-0.5">Últimos 30 días · recomendaciones automáticas</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead>
                                <tr>
                                    <th className="px-3 py-2 text-left text-[10px] font-black text-gray-400 uppercase">Sub-Clasificación</th>
                                    <th className="px-3 py-2 text-center text-[10px] font-black text-gray-400 uppercase">Salidas</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-black text-gray-400 uppercase">Recomendación</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {subCategoryRotation.map(row => {
                                    const rec = rotationRecs[row.subCategory];
                                    const severityColor = rec?.severity === 'CRITICAL' ? 'bg-red-100 text-red-700'
                                        : rec?.severity === 'HIGH' ? 'bg-orange-100 text-orange-700'
                                        : rec?.severity === 'MEDIUM' ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-100 text-gray-400';
                                    return (
                                        <tr key={row.subCategory} className="hover:bg-gray-50">
                                            <td className="px-3 py-2.5 text-sm font-bold text-gray-800">{row.subCategory}</td>
                                            <td className="px-3 py-2.5 text-center text-sm font-black text-gray-600">{row.totalOut}</td>
                                            <td className="px-3 py-2.5">
                                                {rec ? (
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${severityColor}`}>
                                                        {rec.recommendation}
                                                    </span>
                                                ) : (
                                                    <span className="inline-block h-3 w-36 bg-gray-100 rounded-full animate-pulse" />
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StatisticsView;
