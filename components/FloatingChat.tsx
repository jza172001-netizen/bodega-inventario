import React, { useState, useRef, useEffect } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, Project, MovementType, InventoryType } from '../types';
import { askCopilot, parseExitIntent, parseCreationIntent, parseBulkAddIntent, ParsedExit, ParsedBulkAdd, BulkAddItem } from '../services/copilotService';

interface FloatingChatProps {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    purchaseOrders: PurchaseOrder[];
    projects: Project[];
    onLogMovements: (ms: Array<Omit<Movement, 'id'>>) => void;
    onCreateItem: (item: Omit<Item, 'id'>) => Item;
    onCreateProject: (p: Omit<Project, 'id'>) => Project;
    onCreatePersonnel: (p: Omit<Personnel, 'id'>) => Personnel;
}

type ChatMsg = {
    id: string;
    role: 'user' | 'bot';
    text: string;
    parsedExit?: ParsedExit;
    parsedBulkAdd?: ParsedBulkAdd;
    pendingItemCreate?: { name: string; unit: string };
    confirmed?: boolean;
};

const TYPE_LABELS: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: '⚡ H. Eléctrica',
    [InventoryType.HAND_TOOL]:       '🔨 H. Manual',
    [InventoryType.PPE]:             '🦺 EPP',
    [InventoryType.SINGLE_USE]:      '📦 Consumible',
};

const TYPE_COLORS: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    [InventoryType.HAND_TOOL]:       'bg-blue-100 text-blue-700 border-blue-300',
    [InventoryType.PPE]:             'bg-green-100 text-green-700 border-green-300',
    [InventoryType.SINGLE_USE]:      'bg-gray-100 text-gray-600 border-gray-300',
};

const uid = () => Math.random().toString(36).slice(2);
const WELCOME = 'Hola 👋 Dime qué necesitas:\n• "5 tornillos, 10 clavos, 1 pulidora" → los agrego al inventario\n• "Pedro lleva 1 pala y 5 tornillos para proyecto Torre" → agrego y despacho\n• "saqüé 3 cascos, trabajador Juan" → registro la salida\n• "crea el proyecto Edificio A"\n• Stock bajo, préstamos, movimientos…';

const QUICK = [
    { label: '📦 Stock bajo',      q: '¿Qué materiales tienen stock bajo?' },
    { label: '🔑 Préstamos',       q: '¿Qué herramientas están prestadas?' },
    { label: '🔥 Más consumidos',  q: '¿Cuáles son los más consumidos?' },
    { label: '🕒 Movimientos',     q: 'Muestra los últimos movimientos' },
    { label: '🛒 Órdenes',         q: '¿Órdenes de compra pendientes?' },
];

