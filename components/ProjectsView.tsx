
import React, { useState, useMemo } from 'react';
import { Project, Movement, Item, UserRole, MovementType, Personnel, InventoryType } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { HardHatIcon } from './icons/HardHatIcon';
import { ClockIcon } from './icons/ClockIcon';

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

    // Formato de moneda COP
    const formatCOP = (val: number) => `$${val.toLocaleString('es-CO')}`;

    // Calcular costos solo para materiales de consumo y EPP
    const projectStats = useMemo(() => {
        return projects.map(project => {
            const projectMovements = movements.filter(m => m.projectId === project.id && (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE));
            
            // Solo sumamos costo si es material de consumo o EPP
            const totalExpense = projectMovements.reduce((acc, m) => {
                const item = items.find(i => i.id === m.itemId);
                if (item && (item.inventoryType === InventoryType.SINGLE_USE || item.inventoryType === InventoryType.PPE)) {
                    return acc + (item.price * m.quantity);
                }
                return acc;
            }, 0);

            // Contamos herramientas vinculadas
            const linkedToolsCount = projectMovements.filter(m => {
                const item = items.find(i => i.id === m.itemId);
                return item && (item.inventoryType === InventoryType.HAND_TOOL || item.inventoryType === InventoryType.ELECTRICAL_TOOL);
            }).length;

            return { ...project, totalExpense, linkedToolsCount };
        });
    }, [projects, movements, items]);

    const selectedProject = useMemo(() => 
        projectStats.find(p => p.id === selectedProjectId), 
    [projectStats, selectedProjectId]);

    const detailedData = useMemo(() => {
        if (!selectedProjectId) return { expenses: [], tools: [] };
        
        const projMoves = movements.filter(m => m.projectId === selectedProjectId && (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE));
        
        const expenses: any[] = [];
        const tools: any[] = [];

        projMoves.forEach(m => {
            const item = items.find(i => i.id === m.itemId);
            const person = personnel.find(p => p.id === m.personnelId);
            const data = {
                ...m,
                itemName: item?.name || 'Desconocido',
                personName: person?.name || 'N/A',
                unitPrice: item?.price || 0,
                subtotal: (item?.price || 0) * m.quantity
            };

            if (item && (item.inventoryType === InventoryType.HAND_TOOL || item.inventoryType === InventoryType.ELECTRICAL_TOOL)) {
                tools.push(data);
            } else {
                expenses.push(data);
            }
        });

        return { expenses, tools };
    }, [movements, items, personnel, selectedProjectId]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        onAddProject({ name: newProjectName.trim(), description: newProjectDesc.trim(), status: 'active' });
        setIsAdding(false);
        setNewProjectName('');
        setNewProjectDesc('');
    };

    if (selectedProject) {
        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="bg-white p-6 rounded-3xl shadow-xl border-l-8 border-blue-600">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center">
                            <button onClick={() => setSelectedProjectId(null)} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                                <ArrowLeftIcon className="w-7 h-7 text-gray-700" />
                            </button>
                            <div>
                                <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">{selectedProject.name}</h2>
                                <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Desglose Técnico de Obra</p>
                            </div>
                        </div>
                        <div className="text-right bg-blue-50 px-8 py-5 rounded-2xl border border-blue-100">
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Inversión en Materiales (COP)</p>
                            <p className="text-4xl font-black text-blue-700">{formatCOP(selectedProject.totalExpense)}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* SECCIÓN GASTOS: MATERIALES */}
                    <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                        <div className="p-5 bg-gray-50 border-b flex justify-between items-center">
                            <h3 className="font-black text-xs text-gray-700 uppercase tracking-widest">Consumo de Materiales y EPP</h3>
                            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-black">COSTOS</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Material / Personal</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase">Cant.</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase">Gasto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {detailedData.expenses.map(e => (
                                        <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="text-sm font-bold text-gray-900">{e.itemName}</div>
                                                <div className="text-[10px] text-gray-500 font-bold uppercase">{e.personName}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm font-black text-gray-700">{e.quantity}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="text-sm font-black text-blue-600">{formatCOP(e.subtotal)}</div>
                                            </td>
                                        </tr>
                                    ))}
                                    {detailedData.expenses.length === 0 && (
                                        <tr><td colSpan={3} className="py-20 text-center text-gray-400 font-bold uppercase text-[10px]">Sin gastos registrados</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* SECCIÓN ACTIVOS: HERRAMIENTAS */}
                    <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                        <div className="p-5 bg-gray-50 border-b flex justify-between items-center">
                            <h3 className="font-black text-xs text-gray-700 uppercase tracking-widest">Herramientas en Operación</h3>
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-black">ACTIVOS</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Herramienta / Responsable</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase">Cant.</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {detailedData.tools.map(t => (
                                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="text-sm font-bold text-gray-900">{t.itemName}</div>
                                                <div className="text-[10px] text-gray-500 font-bold uppercase">{t.personName}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm font-black text-gray-700">{t.quantity}</td>
                                            <td className="px-4 py-3 text-right">
                                                {t.isReturned ? (
                                                    <span className="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-black uppercase">EN BODEGA</span>
                                                ) : (
                                                    <span className="text-[9px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-black uppercase">EN USO</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {detailedData.tools.length === 0 && (
                                        <tr><td colSpan={3} className="py-20 text-center text-gray-400 font-bold uppercase text-[10px]">No hay herramientas vinculadas</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center border border-gray-100">
                 <div className="flex items-center mb-4 md:mb-0">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                        <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 flex items-center tracking-tighter uppercase">Gestión de Obras</h2>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Consolidado de activos y materiales por proyecto</p>
                    </div>
                </div>
                {userRole === UserRole.OWNER && !isAdding && (
                    <button onClick={() => setIsAdding(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-black py-3 px-6 rounded-2xl shadow-lg transition-all transform hover:scale-105 uppercase text-xs">
                        Nueva Obra
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="bg-white p-8 rounded-3xl shadow-xl border-2 border-blue-500 animate-in slide-in-from-top duration-300">
                    <h3 className="font-black text-gray-900 mb-6 text-xl uppercase tracking-tighter">Registrar Nueva Obra en el Sistema</h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                type="text"
                                placeholder="Nombre de la Obra (Ej: Torre B Apartamento 402)"
                                value={newProjectName}
                                onChange={e => setNewProjectName(e.target.value)}
                                className="w-full p-4 border-2 border-gray-100 rounded-2xl focus:border-blue-500 outline-none font-bold text-gray-700"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Ubicación o Detalle Corto"
                                value={newProjectDesc}
                                onChange={e => setNewProjectDesc(e.target.value)}
                                className="w-full p-4 border-2 border-gray-100 rounded-2xl focus:border-blue-500 outline-none font-bold text-gray-700"
                            />
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-2 text-gray-400 font-bold">Cancelar</button>
                            <button type="submit" className="px-8 py-2 bg-blue-600 text-white font-black rounded-xl uppercase text-xs">Guardar Obra</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projectStats.map(project => (
                    <div 
                        key={project.id} 
                        onClick={() => setSelectedProjectId(project.id)}
                        className="group bg-white border border-gray-100 rounded-[2.5rem] p-7 hover:border-blue-500 hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-6">
                            <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                <HardHatIcon className="w-6 h-6 text-gray-300 group-hover:text-blue-500" />
                            </div>
                        </div>
                        <h3 className="font-black text-xl text-gray-900 group-hover:text-blue-600 transition-colors uppercase leading-tight mb-2 pr-16">{project.name}</h3>
                        <p className="text-xs text-gray-400 font-bold h-8 line-clamp-2 uppercase tracking-wide mb-8">{project.description || 'Sin descripción técnica'}</p>
                        
                        <div className="grid grid-cols-2 gap-4 border-t border-gray-50 pt-6">
                            <div>
                                <span className="text-[9px] text-gray-400 font-black uppercase block mb-1">Activos Vinculados</span>
                                <span className="text-lg font-black text-gray-800">{project.linkedToolsCount} herramientas</span>
                            </div>
                            <div className="text-right">
                                <span className="text-[9px] text-gray-400 font-black uppercase block mb-1">Gasto Materiales</span>
                                <span className="text-lg font-black text-blue-600">{formatCOP(project.totalExpense)}</span>
                            </div>
                        </div>
                        <div className="mt-8 py-3 bg-gray-50 group-hover:bg-blue-600 text-gray-400 group-hover:text-white rounded-2xl text-center text-[10px] font-black transition-all uppercase tracking-widest">
                            Ver Desglose de Gastos
                        </div>
                    </div>
                ))}
            </div>
            {projects.length === 0 && (
                <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-gray-100">
                    <p className="text-xl font-bold text-gray-300 uppercase tracking-tighter">No hay obras registradas en el sistema.</p>
                </div>
            )}
        </div>
    );
};
