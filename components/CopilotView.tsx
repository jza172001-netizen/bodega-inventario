import React, { useState, useRef, useEffect } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, MovementType, PurchaseOrderStatus, Project, InventoryType } from '../types';
import { generateInventoryAnalysis } from '../services/geminiService';
import { askCopilot, parseExitIntent, parseCreationIntent, ParsedExit, PendingMovement } from '../services/copilotService';

interface CopilotViewProps {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    purchaseOrders: PurchaseOrder[];
    projects: Project[];
    onLogMovements: (movements: Array<Omit<Movement, 'id'>>) => void;
    onCreateItem: (item: Omit<Item, 'id'>) => Item;
    onCreateProject: (project: Omit<Project, 'id'>) => Project;
    onCreatePersonnel: (person: Omit<Personnel, 'id'>) => Personnel;
}

type ChatMsg = {
    id: string;
    role: 'user' | 'bot';
    text: string;
    parsedExit?: ParsedExit;
    pendingItemCreate?: { name: string; unit: string };
    confirmed?: boolean;
};

const TYPE_LABELS: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: '⚡ H. Eléctrica',
    [InventoryType.HAND_TOOL]: '🔨 H. Manual',
    [InventoryType.PPE]: '🦺 Seguridad (EPP)',
    [InventoryType.SINGLE_USE]: '📦 Consumible',
};

const uid = () => Math.random().toString(36).slice(2);

const WELCOME = 'Hola 👋 Puedo registrar salidas, **crear proyectos, trabajadores e ítems** directamente desde aquí.\n\nEjemplos:\n• "saqué 5 cascos para proyecto Torre 5, trabajador Pedro"\n• "crea el proyecto Edificio Centro"\n• "añade al trabajador Miguel Torres"\n• "añade el ítem Tornillo M8"';

