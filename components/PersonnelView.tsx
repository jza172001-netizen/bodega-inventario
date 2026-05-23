import React, { useState } from 'react';
import { Personnel, UserRole, Movement, Item, Project } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';
import { EditIcon } from './icons/EditIcon';
import { PersonnelDetailModal } from './PersonnelDetailModal';
import { EditPersonnelModal } from './EditPersonnelModal';
import { buildPersonGroups, buildPersonReminderUrl } from '../services/whatsappService';

interface PersonnelViewProps {
    personnel: Personnel[];
    movements: Movement[];
    items: Item[];
    projects: Project[];
    openAddPersonnelModal: () => void;
    onGoBack: () => void;
    onEditPersonnel?: (person: Personnel) => void;
    onDeletePersonnel?: (id: string) => void;
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
    userRole,
}) => {
    const [detailPerson, setDetailPerson] = useState<Personnel | null>(null);
    const [editPerson, setEditPerson] = useState<Personnel | null>(null);

    const isOwner = userRole === UserRole.OWNER;

    const handleDelete = (e: React.MouseEvent, p: Personnel) => {
        e.stopPropagation();
        const hasLoans = movements.some(m => m.personnelId === p.id && m.isLoan && !m.isReturned);
        if (hasLoans) {
            alert(`${p.name} tiene herramientas activas en préstamo. Márcalas como devueltas antes de eliminar.`);
            return;
        }
        if (window.confirm(`¿Eliminar a ${p.name}? Su historial de movimientos se conserva.`)) {
            onDeletePersonnel?.(p.id);
        }
    };

    const openEdit = (e: React.MouseEvent, p: Personnel) => {
        e.stopPropagation();
        setEditPerson(p);
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
                    {isOwner && (
                        <button onClick={openAddPersonnelModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                            <PlusIcon className="w-5 h-5 mr-2" />
                            Añadir
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {personnel.map(p => {
                        const activeLoans = movements.filter(m => m.personnelId === p.id && m.isLoan && !m.isReturned);
                        const activeItems = activeLoans.map(m => items.find(i => i.id === m.itemId)).filter(Boolean) as Item[];
                        const visibleChips = activeItems.slice(0, 3);
                        const extra = activeItems.length - visibleChips.length;

                        const waUrl = p.phone && activeLoans.length > 0
                            ? buildPersonReminderUrl(p.phone, p.name, buildPersonGroups(p, movements, items))
                            : null;

                        return (
                            <div
                                key={p.id}
                                onClick={() => setDetailPerson(p)}
                                className="p-4 border rounded-xl bg-gray-50 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                                        <div className="w-10 h-10 rounded-full bg-blue-200 text-blue-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                                            {p.name.charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <span className="font-medium text-gray-700 truncate block" title={p.name}>{p.name}</span>
                                            {p.phone ? (
                                                <span className="text-[10px] text-gray-400 truncate block">{p.phone}</span>
                                            ) : (
                                                <span className="text-[10px] text-gray-300 block">Sin teléfono</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action buttons — always visible for owner */}
                                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                        {waUrl && (
                                            <a
                                                href={waUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-100 rounded-lg transition-colors"
                                                title="Recordar por WhatsApp"
                                            >
                                                📲
                                            </a>
                                        )}
                                        {isOwner && (
                                            <>
                                                <button
                                                    onClick={e => openEdit(e, p)}
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Editar"
                                                >
                                                    <EditIcon className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={e => handleDelete(e, p)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Eliminar"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {activeItems.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {visibleChips.map((item, i) => (
                                            <span key={i} className="text-[10px] font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200 px-1.5 py-0.5 rounded-full truncate max-w-[120px]" title={item.name}>{item.name}</span>
                                        ))}
                                        {extra > 0 && (
                                            <span className="text-[10px] font-semibold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">+{extra} más</span>
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
                    onClose={() => setDetailPerson(null)}
                />
            )}

            <EditPersonnelModal
                isOpen={!!editPerson}
                person={editPerson}
                onClose={() => setEditPerson(null)}
                onSave={p => { onEditPersonnel?.(p); setEditPerson(null); }}
            />
        </>
    );
};
