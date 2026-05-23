
import React, { useMemo, useState, useRef, useCallback } from 'react';
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
}

const INV_FILTERS = [
    { key: '', label: 'Todos' },
    { key: InventoryType.HAND_TOOL,       label: '🔨 Manual' },
    { key: InventoryType.ELECTRICAL_TOOL, label: '⚡ Eléctrica' },
    { key: InventoryType.PPE,             label: '🦺 EPP' },
    { key: InventoryType.SINGLE_USE,      label: '📦 Consumibles' },
] as const;

export const LoansView: React.FC<LoansViewProps> = ({
    movements, items, personnel, onReturnItem, onMarkPendingPickup, onGoBack, userRole = UserRole.EMPLOYEE,
}) => {
    const isOwner = userRole === UserRole.OWNER;
    const [search, setSearch]     = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [returningLoan, setReturningLoan] = useState<Movement | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

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
    }, [activeLoans, typeFilter, search]);

    const pendingPickup = useMemo(() => filteredLoans.filter(m => m.pendingPickup), [filteredLoans]);
    const overdueLoans  = useMemo(() => filteredLoans.filter(m => !m.pendingPickup && getDays(m.timestamp) > 14), [filteredLoans]);
    const warningLoans  = useMemo(() => filteredLoans.filter(m => !m.pendingPickup && getDays(m.timestamp) > 7 && getDays(m.timestamp) <= 14), [filteredLoans]);
    const normalLoans   = useMemo(() => filteredLoans.filter(m => !m.pendingPickup && getDays(m.timestamp) <= 7), [filteredLoans]);

    // Letras únicas de los trabajadores presentes en la vista
    const availableLetters = useMemo(() => {
        const letters = new Set<string>();
        for (const m of filteredLoans) {
            const name = getPersonName(m.personnelId);
            if (name) letters.add(name.charAt(0).toUpperCase());
        }
        return [...letters].sort();
    }, [filteredLoans]);

    const jumpToLetter = useCallback((letter: string) => {
        const el = document.getElementById(`worker-${letter}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const handleReturn = (loan: Movement) => {
        setReturningLoan(loan);
    };

    const confirmReturn = (ids: string[], condition: ReturnCondition, notes: string) => {
        ids.forEach(id => onReturnItem(id, condition, notes));
        setReturningLoan(null);
    };

    const LoanCard: React.FC<{ loan: Movement }> = ({ loan }) => {
        const days = getDays(loan.timestamp);
        const isPending = !!loan.pendingPickup;
        let cardClass = 'border border-gray-100 bg-white';
        let daysBadge = 'bg-green-100 text-green-800';
        if (isPending)      { cardClass = 'border border-orange-200 bg-orange-50'; daysBadge = 'bg-orange-100 text-orange-800'; }
        else if (days > 14) { cardClass = 'border border-red-200 bg-red-50';       daysBadge = 'bg-red-100 text-red-800'; }
        else if (days > 7)  { cardClass = 'border border-yellow-200 bg-yellow-50'; daysBadge = 'bg-yellow-100 text-yellow-800'; }
        return (
            <div className={`rounded-2xl p-4 ${cardClass} flex flex-col gap-3`}>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm leading-snug">{getItemName(loan.itemId)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(loan.timestamp).toLocaleDateString('es-CO')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${daysBadge}`}>{days}d</span>
                        {isPending && <span className="text-[10px] font-black bg-orange-500 text-white px-2 py-0.5 rounded-full">Recoger</span>}
                    </div>
                </div>
                <div className="flex gap-2">
                    {isOwner && (
                        <button onClick={() => handleReturn(loan)}
                            className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all">
                            ✓ Devuelta
                        </button>
                    )}
                    {!isPending ? (
                        <button onClick={() => onMarkPendingPickup(loan.id, true)}
                            className="flex-1 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-800 text-xs font-bold rounded-xl transition-all">
                            📍 Ir a recoger
                        </button>
                    ) : (
                        <button onClick={() => onMarkPendingPickup(loan.id, false)}
                            className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all">
                            ✕ Cancelar
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const WorkerGroup: React.FC<{ loans: Movement[] }> = ({ loans }) => {
        const byWorker = useMemo(() => {
            const map = new Map<string, Movement[]>();
            for (const m of loans) {
                const key = m.personnelId ?? '__none__';
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(m);
            }
            return [...map.entries()]
                .map(([key, ms]) => ({ name: getPersonName(key === '__none__' ? undefined : key), loans: ms }))
                .sort((a, b) => a.name.localeCompare(b.name, 'es'));
        }, [loans]);

        return (
            <div className="space-y-4">
                {byWorker.map(({ name, loans: wLoans }) => {
                    const letter = name.charAt(0).toUpperCase();
                    return (
                        <div key={name} id={`worker-${letter}`}>
                            <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs flex-shrink-0">{letter}</span>
                                {name} <span className="font-normal text-gray-400">({wLoans.length})</span>
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {wLoans.map(l => <LoanCard key={l.id} loan={l} />)}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const Section: React.FC<{ title: string; color: string; loans: Movement[] }> = ({ title, color, loans }) => {
        if (loans.length === 0) return null;
        return (
            <div className="mb-6">
                <p className={`text-xs font-black uppercase tracking-widest mb-3 ${color}`}>{title} ({loans.length})</p>
                <WorkerGroup loans={loans} />
            </div>
        );
    };

    return (
        <div className="relative">
            <div ref={scrollRef} className="bg-white p-4 md:p-6 rounded-2xl shadow-sm pr-8">
                <div className="flex items-center mb-4">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                        <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                            <ClockIcon className="w-6 h-6 text-indigo-600" />
                            Préstamos Activos
                        </h2>
                        <p className="text-xs text-gray-500">{activeLoans.length} herramienta(s) fuera de bodega</p>
                    </div>
                </div>

                {/* Chips de tipo */}
                <div className="flex gap-2 overflow-x-auto pb-1 mb-3 scrollbar-hide">
                    {INV_FILTERS.map(f => (
                        <button key={f.key} onClick={() => setTypeFilter(f.key)}
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
                    <>
                        <Section title="📍 Pendientes de recoger" color="text-orange-600" loans={pendingPickup} />
                        <Section title="🔴 Más de 14 días"        color="text-red-600"    loans={overdueLoans} />
                        <Section title="⚠️ Entre 7 y 14 días"     color="text-yellow-600" loans={warningLoans} />
                        <Section title="✅ Al día (menos de 7 días)" color="text-green-600" loans={normalLoans} />
                    </>
                )}
            </div>

            {/* Índice alfabético lateral derecho */}
            {availableLetters.length > 0 && (
                <div className="fixed right-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-30">
                    {availableLetters.map(letter => (
                        <button
                            key={letter}
                            onClick={() => jumpToLetter(letter)}
                            className="w-5 h-5 flex items-center justify-center text-[10px] font-black text-indigo-600 hover:text-white hover:bg-indigo-500 rounded-full transition-all"
                        >
                            {letter}
                        </button>
                    ))}
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
