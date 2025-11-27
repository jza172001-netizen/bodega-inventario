

import React from 'react';
import { PurchaseOrder, Item, UserRole } from '../types';
import { PurchaseOrderStatus } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';

interface PurchaseOrdersViewProps {
    purchaseOrders: PurchaseOrder[];
    items: Item[];
    openAddPurchaseOrderModal: () => void;
    onUpdateStatus: (orderId: string, status: PurchaseOrderStatus) => void;
    userRole: UserRole;
    onGoBack: () => void;
}

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({ purchaseOrders, items, openAddPurchaseOrderModal, onUpdateStatus, userRole, onGoBack }) => {
    
    const getItemName = (itemId: string) => items.find(i => i.id === itemId)?.name || 'N/A';
    
    const getStatusClass = (status: PurchaseOrderStatus) => {
        switch (status) {
            case PurchaseOrderStatus.ORDERED: return 'bg-blue-100 text-blue-800';
            case PurchaseOrderStatus.SHIPPED: return 'bg-indigo-100 text-indigo-800';
            case PurchaseOrderStatus.RECEIVED: return 'bg-green-100 text-green-800';
            case PurchaseOrderStatus.CANCELLED: return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const statusOptions: { [key in PurchaseOrderStatus]: PurchaseOrderStatus[] } = {
        [PurchaseOrderStatus.ORDERED]: [PurchaseOrderStatus.SHIPPED, PurchaseOrderStatus.CANCELLED],
        [PurchaseOrderStatus.SHIPPED]: [PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELLED],
        [PurchaseOrderStatus.RECEIVED]: [],
        [PurchaseOrderStatus.CANCELLED]: [],
    }

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md">
                 <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center">
                        <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                        </button>
                        <h2 className="text-xl font-semibold text-gray-800">Órdenes de Compra</h2>
                    </div>
                     {userRole === UserRole.OWNER && (
                        <button onClick={openAddPurchaseOrderModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                            <PlusIcon className="w-5 h-5 mr-2" />
                            Crear Orden
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                {purchaseOrders.map(order => (
                    <div key={order.id} className="bg-white p-5 rounded-xl shadow-md">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-bold text-lg text-gray-800">Orden #{order.id.split('-')[1]}</p>
                                <p className="text-sm text-gray-600">Proveedor: <span className="font-medium">{order.supplier}</span></p>
                                <p className="text-sm text-gray-500">
                                    Fecha: {new Date(order.orderDate).toLocaleDateString()}
                                    {order.expectedDeliveryDate && ` | Entrega Esperada: ${new Date(order.expectedDeliveryDate).toLocaleDateString()}`}
                                </p>
                            </div>
                            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusClass(order.status)}`}>
                                {order.status}
                            </span>
                        </div>
                        <div className="mt-4 border-t pt-4">
                            <h4 className="font-semibold text-gray-700 mb-2">Artículos:</h4>
                            <ul className="space-y-1 text-sm">
                                {order.items.map(item => (
                                    <li key={item.itemId} className="flex justify-between">
                                        <span>{getItemName(item.itemId)}</span>
                                        <span className="text-gray-600">{item.quantity} x ${item.price.toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {order.notes && <p className="text-sm text-gray-500 mt-3 italic">Notas: {order.notes}</p>}
                        {userRole === UserRole.OWNER && statusOptions[order.status].length > 0 && (
                             <div className="mt-4 pt-4 border-t flex items-center justify-end space-x-2">
                                <span className="text-sm font-medium text-gray-600">Actualizar estado:</span>
                                {statusOptions[order.status].map(newStatus => (
                                    <button 
                                        key={newStatus}
                                        onClick={() => onUpdateStatus(order.id, newStatus)}
                                        className={`px-3 py-1 text-xs font-bold rounded-full ${
                                            newStatus === PurchaseOrderStatus.RECEIVED ? 'bg-green-500 hover:bg-green-600 text-white' :
                                            newStatus === PurchaseOrderStatus.SHIPPED ? 'bg-indigo-500 hover:bg-indigo-600 text-white' :
                                            'bg-red-500 hover:bg-red-600 text-white'
                                        }`}
                                    >
                                        {newStatus}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                 {purchaseOrders.length === 0 && (
                    <div className="bg-white p-6 rounded-xl shadow-md text-center">
                        <p className="text-gray-500">No hay órdenes de compra registradas.</p>
                    </div>
                 )}
            </div>
        </div>
    );
};