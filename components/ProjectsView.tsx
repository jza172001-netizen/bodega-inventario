
import React, { useState, useMemo } from 'react';
import { Project, Movement, Item, UserRole, MovementType, Personnel, InventoryType } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';

interface ProjectsViewProps {
    projects: Project[];
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    onAddProject: (project: Omit<Project, 'id'>) => void;
    onDeleteProject?: (id: string) => void;
    onGoBack: () => void;
    userRole: UserRole;
    showEconomicValues?: boolean;
}

const MOV_LABEL: Record<string, string> = {
    PURCHASE: 'Compra',
    CHECK_IN:  'Entrada',
    CHECK_OUT: 'Salida',
    WASTE:     'Merma',
};

const MOV_COLOR: Record<string, string> = {
    PURCHASE: 'bg-green-100 text-green-700',
    CHECK_IN:  'bg-blue-100 text-blue-700',
    CHECK_OUT: 'bg-yellow-100 text-yellow-700',
    WASTE:     'bg-red-100 text-red-700',
};

const LOAN_TYPES = new Set([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL]);
const CONSUMABLE_TYPES = new Set([InventoryType.SINGLE_USE, InventoryType.PPE]);

// ── Project detail ───────────────────────────────────────────────────────────
const ProjectDetail: React.FC<{
    project: Project;
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    onBack: () => void;
    showEconomicValues: boolean;
}> = ({ project, movements, items, personnel, onBack, showEconomicValues }) => {
    const [historyOpen, setHistoryOpen] = useState(false);

    const pMovements = useMemo(
        () => movements.filter(m => m.projectId === project.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
        [movements, project.id]
    );

    const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);
    const itemMap     = useMemo(() => new Map(items.map(i => [i.id, i])),     [items]);

    // Unique workers
    const workerSummary = useMemo(() => {
        const ids = [...new Set(pMovements.filter(m => m.personnelId).map(m => m.personnelId!))];
        return ids.map(id => {
            const person = personnelMap.get(id);
            const wMov = pMovements.filter(m => m.personnelId === id);
            const activeLoans = wMov.filter(m => m.isLoan && !m.isReturned);
            const returnedLoans = wMov.filter(m => m.isLoan && m.isReturned);
            const consumables = wMov.filter(m => {
                const it = itemMap.get(m.itemId);
                return it && CONSUMABLE_TYPES.has(it.inventoryType);
            });
            return { id, person, activeLoans, returnedLoans, consumables, total: wMov.length };
        });
    }, [pMovements, personnelMap, itemMap]);

    // Active loans for this project
    const activeLoans = useMemo(
        () => pMovements.filter(m => m.isLoan && !m.isReturned),
        [pMovements]
    );

    // Consumables aggregated
    const consumablesUsed = useMemo(() => {
        const map = new Map<string, { name: string; qty: number; unit: string; price: number }>();
        pMovements
            .filter(m => m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE)
            .forEach(m => {
                const it = itemMap.get(m.itemId);
                if (!it || !CONSUMABLE_TYPES.has(it.inventoryType)) return;
                const existing = map.get(m.itemId);
                if (existing) existing.qty += m.quantity;
                else map.set(m.itemId, { name: it.name, qty: m.quantity, unit: it.unit, price: it.price ?? 0 });
            });
        return [...map.values()].sort((a, b) => b.qty - a.qty);
    }, [pMovements, itemMap]);

    const totalCost = useMemo(
        () => consumablesUsed.reduce((s, c) => s + c.qty * c.price, 0),
        [consumablesUsed]
    );

    const toolsOut = useMemo(
        () => pMovements.filter(m => {
            const it = itemMap.get(m.itemId);
            return it && LOAN_TYPES.has(it.inventoryType);
        }),
        [pMovements, itemMap]
    );

    const fmt = (d: string | Date) => new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0">
                        <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight truncate">{project.name}</h2>
                        {project.description && <p className="text-xs text-gray-400 mt-0.5">{project.description}</p>}
                    </div>
                    <span className={`flex-shrink-0 ml-auto text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {project.status === 'active' ? 'Activo' : 'Terminado'}
                    </span>
                </div>
                {/* Summary chips */}
                <div className="flex flex-wrap gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full">
                        <span>👷</span>{workerSummary.length} persona{workerSummary.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-full">
                        <span>🔑</span>{activeLoans.length} préstamo{activeLoans.length !== 1 ? 's' : ''} activo{activeLoans.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold bg-orange-50 text-orange-700 px-3 py-1.5 rounded-full">
                        <span>🔨</span>{toolsOut.length} uso{toolsOut.length !== 1 ? 's' : ''} de herramienta{toolsOut.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full">
                        <span>📦</span>{consumablesUsed.reduce((s, c) => s + c.qty, 0)} consumibles
                    </span>
                </div>
            </div>

            {/* Personal involucrado */}
            {workerSummary.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-5 pt-4 pb-2">👷 Personal involucrado</p>
                    <div className="divide-y divide-gray-50">
                        {workerSummary.map(({ id, person, activeLoans: al, returnedLoans, consumables }) => (
                            <div key={id} className="px-5 py-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 font-black text-sm flex items-center justify-center flex-shrink-0">
                                            {person?.name?.[0]?.toUpperCase() ?? '?'}
                                        </div>
                                        <span className="font-bold text-sm text-gray-900">{person?.name ?? 'Desconocido'}</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] font-bold">
                                        {al.length > 0 && <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{al.length} activo{al.length !== 1 ? 's' : ''}</span>}
                                        {returnedLoans.length > 0 && <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{returnedLoans.length} devuelto{returnedLoans.length !== 1 ? 's' : ''}</span>}
                                        {consumables.length > 0 && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{consumables.reduce((s, m) => s + m.quantity, 0)} cons.</span>}
                                    </div>
                                </div>
                                {al.length > 0 && (
                                    <div className="mt-2 ml-10 space-y-1">
                                        {al.map(m => {
                                            const it = itemMap.get(m.itemId);
                                            return (
                                                <p key={m.id} className="text-xs text-yellow-700 font-semibold flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                                                    {it?.name ?? m.itemId} — desde {fmt(m.timestamp)}
                                                </p>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Préstamos activos */}
            {activeLoans.length > 0 && (
                <div className="bg-white border border-yellow-200 rounded-2xl shadow-sm overflow-hidden">
                    <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest px-5 pt-4 pb-2">🔑 Préstamos activos</p>
                    <div className="divide-y divide-yellow-50">
                        {activeLoans.map(m => {
                            const it = itemMap.get(m.itemId);
                            const worker = personnelMap.get(m.personnelId ?? '');
                            const days = Math.floor((Date.now() - new Date(m.timestamp).getTime()) / 86400000);
                            return (
                                <div key={m.id} className="px-5 py-3 flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-sm text-gray-900">{it?.name ?? '—'}</p>
                                        {worker && <p className="text-xs text-gray-500 mt-0.5">Con {worker.name}</p>}
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-full ${days > 7 ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {days === 0 ? 'hoy' : `hace ${days}d`}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Materiales consumidos */}
            {consumablesUsed.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-5 pt-4 pb-2">📦 Materiales consumidos</p>
                    <div className="divide-y divide-gray-50">
                        {consumablesUsed.map((c, i) => (
                            <div key={i} className="px-5 py-3 flex items-center justify-between">
                                <span className="text-sm text-gray-800 font-semibold">{c.name}</span>
                                <div className="text-right">
                                    <span className="font-black text-gray-900 text-sm">{c.qty} <span className="font-normal text-xs text-gray-400">{c.unit}</span></span>
                                    {showEconomicValues && c.price > 0 && (
                                        <p className="text-[10px] text-gray-400">${(c.qty * c.price).toLocaleString('es-CO')}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                        {showEconomicValues && totalCost > 0 && (
                            <div className="px-5 py-3 flex items-center justify-between bg-gray-50">
                                <span className="text-xs font-black text-gray-700 uppercase tracking-wider">Total estimado</span>
                                <span className="font-black text-gray-900">${totalCost.toLocaleString('es-CO')}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Historial completo (colapsable) */}
            {pMovements.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                    <button
                        onClick={() => setHistoryOpen(o => !o)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">📋 Historial completo ({pMovements.length})</p>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                    </button>
                    {historyOpen && (
                        <div className="divide-y divide-gray-50 border-t border-gray-100">
                            {pMovements.map(m => {
                                const it   = itemMap.get(m.itemId);
                                const worker = personnelMap.get(m.personnelId ?? '');
                                const label = m.isLoan ? (m.isReturned ? 'Devuelto' : 'Préstamo') : (MOV_LABEL[m.type] ?? m.type);
                                const color = m.isLoan && !m.isReturned ? 'bg-yellow-100 text-yellow-700' : (MOV_COLOR[m.type] ?? 'bg-gray-100 text-gray-600');
                                return (
                                    <div key={m.id} className="px-5 py-2.5 flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-gray-400 w-14 flex-shrink-0">{fmt(m.timestamp)}</span>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${color}`}>{label}</span>
                                        <span className="text-sm text-gray-800 font-semibold truncate flex-1">{it?.name ?? '—'}</span>
                                        <span className="text-xs text-gray-500 flex-shrink-0">{m.quantity} {it?.unit ?? ''}</span>
                                        {worker && <span className="text-xs text-gray-400 truncate hidden sm:block">{worker.name}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {pMovements.length === 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-gray-400 text-sm shadow-sm">
                    Sin movimientos registrados para este proyecto aún.
                </div>
            )}
        </div>
    );
};

