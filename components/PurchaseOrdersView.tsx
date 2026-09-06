
import React, { useState } from 'react';
import { PurchaseOrder, Item, UserRole, PurchaseOrderStatus } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';
import { ConfirmDialog } from './ConfirmDialog';

interface PurchaseOrdersViewProps {
    purchaseOrders: PurchaseOrder[];
    items: Item[];
    openAddPurchaseOrderModal: () => void;
    onUpdateStatus: (orderId: string, status: PurchaseOrderStatus) => void;
    userRole: UserRole;
    onGoBack: () => void;
    onDeleteOrder?: (id: string) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({ purchaseOrders, items, openAddPurchaseOrderModal, onUpdateStatus, userRole, onGoBack, onDeleteOrder, onBehaviorLog }) => {
    const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | ''>('');
    const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);

    const filtered = statusFilter
        ? purchaseOrders.filter(o => o.status === statusFilter)
        : purchaseOrders;
    
    const getItemName = (itemId: string) => items.find(i => i.id === itemId)?.name || 'N/A';
    
    const getStatusClass = (status: PurchaseOrderStatus) => {
        switch (status) {
            case PurchaseOrderStatus.ORDERED: return 'bg-marca-suave text-marca-oscuro';
            case PurchaseOrderStatus.SHIPPED: return 'bg-marca-suave text-marca-oscuro';
            case PurchaseOrderStatus.RECEIVED: return 'bg-bien-suave text-bien';
            case PurchaseOrderStatus.CANCELLED: return 'bg-alerta-suave text-alerta';
            default: return 'bg-papel-hondo text-tinta';
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-papel p-6 rounded-xl shadow-md flex justify-between items-center">
                <div className="flex items-center">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-papel-hondo">
                        <ArrowLeftIcon className="w-6 h-6 text-tinta-suave" />
                    </button>
                    <h2 className="text-xl font-black text-tinta uppercase">Órdenes de Compra</h2>
                </div>
                {userRole !== UserRole.VISITOR && (
                    <button onClick={() => { onBehaviorLog?.('BUTTON', 'Abrió: Nueva orden de compra'); openAddPurchaseOrderModal(); }} className="flex items-center bg-marca hover:bg-marca-fuerte text-tinta font-bold py-2 px-4 rounded-lg">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Crear Orden
                    </button>
                )}
            </div>

            {/* Filtros de estado */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {([['', 'Todos'], [PurchaseOrderStatus.ORDERED, '📋 Pedido'], [PurchaseOrderStatus.SHIPPED, '🚚 Enviado'], [PurchaseOrderStatus.RECEIVED, '✅ Recibido'], [PurchaseOrderStatus.CANCELLED, '❌ Cancelado']] as [PurchaseOrderStatus | '', string][]).map(([s, label]) => (
                    <button key={s} onClick={() => { setStatusFilter(s); onBehaviorLog?.('FILTER', `OC: estado=${label}`); }}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${statusFilter === s ? 'bg-marca text-tinta' : 'bg-papel-hondo text-tinta-suave hover:bg-papel-borde'}`}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-4">
                {filtered.map(order => (
                    <div key={order.id} className="bg-papel p-5 rounded-xl shadow-md relative">
                         <button
                            onClick={() => setOrderToDelete(order)}
                            className="absolute top-4 right-4 text-tinta-tenue hover:text-alerta"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                        <div className="flex justify-between items-start pr-12">
                            <div>
                                <p className="font-bold text-lg text-tinta">Orden #{order.id.split('-')[1]}</p>
                                <p className="text-sm text-tinta-suave font-bold uppercase">{order.supplier}</p>
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
            {orderToDelete && (
                <ConfirmDialog
                    title="Borrar orden"
                    message={`¿Borrar la orden de ${orderToDelete.supplier}?`}
                    confirmLabel="Sí, borrar"
                    onConfirm={() => { onBehaviorLog?.('ACTION', `Eliminó OC: ${orderToDelete.supplier}`); onDeleteOrder?.(orderToDelete.id); }}
                    onClose={() => setOrderToDelete(null)}
                />
            )}
        </div>
    );
};
