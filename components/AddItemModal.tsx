import React, { useState } from 'react';
import { Item, UserRole, InventoryType } from '../types';
import { XIcon } from './icons/XIcon';
import { formatCOP, parseCOP } from '../constants';

interface AddItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddItem: (item: Omit<Item, 'id'>) => void;
    userRole: UserRole;
}

// Sub-categorías y categorías sugeridas por tipo
const TYPE_DEFAULTS: Record<InventoryType, { category: string; subCategory: string; unit: string }> = {
    [InventoryType.HAND_TOOL]:       { category: 'Herramientas', subCategory: 'Herramientas Manuales',   unit: 'unidades' },
    [InventoryType.ELECTRICAL_TOOL]: { category: 'Herramientas', subCategory: 'Herramientas Eléctricas', unit: 'unidades' },
    [InventoryType.PPE]:             { category: 'Seguridad',    subCategory: 'Equipos de Protección',   unit: 'unidades' },
    [InventoryType.SINGLE_USE]:      { category: 'Materiales',   subCategory: 'Material de Consumo',     unit: 'unidades' },
};

export const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose, onAddItem, userRole }) => {
    const [name, setName] = useState('');
    const [inventoryType, setInventoryType] = useState<InventoryType>(InventoryType.HAND_TOOL);
    const [quantity, setQuantity] = useState(0);
    const [price, setPrice] = useState(0);
    const [priceDisplay, setPriceDisplay] = useState('0');
    const [unit, setUnit] = useState('unidades');
    const [subCategory, setSubCategory] = useState('Herramientas Manuales');

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
        );
    }

    const handleTypeChange = (type: InventoryType) => {
        setInventoryType(type);
        const defaults = TYPE_DEFAULTS[type];
        setSubCategory(defaults.subCategory);
        setUnit(defaults.unit);
    };

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Allow typing: remove dots to get raw digits
        const raw = e.target.value.replace(/\./g, '').replace(/[^\d]/g, '');
        const num = parseInt(raw, 10) || 0;
        setPrice(num);
        setPriceDisplay(raw); // Show raw while typing
    };

    const handlePriceBlur = () => {
        setPriceDisplay(formatCOP(price));
    };

    const handlePriceFocus = () => {
        setPriceDisplay(price > 0 ? price.toString() : '');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            alert('El nombre del artículo es requerido.');
            return;
        }
        const defaults = TYPE_DEFAULTS[inventoryType];
        onAddItem({
            name: name.trim(),
            category: defaults.category,
            subCategory: subCategory.trim() || defaults.subCategory,
            inventoryType,
            quantity,
            minStock: 0,
            price,
            unit: unit.trim() || 'unidades',
        });
        // Reset
        setName('');
        setInventoryType(InventoryType.HAND_TOOL);
        setQuantity(0);
        setPrice(0);
        setPriceDisplay('0');
        setUnit('unidades');
        setSubCategory('Herramientas Manuales');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg m-4">
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-xl font-bold text-gray-800">Añadir Nuevo Artículo</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Tipo + Nombre */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Tipo de artículo</label>
                        <select
                            value={inventoryType}
                            onChange={e => handleTypeChange(e.target.value as InventoryType)}
                            className="w-full input-style"
                        >
                            {Object.values(InventoryType).map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Nombre del artículo</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            className="w-full input-style"
                            placeholder='Ej: Martillo de uña 20oz'
                            autoFocus
                        />
                    </div>

                    {/* Sub-clasificación (editable pero pre-llenada) */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Sub-clasificación <span className="text-gray-400 font-normal normal-case">(auto-completada)</span>
                        </label>
                        <input
                            type="text"
                            value={subCategory}
                            onChange={e => setSubCategory(e.target.value)}
                            className="w-full input-style"
                            placeholder="Ej: Herramientas de Golpe"
                        />
                    </div>

                    {/* Cantidad + Precio en COP */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Cantidad inicial</label>
                            <input
                                type="number"
                                value={quantity}
                                onChange={e => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                                min="0"
                                required
                                className="w-full input-style"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                                Precio unitario (COP $)
                            </label>
                            <input
                                type="text"
                                value={priceDisplay}
                                onChange={handlePriceChange}
                                onBlur={handlePriceBlur}
                                onFocus={handlePriceFocus}
                                className="w-full input-style"
                                placeholder="Ej: 120.000"
                                inputMode="numeric"
                            />
                        </div>
                    </div>

                    {/* Unidad */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Unidad de medida</label>
                        <input
                            type="text"
                            value={unit}
                            onChange={e => setUnit(e.target.value)}
                            className="w-full input-style"
                            placeholder="Ej: unidades, metros, cajas"
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">
                            Cancelar
                        </button>
                        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                            Guardar Artículo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
