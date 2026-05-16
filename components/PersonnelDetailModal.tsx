import React, { useMemo, useState } from 'react';
import { Personnel, Movement, Item, Project, MovementType, InventoryType } from '../types';

interface Props {
    person: Personnel;
    movements: Movement[];
    items: Item[];
    projects: Project[];
    onReturnLoan?: (movementId: string) => void;
    onClose: () => void;
}

type Tab = 'manual' | 'electric' | 'consumo' | 'epp';

const currentYear = new Date().getFullYear();
const daysSince = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

export const PersonnelDetailModal: React.FC<Props> = ({ person, movements, items, projects, onReturnLoan, onClose }) => {
    const [tab, setTab] = useState<Tab>('manual');

    const myMovements = useMemo(
        () => movements.filter(m => m.personnelId === person.id),
        [movements, person.id]
    );

    const itemByType = (type: InventoryType) => new Set(items.filter(i => i.inventoryType === type).map(i => i.id));

    type LoanGroup = { itemId: string; totalQty: number; movementIds: string[]; date: Date; workers: string[] };

    // Agrupa por ítem + día exacto. Mismo ítem mismo día → 1 tarjeta sumando cantidades y uniendo nombres de trabajadores.
    const groupLoans = (loanMovements: Movement[]): LoanGroup[] => {
        const map = new Map<string, LoanGroup>();
        for (const m of loanMovements) {
            const ts = new Date(m.timestamp);
            const dayKey = `${m.itemId}__${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}`;
            if (!map.has(dayKey)) {
                map.set(dayKey, { itemId: m.itemId, totalQty: 0, movementIds: [], date: ts, workers: [] });
            }
            const g = map.get(dayKey)!;
            g.totalQty += m.quantity;
            g.movementIds.push(m.id);
            if (m.notes && !g.workers.includes(m.notes)) g.workers.push(m.notes);
        }
        return [...map.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
    };

    // H. Manual: préstamos activos agrupados por ítem
    const activeManual = useMemo(() => {
        const manualIds = itemByType(InventoryType.HAND_TOOL);
        const loans = myMovements.filter(m => m.isLoan && !m.isReturned && manualIds.has(m.itemId));
        return groupLoans(loans);
    }, [myMovements, items]);

    // H. Eléctrica: préstamos activos agrupados por ítem
    const activeElectric = useMemo(() => {
        const electricIds = itemByType(InventoryType.ELECTRICAL_TOOL);
        const loans = myMovements.filter(m => m.isLoan && !m.isReturned && electricIds.has(m.itemId));
        return groupLoans(loans);
    }, [myMovements, items]);

    // Consumibles: salidas sin préstamo del año, agrupadas por ítem
    const consumoYear = useMemo(() => {
        const consumoIds = itemByType(InventoryType.SINGLE_USE);
        const checkouts = myMovements.filter(m =>
            m.type === MovementType.CHECK_OUT && !m.isLoan && consumoIds.has(m.itemId) &&
            new Date(m.timestamp).getFullYear() === currentYear
        );
        const grouped: Record<string, { item: Item; total: number; lastDate: Date }> = {};
        checkouts.forEach(m => {
            const item = items.find(i => i.id === m.itemId);
            if (!item) return;
            const ts = new Date(m.timestamp);
            if (!grouped[m.itemId]) grouped[m.itemId] = { item, total: 0, lastDate: ts };
            grouped[m.itemId].total += m.quantity;
            if (ts > grouped[m.itemId].lastDate) grouped[m.itemId].lastDate = ts;
        });
        return Object.values(grouped).sort((a, b) => b.total - a.total);
    }, [myMovements, items]);

    // EPP: salidas sin préstamo del año, agrupadas por ítem
    const eppYear = useMemo(() => {
        const eppIds = itemByType(InventoryType.PPE);
        const checkouts = myMovements.filter(m =>
            m.type === MovementType.CHECK_OUT && !m.isLoan && eppIds.has(m.itemId) &&
            new Date(m.timestamp).getFullYear() === currentYear
        );
        const grouped: Record<string, { item: Item; total: number; lastDate: Date }> = {};
        checkouts.forEach(m => {
            const item = items.find(i => i.id === m.itemId);
            if (!item) return;
            const ts = new Date(m.timestamp);
            if (!grouped[m.itemId]) grouped[m.itemId] = { item, total: 0, lastDate: ts };
            grouped[m.itemId].total += m.quantity;
            if (ts > grouped[m.itemId].lastDate) grouped[m.itemId].lastDate = ts;
        });
        return Object.values(grouped).sort((a, b) => b.total - a.total);
    }, [myMovements, items]);

    const itemName = (id: string) => items.find(i => i.id === id)?.name ?? 'Ítem eliminado';
    const itemUnit = (id: string) => items.find(i => i.id === id)?.unit ?? 'und';

    const TABS: { key: Tab; label: string; count: number }[] = [
        { key: 'manual', label: 'H. Manual', count: activeManual.length },
        { key: 'electric', label: 'H. Eléctrica', count: activeElectric.length },
        { key: 'consumo', label: 'Consumibles', count: consumoYear.length },
        { key: 'epp', label: 'EPP', count: eppYear.length },
    ];

    const handleReturn = (g: { itemId: string; movementIds: string[]; date: Date }) => {
        const fecha = g.date.toLocaleDateString('es-CO');
        if (window.confirm(`¿Confirmar devolución de "${itemName(g.itemId)}" (${fecha})?`)) {
            g.movementIds.forEach(id => onReturnLoan?.(id));
        }
    };

    const ToolCard = ({ g }: { g: LoanGroup }) => {
        const d = daysSince(g.date);
        const colorClass = d > 14 ? 'border-red-200 bg-red-50' : d > 7 ? 'border-yellow-200 bg-yellow-50' : 'border-blue-100 bg-blue-50';
        const badgeClass = d > 14 ? 'bg-red-100 text-red-700' : d > 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700';
        return (
            <div className={`flex items-center justify-between p-4 rounded-xl border ${colorClass}`}>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 text-sm">{itemName(g.itemId)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{g.totalQty} {itemUnit(g.itemId)} · {g.date.toLocaleDateString('es-CO')}</p>
                    {g.workers.length > 0 && (
                        <p className="text-xs font-semibold text-indigo-600 mt-1">👷 {g.workers.join(', ')}</p>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full ${badgeClass}`}>
                        {d === 0 ? 'hoy' : `${d}d fuera`}
                    </span>
                    {onReturnLoan && (
                        <button
                            onClick={() => handleReturn(g)}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg font-bold"
                        >
                            Devolver
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const ConsumptionTable = ({ rows }: { rows: { item: Item; total: number; lastDate: Date }[] }) => (
        rows.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">Sin registros este año.</p>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            <th className="pb-3">Ítem</th>
                            <th className="pb-3 text-center">Total año</th>
                            <th className="pb-3 text-right">Última salida</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {rows.map(({ item, total, lastDate }) => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="py-2.5 font-medium text-gray-800">{item.name}</td>
                                <td className="py-2.5 text-center font-black text-blue-600">{total} <span className="font-normal text-gray-400 text-xs">{item.unit}</span></td>
                                <td className="py-2.5 text-right text-gray-400 text-xs">{lastDate.toLocaleDateString('es-CO')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    );

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
                <div className="flex border-b border-gray-100 px-4 overflow-x-auto">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex-shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
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
                    {tab === 'manual' && (
                        activeManual.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-2xl mb-2">✅</p>
                                <p className="text-gray-500 text-sm">No tiene herramienta manual prestada.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {activeManual.map(g => <ToolCard key={g.itemId} g={g} />)}
                            </div>
                        )
                    )}

                    {tab === 'electric' && (
                        activeElectric.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-2xl mb-2">✅</p>
                                <p className="text-gray-500 text-sm">No tiene herramienta eléctrica prestada.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {activeElectric.map(g => <ToolCard key={g.itemId} g={g} />)}
                            </div>
                        )
                    )}

                    {tab === 'consumo' && <ConsumptionTable rows={consumoYear} />}
                    {tab === 'epp' && <ConsumptionTable rows={eppYear} />}
                </div>
            </div>
        </div>
    );
};
