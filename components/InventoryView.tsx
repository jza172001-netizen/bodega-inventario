
import React, { useMemo, useState } from 'react';
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
    onOpenInvoiceReader?: () => void;
    userRole: UserRole;
    category: string | null;
    onGoBack: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ items, openAddItemModal, onEditItem, onDeleteItem, onItemHistory, onOpenInvoiceReader, userRole, category, onGoBack }) => {
    const [search, setSearch] = useState('');

    const displayItems = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter(i =>
            i.name.toLowerCase().includes(q) ||
            i.subCategory.toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q)
        );
    }, [items, search]);

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
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                <div className="flex items-center">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                      <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                    </button>
                    <h2 className="text-2xl font-semibold text-gray-800">
                        {category || 'Todos los Artículos'}
                    </h2>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-56">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar artículo..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>
                    {userRole === UserRole.OWNER && (
                        <>
                            <button onClick={onOpenInvoiceReader} className="flex items-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-3 rounded-lg text-sm whitespace-nowrap" title="Importar desde factura o archivo">
                                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/></svg>
                                Importar
                            </button>
                            <button onClick={openAddItemModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm whitespace-nowrap">
                                <PlusIcon className="w-5 h-5 mr-2" />
                                Añadir
                            </button>
                        </>
                    )}
                </div>
            </div>
            {search && (
                <p className="text-xs text-gray-400 mb-3">{displayItems.length} resultado{displayItems.length !== 1 ? 's' : ''} para "{search}"</p>
            )}
            {/* Mobile cards */}
            <div className="md:hidden space-y-2 mb-2">
                {displayItems.map(item => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 text-sm truncate cursor-pointer" onClick={() => onItemHistory(item)}>{item.name}</p>
                            <p className="text-xs text-gray-500 truncate">{item.subCategory}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-bold text-gray-800">{item.quantity} <span className="text-xs font-normal text-gray-500">{item.unit}</span></span>
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStockStatusColor(item)}`}>{getStockStatusText(item)}</span>
                            <div className="flex gap-1">
                                <button onClick={() => onItemHistory(item)} className="text-blue-500 p-1" title="Historial"><HistoryIcon className="w-4 h-4"/></button>
                                {userRole === UserRole.OWNER && (
                                    <>
                                        <button onClick={() => onEditItem(item)} className="text-indigo-500 p-1"><EditIcon className="w-4 h-4"/></button>
                                        <button onClick={() => onDeleteItem(item.id)} className="text-red-400 p-1"><TrashIcon className="w-4 h-4"/></button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {displayItems.length === 0 && (
                    <p className="text-center py-8 text-gray-500 text-sm">{search ? `Sin resultados para "${search}".` : 'No hay artículos en esta categoría.'}</p>
                )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
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
                        {displayItems.map(item => (
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
                 {displayItems.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        <p>{search ? `No se encontraron artículos para "${search}".` : 'No hay artículos en esta categoría.'}</p>
                    </div>
                )}
            </div>{/* end desktop table */}
        </div>
    );
};
