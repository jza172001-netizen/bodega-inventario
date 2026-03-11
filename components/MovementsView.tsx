
import React, { useMemo } from 'react';
import { Movement, Item, Personnel, InventoryType, MovementType, UserRole } from '../types';
import { TruckIcon } from './icons/TruckIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';

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
    
    const filteredMovements = useMemo(() => {
        if (!filterType) return movements;
        const itemIdsInType = new Set(items.filter(i => i.inventoryType === filterType).map(i => i.id));
        return movements.filter(m => itemIdsInType.has(m.itemId));
    }, [movements, items, filterType]);

    const getItemName = (itemId: string) => items.find(i => i.id === itemId)?.name || 'N/A';
    const getPersonnelName = (personnelId?: string) => personnel.find(p => p.id === personnelId)?.name || 'N/A';

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
            <div className="overflow-x-auto">
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
                        {filteredMovements.map(m => (
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
        </div>
    );
};