// ── Projects list ─────────────────────────────────────────────────────────────
export const ProjectsView: React.FC<ProjectsViewProps> = ({
    projects, movements, items, personnel, onAddProject, onDeleteProject, onGoBack, userRole, showEconomicValues = false,
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

    const projectStats = useMemo(() => {
        return projects.map(project => {
            const pm = movements.filter(m => m.projectId === project.id && (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE));
            const consumableCount = pm.reduce((acc, m) => {
                const item = items.find(i => i.id === m.itemId);
                return item && CONSUMABLE_TYPES.has(item.inventoryType) ? acc + m.quantity : acc;
            }, 0);
            const toolsCount = pm.filter(m => {
                const item = items.find(i => i.id === m.itemId);
                return item && LOAN_TYPES.has(item.inventoryType);
            }).length;
            const activeLoans = movements.filter(m => m.projectId === project.id && m.isLoan && !m.isReturned).length;
            const workerCount = new Set(movements.filter(m => m.projectId === project.id && m.personnelId).map(m => m.personnelId!)).size;
            return { ...project, consumableCount, toolsCount, activeLoans, workerCount };
        });
    }, [projects, movements, items]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        onAddProject({ name: newProjectName.trim(), description: newProjectDesc.trim(), status: 'active' });
        setIsAdding(false);
        setNewProjectName('');
        setNewProjectDesc('');
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    if (selectedProject) {
        return (
            <ProjectDetail
                project={selectedProject}
                movements={movements}
                items={items}
                personnel={personnel}
                onBack={() => setSelectedProjectId(null)}
                showEconomicValues={showEconomicValues}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onGoBack} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                        <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
                    </button>
                    <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">Obras / Proyectos</h2>
                </div>
                {userRole === UserRole.OWNER && (
                    <button onClick={() => setIsAdding(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-4 rounded-xl text-xs uppercase tracking-wider transition-colors">
                        <PlusIcon className="w-4 h-4" /> Nueva
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="bg-white border-2 border-blue-500 rounded-2xl p-5 shadow-sm">
                    <h3 className="font-black text-gray-900 mb-4 text-base uppercase tracking-tight">Nueva obra / proyecto</h3>
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <input type="text" placeholder="Nombre de la obra" value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                            className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-400 text-sm" required />
                        <input type="text" placeholder="Ubicación / descripción (opcional)" value={newProjectDesc} onChange={e => setNewProjectDesc(e.target.value)}
                            className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-400 text-sm" />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setIsAdding(false)} className="px-5 py-2 text-gray-400 font-bold text-sm hover:text-gray-600">Cancelar</button>
                            <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-black rounded-xl text-xs uppercase">Guardar</button>
                        </div>
                    </form>
                </div>
            )}

            {projects.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm">
                    <p className="text-4xl mb-3">🏗</p>
                    <p className="text-gray-500 text-sm font-semibold">Sin proyectos registrados</p>
                    <p className="text-gray-400 text-xs mt-1">Crea una obra para asociar movimientos y personal</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projectStats.map(project => (
                        <div key={project.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer relative group">
                            {onDeleteProject && userRole === UserRole.OWNER && (
                                <button
                                    onClick={e => { e.stopPropagation(); if (window.confirm('¿Borrar obra?')) onDeleteProject(project.id); }}
                                    className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            )}
                            <div onClick={() => setSelectedProjectId(project.id)}>
                                <div className="flex items-start justify-between mb-3">
                                    <h3 className="font-black text-base text-gray-900 uppercase leading-tight pr-6">{project.name}</h3>
                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                        {project.status === 'active' ? 'Activo' : 'Terminado'}
                                    </span>
                                </div>
                                {project.description && <p className="text-xs text-gray-400 mb-3 truncate">{project.description}</p>}
                                <div className="grid grid-cols-2 gap-2 border-t border-gray-50 pt-3">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">👷</span>
                                        <div>
                                            <span className="text-xs font-black text-gray-800">{project.workerCount}</span>
                                            <span className="text-[10px] text-gray-400 ml-1">personas</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">🔑</span>
                                        <div>
                                            <span className={`text-xs font-black ${project.activeLoans > 0 ? 'text-yellow-600' : 'text-gray-800'}`}>{project.activeLoans}</span>
                                            <span className="text-[10px] text-gray-400 ml-1">activos</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">🔨</span>
                                        <div>
                                            <span className="text-xs font-black text-gray-800">{project.toolsCount}</span>
                                            <span className="text-[10px] text-gray-400 ml-1">herramientas</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">📦</span>
                                        <div>
                                            <span className="text-xs font-black text-blue-600">{project.consumableCount}</span>
                                            <span className="text-[10px] text-gray-400 ml-1">uds.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
