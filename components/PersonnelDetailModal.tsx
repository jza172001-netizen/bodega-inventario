import React, { useMemo, useState } from 'react';
import { Personnel, Movement, Item, Project, MovementType, InventoryType, ReturnCondition } from '../types';
import { PeriodPicker, Periodo, periodoPorDefecto } from './PeriodPicker';
import { AccesoriosDeItem } from './AccesoriosDeItem';
import { ReturnToolModal } from './ReturnToolModal';

interface Props {
    person: Personnel;
    movements: Movement[];
    items: Item[];
    projects: Project[];
    allPersonnel?: Personnel[];
    onReturnLoan?: (movementId: string, condition?: string, notes?: string) => void;
    onMarkPendingPickup?: (movementId: string, pending: boolean) => void;
    onAssignProject?: (movementId: string, projectId: string) => void;
    onCreateProject?: (name: string) => Project;
    onTransferLoan?: (movementId: string, newPersonnelId: string) => void;
    onClose: () => void;
}

type Tab = 'manual' | 'electric' | 'consumo' | 'epp';
type ActionPanel = 'project' | 'transfer' | null;

type LoanGroup = {
    itemId: string;
    totalQty: number;
    movementIds: string[];
    date: Date;
    workers: string[];
    projectId?: string;
    pendingPickup: boolean;
    /** De quién es, para poder decirlo cuando la ficha muestra toda la cuadrilla. */
    personnelId?: string;
};

const daysSince = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

