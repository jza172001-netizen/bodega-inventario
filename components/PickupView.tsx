
import React, { useMemo } from 'react';
import { Movement, Item, Personnel, Project } from '../types';
import { buildConsolidatedPickupUrl, MELLO_NAME } from '../services/whatsappService';

interface Props {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    projects: Project[];
    onMarkPendingPickup: (movementId: string, pending: boolean) => void;
    onReturnItem: (movementId: string) => void;
}

export const PickupView: React.FC<Props> = ({
    movements, items, personnel, projects, onMarkPendingPickup, onReturnItem,
}) => {
    const itemMap    = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personMap  = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);
    const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

    const pending = useMemo(
        () => movements.filter(m => m.isLoan && !m.isReturned && m.pendingPickup),
        [movements]
    );

    const grouped = useMemo(() => {
        const map = new Map<string, { label: string; loans: Movement[] }>();
        for (const m of pending) {
            const key   = m.projectId ?? '__none__';
            const label = m.projectId ? (projectMap.get(m.projectId)?.name ?? 'Proyecto desconocido') : 'Sin proyecto';
            if (!map.has(key)) map.set(key, { label, loans: [] });
            map.get(key)!.loans.push(m);
        }
        return [...map.values()];
    }, [pending, projectMap]);

    const waUrl = useMemo(() => {
        if (pending.length === 0) return null;
        const list = pending.map(m => ({
            itemName:    itemMap.get(m.itemId)?.name    ?? 'Herramienta',
            qty:         m.quantity,
            workerName:  personMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar',
            projectName: m.projectId ? projectMap.get(m.projectId)?.name : undefined,
        }));
        return buildConsolidatedPickupUrl(list);
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
                    <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-black rounded-xl transition-colors shadow-sm"
                    >
                        📲 Avisar a {MELLO_NAME}
                    </a>
                )}
            </div>

            {/* Grupos por proyecto */}
            {grouped.map(({ label, loans }) => (
                <div key={label} className="bg-white rounded-2xl border border-orange-200 overflow-hidden shadow-sm">
                    <div className="bg-orange-500 px-4 py-2.5">
                        <p className="text-sm font-black text-white">🏗 {label}</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {loans.map(m => {
                            const item   = itemMap.get(m.itemId);
                            const person = personMap.get(m.personnelId ?? '');
                            const days   = getDays(m.timestamp);
                            return (
                                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900 truncate">{item?.name ?? 'Herramienta'}</p>
                                        <p className="text-xs text-gray-500">
                                            x{m.quantity} · {person?.name ?? 'Sin asignar'} · {days}d fuera
                                        </p>
                                    </div>
                                    <div className="flex gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => onMarkPendingPickup(m.id, false)}
                                            className="text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-all"
                                            title="Quitar de la lista"
                                        >
                                            ✕
                                        </button>
                                        <button
                                            onClick={() => { if (window.confirm('¿Marcar como recogida y devuelta?')) onReturnItem(m.id); }}
                                            className="text-xs px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all"
                                        >
                                            ✓ Recogida
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            <p className="text-[10px] text-gray-400 text-center">
                Toca "📲 Avisar a {MELLO_NAME}" para enviar la lista completa por WhatsApp de una sola vez.
            </p>
        </div>
    );
};
