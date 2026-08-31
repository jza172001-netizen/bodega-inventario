
import React, { useState } from 'react';
import { Item, Movement, Personnel, MovementType, Project } from '../types';
import { XIcon } from './icons/XIcon';
import { isAsset, daysSince } from '../utils/inventory';

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
    // La acción es por préstamo, no global: un ítem puede estar con dos personas
    // a la vez y cada una se devuelve o reasigna por separado.
    const [activeAction, setActiveAction] = useState<{ movId: string; kind: 'transfer' | 'project' } | null>(null);
    const [selectedPersonId, setSelectedPersonId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');

    if (!isOpen || !item) return null;

    const history = movements
        .filter(m => m.itemId === item.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // filter, no find: con find(), un martillo que tienen Adrián y Abel mostraba
    // un solo tenedor y el otro desaparecía de la pantalla.
    const activeLoans = history.filter(m => m.isLoan && !m.isReturned);
    const unidadesFuera = activeLoans.reduce((s, m) => s + m.quantity, 0);
    const activeProjects = projects.filter(p => p.status === 'active');
    const esHerramienta = isAsset(item);

    // Para un consumible la pregunta no es "¿quién lo tiene?" sino "¿quién lo gastó?".
    const consumos = esHerramienta ? [] : (() => {
        const porPersona = new Map<string, { nombre: string; unidades: number; ultima: Date }>();
        for (const m of history) {
            if (m.type !== MovementType.CHECK_OUT || m.isLoan) continue;
            const key = m.personnelId ?? '__sin__';
            const ts = new Date(m.timestamp);
            const reg = porPersona.get(key);
            if (!reg) {
                porPersona.set(key, {
                    nombre: m.personnelId ? (personnel.find(p => p.id === m.personnelId)?.name ?? 'Desconocido') : 'Sin asignar',
                    unidades: m.quantity,
                    ultima: ts,
                });
            } else {
                reg.unidades += m.quantity;
                if (ts > reg.ultima) reg.ultima = ts;
            }
        }
        return [...porPersona.values()].sort((a, b) => b.unidades - a.unidades);
    })();

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

    const handleReturn = (loan: Movement) => {
        if (!onReturnItem) return;
        onReturnItem(loan.id);
        setActiveAction(null);
    };

    const handleTransfer = (loan: Movement) => {
        if (!onTransferLoan || !selectedPersonId) return;
        onTransferLoan(loan.id, selectedPersonId);
        setActiveAction(null);
        setSelectedPersonId('');
    };

    const handleProject = (loan: Movement) => {
        if (!onAssignProject || !selectedProjectId) return;
        onAssignProject(loan.id, selectedProjectId);
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

                {/* Préstamos activos — uno por tenedor */}
                {activeLoans.length > 0 && onReturnItem && (
                    <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                        <p className="text-xs font-black text-indigo-700 mb-2">
                            {activeLoans.length === 1
                                ? `⚡ Préstamo activo — ${unidadesFuera} unidad(es) ${esHerramienta ? 'fuera de bodega' : 'entregadas y sin devolver'}`
                                : `⚡ ${activeLoans.length} préstamos activos — ${unidadesFuera} unidad(es) repartidas entre ${activeLoans.length} personas`}
                        </p>

                        <div className="space-y-2">
                            {activeLoans.map(loan => {
                                const person = loan.personnelId ? personnel.find(p => p.id === loan.personnelId) : null;
                                const open = activeAction?.movId === loan.id ? activeAction.kind : null;
                                return (
                                    <div key={loan.id} className="bg-white border border-indigo-100 rounded-lg p-2">
                                        <p className="text-xs font-bold text-gray-700 mb-2">
                                            {person?.name ?? 'Sin asignar'}
                                            <span className="ml-2 font-black text-indigo-600">×{loan.quantity}</span>
                                            <span className="ml-2 font-normal text-gray-400">{daysSince(loan.timestamp)}d</span>
                                            {!esHerramienta && (
                                                <span className="ml-2 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                                                    marcado como préstamo
                                                </span>
                                            )}
                                        </p>

                                        {!open ? (
                                            <div className="flex gap-2 flex-wrap">
                                                <button
                                                    onClick={() => handleReturn(loan)}
                                                    className="flex-1 min-w-[100px] py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl transition-all"
                                                >
                                                    ✓ Devolver
                                                </button>
                                                {onTransferLoan && (
                                                    <button
                                                        onClick={() => setActiveAction({ movId: loan.id, kind: 'transfer' })}
                                                        className="flex-1 min-w-[100px] py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl transition-all"
                                                    >
                                                        👤 Reasignar
                                                    </button>
                                                )}
                                                {onAssignProject && activeProjects.length > 0 && (
                                                    <button
                                                        onClick={() => setActiveAction({ movId: loan.id, kind: 'project' })}
                                                        className="flex-1 min-w-[100px] py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl transition-all"
                                                    >
                                                        📁 Proyecto
                                                    </button>
                                                )}
                                            </div>
                                        ) : open === 'transfer' ? (
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <select
                                                    value={selectedPersonId}
                                                    onChange={e => setSelectedPersonId(e.target.value)}
                                                    className="flex-1 min-w-0 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                >
                                                    <option value="">— Selecciona trabajador —</option>
                                                    {personnel.filter(p => p.id !== loan.personnelId).map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                                <button onClick={() => handleTransfer(loan)} disabled={!selectedPersonId}
                                                    className="flex-shrink-0 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-black rounded-xl transition-all">
                                                    Confirmar
                                                </button>
                                                <button onClick={cancelAction} className="flex-shrink-0 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-black rounded-xl transition-all">✕</button>
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
                                                <button onClick={() => handleProject(loan)} disabled={!selectedProjectId}
                                                    className="flex-shrink-0 py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-black rounded-xl transition-all">
                                                    Confirmar
                                                </button>
                                                <button onClick={cancelAction} className="flex-shrink-0 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-black rounded-xl transition-all">✕</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Consumible: no hay nada que reclamar, pero sí hay gasto que analizar */}
                {consumos.length > 0 && (
                    <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <p className="text-xs font-black text-emerald-700 mb-2">
                            📦 Consumido — {consumos.reduce((s, c) => s + c.unidades, 0)} {item.unit} en total
                        </p>
                        <div className="space-y-1">
                            {consumos.map(c => (
                                <div key={c.nombre} className="flex items-center justify-between bg-white border border-emerald-100 rounded-lg px-2 py-1.5">
                                    <span className="text-xs font-bold text-gray-700 truncate">{c.nombre}</span>
                                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                        <span className="font-black text-emerald-600">×{c.unidades}</span>
                                        <span className="ml-2">último: {c.ultima.toLocaleDateString('es-CO')}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
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