const CopilotView: React.FC<CopilotViewProps> = ({
    items, movements, personnel, purchaseOrders, projects,
    onLogMovements, onCreateItem, onCreateProject, onCreatePersonnel,
}) => {
    const [messages, setMessages] = useState<ChatMsg[]>([
        { id: uid(), role: 'bot', text: WELCOME }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [selections, setSelections] = useState<Record<string, Record<number, string>>>({});
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addBot = (text: string, extra?: Partial<ChatMsg>) => {
        setMessages(prev => [...prev, { id: uid(), role: 'bot', text, ...extra }]);
    };

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        setMessages(prev => [...prev, { id: uid(), role: 'user', text: trimmed }]);
        setInput('');
        setLoading(true);

        // 1. Creation intents
        const creation = parseCreationIntent(trimmed);
        if (creation) {
            if (creation.type === 'project') {
                const p = onCreateProject({ name: creation.name, status: 'active' });
                addBot(`✅ Proyecto **${p.name}** creado. Ya puedes usarlo cuando registres salidas.`);
            } else if (creation.type === 'personnel') {
                const p = onCreatePersonnel({ name: creation.name });
                addBot(`✅ Trabajador **${p.name}** registrado.`);
            } else if (creation.type === 'item') {
                if (creation.inventoryType) {
                    const it = onCreateItem({
                        name: creation.name, inventoryType: creation.inventoryType,
                        quantity: 0, unit: creation.unit, category: 'Sin clasificar',
                        subCategory: 'General', minStock: 0, price: 0,
                    });
                    addBot(`✅ Ítem **${it.name}** agregado como ${TYPE_LABELS[creation.inventoryType]}.`);
                } else {
                    addBot(`¿Qué tipo de ítem es **"${creation.name}"**? Selecciona una categoría:`,
                        { pendingItemCreate: { name: creation.name, unit: creation.unit } });
                }
            }
            setLoading(false);
            return;
        }

        // 2. Exit intents
        const parsed = parseExitIntent(trimmed, items, projects, personnel);
        if (parsed.isExitIntent) {
            const allUnknown = parsed.movements.every(m => !m.matchedItem && !m.candidates.length);
            if (parsed.movements.length === 0 || allUnknown) {
                addBot('No pude identificar ningún material. Intenta especificar el nombre, por ej: "saqué 5 cascos de seguridad".');
            } else {
                addBot('', { parsedExit: parsed });
            }
        } else {
            // 3. General queries
            if (/informe|reporte|análisis completo/i.test(trimmed)) {
                try {
                    const txt = await generateInventoryAnalysis(items, movements);
                    addBot(txt);
                } catch { addBot('Error generando el informe.'); }
            } else {
                const resp = await askCopilot(trimmed, { items, movements, personnel, purchaseOrders });
                addBot(resp);
            }
        }
        setLoading(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); }
    };

    const handleConfirmExit = (msg: ChatMsg) => {
        const exit = msg.parsedExit!;
        const sel = selections[msg.id] ?? {};
        const toLog: Array<Omit<Movement, 'id'>> = exit.movements.map((pm, idx) => {
            const item = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) ?? null : null);
            if (!item) return null;
            return { itemId: item.id, type: MovementType.CHECK_OUT, quantity: pm.quantity,
                timestamp: new Date(), personnelId: exit.matchedPersonnel?.id,
                projectId: exit.matchedProject?.id, notes: '', isLoan: false, isReturned: false };
        }).filter(Boolean) as Array<Omit<Movement, 'id'>>;
        if (!toLog.length) { addBot('No hay materiales confirmados para registrar.'); return; }
        onLogMovements(toLog);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
        addBot(`✅ ${toLog.length} salida(s) registradas correctamente.`);
    };

    const handleCancelExit = (msgId: string) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, confirmed: true } : m));
        addBot('Cancelado.');
    };

    const setSelection = (msgId: string, movIdx: number, itemId: string) =>
        setSelections(prev => ({ ...prev, [msgId]: { ...(prev[msgId] ?? {}), [movIdx]: itemId } }));

    const handleInlineItemCreate = (msgId: string, movIdx: number, name: string, unit: string, type: InventoryType) => {
        const newItem = onCreateItem({ name, inventoryType: type, quantity: 0, unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0, price: 0 });
        setSelection(msgId, movIdx, newItem.id);
    };

    const handleInlineProjectCreate = (msgId: string, name: string) => {
        const p = onCreateProject({ name, status: 'active' });
        setMessages(prev => prev.map(m => m.id === msgId && m.parsedExit
            ? { ...m, parsedExit: { ...m.parsedExit!, matchedProject: p } }
            : m));
    };

    const handleInlinePersonnelCreate = (msgId: string, name: string) => {
        const p = onCreatePersonnel({ name });
        setMessages(prev => prev.map(m => m.id === msgId && m.parsedExit
            ? { ...m, parsedExit: { ...m.parsedExit!, matchedPersonnel: p } }
            : m));
    };

    const handlePendingItemType = (msgId: string, name: string, unit: string, type: InventoryType) => {
        const it = onCreateItem({ name, inventoryType: type, quantity: 0, unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0, price: 0 });
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, confirmed: true } : m));
        addBot(`✅ Ítem **${it.name}** agregado como ${TYPE_LABELS[type]}.`);
    };

    const QUICK = [
        { label: '📦 Stock bajo', q: 'Que materiales tienen stock bajo?' },
        { label: '🔑 Préstamos activos', q: 'Que herramientas estan prestadas?' },
        { label: '🔥 Más consumidos', q: 'Cuales son los mas consumidos?' },
        { label: '🕒 Últimos movimientos', q: 'Muestra los ultimos movimientos' },
        { label: '🛒 Órdenes pendientes', q: 'Ordenes de compra pendientes?' },
    ];

    return (
        <div className="flex flex-col h-full max-h-[calc(100vh-9rem)]">
            <div className="mb-3">
                <h1 className="text-2xl font-black text-gray-800">Asistente de Bodega</h1>
                <p className="text-gray-500 text-sm mt-0.5">Registra salidas, crea proyectos, trabajadores e ítems con lenguaje natural.</p>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
                {QUICK.map(q => (
                    <button key={q.q} onClick={() => handleSend(q.q)}
                        className="px-3 py-1.5 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded-full text-xs font-semibold transition-all">
                        {q.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4 min-h-[250px]">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.parsedExit && !msg.confirmed ? (
                            <ExitConfirmCard
                                msgId={msg.id}
                                exit={msg.parsedExit}
                                items={items}
                                sel={selections[msg.id] ?? {}}
                                onSelect={(idx, id) => setSelection(msg.id, idx, id)}
                                onCreateItem={(idx, name, unit, type) => handleInlineItemCreate(msg.id, idx, name, unit, type)}
                                onCreateProject={(name) => handleInlineProjectCreate(msg.id, name)}
                                onCreatePersonnel={(name) => handleInlinePersonnelCreate(msg.id, name)}
                                onConfirm={() => handleConfirmExit(msg)}
                                onCancel={() => handleCancelExit(msg.id)}
                            />
                        ) : msg.pendingItemCreate && !msg.confirmed ? (
                            <PendingItemTypeCard
                                name={msg.pendingItemCreate.name}
                                unit={msg.pendingItemCreate.unit}
                                onSelect={(type) => handlePendingItemType(msg.id, msg.pendingItemCreate!.name, msg.pendingItemCreate!.unit, type)}
                            />
                        ) : (
                            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                                msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                            }`}>
                                {msg.text.replace(/\*\*(.+?)\*\*/g, '$1')}
                            </div>
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                            {[0,1,2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="mt-3 flex gap-2 items-end">
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder='Ej: "saqué 5 cascos para proyecto X, trabajador Y" · "crea el proyecto Torre" · "añade ítem Tornillo M8"'
                    rows={2}
                    className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button onClick={() => handleSend(input)} disabled={!input.trim() || loading}
                    className="h-[3.5rem] px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-all flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    </svg>
                </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
    );
};

// ─── PendingItemTypeCard ─────────────────────────────────────────────────────

const PendingItemTypeCard: React.FC<{ name: string; unit: string; onSelect: (t: InventoryType) => void }> = ({ name, onSelect }) => (
    <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl rounded-bl-sm p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-700 mb-3">¿Qué tipo de ítem es <span className="text-blue-600">"{name}"</span>?</p>
        <div className="grid grid-cols-2 gap-2">
            {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([type, label]) => (
                <button key={type} onClick={() => onSelect(type)}
                    className="py-2 px-3 border border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl text-xs font-semibold text-gray-700 transition-all text-left">
                    {label}
                </button>
            ))}
        </div>
    </div>
);

// ─── ExitConfirmCard ─────────────────────────────────────────────────────────

interface ExitConfirmCardProps {
    msgId: string;
    exit: ParsedExit;
    items: Item[];
    sel: Record<number, string>;
    onSelect: (idx: number, itemId: string) => void;
    onCreateItem: (idx: number, name: string, unit: string, type: InventoryType) => void;
    onCreateProject: (name: string) => void;
    onCreatePersonnel: (name: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

const ExitConfirmCard: React.FC<ExitConfirmCardProps> = ({
    exit, items, sel, onSelect, onCreateItem, onCreateProject, onCreatePersonnel, onConfirm, onCancel
}) => {
    const canConfirm = exit.movements.some((pm, idx) => pm.matchedItem || sel[idx]);

    return (
        <div className="w-full max-w-[92%] bg-white border border-blue-200 rounded-2xl rounded-bl-sm shadow-md p-4">
            <p className="text-xs font-black text-blue-500 uppercase tracking-widest mb-3">📋 Confirmar salidas</p>

            <div className="space-y-2 mb-3">
                {exit.movements.map((pm, idx) => (
                    <MovementRow key={idx} pm={pm} idx={idx} items={items} sel={sel}
                        onSelect={onSelect} onCreateItem={onCreateItem} />
                ))}
            </div>

            {/* Proyecto */}
            <div className="mb-2">
                {exit.matchedProject ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                        📌 <span className="font-semibold">{exit.matchedProject.name}</span>
                    </span>
                ) : exit.rawProject ? (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600">📌 Proyecto "{exit.rawProject}" no existe.</span>
                        <button onClick={() => onCreateProject(exit.rawProject)}
                            className="text-xs font-black text-blue-600 hover:underline">+ Crear</button>
                    </div>
                ) : null}
            </div>

            {/* Trabajador */}
            <div className="mb-3">
                {exit.matchedPersonnel ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                        👤 <span className="font-semibold">{exit.matchedPersonnel.name}</span>
                    </span>
                ) : exit.rawPersonnel ? (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600">👤 Trabajador "{exit.rawPersonnel}" no existe.</span>
                        <button onClick={() => onCreatePersonnel(exit.rawPersonnel)}
                            className="text-xs font-black text-blue-600 hover:underline">+ Crear</button>
                    </div>
                ) : null}
            </div>

            <div className="flex gap-2">
                <button onClick={onConfirm} disabled={!canConfirm}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-sm transition-all">
                    ✅ Confirmar y registrar
                </button>
                <button onClick={onCancel} className="px-4 py-2 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-xl text-sm font-semibold">
                    ✕
                </button>
            </div>
        </div>
    );
};

// ─── MovementRow ─────────────────────────────────────────────────────────────

const MovementRow: React.FC<{
    pm: PendingMovement; idx: number; items: Item[];
    sel: Record<number, string>;
    onSelect: (idx: number, id: string) => void;
    onCreateItem: (idx: number, name: string, unit: string, type: InventoryType) => void;
}> = ({ pm, idx, items, sel, onSelect, onCreateItem }) => {
    const [showCreate, setShowCreate] = useState(false);
    const chosen = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) ?? null : null);

    return (
        <div className="flex items-start gap-3 p-2.5 rounded-xl bg-gray-50">
            <span className={`mt-0.5 w-3 h-3 rounded-full flex-shrink-0 ${chosen ? 'bg-green-400' : pm.candidates.length ? 'bg-amber-400' : 'bg-red-300'}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-black text-gray-700">{pm.quantity}</span>
                    <span className="text-sm text-gray-500 italic truncate">"{pm.rawName}"</span>
                </div>
                {chosen ? (
                    <p className="text-xs text-green-700 font-semibold mt-0.5">→ {chosen.name}</p>
                ) : pm.candidates.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                        <p className="text-xs text-amber-600 w-full mb-0.5">¿Cuál de estos?</p>
                        {pm.candidates.map(c => (
                            <button key={c.id} onClick={() => onSelect(idx, c.id)}
                                className={`text-xs px-2 py-0.5 rounded-full border transition-all ${sel[idx] === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                                {c.name}
                            </button>
                        ))}
                    </div>
                ) : showCreate ? (
                    <div className="mt-1 grid grid-cols-2 gap-1">
                        {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([type, label]) => (
                            <button key={type} onClick={() => { onCreateItem(idx, pm.rawName, pm.unit, type); setShowCreate(false); }}
                                className="py-1 px-2 border border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-lg text-[10px] font-semibold text-gray-600 transition-all text-left">
                                {label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-red-500">No encontrado</p>
                        <button onClick={() => setShowCreate(true)}
                            className="text-xs font-black text-blue-600 hover:underline">+ Crear ítem</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CopilotView;
