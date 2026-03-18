import React, { useState } from 'react';
import { Item, UserRole, InventoryType } from '../types';
import { CATEGORIES } from '../constants';
import { XIcon } from './icons/XIcon';

interface AddItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddItem: (item: Omit<Item, 'id'>) => void;
    userRole: UserRole;
}

export const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose, onAddItem, userRole }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [subCategory, setSubCategory] = useState('');
    const [inventoryType, setInventoryType] = useState<InventoryType>(InventoryType.HAND_TOOL);
    const [quantity, setQuantity] = useState(0);
    const [minStock, setMinStock] = useState(10);
    const [price, setPrice] = useState(0);
    const [unit, setUnit] = useState('unidades');
    const [color, setColor] = useState('');


    if (!isOpen) return null;
    
    if (userRole !== UserRole.OWNER) {
        return (
             <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={onClose}>
                <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md m-4" onClick={e => e.stopPropagation()}>
                    <h2 className="text-xl font-bold text-gray-800">Acceso Denegado</h2>
                    <p className="text-gray-600 mt-4">Solo los propietarios pueden añadir nuevos artículos.</p>
                    <div className="flex justify-end mt-6">
                         <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cerrar</button>
                    </div>
                </div>
            </div>
        )
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !subCategory.trim() || !unit.trim()) {
            alert('El nombre, la sub-clasificación y la unidad son campos requeridos.');
            return;
        }
        
        onAddItem({ 
            name: name.trim(), 
            category, 
            subCategory: subCategory.trim(), 
            inventoryType, 
            quantity, 
            minStock, 
            price, 
            unit: unit.trim(), 
            color: color.trim() || undefined 
        });
        
        // The form state will reset automatically when the modal is closed and re-opened.
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Añadir Nuevo Artículo</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Artículo</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full input-style" placeholder="Ej: Martillo de uña 20oz" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                             <select value={category} onChange={e => setCategory(e.target.value)} className="w-full input-style">
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Sub-clasificación</label>
                            <input type="text" value={subCategory} onChange={e => setSubCategory(e.target.value)} required className="w-full input-style" placeholder="Ej: Herramientas de Golpe" />
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Inventario</label>
                         <select value={inventoryType} onChange={e => setInventoryType(e.target.value as InventoryType)} className="w-full input-style">
                            {Object.values(InventoryType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad Inicial</label>
                            <input type="number" value={quantity} onChange={e => setQuantity(Math.max(0, parseInt(e.target.value) || 0))} min="0" required className="w-full input-style"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Stock Mínimo</label>
                            <input type="number" value={minStock} onChange={e => setMinStock(Math.max(0, parseInt(e.target.value) || 0))} min="0" required className="w-full input-style"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Precio Unitario</label>
                            <input type="number" value={price} onChange={e => setPrice(Math.max(0, parseFloat(e.target.value) || 0))} min="0" step="0.01" required className="w-full input-style"/>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unidad de Medida</label>
                            <input type="text" value={unit} onChange={e => setUnit(e.target.value)} required className="w-full input-style" placeholder="Ej: unidades, metros, cajas" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Color (Opcional)</label>
                            <input type="text" value={color} onChange={e => setColor(e.target.value)} className="w-full input-style" placeholder="Ej: Rojo" />
                        </div>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar Artículo</button>
                    </div>
                </form>
            </div>
        </div>
    );
};