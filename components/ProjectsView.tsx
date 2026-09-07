
import React, { useState, useMemo } from 'react';
import { Project, Movement, Item, UserRole, MovementType, Personnel, InventoryType } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { PersonnelDetailModal } from './PersonnelDetailModal';
import { TrashIcon } from './icons/TrashIcon';
import { looseMatch } from '../utils/genus';

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
    /** Los mismos de Personal: acá adentro la ficha y el histórico son los de siempre. */
    onItemHistory?: (item: Item) => void;
    onReturnLoan?: (movementId: string, condition?: string, notes?: string) => void;
    onMarkPendingPickup?: (movementId: string, pending: boolean) => void;
    onAssignProject?: (movementId: string, projectId: string) => void;
    onCreateProject?: (name: string) => Project;
    onTransferLoan?: (movementId: string, newPersonnelId: string) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

const MOV_LABEL: Record<string, string> = {
    PURCHASE: 'Compra',
    CHECK_IN:  'Entrada',
    CHECK_OUT: 'Salida',
    WASTE:     'Merma',
};

const MOV_COLOR: Record<string, string> = {
    PURCHASE: 'bg-bien-suave text-bien',
    CHECK_IN:  'bg-marca-suave text-marca-oscuro',
    CHECK_OUT: 'bg-atencion-suave text-atencion',
    WASTE:     'bg-alerta-suave text-alerta',
};

/**
 * Un número del encabezado del proyecto, que ahora sí lleva a alguna parte.
 *
 * Si la sección de destino no existe —un proyecto sin consumibles, por
 * ejemplo— el chip se queda quieto y sin sombra de botón, para no prometer un
 * salto que no va a pasar.
 */
