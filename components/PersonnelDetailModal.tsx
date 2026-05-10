import React, { useMemo, useState } from 'react';
import { Personnel, Movement, Item, Project, MovementType } from '../types';

interface Props {
    person: Personnel;
    movements: Movement[];
    items: Item[];
    projects: Project[];
    onClose: () => void;
}

type Tab = 'active' | 'loans' | 'consumption';

const currentYear = new Date().getFullYear();

const daysSince = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

export const PersonnelDetailModal: React.FC<Props> = ({ person, movements, items, projects, onClose }) => {
    const [tab, setTab] = useState<Tab>('active');

    const myMovements = useMemo(
        () => movements.filter(m => m.personnelId === person.id),
        [movements, person.id]
    );

    const activeLoans = useMemo(
        () => myMovements.filter(m => m.isLoan && !m.isReturned),
        [myMovements]
    );

    const yearLoans = useMemo(
        () => myMovements.filter(m => m.isLoan && new Date(m.timestamp).getFullYear() === currentYear)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
        [myMovements]
    );

    const yearConsumption = useMemo(() => {
        const checkouts = myMovements.filter(m =>
            m.type === MovementType.CHECK_OUT &&
            !m.isLoan &&
            new Date(m.timestamp).getFullYear() === currentYear
        );
        const grouped: Record<string, { item: Item; total: number; projects: Set<string> }> = {};
        checkouts.forEach(m => {
            const item = items.find(i => i.id === m.itemId);
            if (!item) return;
            if (!grouped[m.itemId]) grouped[m.itemId] = { item, total: 0, projects: new Set() };
            grouped[m.itemId].total += m.quantity;
            if (m.projectId) grouped[m.itemId].projects.add(m.projectId);
        });
        return Object.values(grouped).sort((a, b) => b.total - a.total);
    }, [myMovements, items]);

    const itemName = (id: string) => items.find(i => i.id === id)?.name ?? 'Ítem eliminado';
    const projectName = (id?: string) => id ? (projects.find(p => p.id === id)?.name ?? 'Proyecto') : '—';

    const TABS: { key: Tab; label: string; count: number }[] = [
        { key: 'active', label: 'Activo', count: activeLoans.length },
        { key: 'loans', label: `Préstamos ${currentYear}`, count: yearLoans.length },
        { key: 'consumption', label: `Consumo ${currentYear}`, count: yearConsumption.length },
    ];

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xl">
                            {person.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">{person.name}</h2>
                            <p className="text-xs text-gray-400">{myMovements.length} movimientos en total</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 px-4">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            {t.label}
                            {t.count > 0 && (
                                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-black ${tab === t.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* Tab: Activo */}
                    {tab === 'active' && (
                        <div>
                            {activeLoans.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-2xl mb-2">✅</p>
                                    <p className="text-gray-500 text-sm">No tiene herramientas prestadas actualmente.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {activeLoans.map(m => {
                                        const d = daysSince(m.timestamp);
                                        return (
                                            <div key={m.id} className={`flex items-center justify-between p-4 rounded-xl border ${d > 14 ? 'border-red-200 bg-red-50' : d > 7 ? 'border-yellow-200 bg-yellow-50' : 'border-gray-100 bg-gray-50'}`}>
                                                <div>
                                                    <p className="font-semibold text-gray-800 text-sm">{itemName(m.itemId)}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">{m.quantity} {items.find(i => i.id === m.itemId)?.unit ?? 'und'} · {projectName(m.projectId)}</p>
                                                </div>
                                                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${d > 14 ? 'bg-red-100 text-red-700' : d > 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {d === 0 ? 'hoy' : `${d}d fuera`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab: Préstamos del año */}
                    {tab === 'loans' && (
                        <div>
                            {yearLoans.length === 0 ? (
                                <p className="text-gray-400 text-sm text-center py-12">Sin préstamos este año.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                                <th className="pb-3">Ítem</th>
                                                <th className="pb-3 text-center">Cant.</th>
                                                <th className="pb-3">Proyecto</th>
                                                <th className="pb-3">Fecha</th>
                                                <th className="pb-3 text-center">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {yearLoans.map(m => (
                                                <tr key={m.id} className="hover:bg-gray-50">
                                                    <td className="py-2.5 font-medium text-gray-800">{itemName(m.itemId)}</td>
                                                    <td className="py-2.5 text-center text-gray-600">{m.quantity}</td>
                                                    <td className="py-2.5 text-gray-500 text-xs">{projectName(m.projectId)}</td>
                                                    <td className="py-2.5 text-gray-400 text-xs whitespace-nowrap">{new Date(m.timestamp).toLocaleDateString('es-CO')}</td>
                                                    <td className="py-2.5 text-center">
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${m.isReturned ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                            {m.isReturned ? 'Devuelto' : 'Fuera'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab: Consumo del año */}
                    {tab === 'consumption' && (
                        <div>
                            {yearConsumption.length === 0 ? (
                                <p className="text-gray-400 text-sm text-center py-12">Sin consumo registrado este año.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                                <th className="pb-3">Ítem</th>
                                                <th className="pb-3 text-center">Total</th>
                                                <th className="pb-3">Proyectos</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {yearConsumption.map(({ item, total, projects: projIds }) => (
                                                <tr key={item.id} className="hover:bg-gray-50">
                                                    <td className="py-2.5 font-medium text-gray-800">{item.name}</td>
                                                    <td className="py-2.5 text-center font-black text-blue-600">{total} <span className="font-normal text-gray-400 text-xs">{item.unit}</span></td>
                                                    <td className="py-2.5 text-xs text-gray-500">
                                                        {projIds.size === 0 ? '—' : [...projIds].map(id => projectName(id)).join(', ')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
