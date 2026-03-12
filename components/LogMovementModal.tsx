import React, { useState, useMemo } from 'react';
import { Item, Movement, Personnel, UserRole, InventoryType, Project } from '../types';
import { MovementType } from '../types';
import { XIcon } from './icons/XIcon';

interface LogMovementModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogMovement: (movement: Omit<Movement, 'id' | 'timestamp'>, date: Date) => void;
    items: Item[];
    personnel: Personnel[];
    projects: Project[];
    userRole: UserRole;
    filterInventoryType?: InventoryType;
}

const today = () => new Date().toISOString().split('T')[0];

export const LogMovementModal: React.FC<LogMovementModalProps> = ({
    isOpen, onClose, onLogMovement, items, personnel, projects, userRole, filterInventoryType
}) => {
    const [date, setDate] = useState(today());
    const [typeFilter, setTypeFilter] = useState<InventoryType | ''>(filterInventoryType || '');
    const [itemId, setItemId] = useState('');
    const [movType, setMovType] = useState<MovementType>(MovementType.CHECK_OUT);
    const [quantity, setQuantity] = useState(1);
    const [personnelId, setPersonnelId] = useState('');
    const [projectId, setProjectId] = useState('');

    const filteredItems = useMemo(() => {
        if (typeFilter) return items.filter(i => i.inventoryType === typeFilter);
        return items;
    }, [items, typeFilter]);

    // Reset item when type filter changes
    const handleTypeFilterChange = (val: InventoryType | '') => {
        setTypeFilter(val);
        setItemId('');
    };

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!itemId || quantity <= 0) {
            alert('Por favor, seleccione un artículo y una cantidad válida.');
            return;
        }
        const [y, m, d] = date.split('-').map(Number);
        const movDate = new Date(y, m - 1, d, new Date().getHours(), new Date().getMinutes());

        onLogMovement({
            itemId,
            type: movType,
            quantity,
            personnelId: personnelId || undefined,
            projectId: projectId || undefined,
            isLoan: movType === MovementType.CHECK_OUT,
            isReturned: false,
        }, movDate);

        // Reset
        setDate(today());
        setTypeFilter(filterInventoryType || '');
        setItemId('');
        setMovType(MovementType.CHECK_OUT);
        setQuantity(1);
        setPersonnelId('');
        setProjectId('');
        onClose();
    };

    const movTypeOptions = userRole === UserRole.OWNER
        ? Object.values(MovementType)
        : [MovementType.CHECK_IN, MovementType.CHECK_OUT];

    const movTypeLabels: Record<MovementType, string> = {
        [MovementType.CHECK_OUT]: '📤 Salida',
        [MovementType.CHECK_IN]:  '📥 Entrada / Devolución',
        [MovementType.PURCHASE]:  '🛒 Compra',
        [MovementType.WASTE]:     '🗑️ Merma / Pérdida',
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg m-4">
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-xl font-bold text-gray-800">Registrar Movimiento</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Fila 1: Fecha + Tipo de movimiento */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Fecha</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                required
                                className="w-full input-style"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Tipo de movimiento</label>
                            <select
                                value={movType}
                                onChange={e => setMovType(e.target.value as MovementType)}
                                className="w-full input-style"
                            >
                                {movTypeOptions.map(t => (
                                    <option key={t} value={t}>{movTypeLabels[t]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Fila 2: Tipo de herramienta + Artículo */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Tipo de herramienta</label>
                            <select
                                value={typeFilter}
                                onChange={e => handleTypeFilterChange(e.target.value as InventoryType | '')}
                                className="w-full input-style"
                            >
                                <option value="">— Todos —</option>
                                {Object.values(InventoryType).map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Nombre del artículo</label>
                            <select
                                value={itemId}
                                onChange={e => setItemId(e.target.value)}
                                required
                                className="w-full input-style"
                            >
                                <option value="" disabled>Seleccionar...</option>
                                {filteredItems.map(i => (
                                    <option key={i.id} value={i.id}>{i.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Fila 3: Oficial + Cantidad */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                                Oficial / Trabajador
                            </label>
                            <select
                                value={personnelId}
                                onChange={e => setPersonnelId(e.target.value)}
                                className="w-full input-style"
                            >
                                <option value="">— Sin asignar —</option>
                                {personnel.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Cantidad</label>
                            <input
                                type="number"
                                value={quantity}
                                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                min="1"
                                required
                                className="w-full input-style text-lg font-bold"
                            />
                        </div>
                    </div>

                    {/* Fila 4: Lugar / Proyecto */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Lugar / Proyecto de destino
                        </label>
                        <select
                            value={projectId}
                            onChange={e => setProjectId(e.target.value)}
                            className="w-full input-style"
                        >
                            <option value="">— Sin proyecto —</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end space-x-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">
                            Cancelar
                        </button>
                        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
