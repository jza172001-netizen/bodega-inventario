
import React, { useState } from 'react';
import { PurchaseOrder, PurchaseOrderItem, Item } from '../types';
import { PurchaseOrderStatus } from '../types';
import { XIcon } from './icons/XIcon';
import { PlusIcon } from './icons/PlusIcon';

interface AddPurchaseOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddPurchaseOrder: (order: Omit<PurchaseOrder, 'id'>) => void;
    items: Item[];
}

type OrderItemForm = Omit<PurchaseOrderItem, 'price'> & { tempId: number, priceStr: string };

export const AddPurchaseOrderModal: React.FC<AddPurchaseOrderModalProps> = ({ isOpen, onClose, onAddPurchaseOrder, items }) => {
    const [supplier, setSupplier] = useState('');
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [notes, setNotes] = useState('');
    const [orderItems, setOrderItems] = useState<OrderItemForm[]>([{ tempId: Date.now(), itemId: '', quantity: 1, priceStr: '0.00' }]);

    if (!isOpen) return null;
    
    const lowStockItems = items.filter(i => i.quantity <= i.minStock);

    const handleItemChange = (tempId: number, field: keyof OrderItemForm, value: any) => {
        setOrderItems(currentItems =>
            currentItems.map(item => {
                if (item.tempId === tempId) {
                    const updatedItem = { ...item, [field]: value };
                    // If item ID changes, update the price
                    if(field === 'itemId') {
                        const selectedItem = items.find(i => i.id === value);
                        updatedItem.priceStr = selectedItem ? selectedItem.price.toFixed(2) : '0.00';
                    }
                    return updatedItem;
                }
                return item;
            })
        );
    };

    const addOrderItemRow = () => {
        setOrderItems([...orderItems, { tempId: Date.now(), itemId: '', quantity: 1, priceStr: '0.00' }]);
    };
    
    const addLowStockItem = (item: Item) => {
        // Avoid adding duplicates
        if (orderItems.some(oi => oi.itemId === item.id)) return;
        const newItemRow: OrderItemForm = { tempId: Date.now(), itemId: item.id, quantity: item.minStock, priceStr: item.price.toFixed(2) };
        // If the first row is empty, replace it. Otherwise, add a new one.
        if (orderItems.length === 1 && !orderItems[0].itemId) {
            setOrderItems([newItemRow]);
        } else {
            setOrderItems([...orderItems, newItemRow]);
        }
    }

    const removeOrderItemRow = (tempId: number) => {
        setOrderItems(orderItems.filter(item => item.tempId !== tempId));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalOrderItems: PurchaseOrderItem[] = orderItems
            .filter(oi => oi.itemId && oi.quantity > 0)
            .map(oi => ({
                itemId: oi.itemId,
                quantity: oi.quantity,
                price: parseFloat(oi.priceStr) || 0,
            }));

        if (!supplier || finalOrderItems.length === 0) {
            alert('Proveedor y al menos un artículo son requeridos.');
            return;
        }

        onAddPurchaseOrder({
            supplier,
            items: finalOrderItems,
            status: PurchaseOrderStatus.ORDERED,
            orderDate: new Date(),
            expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined,
            notes,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Crear Orden de Compra</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-6 h-6" /></button>
                </div>
                 {lowStockItems.length > 0 && <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
                    <h3 className="font-semibold text-yellow-800 mb-2">Sugerencias (Stock Bajo)</h3>
                    <div className="flex flex-wrap gap-2">
                        {lowStockItems.map(item => (
                            <button key={item.id} type="button" onClick={() => addLowStockItem(item)} className="px-2 py-1 bg-yellow-200 text-yellow-900 text-xs font-medium rounded-full hover:bg-yellow-300">
                                {item.name}
                            </button>
                        ))}
                    </div>
                </div>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                            <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} required className="w-full input-style"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Entrega Estimada</label>
                            <input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} className="w-full input-style"/>
                        </div>
                    </div>
                    <div>
                        <h3 className="text-lg font-medium text-gray-800 mb-2 border-b pb-2">Artículos a Ordenar</h3>
                        <div className="space-y-3">
                        {orderItems.map((item, index) => (
                            <div key={item.tempId} className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-5">
                                    <label className={`text-sm font-medium text-gray-700 mb-1 ${index !== 0 ? 'hidden' : 'block'}`}>Artículo</label>
                                    <select value={item.itemId} onChange={e => handleItemChange(item.tempId, 'itemId', e.target.value)} className="w-full input-style">
                                        <option value="">Seleccionar...</option>
                                        {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-3">
                                    <label className={`text-sm font-medium text-gray-700 mb-1 ${index !== 0 ? 'hidden' : 'block'}`}>Cantidad</label>
                                    <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(item.tempId, 'quantity', parseInt(e.target.value) || 1)} className="w-full input-style" />
                                </div>
                                 <div className="col-span-3">
                                    <label className={`text-sm font-medium text-gray-700 mb-1 ${index !== 0 ? 'hidden' : 'block'}`}>Precio U.</label>
                                    <input type="text" value={item.priceStr} onChange={e => handleItemChange(item.tempId, 'priceStr', e.target.value)} className="w-full input-style" />
                                </div>
                                <div className="col-span-1 self-end">
                                    {orderItems.length > 1 && <button type="button" onClick={() => removeOrderItemRow(item.tempId)} className="text-red-500 hover:text-red-700 p-2">
                                        <XIcon className="w-4 h-4" />
                                    </button>}
                                </div>
                            </div>
                        ))}
                        </div>
                        <button type="button" onClick={addOrderItemRow} className="mt-2 flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium">
                           <PlusIcon className="w-4 h-4 mr-1" /> Añadir Artículo
                        </button>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full input-style" />
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar Orden</button>
                    </div>
                </form>
            </div>
            <style jsx>{`
                .input-style { padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
                .input-style:focus { outline: none; --tw-ring-color: #3b82f6; box-shadow: 0 0 0 2px var(--tw-ring-color); border-color: #3b82f6; }
            `}</style>
        </div>
    );
};