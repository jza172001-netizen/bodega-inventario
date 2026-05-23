import React, { useState, useEffect } from 'react';
import { Item, InventoryType } from '../types';
import { CATEGORIES } from '../constants';
import { XIcon } from './icons/XIcon';

interface EditItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEditItem: (item: Item) => void;
    itemToEdit: Item | null;
}

export const EditItemModal: React.FC<EditItemModalProps> = ({ isOpen, onClose, onEditItem, itemToEdit }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [subCategory, setSubCategory] = useState('');
    const [inventoryType, setInventoryType] = useState<InventoryType>(InventoryType.HAND_TOOL);
    const [quantity, setQuantity] = useState(0);
    const [minStock, setMinStock] = useState(0);
    const [unit, setUnit] = useState('');
    const [color, setColor] = useState('');
    const [requiresReturnNote, setRequiresReturnNote] = useState(false);

    const UNIT_OPTIONS = ['unidades', 'pares', 'caja', 'bolsa', 'rollo', 'pliego', 'litro', 'ml', 'galón', 'kg', 'g', 'ton', 'm', 'cm', 'mm', 'km', 'm²', 'm³', 'yarda'];

    useEffect(() => {
        if (itemToEdit) {
            setName(itemToEdit.name);
            setCategory(itemToEdit.category);
            setSubCategory(itemToEdit.subCategory);
            setInventoryType(itemToEdit.inventoryType);
            setQuantity(itemToEdit.quantity);
            setMinStock(itemToEdit.minStock);
            setUnit(itemToEdit.unit);
            setColor(itemToEdit.color || '');
            setRequiresReturnNote(itemToEdit.requiresReturnNote ?? false);
        }
    }, [itemToEdit]);
    
    if (!isOpen || !itemToEdit) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const updatedItem: Item = {
            ...itemToEdit,
            name,
            category,
            subCategory,
            inventoryType,
            quantity,
            minStock,
            unit,
            color: color || undefined,
            requiresReturnNote: requiresReturnNote || undefined,
        };
        onEditItem(updatedItem);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Editar Artículo</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Artículo</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full input-style"/>
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
                            <input type="text" value={subCategory} onChange={e => setSubCategory(e.target.value)} required className="w-full input-style"/>
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Inventario</label>
                         <select value={inventoryType} onChange={e => setInventoryType(e.target.value as InventoryType)} className="w-full input-style">
                            {Object.values(InventoryType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                            <input type="number" value={quantity} onChange={e => setQuantity(Math.max(0, parseInt(e.target.value) || 0))} min="0" required className="w-full input-style"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Stock Mínimo</label>
                            <input type="number" value={minStock} onChange={e => setMinStock(Math.max(0, parseInt(e.target.value) || 0))} min="0" required className="w-full input-style"/>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unidad de Medida</label>
                            {inventoryType === InventoryType.SINGLE_USE ? (
                                <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full input-style">
                                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            ) : (
                                <input type="text" value={unit} onChange={e => setUnit(e.target.value)} required className="w-full input-style"/>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Color (Opcional)</label>
                            <input type="text" value={color} onChange={e => setColor(e.target.value)} className="w-full input-style"/>
                        </div>
                    </div>
                    {(inventoryType === 'Herramienta Manual' || inventoryType === 'Herramienta Eléctrica') && (
                        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <input
                                type="checkbox"
                                id="requiresReturnNote"
                                checked={requiresReturnNote}
                                onChange={e => setRequiresReturnNote(e.target.checked)}
                                className="w-4 h-4 accent-amber-600 cursor-pointer"
                            />
                            <label htmlFor="requiresReturnNote" className="text-sm text-amber-800 font-semibold cursor-pointer">
                                Exigir nota detallada al devolver
                                <span className="block text-xs font-normal text-amber-600">Para taladros, pulidoras y herramientas con accesorios</span>
                            </label>
                        </div>
                    )}
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar Cambios</button>
                    </div>
                </form>
            </div>
        </div>
    );
};