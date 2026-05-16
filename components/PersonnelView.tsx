import React, { useState } from 'react';
import { Personnel, UserRole, Movement, Item, Project } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';
import { EditIcon } from './icons/EditIcon';
import { PersonnelDetailModal } from './PersonnelDetailModal';

interface PersonnelViewProps {
    personnel: Personnel[];
    movements: Movement[];
    items: Item[];
    projects: Project[];
    openAddPersonnelModal: () => void;
    onGoBack: () => void;
    onEditPersonnel?: (person: Personnel) => void;
    onDeletePersonnel?: (id: string) => void;
    onReturnLoan?: (movementId: string) => void;
    userRole?: UserRole;
}

export const PersonnelView: React.FC<PersonnelViewProps> = ({
    personnel,
    movements,
    items,
    projects,
    openAddPersonnelModal,
    onGoBack,
    onEditPersonnel,
    onDeletePersonnel,
    onReturnLoan,
    userRole,
}) => {
    // Guardamos el ID del detalle, no el objeto, para que siempre refleje el array actualizado
    const [detailPersonId, setDetailPersonId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    const detailPerson = detailPersonId ? personnel.find(p => p.id === detailPersonId) : null;

    const startEdit = (e: React.MouseEvent, p: Personnel) => {
        e.stopPropagation();
        setEditingId(p.id);
        setEditingName(p.name);
    };

    const confirmEdit = (p: Personnel) => {
        if (editingName.trim() && onEditPersonnel) {
            onEditPersonnel({ ...p, name: editingName.trim() });
        }
        setEditingId(null);
    };

    const cancelEdit = () => setEditingId(null);

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('¿Eliminar este trabajador?')) {
            onDeletePersonnel?.(id);
        }
    };

    return (
        <>
            <div className="bg-white p-6 rounded-xl shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center">
                        <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                        </button>
                        <h2 className="text-xl font-semibold text-gray-800">Personal</h2>
                    </div>
                    <button onClick={openAddPersonnelModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Añadir Personal
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {personnel.map(p => {
                        const active = movements.filter(m => m.personnelId === p.id && m.isLoan && !m.isReturned).length;
                        const isEditing = editingId === p.id;

                        return (
                            <div
                                key={p.id}
                                onClick={() => !isEditing && setDetailPersonId(p.id)}
                                className={`p-4 border rounded-xl bg-gray-50 transition-all group ${isEditing ? 'border-blue-400 bg-blue-50' : 'hover:bg-blue-50 hover:border-blue-200 cursor-pointer'}`}
                            >
                                {isEditing ? (
                                    <div onClick={e => e.stopPropagation()} className="space-y-2">
                                        <input
                                            autoFocus
                                            value={editingName}
                                            onChange={e => setEditingName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') confirmEdit(p); if (e.key === 'Escape') cancelEdit(); }}
                                            className="w-full text-sm border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => confirmEdit(p)} className="flex-1 text-xs bg-blue-600 text-white rounded-lg py-1 font-bold">Guardar</button>
                                            <button onClick={cancelEdit} className="flex-1 text-xs bg-gray-100 text-gray-600 rounded-lg py-1 font-bold">Cancelar</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-blue-200 text-blue-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                                                {p.name.charAt(0)}
                                            </div>
                                            <div className="min-w-0">
                                                <span className="font-medium text-gray-700 truncate block" title={p.name}>{p.name}</span>
                                                {p.phone && (
                                                    <span className="text-[10px] text-gray-400 truncate block">{p.phone}</span>
                                                )}
                                                {active > 0 && (
                                                    <span className="text-[10px] font-black text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded-full">{active} préstamo{active > 1 ? 's' : ''}</span>
                                                )}
                                            </div>
                                        </div>
                                        {userRole === UserRole.OWNER && (
                                            <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
                                                <button onClick={e => startEdit(e, p)} className="p-1 text-gray-400 hover:text-indigo-600 rounded" title="Editar nombre">
                                                    <EditIcon className="w-4 h-4"/>
                                                </button>
                                                <button onClick={e => handleDelete(e, p.id)} className="p-1 text-gray-400 hover:text-red-600 rounded" title="Eliminar">
                                                    <TrashIcon className="w-4 h-4"/>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {personnel.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        <p>No hay personal registrado.</p>
                    </div>
                )}
            </div>

            {detailPerson && (
                <PersonnelDetailModal
                    person={detailPerson}
                    movements={movements}
                    items={items}
                    projects={projects}
                    onReturnLoan={onReturnLoan}
                    onClose={() => setDetailPersonId(null)}
                />
            )}
        </>
    );
};
