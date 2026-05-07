import React, { useState } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, MovementType, PurchaseOrderStatus } from '../types';
import { generateInventoryAnalysis } from '../services/geminiService';

interface CopilotViewProps {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    purchaseOrders: PurchaseOrder[];
}

type ResultCard = { title: string; content: React.ReactNode };

const CopilotView: React.FC<CopilotViewProps> = ({ items, movements, personnel, purchaseOrders }) => {
    const [result, setResult] = useState<ResultCard | null>(null);
    const [informe, setInforme] = useState<string>('');
    const [loadingInforme, setLoadingInforme] = useState(false);

    const days = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

    const actions = [
        {
            label: '📋 Órdenes de compra pendientes',
            run: () => {
                const pending = purchaseOrders.filter(o =>
                    o.status === PurchaseOrderStatus.ORDERED || o.status === PurchaseOrderStatus.SHIPPED
                );
                setResult({
                    title: 'Órdenes de compra pendientes',
                    content: pending.length === 0
                        ? <p className="text-gray-500">No hay órdenes pendientes.</p>
                        : <ul className="divide-y divide-gray-100">
                            {pending.map(o => (
                                <li key={o.id} className="py-2 flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-gray-800">{o.supplier}</p>
                                        <p className="text-xs text-gray-500">{o.items.length} ítem(s) · {new Date(o.orderDate).toLocaleDateString('es-CO')}</p>
                                    </div>
                                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${o.status === PurchaseOrderStatus.ORDERED ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                        {o.status}
                                    </span>
                                </li>
                            ))}
                        </ul>
                });
            }
        },
        {
            label: '🔥 Material más consumido (30 días)',
            run: () => {
                const last30 = movements.filter(m => days(m.timestamp) <= 30 && m.type === MovementType.CHECK_OUT);
                const totals: Record<string, number> = {};
                last30.forEach(m => { totals[m.itemId] = (totals[m.itemId] || 0) + m.quantity; });
                const top = Object.entries(totals)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([id, qty]) => ({ item: items.find(i => i.id === id), qty }))
                    .filter(x => x.item);
                setResult({
                    title: 'Material más consumido (últimos 30 días)',
                    content: top.length === 0
                        ? <p className="text-gray-500">Sin salidas en los últimos 30 días.</p>
                        : <ul className="divide-y divide-gray-100">
                            {top.map(({ item, qty }, i) => (
                                <li key={item!.id} className="py-2 flex justify-between items-center">
                                    <span className="text-gray-800">
                                        <span className="font-bold text-blue-600 mr-2">#{i + 1}</span>
                                        {item!.name}
                                    </span>
                                    <span className="font-semibold text-red-600">{qty} {item!.unit}</span>
                                </li>
                            ))}
                        </ul>
                });
            }
        },
        {
            label: '🕒 Últimos 10 movimientos',
            run: () => {
                const last10 = [...movements]
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .slice(0, 10);
                setResult({
                    title: 'Últimos 10 movimientos',
                    content: last10.length === 0
                        ? <p className="text-gray-500">No hay movimientos registrados.</p>
                        : <ul className="divide-y divide-gray-100">
                            {last10.map(m => {
                                const item = items.find(i => i.id === m.itemId);
                                const person = personnel.find(p => p.id === m.personnelId);
                                return (
                                    <li key={m.id} className="py-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-semibold text-gray-800 text-sm">{item?.name ?? 'Ítem eliminado'}</p>
                                                <p className="text-xs text-gray-500">{person?.name ?? '—'} · {new Date(m.timestamp).toLocaleDateString('es-CO')}</p>
                                            </div>
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                {m.type} {m.quantity} {item?.unit}
                                            </span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                });
            }
        },
        {
            label: '🚨 Stock bajo mínimo',
            run: () => {
                const bajo = items.filter(i => i.quantity <= i.minStock);
                setResult({
                    title: 'Ítems con stock bajo mínimo',
                    content: bajo.length === 0
                        ? <p className="text-green-600 font-semibold">✅ Todo el inventario está por encima del mínimo.</p>
                        : <ul className="divide-y divide-gray-100">
                            {bajo.map(i => (
                                <li key={i.id} className="py-2 flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-gray-800">{i.name}</p>
                                        <p className="text-xs text-gray-500">{i.category}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-bold text-sm ${i.quantity === 0 ? 'text-red-600' : 'text-orange-500'}`}>
                                            {i.quantity === 0 ? '🔴 AGOTADO' : `🟠 ${i.quantity} ${i.unit}`}
                                        </p>
                                        <p className="text-xs text-gray-400">mín: {i.minStock} {i.unit}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                });
            }
        },
        {
            label: '🔑 Herramientas en préstamo',
            run: () => {
                const prestamos = movements.filter(m => m.isLoan && !m.isReturned);
                setResult({
                    title: 'Herramientas actualmente en préstamo',
                    content: prestamos.length === 0
                        ? <p className="text-green-600 font-semibold">✅ No hay herramientas en préstamo.</p>
                        : <ul className="divide-y divide-gray-100">
                            {prestamos.map(m => {
                                const item = items.find(i => i.id === m.itemId);
                                const person = personnel.find(p => p.id === m.personnelId);
                                const diasFuera = days(m.timestamp);
                                return (
                                    <li key={m.id} className="py-2 flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold text-gray-800">{item?.name ?? '—'}</p>
                                            <p className="text-xs text-gray-500">Responsable: {person?.name ?? 'Sin asignar'}</p>
                                        </div>
                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${diasFuera > 7 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {diasFuera}d fuera
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                });
            }
        },
    ];

    const handleGenerarInforme = async () => {
        setLoadingInforme(true);
        setResult(null);
        setInforme('');
        try {
            const texto = await generateInventoryAnalysis(items, movements);
            setInforme(texto);
        } catch {
            setInforme('Error generando el informe.');
        } finally {
            setLoadingInforme(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-black text-gray-800">Análisis de Bodega</h1>
                <p className="text-gray-500 text-sm mt-1">Consultas rápidas sobre tu inventario en tiempo real.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {actions.map(a => (
                    <button
                        key={a.label}
                        onClick={() => { setInforme(''); a.run(); }}
                        className="text-left bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-xl px-4 py-4 transition-all duration-150 text-sm font-semibold text-gray-700 hover:text-blue-700"
                    >
                        {a.label}
                    </button>
                ))}
                <button
                    onClick={handleGenerarInforme}
                    disabled={loadingInforme}
                    className="text-left bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl px-4 py-4 transition-all duration-150 text-sm font-semibold text-white"
                >
                    {loadingInforme ? '⏳ Generando informe...' : '📊 Generar informe completo'}
                </button>
            </div>

            {result && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-base font-bold text-gray-800">{result.title}</h2>
                        <button onClick={() => setResult(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                    </div>
                    {result.content}
                </div>
            )}

            {informe && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-base font-bold text-gray-800">Informe completo</h2>
                        <button onClick={() => setInforme('')} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                    </div>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-[60vh]">{informe}</pre>
                </div>
            )}
        </div>
    );
};

export default CopilotView;