const ChipResumen: React.FC<{ emoji: string; texto: string; destino: string; tono: 'marca' | 'atencion' }> = ({ emoji, texto, destino, tono }) => {
    const color = tono === 'marca' ? 'bg-marca-suave text-marca-oscuro' : 'bg-atencion-suave text-atencion';
    const irA = () => document.getElementById(destino)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return (
        <button type="button" onClick={irA}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all hover:brightness-95 active:scale-95 ${color}`}>
            <span>{emoji}</span>{texto}
        </button>
    );
};

const LOAN_TYPES = new Set([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL]);
const CONSUMABLE_TYPES = new Set([InventoryType.SINGLE_USE, InventoryType.PPE]);

// ── Project detail ───────────────────────────────────────────────────────────
const ProjectDetail: React.FC<{
    project: Project;
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    projects: Project[];
    onBack: () => void;
    showEconomicValues: boolean;
    onItemHistory?: (item: Item) => void;
    onReturnLoan?: (movementId: string, condition?: string, notes?: string) => void;
    onMarkPendingPickup?: (movementId: string, pending: boolean) => void;
    onAssignProject?: (movementId: string, projectId: string) => void;
    onCreateProject?: (name: string) => Project;
    onTransferLoan?: (movementId: string, newPersonnelId: string) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
    /** Para que la ficha de la persona sepa si quien mira puede actuar. */
    userRole: UserRole;
}> = ({ project, movements, items, personnel, projects, onBack, showEconomicValues,
       onItemHistory, onReturnLoan, onMarkPendingPickup, onAssignProject, onCreateProject,
       onTransferLoan, onBehaviorLog, userRole }) => {
    const [historyOpen, setHistoryOpen] = useState(false);
    // Acá adentro no se podía tocar nada: los nombres eran texto muerto. Son los
    // mismos datos que en Préstamos y en Personal, así que abren lo mismo.
    const [fichaDe, setFichaDe] = useState<Personnel | null>(null);

    /** El nombre del ítem, tocable: abre su histórico. */
    const NombreDeItem: React.FC<{ item?: Item; texto?: string; className?: string }> = ({ item, texto, className = '' }) => {
        const etiqueta = texto ?? item?.name ?? '—';
        if (!item || !onItemHistory) return <span className={className}>{etiqueta}</span>;
        return (
            <button type="button"
                onClick={() => { onBehaviorLog?.('BUTTON', `Ver historial desde Proyecto: ${item.name}`); onItemHistory(item); }}
                className={`text-left hover:underline ${className}`}>
                {etiqueta}
            </button>
        );
    };

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
        const map = new Map<string, { itemId: string; name: string; qty: number; unit: string; price: number }>();
        pMovements
            .filter(m => m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE)
            .forEach(m => {
                const it = itemMap.get(m.itemId);
                if (!it || !CONSUMABLE_TYPES.has(it.inventoryType)) return;
                const existing = map.get(m.itemId);
                if (existing) existing.qty += m.quantity;
                else map.set(m.itemId, { itemId: m.itemId, name: it.name, qty: m.quantity, unit: it.unit, price: it.price ?? 0 });
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
            <div className="bg-papel border border-papel-borde rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-papel-hondo transition-colors flex-shrink-0">
                        <ArrowLeftIcon className="w-5 h-5 text-tinta-suave" />
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-xl font-black text-tinta uppercase tracking-tight truncate">{project.name}</h2>
                        {project.description && <p className="text-xs text-tinta-tenue mt-0.5">{project.description}</p>}
                    </div>
                    <span className={`flex-shrink-0 ml-auto text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${project.status === 'active' ? 'bg-bien-suave text-bien' : 'bg-papel-hondo text-tinta-tenue'}`}>
                        {project.status === 'active' ? 'Activo' : 'Terminado'}
                    </span>
                </div>
                {/* Los cuatro números de arriba eran letreros: se veían hundidos pero
                    no llevaban a ninguna parte, y todo lo demás de esta pantalla sí
                    responde. Ahora cada uno baja a su sección. */}
                <div className="flex flex-wrap gap-2">
                    <ChipResumen emoji="👷" tono="marca" destino={`proy-${project.id}-personal`}
                        texto={`${workerSummary.length} persona${workerSummary.length !== 1 ? 's' : ''}`} />
                    <ChipResumen emoji="🔑" tono="atencion" destino={`proy-${project.id}-prestamos`}
                        texto={`${activeLoans.length} préstamo${activeLoans.length !== 1 ? 's' : ''} activo${activeLoans.length !== 1 ? 's' : ''}`} />
                    <ChipResumen emoji="🔨" tono="atencion" destino={`proy-${project.id}-prestamos`}
                        texto={`${toolsOut.length} uso${toolsOut.length !== 1 ? 's' : ''} de herramienta${toolsOut.length !== 1 ? 's' : ''}`} />
                    <ChipResumen emoji="📦" tono="marca" destino={`proy-${project.id}-consumidos`}
                        texto={`${consumablesUsed.reduce((s, c) => s + c.qty, 0)} consumibles`} />
                </div>
            </div>

            {/* Personal involucrado */}
            {workerSummary.length > 0 && (
                <div id={`proy-${project.id}-personal`} className="bg-papel border border-papel-borde rounded-2xl shadow-sm overflow-hidden scroll-mt-4">
                    <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest px-5 pt-4 pb-2">👷 Personal involucrado</p>
                    <div className="divide-y divide-papel-borde">
                        {workerSummary.map(({ id, person, activeLoans: al, returnedLoans, consumables }) => (
                            <div key={id} className="px-5 py-3">
                                <div className="flex items-center justify-between">
                                    <button type="button" disabled={!person}
                                        onClick={() => { if (!person) return; onBehaviorLog?.('BUTTON', `Abrió ficha desde Proyecto: ${person.name}`); setFichaDe(person); }}
                                        className="flex items-center gap-2 min-w-0 text-left disabled:cursor-default">
                                        <div className="w-8 h-8 rounded-xl bg-marca-suave text-marca-oscuro font-black text-sm flex items-center justify-center flex-shrink-0">
                                            {person?.name?.[0]?.toUpperCase() ?? '?'}
                                        </div>
                                        <span className="font-bold text-sm text-tinta truncate">{person?.name ?? 'Desconocido'}</span>
                                        {person && <span className="text-tinta-tenue text-xs flex-shrink-0">›</span>}
                                    </button>
                                    <div className="flex gap-2 text-[10px] font-bold">
                                        {al.length > 0 && <span className="bg-atencion-suave text-atencion px-2 py-0.5 rounded-full">{al.length} activo{al.length !== 1 ? 's' : ''}</span>}
                                        {returnedLoans.length > 0 && <span className="bg-papel-hondo text-tinta-tenue px-2 py-0.5 rounded-full">{returnedLoans.length} devuelto{returnedLoans.length !== 1 ? 's' : ''}</span>}
                                        {consumables.length > 0 && <span className="bg-marca-suave text-marca-oscuro px-2 py-0.5 rounded-full">{consumables.reduce((s, m) => s + m.quantity, 0)} cons.</span>}
                                    </div>
                                </div>
                                {al.length > 0 && (
                                    <div className="mt-2 ml-10 space-y-1">
                                        {al.map(m => {
                                            const it = itemMap.get(m.itemId);
                                            return (
                                                <p key={m.id} className="text-xs text-atencion font-semibold flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-atencion flex-shrink-0" />
                                                    <NombreDeItem item={it} texto={`${it?.name ?? m.itemId} — desde ${fmt(m.timestamp)}`} />
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
                <div id={`proy-${project.id}-prestamos`} className="bg-papel border border-atencion rounded-2xl shadow-sm overflow-hidden scroll-mt-4">
                    <p className="text-[10px] font-black text-atencion uppercase tracking-widest px-5 pt-4 pb-2">🔑 Préstamos activos</p>
                    <div className="divide-y divide-atencion">
                        {activeLoans.map(m => {
                            const it = itemMap.get(m.itemId);
                            const worker = personnelMap.get(m.personnelId ?? '');
                            const days = Math.floor((Date.now() - new Date(m.timestamp).getTime()) / 86400000);
                            return (
                                <div key={m.id} className="px-5 py-3 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <NombreDeItem item={it} className="font-bold text-sm text-tinta block truncate" />
                                        {worker && (
                                            <button type="button"
                                                onClick={() => { onBehaviorLog?.('BUTTON', `Abrió ficha desde Proyecto: ${worker.name}`); setFichaDe(worker); }}
                                                className="text-xs text-tinta-tenue mt-0.5 hover:text-marca-oscuro hover:underline">
                                                Con {worker.name} ›
                                            </button>
                                        )}
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-full ${days > 7 ? 'bg-alerta-suave text-alerta' : 'bg-atencion-suave text-atencion'}`}>
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
                <div id={`proy-${project.id}-consumidos`} className="bg-papel border border-papel-borde rounded-2xl shadow-sm overflow-hidden scroll-mt-4">
                    <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest px-5 pt-4 pb-2">📦 Materiales consumidos</p>
                    <div className="divide-y divide-papel-borde">
                        {consumablesUsed.map((c, i) => (
                            <div key={i} className="px-5 py-3 flex items-center justify-between">
                                <NombreDeItem item={itemMap.get(c.itemId)} texto={c.name} className="text-sm text-tinta font-semibold min-w-0 truncate" />
                                <div className="text-right">
                                    <span className="font-black text-tinta text-sm">{c.qty} <span className="font-normal text-xs text-tinta-tenue">{c.unit}</span></span>
                                    {showEconomicValues && c.price > 0 && (
                                        <p className="text-[10px] text-tinta-tenue">${(c.qty * c.price).toLocaleString('es-CO')}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                        {showEconomicValues && totalCost > 0 && (
                            <div className="px-5 py-3 flex items-center justify-between bg-papel-hondo">
                                <span className="text-xs font-black text-tinta-suave uppercase tracking-wider">Total estimado</span>
                                <span className="font-black text-tinta">${totalCost.toLocaleString('es-CO')}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Historial completo (colapsable) */}
            {pMovements.length > 0 && (
                <div className="bg-papel border border-papel-borde rounded-2xl shadow-sm overflow-hidden">
                    <button
                        onClick={() => setHistoryOpen(o => !o)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-papel-hondo transition-colors"
                    >
                        <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest">📋 Historial completo ({pMovements.length})</p>
                        <svg className={`w-4 h-4 text-tinta-tenue transition-transform ${historyOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                    </button>
                    {historyOpen && (
                        <div className="divide-y divide-papel-borde border-t border-papel-borde">
                            {pMovements.map(m => {
                                const it   = itemMap.get(m.itemId);
                                const worker = personnelMap.get(m.personnelId ?? '');
                                const label = m.isLoan ? (m.isReturned ? 'Devuelto' : 'Préstamo') : (MOV_LABEL[m.type] ?? m.type);
                                const color = m.isLoan && !m.isReturned ? 'bg-atencion-suave text-atencion' : (MOV_COLOR[m.type] ?? 'bg-papel-hondo text-tinta-suave');
                                return (
                                    <div key={m.id} className="px-5 py-2.5 flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-tinta-tenue w-14 flex-shrink-0">{fmt(m.timestamp)}</span>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${color}`}>{label}</span>
                                        <NombreDeItem item={it} className="text-sm text-tinta font-semibold truncate flex-1" />
                                        <span className="text-xs text-tinta-tenue flex-shrink-0">{m.quantity} {it?.unit ?? ''}</span>
                                        {worker && (
                                            <button type="button" onClick={() => setFichaDe(worker)}
                                                className="text-xs text-tinta-tenue truncate hidden sm:block hover:text-marca-oscuro hover:underline">
                                                {worker.name}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {pMovements.length === 0 && (
                <div className="bg-papel border border-papel-borde rounded-2xl p-10 text-center text-tinta-tenue text-sm shadow-sm">
                    Sin movimientos registrados para este proyecto aún.
                </div>
            )}

            {/* La misma ficha de Personal: devolver, marcar a recoger, pasar la
                herramienta a otro. No hay una segunda versión de nada. */}
            {fichaDe && (
                <PersonnelDetailModal
                    person={fichaDe}
                    movements={movements}
                    items={items}
                    projects={projects}
                    allPersonnel={personnel}
                    onReturnLoan={onReturnLoan}
                    onMarkPendingPickup={onMarkPendingPickup}
                    onAssignProject={onAssignProject}
                    onCreateProject={onCreateProject}
                    onTransferLoan={onTransferLoan}
                    userRole={userRole}
                    onClose={() => setFichaDe(null)}
                />
            )}
        </div>
    );
};

// ── Projects list ─────────────────────────────────────────────────────────────
export const ProjectsView: React.FC<ProjectsViewProps> = ({
    projects, movements, items, personnel, onAddProject, onDeleteProject, onGoBack, userRole, showEconomicValues = false,
    onItemHistory, onReturnLoan, onMarkPendingPickup, onAssignProject, onCreateProject, onTransferLoan, onBehaviorLog,
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    // Cuarta lista con buscador, igual que Historial, Préstamos e Inventario.
    const [busqueda, setBusqueda] = useState('');

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

    const proyectosVisibles = useMemo(() => {
        if (!busqueda.trim()) return projectStats;
        return projectStats.filter(p =>
            looseMatch(p.name, busqueda) || looseMatch(p.description ?? '', busqueda));
    }, [projectStats, busqueda]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        onBehaviorLog?.('ACTION', `Creó proyecto: ${newProjectName.trim()}`);
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
                projects={projects}
                onBack={() => setSelectedProjectId(null)}
                showEconomicValues={showEconomicValues}
                onItemHistory={onItemHistory}
                onReturnLoan={onReturnLoan}
                onMarkPendingPickup={onMarkPendingPickup}
                onAssignProject={onAssignProject}
                onCreateProject={onCreateProject}
                onTransferLoan={onTransferLoan}
                onBehaviorLog={onBehaviorLog}
                userRole={userRole}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-papel border border-papel-borde rounded-2xl px-5 py-4 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onGoBack} className="p-2 rounded-full hover:bg-papel-hondo transition-colors">
                        <ArrowLeftIcon className="w-5 h-5 text-tinta-suave" />
                    </button>
                    <h2 className="text-lg font-black text-tinta uppercase tracking-tight">Obras / Proyectos</h2>
                </div>
                {userRole !== UserRole.VISITOR && (
                    <button onClick={() => setIsAdding(true)} className="flex items-center gap-1.5 bg-marca hover:bg-marca-fuerte text-tinta font-black py-2 px-4 rounded-xl text-xs uppercase tracking-wider transition-colors">
                        <PlusIcon className="w-4 h-4" /> Nueva
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="bg-papel border-2 border-marca rounded-2xl p-5 shadow-sm">
                    <h3 className="font-black text-tinta mb-4 text-base uppercase tracking-tight">Nueva obra / proyecto</h3>
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <input type="text" placeholder="Nombre de la obra" value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                            className="w-full p-3 border-2 border-papel-borde rounded-xl outline-none focus:border-marca text-sm" required />
                        <input type="text" placeholder="Ubicación / descripción (opcional)" value={newProjectDesc} onChange={e => setNewProjectDesc(e.target.value)}
                            className="w-full p-3 border-2 border-papel-borde rounded-xl outline-none focus:border-marca text-sm" />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setIsAdding(false)} className="px-5 py-2 text-tinta-tenue font-bold text-sm hover:text-tinta-suave">Cancelar</button>
                            <button type="submit" className="px-6 py-2 bg-marca text-tinta font-black rounded-xl text-xs uppercase">Guardar</button>
                        </div>
                    </form>
                </div>
            )}

            {projects.length > 0 && (
                <div className="relative">
                    <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar obra o proyecto…"
                        className="w-full text-sm border border-papel-borde rounded-xl pl-3 pr-8 py-2 bg-papel focus:outline-none focus:ring-2 focus:ring-marca" />
                    {busqueda && (
                        <button type="button" onClick={() => setBusqueda('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-tinta-tenue hover:text-alerta text-sm font-black">✕</button>
                    )}
                </div>
            )}

            {projects.length === 0 ? (
                <div className="bg-papel border border-papel-borde rounded-2xl p-10 text-center shadow-sm">
                    <p className="text-4xl mb-3">🏗</p>
                    <p className="text-tinta-tenue text-sm font-semibold">Sin proyectos registrados</p>
                    <p className="text-tinta-tenue text-xs mt-1">Crea una obra para asociar movimientos y personal</p>
                </div>
            ) : proyectosVisibles.length === 0 ? (
                <div className="bg-papel border border-papel-borde rounded-2xl p-10 text-center shadow-sm">
                    <p className="text-tinta-tenue text-sm font-semibold">Ninguna obra se llama así</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {proyectosVisibles.map(project => (
                        <div key={project.id} className="bg-papel border border-papel-borde rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer group">
                            <div onClick={() => { onBehaviorLog?.('NAV', `Abrió proyecto: ${project.name}`); setSelectedProjectId(project.id); }}>
                                {/* La papelera va EN la fila, no flotando encima: estaba en
                                    `absolute right-3`, que es exactamente donde cae la insignia
                                    de «Activo», y las dos se montaban una sobre la otra. */}
                                <div className="flex items-start gap-2 mb-3">
                                    <h3 className="flex-1 min-w-0 font-black text-base text-tinta uppercase leading-tight">{project.name}</h3>
                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${project.status === 'active' ? 'bg-bien-suave text-bien' : 'bg-papel-hondo text-tinta-tenue'}`}>
                                        {project.status === 'active' ? 'Activo' : 'Terminado'}
                                    </span>
                                    {onDeleteProject && userRole !== UserRole.VISITOR && (
                                        <button
                                            onClick={e => { e.stopPropagation(); onBehaviorLog?.('ACTION', `Eliminó proyecto: ${project.name}`); onDeleteProject(project.id); }}
                                            className="flex-shrink-0 p-1 -mt-0.5 text-tinta-tenue hover:text-alerta transition-all"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                {project.description && <p className="text-xs text-tinta-tenue mb-3 truncate">{project.description}</p>}
                                <div className="grid grid-cols-2 gap-2 border-t border-papel-borde pt-3">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">👷</span>
                                        <div>
                                            <span className="text-xs font-black text-tinta">{project.workerCount}</span>
                                            <span className="text-[10px] text-tinta-tenue ml-1">personas</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">🔑</span>
                                        <div>
                                            <span className={`text-xs font-black ${project.activeLoans > 0 ? 'text-atencion' : 'text-tinta'}`}>{project.activeLoans}</span>
                                            <span className="text-[10px] text-tinta-tenue ml-1">activos</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">🔨</span>
                                        <div>
                                            <span className="text-xs font-black text-tinta">{project.toolsCount}</span>
                                            <span className="text-[10px] text-tinta-tenue ml-1">herramientas</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">📦</span>
                                        <div>
                                            <span className="text-xs font-black text-marca-oscuro">{project.consumableCount}</span>
                                            <span className="text-[10px] text-tinta-tenue ml-1">uds.</span>
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
