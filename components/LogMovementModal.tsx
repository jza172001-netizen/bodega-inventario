
import React, { useState, useMemo } from 'react';
import { Item, Movement, Personnel, UserRole, InventoryType, Project } from '../types';
import { MovementType } from '../types';
import { XIcon } from './icons/XIcon';

interface LogMovementModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogMovement: (movement: Omit<Movement, 'id' | 'timestamp'>) => void;
    items: Item[];
    personnel: Personnel[];
    projects: Project[];
    userRole: UserRole;
    filterInventoryType?: InventoryType;
}

export const LogMovementModal: React.FC<LogMovementModalProps> = ({ isOpen, onClose, onLogMovement, items, personnel, projects, userRole, filterInventoryType }) => {
    const [itemId, setItemId] = useState('');
    const [type, setType] = useState<MovementType>(MovementType.CHECK_OUT);
    const [quantity, setQuantity] = useState(1);
    const [personnelId, setPersonnelId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [isLoan, setIsLoan] = useState(false);
    const [notes, setNotes] = useState('');

    const filteredItems = useMemo(() => {
        return filterInventoryType ? items.filter(i => i.inventoryType === filterInventoryType) : items;
    }, [items, filterInventoryType]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!itemId || quantity <= 0) {
            alert('Por favor, seleccione un artículo y una cantidad válida.');
            return;
        }
        onLogMovement({ 
            itemId, 
            type, 
            quantity, 
            personnelId: personnelId || undefined, 
            projectId: projectId || undefined,
            isLoan: type === MovementType.CHECK_OUT ? isLoan : false,
            notes 
        });
        // Reset form
        setItemId('');
        setType(MovementType.CHECK_OUT);
        setQuantity(1);
        setPersonnelId('');
        setProjectId('');
        setIsLoan(false);
        setNotes('');
        onClose();
    };
    
    const allowedMovementTypes = userRole === UserRole.OWNER 
        ? Object.values(MovementType)
        : [MovementType.CHECK_IN, MovementType.CHECK_OUT];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg m-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Registrar Movimiento</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Artículo</label>
                            <select value={itemId} onChange={e => setItemId(e.target.value)} required className="w-full input-style">
                                <option value="" disabled>Seleccionar artículo...</option>
                                {filteredItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Movimiento</label>
                            <select value={type} onChange={e => setType(e.target.value as MovementType)} className="w-full input-style">
                                {allowedMovementTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                            <input type="number" value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} min="1" required className="w-full input-style"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Personal (Opcional)</label>
                            <select value={personnelId} onChange={e => setPersonnelId(e.target.value)} className="w-full input-style">
                                <option value="">N/A</option>
                                {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    {/* Campos adicionales para SALIDAS */}
                    {(type === MovementType.CHECK_OUT || type === MovementType.WASTE) && (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto (Opcional)</label>
                                <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full input-style">
                                    <option value="">Ninguno / General</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            {type === MovementType.CHECK_OUT && (
                                <div className="flex items-center mt-6">
                                    <input
                                        id="isLoan"
                                        type="checkbox"
                                        checked={isLoan}
                                        onChange={e => setIsLoan(e.target.checked)}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor="isLoan" className="ml-2 block text-sm text-gray-900">
                                        ¿Es un préstamo? (Requiere devolución)
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notas (Opcional)</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full input-style" placeholder="Ej: Para el proyecto Edificio Central" />
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar Movimiento</button>
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
