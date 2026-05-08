
import React, { useMemo, useState, useEffect } from 'react';
import { Movement, Item, Personnel, InventoryType, MovementType, UserRole } from '../types';
import { TruckIcon } from './icons/TruckIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';

const PAGE_SIZE = 25;

interface MovementsViewProps {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    filterType?: InventoryType;
    openLogMovementModal?: () => void;
    onReturnLoan?: (movementId: string) => void;
    onDeleteMovement?: (id: string) => void;
    onGoBack: () => void;
}

export const MovementsView: React.FC<MovementsViewProps> = ({ movements, items, personnel, filterType, openLogMovementModal, onReturnLoan, onDeleteMovement, onGoBack }) => {
    const [page, setPage] = useState(0);

    // Memoized O(1) lookup maps — mejora 4
    const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);
    const getItemName = (id: string) => itemMap.get(id)?.name ?? 'N/A';
    const getPersonnelName = (id?: string) => id ? (personnelMap.get(id)?.name ?? 'N/A') : 'N/A';

    const filteredMovements = useMemo(() => {
        if (!filterType) return movements;
        const itemIdsInType = new Set(items.filter(i => i.inventoryType === filterType).map(i => i.id));
        return movements.filter(m => itemIdsInType.has(m.itemId));
    }, [movements, items, filterType]);

    // Reset page when filter changes — mejora 8
    useEffect(() => { setPage(0); }, [filterType]);

    const totalPages = Math.ceil(filteredMovements.length / PAGE_SIZE);
    const pagedMovements = useMemo(
        () => filteredMovements.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
        [filteredMovements, page]
    );

    const getMovementTypeClass = (type: MovementType) => {
        switch (type) {
            case MovementType.PURCHASE: return 'bg-green-100 text-green-800';
            case MovementType.CHECK_IN: return 'bg-blue-100 text-blue-800';
            case MovementType.CHECK_OUT: return 'bg-yellow-100 text-yellow-800';
            case MovementType.WASTE: return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                <div className="flex items-center mb-2 md:mb-0">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                        <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                    </button>
                    <h2 className="text-xl font-semibold text-gray-800">
                        Historial (Kardex)
                    </h2>
                </div>
                {openLogMovementModal && (
                    <button onClick={openLogMovementModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm">
                        <TruckIcon className="w-5 h-5 mr-2" />
                        Registrar Movimiento
                    </button>
                )}
            </div>

            {/* Desktop table — mejora 6 */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Artículo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cant.</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Personal</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {pagedMovements.map(m => (
                            <tr key={m.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{new Date(m.timestamp).toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{getItemName(m.itemId)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getMovementTypeClass(m.type)}`}>
                                        {m.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-bold">{m.quantity}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getPersonnelName(m.personnelId)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex space-x-2">
                                    {m.isLoan && !m.isReturned && onReturnLoan && (
                                        <button
                                            onClick={() => onReturnLoan(m.id)}
                                            className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                                        >
                                            Devolver
                                        </button>
                                    )}
                                    {onDeleteMovement && (
                                        <button
                                            onClick={() => { if(window.confirm('¿Borrar este registro?')) onDeleteMovement(m.id)}}
                                            className="text-red-400 hover:text-red-600 p-1"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards — mejora 6 */}
            <div className="md:hidden space-y-3">
                {pagedMovements.map(m => (
                    <div key={m.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <div className="flex justify-between items-start mb-1">
                            <p className="font-semibold text-gray-900 text-sm">{getItemName(m.itemId)}</p>
                            <span className={`px-2 text-xs font-semibold rounded-full ${getMovementTypeClass(m.type)}`}>
                                {m.type}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-500">
                            <span>{getPersonnelName(m.personnelId)}</span>
                            <span className="font-bold text-gray-800">x{m.quantity}</span>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-xs text-gray-400">{new Date(m.timestamp).toLocaleString()}</span>
                            <div className="flex gap-2">
                                {m.isLoan && !m.isReturned && onReturnLoan && (
                                    <button onClick={() => onReturnLoan(m.id)} className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded">
                                        Devolver
                                    </button>
                                )}
                                {onDeleteMovement && (
                                    <button onClick={() => { if(window.confirm('¿Borrar?')) onDeleteMovement(m.id)}} className="text-red-400">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredMovements.length === 0 && (
                <p className="text-center py-10 text-gray-500">No hay movimientos registrados.</p>
            )}

            {/* Paginación — mejora 8 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                        Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredMovements.length)} de {filteredMovements.length}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="px-3 py-1 text-xs font-medium rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                        >
                            ← Anterior
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="px-3 py-1 text-xs font-medium rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                        >
                            Siguiente →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
