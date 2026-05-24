
import React, { useMemo, useState, useEffect } from 'react';
import { Movement, Item, Personnel, InventoryType, MovementType, UserRole } from '../types';
import { TruckIcon } from './icons/TruckIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';

const PAGE_SIZE = 40;

type FilterKey = '' | 'prestamo' | 'devuelto' | 'salida' | 'entrada';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
    { key: '',          label: 'Todos' },
    { key: 'prestamo',  label: '🔑 Préstamo' },
    { key: 'devuelto',  label: '✅ Devuelto' },
    { key: 'salida',    label: '📤 Salida' },
    { key: 'entrada',   label: '📥 Entrada' },
];

const CONDITION_LABEL: Record<string, string> = {
    good: 'buen estado',
    worn: 'desgastada',
    incomplete: 'incompleta',
    damaged: 'dañada',
    needs_maintenance: 'necesita mantenimiento',
};

interface MovementsViewProps {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    filterType?: InventoryType;
    openLogMovementModal?: () => void;
    onReturnLoan?: (movementId: string) => void;
    onDeleteMovement?: (id: string) => void;
    onGoBack: () => void;
    userRole?: UserRole;
}

export const MovementsView: React.FC<MovementsViewProps> = ({
    movements, items, personnel, filterType,
    openLogMovementModal, onReturnLoan, onDeleteMovement, onGoBack,
    userRole = UserRole.EMPLOYEE,
}) => {
    const isOwner = userRole === UserRole.OWNER;
    const [page, setPage] = useState(0);
    const [filter, setFilter] = useState<FilterKey>('');

    const itemMap      = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);

    const getItemName   = (id: string)  => itemMap.get(id)?.name ?? 'Ítem eliminado';
    const getPersonName = (id?: string) => id ? (personnelMap.get(id)?.name ?? '') : '';

    const allMovements = useMemo(() => {
        const base = filterType
            ? movements.filter(m => itemMap.get(m.itemId)?.inventoryType === filterType)
            : movements;
        return [...base].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [movements, filterType, itemMap]);

    const filtered = useMemo(() => {
        if (!filter) return allMovements;
        return allMovements.filter(m => {
            if (filter === 'prestamo') return !!m.isLoan && !m.isReturned;
            if (filter === 'devuelto') return !!m.isLoan && !!m.isReturned;
            if (filter === 'salida')   return m.type === MovementType.CHECK_OUT && !m.isLoan;
            if (filter === 'entrada')  return m.type === MovementType.CHECK_IN;
            return true;
        });
    }, [allMovements, filter]);

    useEffect(() => { setPage(0); }, [filter, filterType]);

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paged = useMemo(
        () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
        [filtered, page],
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <button onClick={onGoBack} className="p-2 rounded-full hover:bg-gray-100">
                        <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
                    </button>
                    <div>
                        <h2 className="text-base font-black text-gray-900">Historial de herramientas</h2>
                        <p className="text-xs text-gray-400">{allMovements.length} movimientos</p>
                    </div>
                </div>
                {openLogMovementModal && isOwner && (
                    <button onClick={openLogMovementModal}
                        className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-xl text-xs gap-1.5">
                        <TruckIcon className="w-4 h-4" />
                        Registrar
                    </button>
                )}
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-gray-50 scrollbar-hide">
                {FILTERS.map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                            filter === f.key
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Movement list */}
            <div className="divide-y divide-gray-50">
                {paged.length === 0 && (
                    <p className="text-center py-12 text-gray-400 text-sm">Sin movimientos.</p>
                )}

                {paged.map(m => {
                    const itemName   = getItemName(m.itemId);
                    const personName = getPersonName(m.personnelId);
                    const timeStr    = new Date(m.timestamp).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
                    const isActiveLoan = !!m.isLoan && !m.isReturned;
                    const isReturned   = !!m.isLoan && !!m.isReturned;
                    const isCheckOut   = m.type === MovementType.CHECK_OUT && !m.isLoan;
                    const isCheckIn    = m.type === MovementType.CHECK_IN;

                    return (
                        <div key={m.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                    <span className="text-sm font-bold text-gray-900">{itemName}</span>
                                    <span className="text-xs text-gray-400">×{m.quantity}</span>
                                </div>

                                <div className="flex flex-wrap gap-1 mt-1">
                                    {isActiveLoan && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">🔑 Préstamo activo</span>}
                                    {isReturned   && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">✅ Devuelta</span>}
                                    {isCheckOut   && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">📤 Salida</span>}
                                    {isCheckIn    && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">📥 Entrada</span>}
                                    {m.pendingPickup && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">📍 A recoger</span>}
                                </div>

                                <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px] text-gray-400">
                                    <span>{timeStr}</span>
                                    {personName && <><span>·</span><span className="font-semibold text-gray-500">{personName}</span></>}
                                    {m.returnCondition && <><span>·</span><span>{CONDITION_LABEL[m.returnCondition] ?? m.returnCondition}</span></>}
                                    {m.notes && <><span>·</span><span className="italic truncate max-w-[140px]">{m.notes}</span></>}
                                </div>
                            </div>

                            {isOwner && (
                                <div className="flex flex-col gap-1 flex-shrink-0">
                                    {isActiveLoan && onReturnLoan && (
                                        <button onClick={() => onReturnLoan(m.id)}
                                            className="text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 font-bold">
                                            Devolver
                                        </button>
                                    )}
                                    {onDeleteMovement && (!m.isLoan || m.isReturned) && (
                                        <button onClick={() => onDeleteMovement(m.id)}
                                            className="text-red-400 hover:text-red-600 p-1">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                    </p>
                    <div className="flex gap-2">
                        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                            className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                            ← Ant.
                        </button>
                        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                            className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                            Sig. →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
