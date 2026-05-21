
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Item, Movement, Personnel, InventoryType } from '../types';

interface GlobalSearchModalProps {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    onClose: () => void;
    onNavigate: (view: string, tab?: string) => void;
}

const TYPE_LABEL: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: '⚡',
    [InventoryType.HAND_TOOL]:       '🔨',
    [InventoryType.PPE]:             '🦺',
    [InventoryType.SINGLE_USE]:      '📦',
};

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
    items, movements, personnel, onClose, onNavigate,
}) => {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const itemMap      = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);

    const itemResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length < 2) return [];
        return items
            .filter(i => i.name.toLowerCase().includes(q) || i.subCategory.toLowerCase().includes(q))
            .slice(0, 8)
            .map(item => {
                const activeLoan = movements.find(m => m.itemId === item.id && m.isLoan && !m.isReturned);
                const holder = activeLoan ? personnelMap.get(activeLoan.personnelId ?? '') : null;
                const recent = movements
                    .filter(m => m.itemId === item.id)
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                return { item, holder, recent };
            });
    }, [query, items, movements, personnelMap]);

    const personnelResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length < 2) return [];
        return personnel
            .filter(p => p.name.toLowerCase().includes(q))
            .slice(0, 4)
            .map(person => {
                const activeLoans = movements.filter(m => m.personnelId === person.id && m.isLoan && !m.isReturned);
                const loanItems = activeLoans.map(m => itemMap.get(m.itemId)).filter(Boolean) as Item[];
                return { person, activeLoans, loanItems };
            });
    }, [query, personnel, movements, itemMap]);

    const hasResults = itemResults.length > 0 || personnelResults.length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={onClose}>
            <div
                className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar herramienta, material o persona..."
                        className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none"
                    />
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-100">
                        ESC
                    </button>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {query.length < 2 && (
                        <p className="text-center py-10 text-gray-400 text-sm">Escribe al menos 2 caracteres…</p>
                    )}
                    {query.length >= 2 && !hasResults && (
                        <p className="text-center py-10 text-gray-400 text-sm">Sin resultados para "{query}"</p>
                    )}

                    {/* Personnel results */}
                    {personnelResults.length > 0 && (
                        <>
                            <p className="px-4 pt-3 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Personal</p>
                            {personnelResults.map(({ person, loanItems }) => (
                                <button
                                    key={person.id}
                                    onClick={() => { onNavigate('kardex', 'loans'); onClose(); }}
                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm">👷</span>
                                                <span className="font-semibold text-gray-900 text-sm">{person.name}</span>
                                            </div>
                                            {person.phone && (
                                                <p className="text-xs text-gray-400 mt-0.5">{person.phone}</p>
                                            )}
                                            {loanItems.length > 0 ? (
                                                <p className="text-xs text-yellow-700 font-semibold mt-1">
                                                    🔑 Tiene: {loanItems.map(i => i.name).join(', ')}
                                                </p>
                                            ) : (
                                                <p className="text-xs text-green-600 mt-1">✅ Sin préstamos activos</p>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-blue-400 font-semibold flex-shrink-0 mt-0.5">Ver préstamos →</span>
                                    </div>
                                </button>
                            ))}
                        </>
                    )}

                    {/* Item results */}
                    {itemResults.length > 0 && (
                        <>
                            <p className="px-4 pt-3 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ítems</p>
                            {itemResults.map(({ item, holder, recent }) => (
                                <button
                                    key={item.id}
                                    onClick={() => { onNavigate('kardex', 'inventory'); onClose(); }}
                                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm">{TYPE_LABEL[item.inventoryType]}</span>
                                                <span className="font-semibold text-gray-900 text-sm truncate">{item.name}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5">{item.subCategory}</p>
                                            {holder && (
                                                <p className="text-xs text-yellow-700 font-semibold mt-1">
                                                    🔑 Con {holder.name}
                                                </p>
                                            )}
                                            {recent.length > 0 && (
                                                <p className="text-[10px] text-gray-400 mt-1">
                                                    Último mov: {new Date(recent[0].timestamp).toLocaleDateString('es-CO')} · {recent[0].type}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex-shrink-0 text-right">
                                            <span className={`text-lg font-black ${item.quantity === 0 ? 'text-red-500' : item.quantity <= item.minStock && item.minStock > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                                                {item.quantity}
                                            </span>
                                            <p className="text-[10px] text-gray-400">{item.unit}</p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
