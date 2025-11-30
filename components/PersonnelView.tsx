import React from 'react';
import { Personnel, UserRole } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';
import { EditIcon } from './icons/EditIcon';

interface PersonnelViewProps {
    personnel: Personnel[];
    openAddPersonnelModal: () => void;
    onGoBack: () => void;
    onEditPersonnel?: (person: Personnel) => void;
    onDeletePersonnel?: (id: string) => void;
    userRole?: UserRole;
}

export const PersonnelView: React.FC<PersonnelViewProps> = ({ 
    personnel, 
    openAddPersonnelModal, 
    onGoBack, 
    onEditPersonnel, 
    onDeletePersonnel,
    userRole 
}) => {
    
    const handleEdit = (p: Personnel) => {
        if (!onEditPersonnel) return;
        const newName = prompt("Nuevo nombre para " + p.name + ":", p.name);
        if (newName && newName.trim() !== "") {
            onEditPersonnel({ ...p, name: newName.trim() });
        }
    }

    return (
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
                {personnel.map(p => (
                    <div key={p.id} className="p-4 border rounded-lg bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-blue-200 text-blue-600 flex items-center justify-center font-bold text-lg">
                                {p.name.charAt(0)}
                            </div>
                            <span className="font-medium text-gray-700 truncate max-w-[120px]" title={p.name}>{p.name}</span>
                        </div>
                        {userRole === UserRole.OWNER && (
                            <div className="flex space-x-1">
                                <button 
                                    onClick={() => handleEdit(p)}
                                    className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                                    title="Editar nombre"
                                >
                                    <EditIcon className="w-4 h-4"/>
                                </button>
                                <button 
                                    onClick={() => onDeletePersonnel && onDeletePersonnel(p.id)}
                                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                                    title="Eliminar"
                                >
                                    <TrashIcon className="w-4 h-4"/>
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
             {personnel.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                    <p>No hay personal registrado.</p>
                </div>
            )}
        </div>
    );
};