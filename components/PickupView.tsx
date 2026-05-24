
import React, { useMemo, useState } from 'react';
import { Movement, Item, Personnel, Project, InventoryType, ReturnCondition, UserRole } from '../types';
import { buildConsolidatedPickupUrl, MELLO_NAME } from '../services/whatsappService';
import { ReturnToolModal } from './ReturnToolModal';

interface Props {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    projects: Project[];
    userRole?: UserRole;
    onMarkPendingPickup: (movementId: string, pending: boolean) => void;
    onReturnItem: (movementId: string, condition?: string, notes?: string) => void;
}

const INV_FILTERS = [
    { key: '', label: 'Todos' },
    { key: InventoryType.HAND_TOOL,       label: '🔨 Manual' },
    { key: InventoryType.ELECTRICAL_TOOL, label: '⚡ Eléctrica' },
    { key: InventoryType.PPE,             label: '🦺 EPP' },
    { key: InventoryType.SINGLE_USE,      label: '📦 Consumibles' },
] as const;

export const PickupView: React.FC<Props> = ({
    movements, items, personnel, projects, userRole = UserRole.EMPLOYEE, onMarkPendingPickup, onReturnItem,
}) => {
    const isOwner = userRole === UserRole.OWNER;
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [returningMovement, setReturningMovement] = useState<Movement | null>(null);

    const itemMap    = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personMap  = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);
    const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

    const pending = useMemo(
        () => movements.filter(m => m.isLoan && !m.isReturned && m.pendingPickup),
        [movements]
    );

    const filtered = useMemo(() =>
        typeFilter ? pending.filter(m => itemMap.get(m.itemId)?.inventoryType === typeFilter) : pending,
        [pending, typeFilter, itemMap]
    );

    const byWorker = useMemo(() => {
        const map = new Map<string, Movement[]>();
        for (const m of filtered) {
            const key = m.personnelId ?? '__none__';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(m);
        }
        return [...map.entries()]
            .map(([key, ms]) => ({
                name: key === '__none__' ? 'Sin asignar' : (personMap.get(key)?.name ?? 'Sin asignar'),
                loans: ms,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [filtered, personMap]);

    const waUrl = useMemo(() => {
        if (pending.length === 0) return null;
        return buildConsolidatedPickupUrl(pending.map(m => ({
            itemName:    itemMap.get(m.itemId)?.name    ?? 'Herramienta',
            qty:         m.quantity,
            workerName:  personMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar',
            projectName: m.projectId ? projectMap.get(m.projectId)?.name : undefined,
        })));
    }, [pending, itemMap, personMap, projectMap]);

    const getDays = (ts: Date | string) =>
        Math.ceil(Math.abs(Date.now() - new Date(ts).getTime()) / 86400000);

    if (pending.length === 0) {
        return (
            <div className="text-center py-24 text-gray-400">
                <p className="text-4xl mb-3">✅</p>
                <p className="font-semibold text-gray-600">Nada pendiente de recoger</p>
                <p className="text-sm mt-1">Cuando marques un préstamo como "Ir a recoger" aparecerá aquí.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5 max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-black text-gray-900">📍 A Recoger</h1>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {pending.length} herramienta{pending.length !== 1 ? 's' : ''} marcada{pending.length !== 1 ? 's' : ''} para recoger
                    </p>
                </div>
                {waUrl && (
                    <a href={waUrl} target="_blank" rel="noopener noreferrer"
                        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-black rounded-xl transition-colors shadow-sm">
                        📲 Avisar a {MELLO_NAME}
                    </a>
                )}
            </div>

            {/* Chips de tipo */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {INV_FILTERS.map(f => (
                    <button key={f.key} onClick={() => setTypeFilter(f.key)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                            typeFilter === f.key
                                ? 'bg-orange-500 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">Sin resultados para ese tipo.</p>
            ) : (
                byWorker.map(({ name, loans }) => (
                    <div key={name} className="bg-white rounded-2xl border border-orange-200 overflow-hidden shadow-sm">
                        <div className="bg-orange-500 px-4 py-2.5 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-white/30 text-white flex items-center justify-center font-black text-sm">
                                {name.charAt(0)}
                            </span>
                            <p className="text-sm font-black text-white">{name}</p>
                            <span className="ml-auto text-xs font-bold text-orange-100">{loans.length} ítem{loans.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {loans.map(m => {
                                const it   = itemMap.get(m.itemId);
                                const days = getDays(m.timestamp);
                                const proj = m.projectId ? projectMap.get(m.projectId)?.name : null;
                                return (
                                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{it?.name ?? 'Herramienta'}</p>
                                            <p className="text-xs text-gray-500">
                                                x{m.quantity} · {days}d fuera{proj ? ` · ${proj}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex gap-2 flex-shrink-0">
                                            {isOwner && (
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm(`¿Cancelar "a recoger" para ${it?.name ?? 'esta herramienta'}? Se quitará de la lista.`))
                                                            onMarkPendingPickup(m.id, false);
                                                    }}
                                                    className="text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-all"
                                                    title="Quitar de la lista">
                                                    ✕
                                                </button>
                                            )}
                                            <button onClick={() => setReturningMovement(m)}
                                                className="text-xs px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all">
                                                ✓ Recogida
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}

            <p className="text-[10px] text-gray-400 text-center">
                Toca "📲 Avisar a {MELLO_NAME}" para enviar la lista completa por WhatsApp.
            </p>

            {returningMovement && (() => {
                const item = itemMap.get(returningMovement.itemId);
                if (!item) return null;
                return (
                    <ReturnToolModal
                        item={item}
                        personName={personMap.get(returningMovement.personnelId ?? '')?.name ?? 'Sin asignar'}
                        movementIds={[returningMovement.id]}
                        onConfirm={(ids, condition, notes) => {
                            ids.forEach(id => onReturnItem(id, condition, notes));
                            setReturningMovement(null);
                        }}
                        onClose={() => setReturningMovement(null)}
                    />
                );
            })()}
        </div>
    );
};
