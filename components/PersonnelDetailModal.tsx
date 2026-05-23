import React, { useMemo, useState } from 'react';
import { Personnel, Movement, Item, Project, MovementType, InventoryType } from '../types';

interface Props {
    person: Personnel;
    movements: Movement[];
    items: Item[];
    projects: Project[];
    allPersonnel?: Personnel[];
    onReturnLoan?: (movementId: string) => void;
    onMarkPendingPickup?: (movementId: string, pending: boolean) => void;
    onAssignProject?: (movementId: string, projectId: string) => void;
    onCreateProject?: (name: string) => Project;
    onTransferLoan?: (movementId: string, newPersonnelId: string) => void;
    onClose: () => void;
}

type Tab = 'manual' | 'electric' | 'consumo' | 'epp';
type ActionPanel = 'project' | 'transfer' | null;

const currentYear = new Date().getFullYear();
const daysSince = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

export const PersonnelDetailModal: React.FC<Props> = ({
    person, movements, items, projects, allPersonnel = [],
    onReturnLoan, onMarkPendingPickup, onAssignProject, onCreateProject, onTransferLoan,
    onClose,
}) => {
    const [tab, setTab] = useState<Tab>('manual');
    const [openPanel, setOpenPanel] = useState<{ key: string; type: ActionPanel }>({ key: '', type: null });
    const [newProjectName, setNewProjectName] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedPerson, setSelectedPerson] = useState('');

    const myMovements = useMemo(
        () => movements.filter(m => m.personnelId === person.id),
        [movements, person.id]
    );

    const itemByType = (type: InventoryType) => new Set(items.filter(i => i.inventoryType === type).map(i => i.id));

    type LoanGroup = {
        itemId: string;
        totalQty: number;
        movementIds: string[];
        date: Date;
        workers: string[];
        projectId?: string;
        pendingPickup: boolean;
    };

    const groupLoans = (loanMovements: Movement[]): LoanGroup[] => {
        const map = new Map<string, LoanGroup>();
        for (const m of loanMovements) {
            const ts = new Date(m.timestamp);
            const dayKey = `${m.itemId}__${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}`;
            if (!map.has(dayKey)) {
                map.set(dayKey, { itemId: m.itemId, totalQty: 0, movementIds: [], date: ts, workers: [], projectId: m.projectId, pendingPickup: false });
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
        () => movements.filter(m => m.personnelId === person.id),
        [movements, person.id]
    );

    const activeManual = useMemo(() => {
        const ids = itemByType(InventoryType.HAND_TOOL);
        return groupLoans(liveMovements.filter(m => m.isLoan && !m.isReturned && ids.has(m.itemId)));
    }, [liveMovements, items]);

    const activeElectric = useMemo(() => {
        const ids = itemByType(InventoryType.ELECTRICAL_TOOL);
        return groupLoans(liveMovements.filter(m => m.isLoan && !m.isReturned && ids.has(m.itemId)));
    }, [liveMovements, items]);

    const consumoYear = useMemo(() => {
        const consumoIds = itemByType(InventoryType.SINGLE_USE);
        const checkouts = liveMovements.filter(m =>
            m.type === MovementType.CHECK_OUT && !m.isLoan && consumoIds.has(m.itemId) &&
            new Date(m.timestamp).getFullYear() === currentYear
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
    }, [liveMovements, items]);

    const eppYear = useMemo(() => {
        const eppIds = itemByType(InventoryType.PPE);
        const checkouts = liveMovements.filter(m =>
            m.type === MovementType.CHECK_OUT && !m.isLoan && eppIds.has(m.itemId) &&
            new Date(m.timestamp).getFullYear() === currentYear
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
    }, [liveMovements, items]);

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
        const fecha = g.date.toLocaleDateString('es-CO');
        if (window.confirm(`¿Confirmar devolución de "${itemName(g.itemId)}" (${fecha})?`)) {
            g.movementIds.forEach(id => onReturnLoan?.(id));
        }
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
        const colorClass = isPending ? 'border-orange-200 bg-orange-50' : d > 14 ? 'border-red-200 bg-red-50' : d > 7 ? 'border-yellow-200 bg-yellow-50' : 'border-blue-100 bg-blue-50';
        const badgeClass = isPending ? 'bg-orange-100 text-orange-700' : d > 14 ? 'bg-red-100 text-red-700' : d > 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700';
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
                        <p className="font-semibold text-gray-800 text-sm leading-snug">{itemName(g.itemId)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {g.totalQty} {itemUnit(g.itemId)} · {g.date.toLocaleDateString('es-CO')}
                        </p>
                        {proj && (
                            <p className="text-xs text-indigo-600 font-semibold mt-0.5 truncate">📁 {proj}</p>
                        )}
                        {isPending && (
                            <p className="text-xs font-black text-orange-600 mt-0.5">📍 Pendiente de recoger</p>
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
                                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
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
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
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
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                            }`}
                        >
                            ↗️ Traspasar
                        </button>
                    )}

                    {/* Return */}
                    {onReturnLoan && (
                        <button
                            onClick={() => handleReturn(g)}
                            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all"
                        >
                            ✓ Devolver
                        </button>
                    )}
                </div>

                {/* Project panel */}
                {isProjectOpen && (
                    <div className="border-t border-indigo-100 bg-indigo-50 px-3 py-3 space-y-2">
                        <p className="text-[11px] font-black text-indigo-700 uppercase tracking-wide">Asignar proyecto</p>
                        {projects.length > 0 && (
                            <div className="flex gap-2">
                                <select
                                    value={selectedProject}
                                    onChange={e => setSelectedProject(e.target.value)}
                                    className="flex-1 text-xs border border-indigo-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                                >
                                    <option value="">— Elegir proyecto —</option>
                                    {[...projects].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => handleAssignProject(g)}
                                    disabled={!selectedProject}
                                    className="text-xs font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-40 transition-all"
                                >
                                    Asignar
                                </button>
                            </div>
                        )}
                        <p className="text-[10px] text-indigo-500 font-semibold">O crear proyecto nuevo:</p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newProjectName}
                                onChange={e => setNewProjectName(e.target.value)}
                                placeholder="Nombre del proyecto..."
                                className="flex-1 text-xs border border-indigo-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAssign(g); }}
                            />
                            <button
                                onClick={() => handleCreateAndAssign(g)}
                                disabled={!newProjectName.trim()}
                                className="text-xs font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-40 transition-all"
                            >
                                Crear
                            </button>
                        </div>
                    </div>
                )}

                {/* Transfer panel */}
                {isTransferOpen && (
                    <div className="border-t border-purple-100 bg-purple-50 px-3 py-3 space-y-2">
                        <p className="text-[11px] font-black text-purple-700 uppercase tracking-wide">Traspasar a otro trabajador</p>
                        <div className="flex gap-2">
                            <select
                                value={selectedPerson}
                                onChange={e => setSelectedPerson(e.target.value)}
                                className="flex-1 text-xs border border-purple-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                            >
                                <option value="">— Elegir trabajador —</option>
                                {otherPersonnel.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => handleTransfer(g)}
                                disabled={!selectedPerson}
                                className="text-xs font-bold px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-40 transition-all"
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
            <p className="text-gray-400 text-sm text-center py-12">Sin registros este año.</p>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            <th className="pb-3">Ítem</th>
                            <th className="pb-3 text-center">Total año</th>
                            <th className="pb-3 text-right">Última salida</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {rows.map(({ item, total, lastDate }) => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="py-2.5 font-medium text-gray-800">{item.name}</td>
                                <td className="py-2.5 text-center font-black text-blue-600">{total} <span className="font-normal text-gray-400 text-xs">{item.unit}</span></td>
                                <td className="py-2.5 text-right text-gray-400 text-xs">{lastDate.toLocaleDateString('es-CO')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xl">
                            {person.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">{person.name}</h2>
                            <p className="text-xs text-gray-400">{myMovements.length} movimientos en total</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1.5 px-4 py-3 bg-gray-50 border-b border-gray-100 overflow-x-auto">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 text-xs font-black rounded-xl transition-all ${tab === t.key ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}
                        >
                            {t.label}
                            {t.count > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${tab === t.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {tab === 'manual' && (
                        activeManual.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-2xl mb-2">✅</p>
                                <p className="text-gray-500 text-sm">No tiene herramienta manual prestada.</p>
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
                                <p className="text-gray-500 text-sm">No tiene herramienta eléctrica prestada.</p>
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
        </div>
    );
};
