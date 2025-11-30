
import React, { useMemo } from 'react';
import { Item, InventoryType, UserRole } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { EditIcon } from './icons/EditIcon';
import { TrashIcon } from './icons/TrashIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { HistoryIcon } from './icons/HistoryIcon';

interface InventoryViewProps {
    items: Item[];
    openAddItemModal: () => void;
    onEditItem: (item: Item) => void;
    onDeleteItem: (itemId: string) => void;
    onItemHistory: (item: Item) => void;
    userRole: UserRole;
    category: string | null;
    onGoBack: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ items, openAddItemModal, onEditItem, onDeleteItem, onItemHistory, userRole, category, onGoBack }) => {

    const getStockStatusColor = (item: Item) => {
        if (item.minStock <= 0) return 'bg-gray-200 text-gray-800';
        const stockLevel = item.quantity / item.minStock;
        if (item.quantity <= 0) return 'bg-red-200 text-red-800';
        if (stockLevel <= 1) return 'bg-yellow-200 text-yellow-800';
        return 'bg-green-200 text-green-800';
    };

    const getStockStatusText = (item: Item) => {
        if (item.minStock <= 0) return 'N/A';
        if (item.quantity <= 0) return 'Agotado';
        if (item.quantity <= item.minStock) return 'Bajo Stock';
        return 'OK';
    }
    
    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                <div className="flex items-center">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                      <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                    </button>
                    <h2 className="text-2xl font-semibold text-gray-800">
                        Inventario: {category || 'Todos los Artículos'}
                    </h2>
                </div>
                {userRole === UserRole.OWNER && (
                    <button onClick={openAddItemModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Añadir Artículo
                    </button>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sub-Clasificación</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {items.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer" onClick={() => onItemHistory(item)}>
                                    {item.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.subCategory}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold">{item.quantity}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.unit}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStockStatusColor(item)}`}>
                                        {getStockStatusText(item)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                    <button onClick={() => onItemHistory(item)} className="text-blue-600 hover:text-blue-900 p-1" title="Ver Historial (Kardex)">
                                        <HistoryIcon className="w-5 h-5"/>
                                    </button>
                                    {userRole === UserRole.OWNER && (
                                        <>
                                            <button onClick={() => onEditItem(item)} className="text-indigo-600 hover:text-indigo-900 p-1" title="Editar">
                                                <EditIcon className="w-5 h-5"/>
                                            </button>
                                            <button onClick={() => onDeleteItem(item.id)} className="text-red-600 hover:text-red-900 p-1" title="Eliminar">
                                                <TrashIcon className="w-5 h-5"/>
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {items.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        <p>No hay artículos en esta categoría.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