export const FloatingChat: React.FC<FloatingChatProps> = ({
    items, movements, personnel, purchaseOrders, projects,
    onLogMovements, onCreateItem, onCreateProject, onCreatePersonnel,
}) => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMsg[]>([{ id: uid(), role: 'bot', text: WELCOME }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasNew, setHasNew] = useState(false);
    const [exitSelections, setExitSelections] = useState<Record<string, Record<number, string>>>({});
    const [bulkTypes, setBulkTypes] = useState<Record<string, Record<number, InventoryType>>>({});
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) { setHasNew(false); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); }
    }, [messages, open]);

    const addBot = (text: string, extra?: Partial<ChatMsg>) => {
        const msg = { id: uid(), role: 'bot' as const, text, ...extra };
        setMessages(prev => [...prev, msg]);
        if (!open) setHasNew(true);
    };

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        setMessages(prev => [...prev, { id: uid(), role: 'user', text: trimmed }]);
        setInput('');
        setLoading(true);

        const creation = parseCreationIntent(trimmed);
        if (creation) {
            if (creation.type === 'project') {
                const p = onCreateProject({ name: creation.name, status: 'active' });
                addBot(`✅ Proyecto **${p.name}** creado.`);
            } else if (creation.type === 'personnel') {
                const p = onCreatePersonnel({ name: creation.name });
                addBot(`✅ Trabajador **${p.name}** registrado.`);
            } else if (creation.type === 'item') {
                if (creation.inventoryType) {
                    const it = onCreateItem({ name: creation.name, inventoryType: creation.inventoryType, quantity: 0, unit: creation.unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0, price: 0 });
                    addBot(`✅ Ítem **${it.name}** creado como ${TYPE_LABELS[creation.inventoryType]}.`);
                } else {
                    addBot(`¿Qué tipo de ítem es **"${creation.name}"**?`, { pendingItemCreate: { name: creation.name, unit: creation.unit } });
                }
            }
            setLoading(false);
            return;
        }

        const bulk = parseBulkAddIntent(trimmed, items, projects, personnel);
        if (bulk.isBulkAdd) {
            addBot('', { parsedBulkAdd: bulk });
            setLoading(false);
            return;
        }

        const parsed = parseExitIntent(trimmed, items, projects, personnel);
        if (parsed.isExitIntent) {
            if (parsed.movements.length === 0 || parsed.movements.every(m => !m.matchedItem && !m.candidates.length)) {
                addBot('No pude identificar ningún material. Intenta: "saqüé 5 cascos de seguridad, trabajador Pedro".');
            } else {
                addBot('', { parsedExit: parsed });
            }
            setLoading(false);
            return;
        }

        const resp = await askCopilot(trimmed, { items, movements, personnel, purchaseOrders });
        addBot(resp);
        setLoading(false);
    };

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); }
    };

    const handleConfirmExit = (msg: ChatMsg) => {
        const exit = msg.parsedExit!;
        const sel = exitSelections[msg.id] ?? {};
        const toLog: Array<Omit<Movement, 'id'>> = exit.movements.map((pm, idx) => {
            const item = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) ?? null : null);
            if (!item) return null;
            return { itemId: item.id, type: MovementType.CHECK_OUT, quantity: pm.quantity, timestamp: new Date(), personnelId: exit.matchedPersonnel?.id, projectId: exit.matchedProject?.id, notes: '', isLoan: false, isReturned: false };
        }).filter(Boolean) as Array<Omit<Movement, 'id'>>;
        if (!toLog.length) { addBot('No hay materiales confirmados.'); return; }
        onLogMovements(toLog);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
        addBot(`✅ ${toLog.length} salida(s) registradas.`);
    };

    const handleConfirmBulk = (msg: ChatMsg, withDispatch: boolean) => {
        const bulk = msg.parsedBulkAdd!;
        const myTypes = bulkTypes[msg.id] ?? {};
        const created: Item[] = [];

        bulk.items.forEach((bi, idx) => {
            const itemType = myTypes[idx] ?? bi.guessedType;
            let resolvedItem = bi.matchedItem;
            if (!resolvedItem) {
                resolvedItem = onCreateItem({ name: bi.rawName, inventoryType: itemType, quantity: 0, unit: bi.unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0, price: 0 });
                created.push(resolvedItem);
            }
        });

        const checkIns: Array<Omit<Movement, 'id'>> = bulk.items.map((bi, idx) => {
            const item = bi.matchedItem ?? created.find(c => c.name.toLowerCase() === bi.rawName.toLowerCase()) ?? null;
            if (!item) return null;
            return { itemId: item.id, type: MovementType.PURCHASE, quantity: bi.quantity, timestamp: new Date(), notes: 'Entrada desde asistente', isLoan: false, isReturned: false };
        }).filter(Boolean) as Array<Omit<Movement, 'id'>>;

        onLogMovements(checkIns);

        if (withDispatch && (bulk.matchedPersonnel || bulk.rawPersonnel)) {
            let worker = bulk.matchedPersonnel;
            if (!worker && bulk.rawPersonnel) worker = onCreatePersonnel({ name: bulk.rawPersonnel });
            let project = bulk.matchedProject;
            if (!project && bulk.rawProject) project = onCreateProject({ name: bulk.rawProject, status: 'active' });

            const checkOuts: Array<Omit<Movement, 'id'>> = bulk.items.map((bi, idx) => {
                const item = bi.matchedItem ?? created.find(c => c.name.toLowerCase() === bi.rawName.toLowerCase()) ?? null;
                if (!item) return null;
                return { itemId: item.id, type: MovementType.CHECK_OUT, quantity: bi.quantity, timestamp: new Date(), personnelId: worker?.id, projectId: project?.id, notes: '', isLoan: false, isReturned: false };
            }).filter(Boolean) as Array<Omit<Movement, 'id'>>;
            onLogMovements(checkOuts);
        }

        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
        const newCount = created.length;
        const total = bulk.items.length;
        let reply = `✅ ${total} ítem(s) agregados al inventario.`;
        if (newCount > 0) reply += ` (${newCount} creados nuevos)`;
        if (withDispatch) reply += bulk.matchedPersonnel ? ` Despachados a **${bulk.matchedPersonnel.name}**.` : bulk.rawPersonnel ? ` Despachados a **${bulk.rawPersonnel}**.` : '';
        addBot(reply);
    };

    const setBulkType = (msgId: string, idx: number, type: InventoryType) =>
        setBulkTypes(prev => ({ ...prev, [msgId]: { ...(prev[msgId] ?? {}), [idx]: type } }));

    const setExitSel = (msgId: string, idx: number, itemId: string) =>
        setExitSelections(prev => ({ ...prev, [msgId]: { ...(prev[msgId] ?? {}), [idx]: itemId } }));

    const handlePendingItemType = (msgId: string, name: string, unit: string, type: InventoryType) => {
        const it = onCreateItem({ name, inventoryType: type, quantity: 0, unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0, price: 0 });
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, confirmed: true } : m));
        addBot(`✅ Ítem **${it.name}** creado como ${TYPE_LABELS[type]}.`);
    };

    const renderMessage = (msg: ChatMsg) => {
        if (msg.parsedExit && !msg.confirmed)
            return <ExitCard key={msg.id} msg={msg} items={items} sel={exitSelections[msg.id] ?? {}} onSelect={(i, id) => setExitSel(msg.id, i, id)} onConfirm={() => handleConfirmExit(msg)} onCancel={() => { setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m)); addBot('Cancelado.'); }} />;

        if (msg.parsedBulkAdd && !msg.confirmed)
            return <BulkAddCard key={msg.id} msg={msg} myTypes={bulkTypes[msg.id] ?? {}} onTypeChange={(i, t) => setBulkType(msg.id, i, t)} onConfirm={(dispatch) => handleConfirmBulk(msg, dispatch)} onCancel={() => { setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m)); addBot('Cancelado.'); }} />;

        if (msg.pendingItemCreate && !msg.confirmed)
            return <TypePickCard key={msg.id} name={msg.pendingItemCreate.name} onSelect={(t) => handlePendingItemType(msg.id, msg.pendingItemCreate!.name, msg.pendingItemCreate!.unit, t)} />;

        return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                    {msg.text.replace(/\*\*(.+?)\*\*/g, '$1')}
                </div>
            </div>
        );
    };

    return (
        <>
            {open && (
                <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[340px] sm:w-[390px] flex flex-col rounded-2xl shadow-2xl border border-gray-200 overflow-hidden bg-white" style={{ maxHeight: 'min(560px, calc(100vh - 110px))' }}>
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-600 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🤖</span>
                            <div>
                                <p className="text-white font-bold text-sm leading-tight">Asistente de Bodega</p>
                                <p className="text-blue-200 text-[10px]">Crear · Agregar · Despachar · Consultar</p>
                            </div>
                        </div>
                        <button onClick={() => setOpen(false)} className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-blue-700 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>

                    <div className="bg-gray-50 px-3 py-2 flex flex-wrap gap-1.5 border-b border-gray-200 flex-shrink-0">
                        {QUICK.map(q => (
                            <button key={q.q} onClick={() => handleSend(q.q)} disabled={loading} className="px-2.5 py-1 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded-full text-[11px] font-semibold transition-all disabled:opacity-50">
                                {q.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
                        {messages.map(msg => renderMessage(msg))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                                    {[0,1,2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef}/>
                    </div>

                    <div className="border-t border-gray-200 px-3 py-2 flex gap-2 items-end flex-shrink-0">
                        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                            placeholder='Ej: "5 tornillos, 1 pulidora, 10 clavos" o "Pedro lleva 1 pala para proyecto Torre"'
                            rows={2} className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" style={{ maxHeight: '80px' }}
                        />
                        <button onClick={() => handleSend(input)} disabled={!input.trim() || loading} className="h-9 w-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl transition-all flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                        </button>
                    </div>
                </div>
            )}

            <button onClick={() => setOpen(v => !v)} className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-xl flex items-center justify-center transition-all duration-200" aria-label="Abrir asistente">
                {open
                    ? <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    : <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
                }
                {hasNew && !open && <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white animate-pulse"/>}
            </button>
        </>
    );
};

const BulkAddCard: React.FC<{
    msg: ChatMsg;
    myTypes: Record<number, InventoryType>;
    onTypeChange: (idx: number, t: InventoryType) => void;
    onConfirm: (withDispatch: boolean) => void;
    onCancel: () => void;
}> = ({ msg, myTypes, onTypeChange, onConfirm, onCancel }) => {
    const bulk = msg.parsedBulkAdd!;
    const hasWorker = !!(bulk.matchedPersonnel || bulk.rawPersonnel);

    return (
        <div className="w-full bg-white border border-blue-200 rounded-2xl rounded-bl-sm shadow-md p-3">
            <p className="text-xs font-black text-blue-500 uppercase tracking-widest mb-2">📥 Agregar al inventario</p>
            <div className="space-y-1.5 mb-3">
                {bulk.items.map((bi, idx) => {
                    const currentType = myTypes[idx] ?? bi.guessedType;
                    const isNew = !bi.matchedItem;
                    return (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50">
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isNew ? 'bg-blue-400' : 'bg-green-400'}`}/>
                            <span className="text-sm font-bold text-gray-700 min-w-0 flex-1 truncate">
                                {bi.quantity}× {bi.rawName}
                                {!isNew && <span className="text-xs text-green-600 font-normal ml-1">(en stock)</span>}
                                {isNew && <span className="text-xs text-blue-500 font-normal ml-1">(nuevo)</span>}
                            </span>
                            {isNew && (
                                <select value={currentType} onChange={e => onTypeChange(idx, e.target.value as InventoryType)}
                                    className="text-[10px] border border-gray-200 rounded-lg px-1 py-0.5 bg-white text-gray-600 flex-shrink-0">
                                    {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([t, l]) => (
                                        <option key={t} value={t}>{l}</option>
                                    ))}
                                </select>
                            )}
                            {!isNew && (
                                <span className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ${TYPE_COLORS[bi.matchedItem!.inventoryType]}`}>
                                    {TYPE_LABELS[bi.matchedItem!.inventoryType]}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            {(bulk.matchedPersonnel || bulk.rawPersonnel) && (
                <div className="mb-2 flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">👤</span>
                    <span className="text-xs font-semibold text-gray-700">{bulk.matchedPersonnel?.name || bulk.rawPersonnel}</span>
                    {bulk.matchedProject && <><span className="text-xs text-gray-400">·</span><span className="text-xs text-gray-600">📌 {bulk.matchedProject.name}</span></>}
                    {!bulk.matchedProject && bulk.rawProject && <><span className="text-xs text-gray-400">·</span><span className="text-xs text-amber-600">📌 {bulk.rawProject} (nuevo)</span></>}
                </div>
            )}
            <div className="flex gap-2">
                <button onClick={() => onConfirm(false)} className="flex-1 py-1.5 border border-blue-500 text-blue-600 hover:bg-blue-50 font-bold rounded-xl text-xs transition-all">
                    📥 Solo inventario
                </button>
                {hasWorker && (
                    <button onClick={() => onConfirm(true)} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all">
                        📤 Agregar y despachar
                    </button>
                )}
                <button onClick={onCancel} className="px-3 py-1.5 border border-gray-200 text-gray-400 hover:bg-gray-50 rounded-xl text-xs font-semibold">✕</button>
            </div>
        </div>
    );
};

const ExitCard: React.FC<{
    msg: ChatMsg;
    items: Item[];
    sel: Record<number, string>;
    onSelect: (idx: number, id: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ msg, items, sel, onSelect, onConfirm, onCancel }) => {
    const exit = msg.parsedExit!;
    const canConfirm = exit.movements.some((pm, idx) => pm.matchedItem || sel[idx]);

    return (
        <div className="w-full bg-white border border-orange-200 rounded-2xl rounded-bl-sm shadow-md p-3">
            <p className="text-xs font-black text-orange-500 uppercase tracking-widest mb-2">📤 Confirmar salidas</p>
            <div className="space-y-1.5 mb-3">
                {exit.movements.map((pm, idx) => {
                    const chosen = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) : undefined);
                    return (
                        <div key={idx} className="p-2 rounded-xl bg-gray-50">
                            <div className="flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${chosen ? 'bg-green-400' : pm.candidates.length ? 'bg-amber-400' : 'bg-red-300'}`}/>
                                <span className="text-sm font-bold text-gray-700">{pm.quantity}×</span>
                                <span className="text-sm text-gray-500 italic truncate">"{pm.rawName}"</span>
                            </div>
                            {chosen && <p className="text-xs text-green-700 font-semibold ml-5 mt-0.5">→ {chosen.name}</p>}
                            {!chosen && pm.candidates.length > 0 && (
                                <div className="ml-5 mt-1 flex flex-wrap gap-1">
                                    {pm.candidates.map(c => (
                                        <button key={c.id} onClick={() => onSelect(idx, c.id)}
                                            className={`text-xs px-2 py-0.5 rounded-full border transition-all ${sel[idx] === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {!chosen && !pm.candidates.length && <p className="text-xs text-red-400 ml-5 mt-0.5">No encontrado en inventario</p>}
                        </div>
                    );
                })}
            </div>
            {exit.matchedPersonnel && (
                <div className="mb-2 text-xs text-gray-600 flex items-center gap-1.5">
                    <span>👤</span><span className="font-semibold">{exit.matchedPersonnel.name}</span>
                    {exit.matchedProject && <><span className="text-gray-400">·</span><span>📌 {exit.matchedProject.name}</span></>}
                </div>
            )}
            <div className="flex gap-2">
                <button onClick={onConfirm} disabled={!canConfirm} className="flex-1 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                    ✅ Confirmar y registrar
                </button>
                <button onClick={onCancel} className="px-3 py-1.5 border border-gray-200 text-gray-400 hover:bg-gray-50 rounded-xl text-xs font-semibold">✕</button>
            </div>
        </div>
    );
};

const TypePickCard: React.FC<{ name: string; onSelect: (t: InventoryType) => void }> = ({ name, onSelect }) => (
    <div className="w-full bg-white border border-gray-200 rounded-2xl rounded-bl-sm p-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-700 mb-2">¿Qué tipo es <span className="text-blue-600">"{name}"</span>?</p>
        <div className="grid grid-cols-2 gap-1.5">
            {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([type, label]) => (
                <button key={type} onClick={() => onSelect(type)} className={`py-2 px-2 border rounded-xl text-xs font-semibold text-gray-700 transition-all text-left hover:border-blue-400 hover:bg-blue-50 ${TYPE_COLORS[type]}`}>
                    {label}
                </button>
            ))}
        </div>
    </div>
);
