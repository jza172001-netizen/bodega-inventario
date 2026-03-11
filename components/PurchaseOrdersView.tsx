
import React from 'react';
import { PurchaseOrder, Item, UserRole, PurchaseOrderStatus } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';

interface PurchaseOrdersViewProps {
    purchaseOrders: PurchaseOrder[];
    items: Item[];
    openAddPurchaseOrderModal: () => void;
    onUpdateStatus: (orderId: string, status: PurchaseOrderStatus) => void;
    userRole: UserRole;
    onGoBack: () => void;
    onDeleteOrder?: (id: string) => void;
}

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({ purchaseOrders, items, openAddPurchaseOrderModal, onUpdateStatus, userRole, onGoBack, onDeleteOrder }) => {
    
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

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md flex justify-between items-center">
                <div className="flex items-center">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                        <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                    </button>
                    <h2 className="text-xl font-black text-gray-800 uppercase">Órdenes de Compra</h2>
                </div>
                {userRole === UserRole.OWNER && (
                    <button onClick={openAddPurchaseOrderModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Crear Orden
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4">
                {purchaseOrders.map(order => (
                    <div key={order.id} className="bg-white p-5 rounded-xl shadow-md relative">
                         <button 
                            onClick={() => { if(window.confirm('¿Borrar orden?')) onDeleteOrder?.(order.id)}}
                            className="absolute top-4 right-4 text-gray-300 hover:text-red-500"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                        <div className="flex justify-between items-start pr-12">
                            <div>
                                <p className="font-bold text-lg text-gray-800">Orden #{order.id.split('-')[1]}</p>
                                <p className="text-sm text-gray-600 font-bold uppercase">{order.supplier}</p>
                            </div>
                            <span className={`px-3 py-1 text-xs font-black uppercase rounded-full ${getStatusClass(order.status)}`}>
                                {order.status}
                            </span>
                        </div>
                        <div className="mt-4 border-t pt-4">
                            <ul className="space-y-1 text-sm">
                                {order.items.map(item => (
                                    <li key={item.itemId} className="flex justify-between">
                                        <span>{getItemName(item.itemId)}</span>
                                        <span className="font-bold">{item.quantity} x ${item.price.toFixed(0)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
