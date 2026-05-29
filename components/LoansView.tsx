
import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Movement, Item, Personnel, UserRole, InventoryType, ReturnCondition } from '../types';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { ClockIcon } from './icons/ClockIcon';
import { ReturnToolModal } from './ReturnToolModal';

interface LoansViewProps {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    onReturnItem: (movementId: string, condition?: string, notes?: string) => void;
    onMarkPendingPickup: (movementId: string, pending: boolean) => void;
    onGoBack: () => void;
    userRole?: UserRole;
    onBehaviorLog?: (action: string, detail: string) => void;
}

const INV_FILTERS = [
    { key: '', label: 'Todos' },
    { key: InventoryType.HAND_TOOL,       label: '🔨 Manual' },
    { key: InventoryType.ELECTRICAL_TOOL, label: '⚡ Eléctrica' },
    { key: InventoryType.PPE,             label: '🦺 EPP' },
    { key: InventoryType.SINGLE_USE,      label: '📦 Consumibles' },
] as const;

const INV_EMOJI: Record<string, string> = {
    [InventoryType.HAND_TOOL]:       '🔨',
    [InventoryType.ELECTRICAL_TOOL]: '⚡',
    [InventoryType.PPE]:             '🦺',
    [InventoryType.SINGLE_USE]:      '📦',
};

