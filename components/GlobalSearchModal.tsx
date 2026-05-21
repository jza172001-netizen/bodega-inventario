
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

    const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length < 2) return [];

        return items
            .filter(i => i.name.toLowerCase().includes(q) || i.subCategory.toLowerCase().includes(q))
            .slice(0, 12)
            .map(item => {
                const activeLoan = movements.find(m => m.itemId === item.id && m.isLoan && !m.isReturned);
                const holder = activeLoan ? personnelMap.get(activeLoan.personnelId ?? '') : null;
                const recent = movements
                    .filter(m => m.itemId === item.id)
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .slice(0, 3);
                return { item, activeLoan, holder, recent };
            });
    }, [query, items, movements, personnelMap]);

    const handleSelect = (item: Item) => {
        onNavigate('kardex', 'inventory');
        onClose();
    };

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
                    {query.length >= 2 && results.length === 0 && (
                        <p className="text-center py-10 text-gray-400 text-sm">Sin resultados para "{query}"</p>
                    )}
                    {query.length < 2 && (
                        <p className="text-center py-10 text-gray-400 text-sm">Escribe al menos 2 caracteres…</p>
                    )}
                    {results.map(({ item, holder, recent }) => (
                        <button
                            key={item.id}
                            onClick={() => handleSelect(item)}
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
                </div>
            </div>
        </div>
    );
};
