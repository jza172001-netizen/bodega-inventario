
import React, { useState } from 'react';
import { Item, Movement, Personnel, MovementType, Project } from '../types';
import { XIcon } from './icons/XIcon';

interface ItemHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: Item | null;
    movements: Movement[];
    personnel: Personnel[];
    projects?: Project[];
    onReturnItem?: (id: string) => void;
    onTransferLoan?: (movementId: string, newPersonnelId: string) => void;
    onAssignProject?: (movementId: string, projectId: string) => void;
}

export const ItemHistoryModal: React.FC<ItemHistoryModalProps> = ({
    isOpen, onClose, item, movements, personnel,
    projects = [], onReturnItem, onTransferLoan, onAssignProject,
}) => {
    const [activeAction, setActiveAction] = useState<'transfer' | 'project' | null>(null);
    const [selectedPersonId, setSelectedPersonId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');

    if (!isOpen || !item) return null;

    const history = movements
        .filter(m => m.itemId === item.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const activeLoan = history.find(m => m.isLoan && !m.isReturned);
    const loanPerson = activeLoan?.personnelId ? personnel.find(p => p.id === activeLoan.personnelId) : null;
    const activeProjects = projects.filter(p => p.status === 'active');

    const getPersonnelName = (id?: string) => personnel.find(p => p.id === id)?.name || '-';

    const getRowColor = (type: MovementType) => {
        switch (type) {
            case MovementType.PURCHASE: return 'bg-green-50';
            case MovementType.CHECK_IN: return 'bg-blue-50';
            case MovementType.CHECK_OUT: return 'bg-white';
            case MovementType.WASTE: return 'bg-red-50';
            default: return 'bg-white';
        }
    };

    const totalIn  = history.filter(m => m.type === MovementType.PURCHASE || m.type === MovementType.CHECK_IN).reduce((acc, m) => acc + m.quantity, 0);
    const totalOut = history.filter(m => m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE).reduce((acc, m) => acc + m.quantity, 0);

    const handleReturn = () => {
        if (!activeLoan || !onReturnItem) return;
        onReturnItem(activeLoan.id);
        setActiveAction(null);
    };

    const handleTransfer = () => {
        if (!activeLoan || !onTransferLoan || !selectedPersonId) return;
        onTransferLoan(activeLoan.id, selectedPersonId);
        setActiveAction(null);
        setSelectedPersonId('');
    };

    const handleProject = () => {
        if (!activeLoan || !onAssignProject || !selectedProjectId) return;
        onAssignProject(activeLoan.id, selectedProjectId);
        setActiveAction(null);
        setSelectedProjectId('');
    };

    const cancelAction = () => {
        setActiveAction(null);
        setSelectedPersonId('');
        setSelectedProjectId('');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-3xl m-4 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-start mb-4 border-b pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">{item.name}</h2>
                        <p className="text-gray-500 text-sm">Kardex / Historial de Movimientos</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-6 h-6" /></button>
                </div>

                {/* Active loan action panel */}
                {activeLoan && onReturnItem && (
                    <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                        <p className="text-xs font-black text-indigo-700 mb-2">
                            ⚡ Préstamo activo — {loanPerson?.name ?? 'Sin asignar'} tiene esta herramienta
                        </p>

                        {!activeAction ? (
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    onClick={handleReturn}
                                    className="flex-1 min-w-[100px] py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl transition-all"
                                >
                                    ✓ Devolver
                                </button>
                                {onTransferLoan && (
                                    <button
                                        onClick={() => setActiveAction('transfer')}
                                        className="flex-1 min-w-[100px] py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl transition-all"
                                    >
                                        👤 Reasignar
                                    </button>
                                )}
                                {onAssignProject && activeProjects.length > 0 && (
                                    <button
                                        onClick={() => setActiveAction('project')}
                                        className="flex-1 min-w-[100px] py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl transition-all"
                                    >
                                        📁 Proyecto
                                    </button>
                                )}
                            </div>
                        ) : activeAction === 'transfer' ? (
                            <div className="flex gap-2 items-center flex-wrap">
                                <select
                                    value={selectedPersonId}
                                    onChange={e => setSelectedPersonId(e.target.value)}
                                    className="flex-1 min-w-0 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                >
                                    <option value="">— Selecciona trabajador —</option>
                                    {personnel.filter(p => p.id !== activeLoan.personnelId).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleTransfer}
                                    disabled={!selectedPersonId}
                                    className="flex-shrink-0 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-black rounded-xl transition-all"
                                >
                                    Confirmar
                                </button>
                                <button onClick={cancelAction} className="flex-shrink-0 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-black rounded-xl transition-all">
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2 items-center flex-wrap">
                                <select
                                    value={selectedProjectId}
                                    onChange={e => setSelectedProjectId(e.target.value)}
                                    className="flex-1 min-w-0 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400"
                                >
                                    <option value="">— Selecciona proyecto —</option>
                                    {activeProjects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleProject}
                                    disabled={!selectedProjectId}
                                    className="flex-shrink-0 py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-black rounded-xl transition-all"
                                >
                                    Confirmar
                                </button>
                                <button onClick={cancelAction} className="flex-shrink-0 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-black rounded-xl transition-all">
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div className="bg-gray-100 p-2 rounded">
                        <span className="block text-xs text-gray-500">Stock Actual</span>
                        <span className="font-bold text-lg">{item.quantity}</span>
                    </div>
                    <div className="bg-green-100 p-2 rounded">
                        <span className="block text-xs text-green-700">Total Entradas</span>
                        <span className="font-bold text-lg text-green-800">{totalIn}</span>
                    </div>
                    <div className="bg-red-100 p-2 rounded">
                        <span className="block text-xs text-red-700">Total Salidas</span>
                        <span className="font-bold text-lg text-red-800">{totalOut}</span>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Fecha</th>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Tipo</th>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Cant.</th>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Personal</th>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Notas</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {history.map(m => (
                                <tr key={m.id} className={getRowColor(m.type)}>
                                    <td className="px-4 py-3 text-gray-600">{new Date(m.timestamp).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 font-medium">{m.type} {m.isLoan && <span className="text-xs bg-indigo-100 text-indigo-700 px-1 rounded">Préstamo</span>}</td>
                                    <td className="px-4 py-3 font-bold">{m.quantity}</td>
                                    <td className="px-4 py-3 text-gray-600">{getPersonnelName(m.personnelId)}</td>
                                    <td className="px-4 py-3 text-gray-500 italic truncate max-w-xs">{m.notes || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {history.length === 0 && <p className="text-center py-8 text-gray-400">Sin historial registrado.</p>}
                </div>
            </div>
        </div>
    );
};