export const LoansView: React.FC<LoansViewProps> = ({
    movements, items, personnel, onReturnItem, onMarkPendingPickup, onGoBack, userRole = UserRole.EMPLOYEE, onBehaviorLog,
}) => {
    const isOwner = userRole === UserRole.OWNER;
    const [search, setSearch]         = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [returningLoan, setReturningLoan] = useState<Movement | null>(null);
    const bottomSentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = bottomSentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) onBehaviorLog?.('SCROLL', 'Llegó al fondo: Préstamos');
        }, { threshold: 0.5 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const itemMap   = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);

    const getItemName   = (id: string)  => itemMap.get(id)?.name ?? 'Desconocido';
    const getPersonName = (id?: string) => personMap.get(id ?? '')?.name ?? 'Sin asignar';
    const getDays       = (d: Date | string) =>
        Math.ceil(Math.abs(Date.now() - new Date(d).getTime()) / 86400000);

    const activeLoans = useMemo(() => movements.filter(m => m.isLoan && !m.isReturned), [movements]);

    const filteredLoans = useMemo(() => {
        let list = activeLoans;
        if (typeFilter) list = list.filter(m => itemMap.get(m.itemId)?.inventoryType === typeFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(m =>
                getItemName(m.itemId).toLowerCase().includes(q) ||
                getPersonName(m.personnelId).toLowerCase().includes(q)
            );
        }
        return list;
    }, [activeLoans, typeFilter, search, itemMap]); // eslint-disable-line react-hooks/exhaustive-deps

    // Group by item (tool), sorted A-Z by tool name
    const toolGroups = useMemo(() => {
        const map = new Map<string, { item: Item; loans: Movement[] }>();
        for (const m of filteredLoans) {
            const item = itemMap.get(m.itemId);
            if (!item) continue;
            if (!map.has(m.itemId)) map.set(m.itemId, { item, loans: [] });
            map.get(m.itemId)!.loans.push(m);
        }
        return [...map.values()].sort((a, b) => a.item.name.localeCompare(b.item.name, 'es'));
    }, [filteredLoans, itemMap]);

    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    const activeLetters = useMemo(() => {
        const letters = new Set<string>();
        for (const { item } of toolGroups) {
            letters.add(item.name.charAt(0).toUpperCase());
        }
        return letters;
    }, [toolGroups]);

    const jumpToLetter = useCallback((letter: string) => {
        const el = document.querySelector(`[data-tool-letter="${letter}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const handleReturn = (loan: Movement) => {
        onBehaviorLog?.('BUTTON', `Abrió devolución: ${getItemName(loan.itemId)} (${getPersonName(loan.personnelId)})`);
        setReturningLoan(loan);
    };

    const confirmReturn = (ids: string[], condition: ReturnCondition, notes: string) => {
        ids.forEach(id => {
            const loan = movements.find(m => m.id === id);
            if (loan) onBehaviorLog?.('ACTION', `Confirmó devolución: ${getItemName(loan.itemId)} de ${getPersonName(loan.personnelId)} — ${condition}`);
            onReturnItem(id, condition, notes);
        });
        setReturningLoan(null);
    };

    const LoanRow: React.FC<{ loan: Movement }> = ({ loan }) => {
        const days = getDays(loan.timestamp);
        const isPending = !!loan.pendingPickup;
        let rowClass = 'border-l-2 border-gray-200 pl-3';
        let daysBadge = 'bg-green-100 text-green-800';
        if (isPending)      { rowClass = 'border-l-2 border-indigo-400 pl-3'; daysBadge = 'bg-indigo-100 text-indigo-700'; }
        else if (days > 14) { rowClass = 'border-l-2 border-red-400 pl-3';    daysBadge = 'bg-red-100 text-red-800'; }
        else if (days > 7)  { rowClass = 'border-l-2 border-yellow-400 pl-3'; daysBadge = 'bg-yellow-100 text-yellow-800'; }

        return (
            <div className={`py-2 ${rowClass} flex items-center gap-2`}>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{getPersonName(loan.personnelId)}</p>
                    <p className="text-xs text-gray-400">{new Date(loan.timestamp).toLocaleDateString('es-CO')}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${daysBadge}`}>{days}d</span>
                {isPending && <span className="text-[10px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded-full flex-shrink-0">Recoger</span>}
                <div className="flex gap-1 flex-shrink-0">
                    {isOwner && (
                        <button onClick={() => handleReturn(loan)}
                            className="py-1 px-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-all">
                            ✓
                        </button>
                    )}
                    {!isPending ? (
                        <button onClick={() => { onBehaviorLog?.('ACTION', `Marcó recoger: ${getItemName(loan.itemId)}`); onMarkPendingPickup(loan.id, true); }}
                            className="py-1 px-2 bg-gray-100 hover:bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-lg transition-all">
                            📍
                        </button>
                    ) : (
                        <button onClick={() => { onMarkPendingPickup(loan.id, false); }}
                            className="py-1 px-2 bg-indigo-50 text-indigo-400 text-[10px] font-bold rounded-lg transition-all">
                            ✕
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const seenLetters = new Set<string>();

    return (
        <div className="relative">
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm pr-8">
                <div className="flex items-center mb-4">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                        <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                            <ClockIcon className="w-6 h-6 text-indigo-600" />
                            Préstamos Activos
                        </h2>
                        <p className="text-xs text-gray-500">{activeLoans.length} herramienta(s) fuera de bodega · agrupadas por ítem</p>
                    </div>
                </div>

                {/* Chips de tipo */}
                <div className="flex gap-2 overflow-x-auto pb-1 mb-3 scrollbar-hide">
                    {INV_FILTERS.map(f => (
                        <button key={f.key} onClick={() => { setTypeFilter(f.key); onBehaviorLog?.('FILTER', `Filtro préstamos: ${f.label}`); }}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                                typeFilter === f.key
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}>
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Búsqueda */}
                {activeLoans.length > 0 && (
                    <div className="relative mb-4">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar herramienta o persona..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
                    </div>
                )}

                {activeLoans.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <p className="text-4xl mb-3">🎉</p>
                        <p className="font-semibold">¡Todo está en bodega!</p>
                    </div>
                ) : filteredLoans.length === 0 ? (
                    <p className="text-center py-10 text-gray-400 text-sm">Sin resultados.</p>
                ) : (
                    <div className="space-y-4">
                        {toolGroups.map(({ item, loans }) => {
                            const letter = item.name.charAt(0).toUpperCase();
                            const isFirst = !seenLetters.has(letter);
                            if (isFirst) seenLetters.add(letter);
                            const emoji = INV_EMOJI[item.inventoryType] ?? '📦';
                            const loansOut = loans.length;
                            const stockLeft = item.quantity;

                            return (
                                <div
                                    key={item.id}
                                    className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden"
                                    {...(isFirst ? { 'data-tool-letter': letter } : {})}
                                >
                                    {/* Tool header */}
                                    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-black text-gray-900 text-sm leading-snug">{emoji} {item.name}</p>
                                            {item.subCategory && item.subCategory !== item.name && (
                                                <p className="text-[10px] text-gray-400">{item.subCategory}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                                {loansOut} prestada{loansOut !== 1 ? 's' : ''}
                                            </span>
                                            <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                                stock {stockLeft}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Loan rows */}
                                    <div className="px-4 py-2 space-y-1">
                                        {loans
                                            .sort((a, b) => getDays(b.timestamp) - getDays(a.timestamp))
                                            .map(loan => <LoanRow key={loan.id} loan={loan} />)}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={bottomSentinelRef} className="h-px" />
                    </div>
                )}
            </div>

            {/* Índice alfabético lateral derecho — A-Z por herramienta */}
            {filteredLoans.length > 0 && (
                <div className="fixed right-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-30">
                    {ALPHABET.map(letter => {
                        const active = activeLetters.has(letter);
                        return (
                            <button
                                key={letter}
                                onClick={() => active && jumpToLetter(letter)}
                                disabled={!active}
                                className={`w-5 h-5 flex items-center justify-center text-[10px] font-black rounded-full transition-all ${
                                    active
                                        ? 'text-indigo-600 hover:text-white hover:bg-indigo-500 cursor-pointer'
                                        : 'text-gray-300 cursor-default'
                                }`}
                            >
                                {letter}
                            </button>
                        );
                    })}
                </div>
            )}

            {returningLoan && (() => {
                const item = itemMap.get(returningLoan.itemId);
                if (!item) return null;
                return (
                    <ReturnToolModal
                        item={item}
                        personName={getPersonName(returningLoan.personnelId)}
                        movementIds={[returningLoan.id]}
                        onConfirm={confirmReturn}
                        onClose={() => setReturningLoan(null)}
                    />
                );
            })()}
        </div>
    );
};
