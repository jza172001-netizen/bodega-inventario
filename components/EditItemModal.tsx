import React, { useState, useEffect } from 'react';
import { cantidadDeTexto } from '../utils/numeros';
import { Item, InventoryType, Accessory } from '../types';
import { AccessoriesEditor } from './AccessoriesEditor';
import { CATEGORIES } from '../constants';
import { unidadesCon } from '../utils/unidades';
import { XIcon } from './icons/XIcon';

interface EditItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEditItem: (item: Item) => void;
    itemToEdit: Item | null;
    items: Item[];
}

export const EditItemModal: React.FC<EditItemModalProps> = ({ isOpen, onClose, onEditItem, itemToEdit, items }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [subCategory, setSubCategory] = useState('');
    const [accessories, setAccessories] = useState<Accessory[]>([]);
    const [inventoryType, setInventoryType] = useState<InventoryType>(InventoryType.HAND_TOOL);
    const [quantity, setQuantity] = useState(0);
    const [minStock, setMinStock] = useState(0);
    const [unit, setUnit] = useState('');
    const [color, setColor] = useState('');
    const [brand, setBrand] = useState('');
    const [requiresReturnNote, setRequiresReturnNote] = useState(false);
    // La familia era invisible acá: solo sobrevivía por el spread del ítem, así
    // que un ítem mal agrupado no se podía arreglar desde ninguna parte.
    const [familia, setFamilia] = useState('');


    useEffect(() => {
        if (itemToEdit) {
            setName(itemToEdit.name);
            setFamilia(itemToEdit.familia ?? '');
            setCategory(itemToEdit.category);
            setSubCategory(itemToEdit.subCategory);
            setAccessories(itemToEdit.accessories ?? []);
            setInventoryType(itemToEdit.inventoryType);
            setQuantity(itemToEdit.quantity);
            setMinStock(itemToEdit.minStock);
            setUnit(itemToEdit.unit);
            setColor(itemToEdit.color || '');
            setBrand(itemToEdit.brand || '');
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
            accessories,
            inventoryType,
            quantity,
            minStock,
            unit,
            // Esto borraba el color y la marca de TODO lo que no fuera herramienta
            // eléctrica. Una manual creada desde el chat —que los pide obligatorios—
            // los perdía con solo abrirle el lápiz y guardar, y el nombre se quedaba
            // con el «(Amarillo · Dwalt)» de un color que el ítem ya no tenía.
            color: color || undefined,
            brand: brand || undefined,
            familia: familia.trim() || undefined,
            requiresReturnNote: requiresReturnNote || undefined,
        };
        onEditItem(updatedItem);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-papel rounded-xl shadow-2xl p-8 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-tinta">Editar Artículo</h2>
                    <button onClick={onClose} className="text-tinta-tenue hover:text-tinta-suave"><XIcon className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-tinta-suave mb-1">Nombre del Artículo</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full input-style"/>
                    </div>
                    {/* Fuera del formulario, igual que al crear: no se usan. El valor
                        guardado se respeta y se vuelve a mandar tal cual. */}
                     <div>
                        <label className="block text-sm font-medium text-tinta-suave mb-1">Tipo de Inventario</label>
                         <select value={inventoryType} onChange={e => setInventoryType(e.target.value as InventoryType)} className="w-full input-style">
                            {Object.values(InventoryType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-tinta-suave mb-1">Cantidad</label>
                            <input type="number" value={quantity} onChange={e => setQuantity(cantidadDeTexto(e.target.value, 0))} min="0" required className="w-full input-style"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-tinta-suave mb-1">Stock Mínimo</label>
                            <input type="number" value={minStock} onChange={e => setMinStock(cantidadDeTexto(e.target.value, 0))} min="0" required className="w-full input-style"/>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-tinta-suave mb-1">Unidad de Medida</label>
                            {/* Lista para TODOS los tipos, no solo consumibles. Escrita a
                                mano aparecían "und", "Und" y "unidades" como tres cosas
                                distintas, y el consumo quedaba partido en tres. */}
                            <select value={unit} onChange={e => setUnit(e.target.value)} required className="w-full input-style">
                                {unidadesCon(unit).map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-tinta-suave mb-1">Color (Opcional)</label>
                            <input type="text" value={color} onChange={e => setColor(e.target.value)} className="w-full input-style"/>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-tinta-suave mb-1">Marca (Opcional)</label>
                        <input type="text" value={brand} onChange={e => setBrand(e.target.value)} className="w-full input-style" placeholder="Ej: Stanley, DeWalt, Bosch..."/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-tinta-suave mb-1">
                            Familia
                            <span className="block text-xs font-normal text-tinta-tenue">
                                Con qué otros se agrupa. Vacío = la app la deduce del nombre.
                            </span>
                        </label>
                        <input type="text" value={familia} onChange={e => setFamilia(e.target.value)}
                            className="w-full input-style" placeholder="Ej: Lechada, Taladro, Clavos"/>
                    </div>
                    {(inventoryType === InventoryType.ELECTRICAL_TOOL || inventoryType === InventoryType.HAND_TOOL) && (
                        <AccessoriesEditor value={accessories} onChange={setAccessories} items={items} />
                    )}
                    {(inventoryType === 'Herramienta Manual' || inventoryType === 'Herramienta Eléctrica') && (
                        <div className="flex items-center gap-3 p-3 bg-atencion-suave border border-atencion rounded-xl">
                            <input
                                type="checkbox"
                                id="requiresReturnNote"
                                checked={requiresReturnNote}
                                onChange={e => setRequiresReturnNote(e.target.checked)}
                                className="w-4 h-4 accent-atencion cursor-pointer"
                            />
                            <label htmlFor="requiresReturnNote" className="text-sm text-atencion font-semibold cursor-pointer">
                                Exigir nota detallada al devolver
                                <span className="block text-xs font-normal text-atencion">Para taladros, pulidoras y herramientas con accesorios</span>
                            </label>
                        </div>
                    )}
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-papel-borde text-tinta rounded-md hover:bg-papel-borde">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-marca text-tinta rounded-md hover:bg-marca-fuerte">Guardar Cambios</button>
                    </div>
                </form>
            </div>
        </div>
    );
};