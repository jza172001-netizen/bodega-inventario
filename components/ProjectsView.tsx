
import React, { useState, useMemo } from 'react';
import { Project, Movement, Item, UserRole, MovementType } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { HardHatIcon } from './icons/HardHatIcon';

interface ProjectsViewProps {
    projects: Project[];
    movements: Movement[];
    items: Item[];
    onAddProject: (project: Omit<Project, 'id'>) => void;
    onGoBack: () => void;
    userRole: UserRole;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ projects, movements, items, onAddProject, onGoBack, userRole }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');

    const projectStats = useMemo(() => {
        return projects.map(project => {
            const projectMovements = movements.filter(m => m.projectId === project.id && (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE));
            
            const totalItems = projectMovements.reduce((acc, m) => acc + m.quantity, 0);
            
            const totalCost = projectMovements.reduce((acc, m) => {
                const item = items.find(i => i.id === m.itemId);
                return acc + (item ? item.price * m.quantity : 0);
            }, 0);

            return { ...project, totalItems, totalCost };
        });
    }, [projects, movements, items]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        onAddProject({
            name: newProjectName,
            description: newProjectDesc,
            status: 'active'
        });
        setIsAdding(false);
        setNewProjectName('');
        setNewProjectDesc('');
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                 <div className="flex items-center mb-4 md:mb-0">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                        <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                            <HardHatIcon className="w-8 h-8 mr-2 text-yellow-600"/>
                            Proyectos / Obras
                        </h2>
                        <p className="text-sm text-gray-500">Gestión de costos por proyecto</p>
                    </div>
                </div>
                {userRole === UserRole.OWNER && !isAdding && (
                    <button onClick={() => setIsAdding(true)} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Nuevo Proyecto
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="font-semibold text-gray-700 mb-3">Registrar Nueva Obra</h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                type="text"
                                placeholder="Nombre del Proyecto (Ej: Torre A)"
                                value={newProjectName}
                                onChange={e => setNewProjectName(e.target.value)}
                                className="input-style w-full p-2 border rounded"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Descripción (Opcional)"
                                value={newProjectDesc}
                                onChange={e => setNewProjectDesc(e.target.value)}
                                className="input-style w-full p-2 border rounded"
                            />
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-1 text-gray-600 hover:bg-gray-200 rounded">Cancelar</button>
                            <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Guardar</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projectStats.map(project => (
                    <div key={project.id} className="border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-gray-800">{project.name}</h3>
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Activo</span>
                        </div>
                        <p className="text-sm text-gray-500 mb-4 h-10">{project.description || 'Sin descripción'}</p>
                        
                        <div className="space-y-2 border-t pt-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Items retirados:</span>
                                <span className="font-medium">{project.totalItems}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Costo Materiales:</span>
                                <span className="font-bold text-blue-600">${project.totalCost.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
