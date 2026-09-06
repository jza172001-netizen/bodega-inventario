
import React, { useMemo, useState } from 'react';
import { Movement, Item, Personnel, Project, InventoryType, ReturnCondition, UserRole } from '../types';
import { buildConsolidatedPickupUrl, buildConsolidatedPickupText, buildOwnPickupUrl, buildOwnPickupText } from '../services/whatsappService';
import { ReturnToolModal } from './ReturnToolModal';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    projects: Project[];
    userRole?: UserRole;
    onMarkPendingPickup: (movementId: string, pending: boolean) => void;
    onReturnItem: (movementId: string, condition?: string, notes?: string) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
    onAuditLog?: (action: string, description: string) => void;
}

const INV_FILTERS = [
    { key: '', label: 'Todos' },
    { key: InventoryType.HAND_TOOL,       label: '🔨 Manual' },
    { key: InventoryType.ELECTRICAL_TOOL, label: '⚡ Eléctrica' },
    { key: InventoryType.PPE,             label: '🦺 EPP' },
    { key: InventoryType.SINGLE_USE,      label: '📦 Consumibles' },
] as const;

export const PickupView: React.FC<Props> = ({
    movements, items, personnel, projects, userRole = UserRole.EMPLOYEE, onMarkPendingPickup, onReturnItem, onBehaviorLog, onAuditLog,
}) => {
    const isOwner = userRole !== UserRole.VISITOR;
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [returningMovement, setReturningMovement] = useState<Movement | null>(null);
    const [cancelingPickup, setCancelingPickup] = useState<{ movementId: string; itemName: string } | null>(null);
    // Quién recoge lo elige el bodeguero en cada recogida — nadie viene
    // preseleccionado, para no mandarle el aviso a la persona equivocada.
    const [recipientId, setRecipientId] = useState<string>('');
    // Se resuelve contra la lista viva: si a esa persona la borran o le quitan el
    // teléfono, el select vuelve a quedar vacío en vez de apuntar a un fantasma.
    const selectedRecipient = useMemo(
        () => personnel.find(p => p.id === recipientId && p.phone) ?? null,
        [personnel, recipientId]
    );

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

    // Antes esto se armaba sobre `pending` (toda la bodega) mientras la pantalla
    // mostraba `filtered`: los chips de tipo no acortaban el mensaje y el
    // bodeguero mandaba cosas que ni estaba viendo.
    const pendingItems = useMemo(() => filtered.map(m => ({
        itemName:    itemMap.get(m.itemId)?.name    ?? 'Herramienta',
        qty:         m.quantity,
        workerName:  personMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar',
        projectName: m.projectId ? projectMap.get(m.projectId)?.name : undefined,
    })), [filtered, itemMap, personMap, projectMap]);

    const waUrl = useMemo(() => {
        if (!selectedRecipient?.phone || pendingItems.length === 0) return null;
        return buildConsolidatedPickupUrl(pendingItems, selectedRecipient.phone, selectedRecipient.name);
    }, [pendingItems, selectedRecipient]);

    /**
     * Modo del aviso. `tenedor` le escribe a CADA UNO lo suyo; `mensajero` manda
     * a un tercero la lista completa. Antes solo existía el segundo, sin decirlo:
     * marcar la herramienta de Ferney y avisarle a Abel parecía un error de la app.
     */
    const [modoAviso, setModoAviso] = useState<'tenedor' | 'mensajero'>('tenedor');
    const [avisandoA, setAvisandoA] = useState<{ persona: Personnel; url: string; texto: string } | null>(null);

    /** Cada quien con lo suyo, y solo los que tienen teléfono. */
    const porTenedor = useMemo(() => {
        const map = new Map<string, Movement[]>();
        for (const m of filtered) {
            if (!m.personnelId) continue;
            if (!map.has(m.personnelId)) map.set(m.personnelId, []);
            map.get(m.personnelId)!.push(m);
        }
        return [...map.entries()]
            .map(([id, ms]) => ({
                persona: personMap.get(id),
                loans: ms.map((m): { itemName: string; qty: number; projectName?: string } => ({
                    itemName: itemMap.get(m.itemId)?.name ?? 'Herramienta',
                    qty: m.quantity,
                    projectName: m.projectId ? projectMap.get(m.projectId)?.name : undefined,
                })),
            }))
            .filter((x): x is { persona: Personnel; loans: { itemName: string; qty: number; projectName?: string }[] } => !!x.persona)
            .sort((a, b) => a.persona.name.localeCompare(b.persona.name, 'es'));
    }, [filtered, personMap, itemMap, projectMap]);

    const [confirmandoAviso, setConfirmandoAviso] = useState(false);

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
            <div className="space-y-3">
                <div>
                    <h1 className="text-xl font-black text-gray-900">📍 A Recoger</h1>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {pending.length} herramienta{pending.length !== 1 ? 's' : ''} marcada{pending.length !== 1 ? 's' : ''} para recoger
                    </p>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-2xl p-3 space-y-2">
                    <div className="flex gap-1 bg-white border border-green-200 rounded-xl p-1">
                        {([
                            ['tenedor',   'Avisarle a quien la tiene'],
                            ['mensajero', 'Mandar a alguien a recogerlas'],
                        ] as const).map(([k, label]) => (
                            <button key={k} type="button"
                                onClick={() => { setModoAviso(k); onBehaviorLog?.('FILTER', `Modo de aviso: ${label}`); }}
                                className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all ${
                                    modoAviso === k ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-green-50'
                                }`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {modoAviso === 'tenedor' ? (
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-green-700 uppercase tracking-widest">
                                A cada uno lo suyo
                            </p>
                            {porTenedor.length === 0 && (
                                <p className="text-xs text-gray-400 py-1">Nada marcado con trabajador asignado.</p>
                            )}
                            {porTenedor.map(({ persona, loans }) => (
                                <button key={persona.id} type="button"
                                    disabled={!persona.phone}
                                    onClick={() => setAvisandoA({
                                        persona,
                                        url: buildOwnPickupUrl(persona.phone!, persona.name, loans),
                                        texto: buildOwnPickupText(persona.name, loans),
                                    })}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ${
                                        persona.phone
                                            ? 'bg-white border border-green-200 hover:border-green-400'
                                            : 'bg-gray-50 border border-gray-200 opacity-60 cursor-not-allowed'
                                    }`}>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-bold text-gray-800 truncate">{persona.name}</span>
                                        <span className="block text-[10px] text-gray-400">
                                            {loans.length} herramienta{loans.length !== 1 ? 's' : ''}
                                            {!persona.phone && ' · sin teléfono'}
                                        </span>
                                    </span>
                                    {persona.phone && <span className="text-sm flex-shrink-0">📲</span>}
                                </button>
                            ))}
                        </div>
                    ) : (
                    <>
                    <p className="text-[10px] font-black text-green-700 uppercase tracking-widest">¿A quién le encargamos recogerlas?</p>
                    <select
                        value={selectedRecipient?.id ?? ''}
                        onChange={e => {
                            setRecipientId(e.target.value);
                            const p = personnel.find(x => x.id === e.target.value);
                            if (p) onBehaviorLog?.('ACTION', `Destinatario de recogida: ${p.name}`);
                        }}
                        className="w-full text-sm border border-green-200 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-green-400 outline-none text-gray-700 font-semibold"
                    >
                        <option value="">— Elegir trabajador —</option>
                        {[...personnel]
                            .sort((a, b) => (b.phone ? 1 : 0) - (a.phone ? 1 : 0) || a.name.localeCompare(b.name, 'es'))
                            .map(p => (
                                <option key={p.id} value={p.id} disabled={!p.phone}>
                                    {p.name}{!p.phone ? ' (sin tel)' : ''}
                                </option>
                            ))
                        }
                    </select>
                    <button
                        type="button"
                        disabled={!waUrl}
                        onClick={() => setConfirmandoAviso(true)}
                        className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-sm transition-all w-full ${
                            waUrl
                                ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        📲 {selectedRecipient ? `Encargarle a ${selectedRecipient.name.split(' ')[0]}` : 'Selecciona un trabajador'}
                    </button>
                    </>
                    )}
                </div>
            </div>

            {/* Chips de tipo */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {INV_FILTERS.map(f => (
                    <button key={f.key} onClick={() => setTypeFilter(f.key)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                            typeFilter === f.key
                                ? 'bg-indigo-600 text-white shadow-sm'
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
                    <div key={name} className="bg-white rounded-2xl border border-indigo-100 overflow-hidden shadow-sm">
                        <div className="bg-indigo-700 px-4 py-2.5 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center font-black text-sm">
                                {name.charAt(0)}
                            </span>
                            <p className="text-sm font-black text-white">{name}</p>
                            <span className="ml-auto text-xs font-bold text-indigo-200">{loans.length} ítem{loans.length !== 1 ? 's' : ''}</span>
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
                                                    onClick={() => setCancelingPickup({ movementId: m.id, itemName: it?.name ?? 'esta herramienta' })}
                                                    className="text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-all"
                                                    title="Quitar de la lista">
                                                    ✕
                                                </button>
                                            )}
                                            <button onClick={() => { onBehaviorLog?.('BUTTON', `Confirmó recogida: ${it?.name ?? 'herramienta'}`); setReturningMovement(m); }}
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
                Elige el trabajador y toca "📲 Avisar" para enviar la lista por WhatsApp.
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
            {confirmandoAviso && selectedRecipient && waUrl && (
                <ConfirmDialog
                    title={`Avisar a ${selectedRecipient.name}`}
                    message={`Se le va a enviar al ${selectedRecipient.phone}\n\nEsto es lo que va a recibir:\n────────────────\n${buildConsolidatedPickupText(pendingItems, selectedRecipient.name)}`}
                    confirmLabel="Sí, enviar"
                    onConfirm={() => {
                        // Dentro del clic de confirmar: fuera de un gesto del usuario el
                        // navegador bloquearía la ventana en silencio.
                        onAuditLog?.('PICKUP_NOTIFIED', `Avisó a ${selectedRecipient.name} para recoger ${pending.length} herramienta(s)`);
                        window.open(waUrl, '_blank', 'noopener,noreferrer');
                    }}
                    onClose={() => setConfirmandoAviso(false)}
                />
            )}

            {avisandoA && (
                <ConfirmDialog
                    title={`Avisar a ${avisandoA.persona.name}`}
                    message={`Se le va a enviar al ${avisandoA.persona.phone}\n\nEsto es lo que va a recibir:\n────────────────\n${avisandoA.texto}`}
                    confirmLabel="Sí, enviar"
                    onConfirm={() => {
                        onAuditLog?.('PICKUP_NOTIFIED', `Le avisó a ${avisandoA.persona.name} por sus propias herramientas`);
                        window.open(avisandoA.url, '_blank', 'noopener,noreferrer');
                    }}
                    onClose={() => setAvisandoA(null)}
                />
            )}

            {cancelingPickup && (
                <ConfirmDialog
                    title="Cancelar recogida"
                    message={`¿Cancelar "a recoger" para ${cancelingPickup.itemName}? Se quitará de la lista.`}
                    onConfirm={() => {
                        onBehaviorLog?.('ACTION', `Canceló recogida (Vista Recoger): ${cancelingPickup.itemName}`);
                        onMarkPendingPickup(cancelingPickup.movementId, false);
                    }}
                    onClose={() => setCancelingPickup(null)}
                />
            )}
        </div>
    );
};