export const PersonnelDetailModal: React.FC<Props> = ({
    person, movements, items, projects, allPersonnel = [],
    onReturnLoan, onMarkPendingPickup, onAssignProject, onCreateProject, onTransferLoan,
    onClose,
}) => {
    const [tab, setTab] = useState<Tab>('manual');
    const [openPanel, setOpenPanel] = useState<{ key: string; type: ActionPanel }>({ key: '', type: null });
    const [returningGroup, setReturningGroup] = useState<LoanGroup | null>(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedPerson, setSelectedPerson] = useState('');

    /**
     * Un oficial no saca herramienta: la saca su gente. Filtrar solo por
     * `person.id` hacía que abrir a Alex dijera «0 movimientos en total»
     * mientras su cuadrilla —Jhon jader y Rafael— movía siete herramientas
     * ese mismo día. Los datos estaban bien; la pantalla no los sumaba.
     */
    const cuadrilla = useMemo(
        () => (allPersonnel ?? []).filter(p => p.teamLeaderId === person.id),
        [allPersonnel, person.id]
    );
    const esOficial = !!person.isTeamLeader && cuadrilla.length > 0;
    const [verCuadrilla, setVerCuadrilla] = useState(true);
    // El consumo estaba clavado al AÑO CALENDARIO: en enero no se veía nada y en
    // diciembre se veía todo revuelto. Lo que sirve para decidir es la semana,
    // la quincena o el mes.
    const [periodo, setPeriodo] = useState<Periodo>(periodoPorDefecto());

    /** A quiénes mira esta ficha ahora mismo. */
    const idsEnFoco = useMemo(() => {
        const s = new Set<string>([person.id]);
        if (esOficial && verCuadrilla) for (const p of cuadrilla) s.add(p.id);
        return s;
    }, [person.id, esOficial, verCuadrilla, cuadrilla]);

    const nombreDe = (id?: string) =>
        (allPersonnel ?? []).find(p => p.id === id)?.name ?? '';

    const myMovements = useMemo(
        () => movements.filter(m => m.personnelId && idsEnFoco.has(m.personnelId)),
        [movements, idsEnFoco]
    );

    const itemByType = (type: InventoryType) => new Set(items.filter(i => i.inventoryType === type).map(i => i.id));

    const groupLoans = (loanMovements: Movement[]): LoanGroup[] => {
        const map = new Map<string, LoanGroup>();
        for (const m of loanMovements) {
            const ts = new Date(m.timestamp);
            // La persona entra en la clave: en modo cuadrilla, dos trabajadores
            // con la misma herramienta el mismo día son DOS préstamos, no uno.
            const dayKey = `${m.itemId}__${m.personnelId ?? ''}__${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}`;
            if (!map.has(dayKey)) {
                map.set(dayKey, { itemId: m.itemId, totalQty: 0, movementIds: [], date: ts, workers: [], projectId: m.projectId, pendingPickup: false, personnelId: m.personnelId });
            }
            const g = map.get(dayKey)!;
            g.totalQty += m.quantity;
            g.movementIds.push(m.id);
            if (m.notes && !g.workers.includes(m.notes)) g.workers.push(m.notes);
            if (m.pendingPickup) g.pendingPickup = true;
            if (m.projectId && !g.projectId) g.projectId = m.projectId;
        }
        return [...map.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
    };

    // Re-derive active loans from live movements so actions update in real time
    const liveMovements = useMemo(
        () => movements.filter(m => m.personnelId && idsEnFoco.has(m.personnelId)),
        [movements, idsEnFoco]
    );

    const activeManual = useMemo(() => {
        const ids = itemByType(InventoryType.HAND_TOOL);
        return groupLoans(liveMovements.filter(m => m.isLoan && !m.isReturned && ids.has(m.itemId)));
    }, [liveMovements, items, periodo]);

    const activeElectric = useMemo(() => {
        const ids = itemByType(InventoryType.ELECTRICAL_TOOL);
        return groupLoans(liveMovements.filter(m => m.isLoan && !m.isReturned && ids.has(m.itemId)));
    }, [liveMovements, items, periodo]);

    const consumoYear = useMemo(() => {
        const consumoIds = itemByType(InventoryType.SINGLE_USE);
        const checkouts = liveMovements.filter(m =>
            m.type === MovementType.CHECK_OUT && !m.isLoan && consumoIds.has(m.itemId) &&
            new Date(m.timestamp) >= periodo.from && new Date(m.timestamp) <= periodo.to
        );
        const grouped: Record<string, { item: Item; total: number; lastDate: Date }> = {};
        checkouts.forEach(m => {
            const item = items.find(i => i.id === m.itemId);
            if (!item) return;
            const ts = new Date(m.timestamp);
            if (!grouped[m.itemId]) grouped[m.itemId] = { item, total: 0, lastDate: ts };
            grouped[m.itemId].total += m.quantity;
            if (ts > grouped[m.itemId].lastDate) grouped[m.itemId].lastDate = ts;
        });
        return Object.values(grouped).sort((a, b) => b.total - a.total);
    }, [liveMovements, items, periodo]);

    const eppYear = useMemo(() => {
        const eppIds = itemByType(InventoryType.PPE);
        const checkouts = liveMovements.filter(m =>
            m.type === MovementType.CHECK_OUT && !m.isLoan && eppIds.has(m.itemId) &&
            new Date(m.timestamp) >= periodo.from && new Date(m.timestamp) <= periodo.to
        );
        const grouped: Record<string, { item: Item; total: number; lastDate: Date }> = {};
        checkouts.forEach(m => {
            const item = items.find(i => i.id === m.itemId);
            if (!item) return;
            const ts = new Date(m.timestamp);
            if (!grouped[m.itemId]) grouped[m.itemId] = { item, total: 0, lastDate: ts };
            grouped[m.itemId].total += m.quantity;
            if (ts > grouped[m.itemId].lastDate) grouped[m.itemId].lastDate = ts;
        });
        return Object.values(grouped).sort((a, b) => b.total - a.total);
    }, [liveMovements, items, periodo]);

    const itemName = (id: string) => items.find(i => i.id === id)?.name ?? 'Ítem eliminado';
    const itemUnit = (id: string) => items.find(i => i.id === id)?.unit ?? 'und';
    const projectName = (id?: string) => id ? (projects.find(p => p.id === id)?.name ?? id) : null;

    const TABS: { key: Tab; label: string; count: number }[] = [
        { key: 'manual', label: 'H. Manual', count: activeManual.length },
        { key: 'electric', label: 'H. Eléctrica', count: activeElectric.length },
        { key: 'consumo', label: 'Consumibles', count: consumoYear.length },
        { key: 'epp', label: 'EPP', count: eppYear.length },
    ];

    const handleReturn = (g: LoanGroup) => {
        setReturningGroup(g);
    };

    const confirmReturn = (ids: string[], condition: ReturnCondition, notes: string) => {
        ids.forEach(id => onReturnLoan?.(id, condition, notes));
        setReturningGroup(null);
    };

    const handlePickupToggle = (g: LoanGroup) => {
        const next = !g.pendingPickup;
        g.movementIds.forEach(id => onMarkPendingPickup?.(id, next));
    };

    const groupKey = (g: LoanGroup) => `${g.itemId}__${g.date.getTime()}`;

    const togglePanel = (g: LoanGroup, type: ActionPanel) => {
        const k = groupKey(g);
        if (openPanel.key === k && openPanel.type === type) {
            setOpenPanel({ key: '', type: null });
        } else {
            setOpenPanel({ key: k, type });
            setNewProjectName('');
            setSelectedProject(g.projectId ?? '');
            setSelectedPerson('');
        }
    };

    const handleAssignProject = (g: LoanGroup) => {
        if (!selectedProject) return;
        g.movementIds.forEach(id => onAssignProject?.(id, selectedProject));
        setOpenPanel({ key: '', type: null });
    };

    const handleCreateAndAssign = (g: LoanGroup) => {
        const name = newProjectName.trim();
        if (!name || !onCreateProject) return;
        const created = onCreateProject(name);
        g.movementIds.forEach(id => onAssignProject?.(id, created.id));
        setNewProjectName('');
        setOpenPanel({ key: '', type: null });
    };

    const handleTransfer = (g: LoanGroup) => {
        if (!selectedPerson) return;
        g.movementIds.forEach(id => onTransferLoan?.(id, selectedPerson));
        setOpenPanel({ key: '', type: null });
    };

    const ToolCard = ({ g }: { g: LoanGroup }) => {
        const d = daysSince(g.date);
        const isPending = g.pendingPickup;
        const colorClass = isPending ? 'border-atencion bg-atencion-suave' : d > 14 ? 'border-alerta bg-alerta-suave' : d > 7 ? 'border-atencion bg-atencion-suave' : 'border-marca-borde bg-marca-suave';
        const badgeClass = isPending ? 'bg-atencion-suave text-atencion' : d > 14 ? 'bg-alerta-suave text-alerta' : d > 7 ? 'bg-atencion-suave text-atencion' : 'bg-marca-suave text-marca-oscuro';
        const key = groupKey(g);
        const proj = projectName(g.projectId);

        const isProjectOpen  = openPanel.key === key && openPanel.type === 'project';
        const isTransferOpen = openPanel.key === key && openPanel.type === 'transfer';

        const otherPersonnel = allPersonnel.filter(p => p.id !== person.id).sort((a, b) => a.name.localeCompare(b.name, 'es'));

        return (
            <div className={`rounded-xl border ${colorClass} overflow-hidden`}>
                {/* Main row */}
                <div className="flex items-start justify-between p-3 gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-tinta text-sm leading-snug">{itemName(g.itemId)}</p>
                        <p className="text-xs text-tinta-tenue mt-0.5">
                            {g.totalQty} {itemUnit(g.itemId)} · {g.date.toLocaleDateString('es-CO')}
                            {esOficial && verCuadrilla && g.personnelId !== person.id && (
                                <span className="ml-1 font-black text-marca-oscuro">· {nombreDe(g.personnelId)}</span>
                            )}
                        </p>
                        {/* Lo que salió pegado a la herramienta. */}
                        <AccesoriosDeItem item={items.find(i => i.id === g.itemId)} className="mt-1" />
                        {proj && (
                            <p className="text-xs text-marca-oscuro font-semibold mt-0.5 truncate">📁 {proj}</p>
                        )}
                        {isPending && (
                            <p className="text-xs font-black text-atencion mt-0.5">📍 Pendiente de recoger</p>
                        )}
                    </div>
                    <span className={`flex-shrink-0 text-xs font-black px-2.5 py-1 rounded-full ${badgeClass}`}>
                        {d === 0 ? 'hoy' : `${d}d`}
                    </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5 px-3 pb-3 flex-wrap">
                    {/* Pickup toggle */}
                    {onMarkPendingPickup && (
                        <button
                            onClick={() => handlePickupToggle(g)}
                            className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all ${
                                isPending
                                    ? 'bg-atencion text-tinta hover:bg-atencion'
                                    : 'bg-atencion-suave text-atencion hover:bg-atencion-suave'
                            }`}
                        >
                            {isPending ? '✕ No recoger' : '📍 Ir a recoger'}
                        </button>
                    )}

                    {/* Assign project */}
                    {onAssignProject && (
                        <button
                            onClick={() => togglePanel(g, 'project')}
                            className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all ${
                                isProjectOpen
                                    ? 'bg-marca text-tinta'
                                    : 'bg-marca-suave text-marca-oscuro hover:bg-marca-suave'
                            }`}
                        >
                            📁 Proyecto
                        </button>
                    )}

                    {/* Transfer to another person */}
                    {onTransferLoan && otherPersonnel.length > 0 && (
                        <button
                            onClick={() => togglePanel(g, 'transfer')}
                            className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all ${
                                isTransferOpen
                                    ? 'bg-marca text-tinta'
                                    : 'bg-marca-suave text-marca-oscuro hover:bg-marca-suave'
                            }`}
                        >
                            ↗️ Traspasar
                        </button>
                    )}

                    {/* Return */}
                    {onReturnLoan && (
                        <button
                            onClick={() => handleReturn(g)}
                            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-bien hover:bg-bien text-papel transition-all"
                        >
                            ✓ Devolver
                        </button>
                    )}
                </div>

                {/* Project panel */}
                {isProjectOpen && (
                    <div className="border-t border-marca-borde bg-marca-suave px-3 py-3 space-y-2">
                        <p className="text-[11px] font-black text-marca-oscuro uppercase tracking-wide">Asignar proyecto</p>
                        {projects.length > 0 && (
                            <div className="flex gap-2">
                                <select
                                    value={selectedProject}
                                    onChange={e => setSelectedProject(e.target.value)}
                                    className="flex-1 text-xs border border-marca-borde rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-marca bg-papel"
                                >
                                    <option value="">— Elegir proyecto —</option>
                                    {[...projects].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => handleAssignProject(g)}
                                    disabled={!selectedProject}
                                    className="text-xs font-bold px-3 py-1.5 bg-marca hover:bg-marca-fuerte text-tinta rounded-lg disabled:opacity-40 transition-all"
                                >
                                    Asignar
                                </button>
                            </div>
                        )}
                        <p className="text-[10px] text-marca-oscuro font-semibold">O crear proyecto nuevo:</p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newProjectName}
                                onChange={e => setNewProjectName(e.target.value)}
                                placeholder="Nombre del proyecto..."
                                className="flex-1 text-xs border border-marca-borde rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-marca"
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAssign(g); }}
                            />
                            <button
                                onClick={() => handleCreateAndAssign(g)}
                                disabled={!newProjectName.trim()}
                                className="text-xs font-bold px-3 py-1.5 bg-marca hover:bg-marca-fuerte text-tinta rounded-lg disabled:opacity-40 transition-all"
                            >
                                Crear
                            </button>
                        </div>
                    </div>
                )}

                {/* Transfer panel */}
                {isTransferOpen && (
                    <div className="border-t border-marca-borde bg-marca-suave px-3 py-3 space-y-2">
                        <p className="text-[11px] font-black text-marca-oscuro uppercase tracking-wide">Traspasar a otro trabajador</p>
                        <div className="flex gap-2">
                            <select
                                value={selectedPerson}
                                onChange={e => setSelectedPerson(e.target.value)}
                                className="flex-1 text-xs border border-marca-borde rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-marca bg-papel"
                            >
                                <option value="">— Elegir trabajador —</option>
                                {otherPersonnel.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => handleTransfer(g)}
                                disabled={!selectedPerson}
                                className="text-xs font-bold px-3 py-1.5 bg-marca hover:bg-marca-fuerte text-tinta rounded-lg disabled:opacity-40 transition-all"
                            >
                                Traspasar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const ConsumptionTable = ({ rows }: { rows: { item: Item; total: number; lastDate: Date }[] }) => (
        rows.length === 0 ? (
            <p className="text-tinta-tenue text-sm text-center py-12">Sin registros en este período.</p>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[10px] font-black text-tinta-tenue uppercase tracking-wider">
                            <th className="pb-3">Ítem</th>
                            <th className="pb-3 text-center">Total</th>
                            <th className="pb-3 text-right">Última salida</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-papel-borde">
                        {rows.map(({ item, total, lastDate }) => (
                            <tr key={item.id} className="hover:bg-papel-hondo">
                                <td className="py-2.5 font-medium text-tinta">{item.name}</td>
                                <td className="py-2.5 text-center font-black text-marca-oscuro">{total} <span className="font-normal text-tinta-tenue text-xs">{item.unit}</span></td>
                                <td className="py-2.5 text-right text-tinta-tenue text-xs">{lastDate.toLocaleDateString('es-CO')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-papel rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-papel-borde">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-marca-suave text-marca-oscuro flex items-center justify-center font-black text-xl">
                            {person.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-tinta">{person.name}</h2>
                            <p className="text-xs text-tinta-tenue">
                                {myMovements.length} movimientos en total
                                {esOficial && verCuadrilla && ` · ${person.name} y su cuadrilla`}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-papel-hondo rounded-xl text-tinta-tenue hover:text-tinta-suave">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                {esOficial && (
                    <div className="px-4 pt-3 bg-papel-hondo">
                        <div className="flex gap-1 bg-papel-borde/70 rounded-xl p-1">
                            {([[false, `Solo ${person.name.split(' ')[0]}`], [true, 'Toda la cuadrilla']] as const).map(([v, label]) => (
                                <button key={String(v)} type="button" onClick={() => setVerCuadrilla(v)}
                                    className={`flex-1 py-1.5 text-[11px] font-black rounded-lg transition-all ${
                                        verCuadrilla === v ? 'bg-papel text-tinta shadow-sm' : 'text-tinta-tenue'
                                    }`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-tinta-tenue mt-1 px-1 truncate">
                            {cuadrilla.map(p => p.name).join(' · ')}
                        </p>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1.5 px-4 py-3 bg-papel-hondo border-b border-papel-borde overflow-x-auto">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 text-xs font-black rounded-xl transition-all ${tab === t.key ? 'bg-marca text-tinta shadow-sm' : 'bg-papel text-tinta-tenue border border-papel-borde hover:border-marca-borde hover:text-marca-oscuro'}`}
                        >
                            {t.label}
                            {t.count > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${tab === t.key ? 'bg-marca text-tinta' : 'bg-papel-hondo text-tinta-tenue'}`}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {(tab === 'consumo' || tab === 'epp') && (
                    <div className="px-4 pt-3">
                        <PeriodPicker value={periodo} onChange={setPeriodo} />
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {tab === 'manual' && (
                        activeManual.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-2xl mb-2">✅</p>
                                <p className="text-tinta-tenue text-sm">No tiene herramienta manual prestada.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {activeManual.map(g => <ToolCard key={groupKey(g)} g={g} />)}
                            </div>
                        )
                    )}

                    {tab === 'electric' && (
                        activeElectric.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-2xl mb-2">✅</p>
                                <p className="text-tinta-tenue text-sm">No tiene herramienta eléctrica prestada.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {activeElectric.map(g => <ToolCard key={groupKey(g)} g={g} />)}
                            </div>
                        )
                    )}

                    {tab === 'consumo' && <ConsumptionTable rows={consumoYear} />}
                    {tab === 'epp' && <ConsumptionTable rows={eppYear} />}
                </div>
            </div>

            {returningGroup && (
                <ReturnToolModal
                    item={items.find(i => i.id === returningGroup.itemId) ?? { id: '', name: itemName(returningGroup.itemId), requiresReturnNote: false } as Item}
                    personName={person.name}
                    movementIds={returningGroup.movementIds}
                    onConfirm={confirmReturn}
                    onClose={() => setReturningGroup(null)}
                />
            )}
        </div>
    );
};
