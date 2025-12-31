
import React, { useState, useMemo } from 'react';
import { Project, Movement, Item, UserRole, MovementType, Personnel } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { HardHatIcon } from './icons/HardHatIcon';

interface ProjectsViewProps {
    projects: Project[];
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    onAddProject: (project: Omit<Project, 'id'>) => void;
    onGoBack: () => void;
    userRole: UserRole;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ projects, movements, items, personnel, onAddProject, onGoBack, userRole }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

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

    const selectedProject = useMemo(() => 
        projectStats.find(p => p.id === selectedProjectId), 
    [projectStats, selectedProjectId]);

    const detailedMovements = useMemo(() => {
        if (!selectedProjectId) return [];
        return movements
            .filter(m => m.projectId === selectedProjectId && (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE))
            .map(m => {
                const item = items.find(i => i.id === m.itemId);
                const person = personnel.find(p => p.id === m.personnelId);
                return {
                    ...m,
                    itemName: item?.name || 'Desconocido',
                    personName: person?.name || 'Sin asignar',
                    price: item?.price || 0,
                    subtotal: (item?.price || 0) * m.quantity
                };
            })
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [movements, items, personnel, selectedProjectId]);

    // Resumen acumulado por material
    const materialSummary = useMemo(() => {
        const summary: { [key: string]: { name: string, quantity: number, cost: number } } = {};
        detailedMovements.forEach(m => {
            if (!summary[m.itemId]) {
                summary[m.itemId] = { name: m.itemName, quantity: 0, cost: 0 };
            }
            summary[m.itemId].quantity += m.quantity;
            summary[m.itemId].cost += m.subtotal;
        });
        return Object.values(summary).sort((a, b) => b.cost - a.cost);
    }, [detailedMovements]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        onAddProject({ name: newProjectName, description: newProjectDesc, status: 'active' });
        setIsAdding(false);
        setNewProjectName('');
        setNewProjectDesc('');
    };

    if (selectedProject) {
        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-blue-600">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center">
                            <button onClick={() => setSelectedProjectId(null)} className="mr-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
                                <ArrowLeftIcon className="w-6 h-6 text-gray-700" />
                            </button>
                            <div>
                                <h2 className="text-3xl font-extrabold text-gray-900 uppercase tracking-tight">{selectedProject.name}</h2>
                                <p className="text-gray-500 font-medium">Historial completo de gastos y materiales</p>
                            </div>
                        </div>
                        <div className="bg-blue-50 px-6 py-4 rounded-xl border border-blue-100 flex flex-col items-center justify-center">
                            <span className="text-[10px] text-blue-600 font-black uppercase tracking-widest">Inversión Total en Obra</span>
                            <span className="text-4xl font-black text-blue-700">${selectedProject.totalCost.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Tabla de Desglose Paso a Paso */}
                    <div className="lg:col-span-2 bg-white rounded-xl shadow-md overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-700 flex items-center">
                                <ClockIcon className="w-5 h-5 mr-2 text-blue-500" />
                                Bitácora de Salidas
                            </h3>
                            <span className="text-xs font-bold text-gray-400">{detailedMovements.length} movimientos</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Fecha / Personal</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Material</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase">Cant.</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase">Gasto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {detailedMovements.map(m => (
                                        <tr key={m.id} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="text-[11px] font-bold text-gray-800">{new Date(m.timestamp).toLocaleDateString()}</div>
                                                <div className="text-[10px] text-gray-500 truncate w-32">{m.personName}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-sm font-bold text-gray-900">{m.itemName}</div>
                                                {m.isLoan && <span className="text-[9px] bg-orange-100 text-orange-700 px-1 rounded font-bold">PRÉSTAMO</span>}
                                            </td>
                                            <td className="px-4 py-3 text-center font-black text-gray-700">{m.quantity}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="text-sm font-black text-blue-600">${m.subtotal.toLocaleString()}</div>
                                                <div className="text-[9px] text-gray-400">${m.price.toFixed(2)} c/u</div>
                                            </td>
                                        </tr>
                                    ))}
                                    {detailedMovements.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-20 text-center text-gray-400 italic">No se han registrado retiros para esta obra.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Resumen Acumulado por Insumo */}
                    <div className="bg-white rounded-xl shadow-md overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b">
                            <h3 className="font-bold text-gray-700">Resumen por Material</h3>
                        </div>
                        <div className="p-4 space-y-4">
                            {materialSummary.map(mat => (
                                <div key={mat.name} className="flex flex-col border-b border-gray-100 pb-2">
                                    <div className="flex justify-between items-start">
                                        <span className="text-sm font-bold text-gray-800 truncate w-48">{mat.name}</span>
                                        <span className="text-sm font-black text-blue-600">${mat.cost.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                        <span>Total consumido:</span>
                                        <span className="font-bold">{mat.quantity} unidades</span>
                                    </div>
                                    <div className="mt-2 w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-blue-500 h-full rounded-full" 
                                            style={{ width: `${Math.min((mat.cost / (selectedProject.totalCost || 1)) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                            {materialSummary.length === 0 && (
                                <p className="text-center py-10 text-gray-400 text-sm">Sin datos acumulados.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center">
                 <div className="flex items-center mb-4 md:mb-0">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                        <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 flex items-center">
                            <HardHatIcon className="w-8 h-8 mr-2 text-yellow-600"/>
                            PROYECTOS Y OBRAS
                        </h2>
                        <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Control de costos y materiales por proyecto</p>
                    </div>
                </div>
                {userRole === UserRole.OWNER && !isAdding && (
                    <button onClick={() => setIsAdding(true)} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-black py-3 px-6 rounded-xl shadow-lg transition-all transform hover:scale-105">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        CREAR NUEVA OBRA
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="p-6 bg-white rounded-xl shadow-xl border-2 border-blue-500 animate-in slide-in-from-top duration-300">
                    <h3 className="font-black text-gray-800 mb-6 text-xl uppercase">Registrar Nueva Obra en el Sistema</h3>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Nombre de la Obra</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Edificio Miramar Piso 5"
                                    value={newProjectName}
                                    onChange={e => setNewProjectName(e.target.value)}
                                    className="w-full p-4 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-700 transition-colors"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Descripción General / Ubicación</label>
                                <input
                                    type="text"
                                    placeholder="Opcional"
                                    value={newProjectDesc}
                                    onChange={e => setNewProjectDesc(e.target.value)}
                                    className="w-full p-4 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-700 transition-colors"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end space-x-4">
                            <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">DESCARTAR</button>
                            <button type="submit" className="px-8 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 shadow-md">CONFIRMAR Y CREAR</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projectStats.map(project => (
                    <div 
                        key={project.id} 
                        onClick={() => setSelectedProjectId(project.id)}
                        className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-blue-500 hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-4">
                            <span className="bg-green-100 text-green-700 text-[9px] font-black px-3 py-1 rounded-full uppercase">En Obra</span>
                        </div>
                        <h3 className="font-black text-xl text-gray-800 group-hover:text-blue-600 transition-colors uppercase leading-tight mb-2 pr-16">{project.name}</h3>
                        <p className="text-xs text-gray-500 font-medium mb-8 h-8 line-clamp-2 uppercase tracking-wide">{project.description || 'SIN DESCRIPCIÓN REGISTRADA'}</p>
                        
                        <div className="grid grid-cols-2 gap-4 border-t pt-4">
                            <div>
                                <span className="text-[9px] text-gray-400 font-black uppercase block mb-1">Insumos Salidos</span>
                                <span className="text-lg font-black text-gray-700">{project.totalItems}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-[9px] text-gray-400 font-black uppercase block mb-1">Gasto Total</span>
                                <span className="text-lg font-black text-blue-600">${project.totalCost.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="mt-6 w-full py-3 bg-gray-50 group-hover:bg-blue-600 text-blue-600 group-hover:text-white rounded-xl text-center text-xs font-black transition-all uppercase tracking-widest">
                            VER DETALLES DE GASTOS
                        </div>
                    </div>
                ))}
            </div>
            {projects.length === 0 && (
                <div className="text-center py-32 bg-white rounded-3xl border-2 border-dashed border-gray-200">
                    <HardHatIcon className="w-20 h-20 mx-auto mb-6 opacity-10 text-gray-800"/>
                    <p className="text-xl font-bold text-gray-400 uppercase tracking-tighter">No hay obras registradas. Comience creando una nueva arriba.</p>
                </div>
            )}
        </div>
    );
};

const ClockIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
