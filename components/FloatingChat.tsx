import React, { useState, useRef, useEffect } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, MovementType, Project, InventoryType } from '../types';
import {
    askCopilot, parseExitIntent, parseCreationIntent, parseBulkAddIntent,
    ParsedExit, BulkAddItem
} from '../services/copilotService';

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

const TYPE_LABELS: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: '⚡ Herr. Eléctrica',
    [InventoryType.HAND_TOOL]: '🔨 Herr. Manual',
    [InventoryType.PPE]: '🦺 EPP',
    [InventoryType.SINGLE_USE]: '📦 Consumible',
};

const uid = () => Math.random().toString(36).slice(2);

type DispatchStep = 'manual' | 'electrical' | 'consumables' | 'ready';

interface ActiveDispatch {
    worker: Personnel | null;
    rawWorker: string;
    project: Project | null;
    rawProject: string;
    manual: BulkAddItem[];
    electrical: BulkAddItem[];
    consumables: BulkAddItem[];
    step: DispatchStep;
}

type ChatMsg = {
    id: string;
    role: 'user' | 'bot';
    text: string;
    parsedExit?: ParsedExit;
    exitConfirmed?: boolean;
    dispatchSummary?: { dispatch: ActiveDispatch };
    dispatchConfirmed?: boolean;
    pendingItemCreate?: { name: string; unit: string };
    pendingItemConfirmed?: boolean;
};

const QUICK = [
    { label: '📦 Stock bajo',        q: '¿Qué materiales tienen stock bajo?' },
    { label: '🔑 Préstamos activos',  q: '¿Qué herramientas están prestadas?' },
    { label: '🔥 Más consumidos',     q: '¿Cuáles son los más consumidos?' },
    { label: '🕒 Últimos movimientos', q: 'Muestra los últimos movimientos' },
    { label: '🛒 Órdenes pendientes', q: '¿Órdenes de compra pendientes?' },
];

const WELCOME = '¡Hola! 👋 Puedo ayudarte a:\n• Despachar ítems a un trabajador (guiado paso a paso)\n• Subir ítems al inventario en un solo mensaje\n• Registrar salidas, crear proyectos y personal\n\nEjemplos:\n"Pedro va a trabajar en proyecto Torre"\n"5 tornillos, 10 clavos, 1 pulidora, 1 pica"\n"saqué 3 cascos para proyecto X"';

function guessType(name: string): InventoryType {
    const n = name.toLowerCase();
    if (/taladro|esmeril|sierra|amoladora|compresor|vibrador|pulidora|soldador|generador|cortador|rotomartillo|hidrolavador/.test(n))
        return InventoryType.ELECTRICAL_TOOL;
    if (/llave|martillo|destornillador|alicate|cincel|pala|pico|pica|serrucho|palustre|barra|hacha|palín|rastrillo|carretilla|flexómetro|plomada|tenaza/.test(n))
        return InventoryType.HAND_TOOL;
    if (/casco|guante|gafa|arnés|chaleco|tapaoido|bota|overol|mascarilla|respirador|careta|rodillera/.test(n))
        return InventoryType.PPE;
    return InventoryType.SINGLE_USE;
}

function parseItemList(text: string, forceType?: InventoryType, allItems: Item[] = []): BulkAddItem[] {
    const UNIT_PAT = /^(.+?)\s+(und|kg|m|bolsas?|pares?|cajas?|litros?|lt|rollos?|metros?|sacos?)$/i;
    const parts = text.split(/\s+(?:y|e)\s+|,\s*/).map(p => p.trim()).filter(Boolean);
    return parts.flatMap(part => {
        const nm = part.match(/^(\d+(?:[.,]\d+)?|un[ao]?)\s+(.{2,})/i);
        if (!nm) return [];
        const qStr = nm[1];
        const quantity = /^un[ao]?$/i.test(qStr) ? 1 : parseFloat(qStr.replace(',', '.')) || 1;
        let namePart = nm[2].trim();
        let unit = 'und';
        const um = namePart.match(UNIT_PAT);
        if (um) { namePart = um[1].trim(); unit = um[2].toLowerCase(); }
        if (namePart.length < 2) return [];
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, ' ').trim();
        const nq = norm(namePart);
        const matchedItem = allItems.find(i => norm(i.name) === nq || norm(i.name).includes(nq) || nq.includes(norm(i.name).split(' ')[0])) ?? null;
        const candidates = matchedItem ? [] : allItems.filter(i => {
            const n = norm(i.name); const q = nq;
            return n.includes(q.split(' ')[0]) || q.includes(n.split(' ')[0]);
        }).slice(0, 3);
        return [{ rawName: namePart, quantity, unit, guessedType: forceType ?? guessType(namePart), matchedItem, candidates }];
    });
}

export const FloatingChat: React.FC<FloatingChatProps> = ({
    items, movements, personnel, purchaseOrders, projects,
    onLogMovements, onCreateItem, onCreateProject, onCreatePersonnel,
}) => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMsg[]>([{ id: uid(), role: 'bot', text: WELCOME }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasNew, setHasNew] = useState(false);
    const [activeDispatch, setActiveDispatch] = useState<ActiveDispatch | null>(null);
    const [exitSel, setExitSel] = useState<Record<string, Record<number, string>>>({});
    const [typeOvr, setTypeOvr] = useState<Record<string, Record<string, InventoryType>>>({});
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) setHasNew(false);
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, open]);

    const addBot = (text: string, extra?: Partial<ChatMsg>) => {
        setMessages(prev => [...prev, { id: uid(), role: 'bot', text, ...extra }]);
        if (!open) setHasNew(true);
    };

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        setMessages(prev => [...prev, { id: uid(), role: 'user', text: trimmed }]);
        setInput('');
        setLoading(true);

        // ── FLUJO GUIADO (multi-turno) ─────────────────────────────────────────
        if (activeDispatch) {
            const { step } = activeDispatch;

            if (step === 'manual') {
                const manual = /ninguna?|no|nada/i.test(trimmed) ? [] : parseItemList(trimmed, InventoryType.HAND_TOOL, items);
                const next: ActiveDispatch = { ...activeDispatch, manual, step: 'electrical' };
                setActiveDispatch(next);
                addBot(`✅ ${manual.length} herramienta(s) manual(es).\n\n¿Qué **herramientas eléctricas** se va a llevar?\n_Ej: "1 pulidora, 1 taladro" — o "ninguna"_`);
            } else if (step === 'electrical') {
                const electrical = /ninguna?|no|nada/i.test(trimmed) ? [] : parseItemList(trimmed, InventoryType.ELECTRICAL_TOOL, items);
                const next: ActiveDispatch = { ...activeDispatch, electrical, step: 'consumables' };
                setActiveDispatch(next);
                addBot(`✅ ${electrical.length} herramienta(s) eléctrica(s).\n\n¿Qué **consumibles o EPP** se va a llevar?\n_Ej: "5 tornillos, 2 cascos" — o "ninguno"_`);
            } else if (step === 'consumables') {
                const consumables = /ninguna?|no|nada/i.test(trimmed) ? [] : parseItemList(trimmed, InventoryType.SINGLE_USE, items);
                const finalDispatch: ActiveDispatch = { ...activeDispatch, consumables, step: 'ready' };
                setActiveDispatch(null);
                const all = [...finalDispatch.manual, ...finalDispatch.electrical, ...finalDispatch.consumables];
                if (all.length === 0) {
                    addBot('No registré ningún ítem. ¿Deseas intentar de nuevo?');
                } else {
                    addBot('', { dispatchSummary: { dispatch: finalDispatch } });
                }
            }
            setLoading(false);
            return;
        }

        // ── 1. CREACIÓN ────────────────────────────────────────────────────────
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
                    addBot(`✅ Ítem **${it.name}** (${TYPE_LABELS[creation.inventoryType]}) creado.`);
                } else {
                    addBot(`¿Qué tipo de ítem es **"${creation.name}"**?`, { pendingItemCreate: { name: creation.name, unit: creation.unit } });
                }
            }
            setLoading(false);
            return;
        }

        // ── 2. SALIDAS (checkout) ──────────────────────────────────────────────
        const exit = parseExitIntent(trimmed, items, projects, personnel);
        if (exit.isExitIntent) {
            if (exit.movements.length === 0) {
                addBot('No pude identificar ítems. Ej: "saqué 5 cascos para proyecto Torre, trabajador Pedro"');
            } else {
                addBot('', { parsedExit: exit });
            }
            setLoading(false);
            return;
        }

        // ── 3. INICIO DE DESPACHO (detectar trabajador) ────────────────────────
        let rawWorker = '';
        let rawProject = '';

        const wm = trimmed.match(/(?:(?:el\s+|al?\s+)?(?:trabajador|operario|empleado)\s+)([A-Za-záéíóúÁÉÍÓÚñÑ]+(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑ]+)?)/i);
        if (wm) rawWorker = wm[1].trim();

        if (!rawWorker) {
            for (const p of personnel) {
                const first = p.name.split(' ')[0].toLowerCase();
                if (first.length > 2 && trimmed.toLowerCase().includes(first)) {
                    rawWorker = p.name; break;
                }
            }
        }

        const pm = trimmed.match(/(?:proyecto\s+|para\s+(?:el\s+)?proyecto\s+|en\s+(?:el\s+)?proyecto\s+)([^,\n]+?)(?:\s*,|\s*$)/i);
        if (pm) rawProject = pm[1].trim();

        if (rawWorker) {
            const worker = personnel.find(p => p.name.toLowerCase().includes(rawWorker.toLowerCase()) || rawWorker.toLowerCase().includes(p.name.toLowerCase().split(' ')[0])) ?? null;
            const project = rawProject ? (projects.find(p => p.name.toLowerCase().includes(rawProject.toLowerCase())) ?? null) : null;

            // Si ya viene con ítems en el mismo mensaje
            const bulk = parseBulkAddIntent(trimmed, items, projects, personnel);
            if (bulk.isBulkAdd && bulk.items.length > 0) {
                const dispatch: ActiveDispatch = {
                    worker, rawWorker, project, rawProject,
                    manual: bulk.items.filter(i => i.guessedType === InventoryType.HAND_TOOL),
                    electrical: bulk.items.filter(i => i.guessedType === InventoryType.ELECTRICAL_TOOL),
                    consumables: bulk.items.filter(i => i.guessedType === InventoryType.PPE || i.guessedType === InventoryType.SINGLE_USE),
                    step: 'ready',
                };
                addBot('', { dispatchSummary: { dispatch } });
            } else {
                // Flujo guiado
                const d: ActiveDispatch = { worker, rawWorker, project, rawProject, manual: [], electrical: [], consumables: [], step: 'manual' };
                setActiveDispatch(d);
                const wLabel = worker?.name ?? rawWorker;
                const pLabel = project?.name ?? rawProject;
                addBot(`👷 **${wLabel}**${pLabel ? ` → proyecto **${pLabel}**` : ''}\n\n¿Qué **herramientas manuales** se va a llevar?\n_Ej: "1 pala, 1 pica" — o "ninguna"_`);
            }
            setLoading(false);
            return;
        }

        // ── 4. SUBIR AL INVENTARIO (sin despachar) ────────────────────────────
        const bulk = parseBulkAddIntent(trimmed, items, projects, personnel);
        if (bulk.isBulkAdd && bulk.items.length > 0) {
            const dispatch: ActiveDispatch = {
                worker: null, rawWorker: '', project: null, rawProject: '',
                manual: bulk.items.filter(i => i.guessedType === InventoryType.HAND_TOOL),
                electrical: bulk.items.filter(i => i.guessedType === InventoryType.ELECTRICAL_TOOL),
                consumables: bulk.items.filter(i => i.guessedType !== InventoryType.HAND_TOOL && i.guessedType !== InventoryType.ELECTRICAL_TOOL),
                step: 'ready',
            };
            addBot('', { dispatchSummary: { dispatch } });
            setLoading(false);
            return;
        }

        // ── 5. Q&A ────────────────────────────────────────────────────────────
        const resp = await askCopilot(trimmed, { items, movements, personnel, purchaseOrders });
        addBot(resp);
        setLoading(false);
    };

    const executeDispatch = (msg: ChatMsg, withCheckout: boolean) => {
        const { dispatch } = msg.dispatchSummary!;
        const ovr = typeOvr[msg.id] ?? {};
        const allItems = [...dispatch.manual, ...dispatch.electrical, ...dispatch.consumables];
        const toLog: Array<Omit<Movement, 'id'>> = [];

        let resolvedWorker = dispatch.worker;
        let resolvedProject = dispatch.project;

        if (withCheckout) {
            if (!resolvedWorker && dispatch.rawWorker) resolvedWorker = onCreatePersonnel({ name: dispatch.rawWorker });
            if (!resolvedProject && dispatch.rawProject) resolvedProject = onCreateProject({ name: dispatch.rawProject, status: 'active' });
        }

        for (const bi of allItems) {
            const type = ovr[bi.rawName] ?? bi.guessedType;
            const item = bi.matchedItem ?? onCreateItem({ name: bi.rawName, inventoryType: type, quantity: 0, unit: bi.unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0, price: 0 });

            toLog.push({ itemId: item.id, type: MovementType.PURCHASE, quantity: bi.quantity, timestamp: new Date(), notes: 'Ingreso por asistente', isLoan: false, isReturned: false });

            if (withCheckout) {
                toLog.push({ itemId: item.id, type: MovementType.CHECK_OUT, quantity: bi.quantity, timestamp: new Date(), personnelId: resolvedWorker?.id, projectId: resolvedProject?.id, notes: '', isLoan: false, isReturned: false });
            }
        }

        onLogMovements(toLog);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, dispatchConfirmed: true } : m));
        const n = allItems.length;
        if (withCheckout) {
            addBot(`✅ ${n} ítem(s) subidos al inventario y despachados a **${resolvedWorker?.name ?? dispatch.rawWorker}**${resolvedProject ? ` — proyecto **${resolvedProject.name}**` : ''}.`);
        } else {
            addBot(`✅ ${n} ítem(s) subidos al inventario correctamente.`);
        }
    };

    const confirmExit = (msg: ChatMsg) => {
        const exit = msg.parsedExit!;
        const sel = exitSel[msg.id] ?? {};
        const toLog: Array<Omit<Movement, 'id'>> = exit.movements.flatMap((pm, idx) => {
            const item = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) ?? null : null);
            if (!item) return [];
            return [{ itemId: item.id, type: MovementType.CHECK_OUT, quantity: pm.quantity, timestamp: new Date(), personnelId: exit.matchedPersonnel?.id, projectId: exit.matchedProject?.id, notes: '', isLoan: false, isReturned: false }];
        });
        if (!toLog.length) { addBot('No hay ítems confirmados.'); return; }
        onLogMovements(toLog);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, exitConfirmed: true } : m));
        addBot(`✅ ${toLog.length} salida(s) registradas.`);
    };

    const stepHint = activeDispatch
        ? activeDispatch.step === 'manual' ? 'Herramientas manuales (o "ninguna")'
        : activeDispatch.step === 'electrical' ? 'Herramientas eléctricas (o "ninguna")'
        : 'Consumibles / EPP (o "ninguno")'
        : 'Escribe o usa los botones rápidos…';

    return (
        <>
            {/* Panel */}
            {open && (
                <div className="fixed bottom-24 right-3 sm:right-6 z-50 w-[355px] sm:w-[400px] flex flex-col rounded-2xl shadow-2xl border border-gray-200 overflow-hidden bg-white"
                    style={{ maxHeight: 'min(600px, calc(100vh - 110px))' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-600 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🤖</span>
                            <div>
                                <p className="text-white font-bold text-sm">Asistente Bodega Pro</p>
                                <p className="text-blue-200 text-[10px]">
                                    {activeDispatch
                                        ? `Paso: ${activeDispatch.step === 'manual' ? 'herr. manuales' : activeDispatch.step === 'electrical' ? 'herr. eléctricas' : 'consumibles'}`
                                        : 'Listo para ayudarte'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {activeDispatch && (
                                <button onClick={() => { setActiveDispatch(null); addBot('Despacho cancelado.'); }}
                                    className="text-blue-200 hover:text-white text-[10px] font-bold px-2 py-1 hover:bg-blue-700 rounded">
                                    Cancelar
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-blue-700">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Quick buttons */}
                    {!activeDispatch && (
                        <div className="bg-gray-50 px-3 py-2 flex flex-wrap gap-1.5 border-b border-gray-200 flex-shrink-0">
                            {QUICK.map(q => (
                                <button key={q.q} onClick={() => handleSend(q.q)} disabled={loading}
                                    className="px-2.5 py-1 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded-full text-[11px] font-semibold transition-all disabled:opacity-50">
                                    {q.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.dispatchSummary && !msg.dispatchConfirmed ? (
                                    <DispatchCard
                                        msg={msg}
                                        ovr={typeOvr[msg.id] ?? {}}
                                        onTypeOvr={(name, type) => setTypeOvr(prev => ({ ...prev, [msg.id]: { ...(prev[msg.id] ?? {}), [name]: type } }))}
                                        onAdd={() => executeDispatch(msg, false)}
                                        onDispatch={() => executeDispatch(msg, true)}
                                        onCancel={() => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, dispatchConfirmed: true } : m))}
                                    />
                                ) : msg.parsedExit && !msg.exitConfirmed ? (
                                    <ExitCard
                                        msg={msg}
                                        items={items}
                                        sel={exitSel[msg.id] ?? {}}
                                        onSelect={(idx, id) => setExitSel(prev => ({ ...prev, [msg.id]: { ...(prev[msg.id] ?? {}), [idx]: id } }))}
                                        onConfirm={() => confirmExit(msg)}
                                        onCancel={() => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, exitConfirmed: true } : m))}
                                    />
                                ) : msg.pendingItemCreate && !msg.pendingItemConfirmed ? (
                                    <ItemTypeCard
                                        name={msg.pendingItemCreate.name}
                                        onSelect={type => {
                                            const it = onCreateItem({ name: msg.pendingItemCreate!.name, inventoryType: type, quantity: 0, unit: msg.pendingItemCreate!.unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0, price: 0 });
                                            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pendingItemConfirmed: true } : m));
                                            addBot(`✅ **${it.name}** (${TYPE_LABELS[type]}) creado.`);
                                        }}
                                    />
                                ) : msg.text ? (
                                    <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                                        msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                                    }`}>
                                        {msg.text.replace(/\*\*(.+?)\*\*/g, '$1')}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                                    {[0, 1, 2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t border-gray-200 px-3 py-2 flex-shrink-0 bg-white">
                        {activeDispatch && (
                            <p className="text-[10px] text-blue-600 font-bold mb-1">{stepHint}</p>
                        )}
                        <div className="flex gap-2 items-end">
                            <textarea
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                                placeholder={stepHint}
                                rows={1}
                                className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ maxHeight: '80px' }}
                            />
                            <button onClick={() => handleSend(input)} disabled={!input.trim() || loading}
                                className="h-9 w-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white rounded-xl transition-all flex-shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* FAB */}
            <button onClick={() => setOpen(v => !v)}
                className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-xl flex items-center justify-center transition-all duration-200">
                {open
                    ? <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    : <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
                }
                {hasNew && !open && (
                    <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                )}
            </button>
        </>
    );
};

// ── DispatchCard ──────────────────────────────────────────────────────────────

const TYPE_LABELS_FULL: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: '⚡ Eléctrica',
    [InventoryType.HAND_TOOL]: '🔨 Manual',
    [InventoryType.PPE]: '🦺 EPP',
    [InventoryType.SINGLE_USE]: '📦 Consumible',
};

const DispatchCard: React.FC<{
    msg: ChatMsg;
    ovr: Record<string, InventoryType>;
    onTypeOvr: (name: string, type: InventoryType) => void;
    onAdd: () => void;
    onDispatch: () => void;
    onCancel: () => void;
}> = ({ msg, ovr, onTypeOvr, onAdd, onDispatch, onCancel }) => {
    const { dispatch } = msg.dispatchSummary!;
    const allItems = [...dispatch.manual, ...dispatch.electrical, ...dispatch.consumables];
    const hasWorker = !!(dispatch.worker || dispatch.rawWorker);

    return (
        <div className="w-full max-w-[96%] bg-white border border-blue-200 rounded-2xl rounded-bl-sm shadow-md p-4">
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">📋 Confirmar ítems</p>

            {/* Worker + Project */}
            {(dispatch.rawWorker || dispatch.rawProject) && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {dispatch.rawWorker && (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${dispatch.worker ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            👤 {dispatch.worker?.name ?? dispatch.rawWorker}{!dispatch.worker && ' (nuevo)'}
                        </span>
                    )}
                    {dispatch.rawProject && (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${dispatch.project ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            📌 {dispatch.project?.name ?? dispatch.rawProject}{!dispatch.project && ' (nuevo)'}
                        </span>
                    )}
                </div>
            )}

            {/* Items list */}
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {allItems.map((bi, i) => {
                    const effectiveType = ovr[bi.rawName] ?? bi.guessedType;
                    const isNew = !bi.matchedItem && bi.candidates.length === 0;
                    return (
                        <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${bi.matchedItem ? 'bg-green-400' : isNew ? 'bg-blue-400' : 'bg-amber-400'}`} />
                                    <span className="text-xs font-bold text-gray-800">{bi.quantity} {bi.unit}</span>
                                    <span className="text-xs text-gray-600 truncate">{bi.rawName}</span>
                                    {isNew && <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 rounded-full font-bold flex-shrink-0">NUEVO</span>}
                                </div>
                                {bi.matchedItem && <p className="text-[10px] text-green-600 ml-3.5">→ {bi.matchedItem.name}</p>}
                            </div>
                            <select
                                value={effectiveType}
                                onChange={e => onTypeOvr(bi.rawName, e.target.value as InventoryType)}
                                className="text-[10px] border border-gray-200 rounded-lg px-1 py-0.5 bg-white text-gray-600 focus:outline-none focus:border-blue-400 flex-shrink-0"
                            >
                                {Object.entries(TYPE_LABELS_FULL).map(([t, l]) => (
                                    <option key={t} value={t}>{l}</option>
                                ))}
                            </select>
                        </div>
                    );
                })}
            </div>

            <div className="flex gap-2">
                <button onClick={onAdd}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition-all">
                    📦 Solo subir al inventario
                </button>
                {hasWorker && (
                    <button onClick={onDispatch}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all">
                        📦📤 Subir y despachar
                    </button>
                )}
                <button onClick={onCancel}
                    className="px-3 py-2 border border-gray-200 text-gray-400 hover:bg-gray-50 rounded-xl text-xs">
                    ✕
                </button>
            </div>
        </div>
    );
};

// ── ExitCard ──────────────────────────────────────────────────────────────────

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
        <div className="w-full max-w-[96%] bg-white border border-orange-200 rounded-2xl rounded-bl-sm shadow-md p-4">
            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-2">📤 Confirmar salidas</p>

            {exit.matchedPersonnel && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200 mb-2">
                    👤 {exit.matchedPersonnel.name}
                </span>
            )}
            {exit.matchedProject && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200 mb-2 ml-1">
                    📌 {exit.matchedProject.name}
                </span>
            )}

            <div className="space-y-2 mb-3">
                {exit.movements.map((pm, idx) => {
                    const chosen = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) : null);
                    return (
                        <div key={idx} className="flex items-start gap-2 bg-gray-50 rounded-xl p-2">
                            <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${chosen ? 'bg-green-400' : pm.candidates.length ? 'bg-amber-400' : 'bg-red-300'}`} />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-800">{pm.quantity} <span className="font-normal text-gray-500 italic">"{pm.rawName}"</span></p>
                                {chosen
                                    ? <p className="text-[10px] text-green-600">→ {chosen.name}</p>
                                    : pm.candidates.length > 0
                                    ? <div className="flex flex-wrap gap-1 mt-1">
                                        {pm.candidates.map(c => (
                                            <button key={c.id} onClick={() => onSelect(idx, c.id)}
                                                className={`text-[10px] px-2 py-0.5 rounded-full border ${sel[idx] === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                                                {c.name}
                                            </button>
                                        ))}
                                      </div>
                                    : <p className="text-[10px] text-red-500">No encontrado</p>
                                }
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex gap-2">
                <button onClick={onConfirm} disabled={!canConfirm}
                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs">
                    ✅ Confirmar salida
                </button>
                <button onClick={onCancel} className="px-3 py-2 border border-gray-200 text-gray-400 hover:bg-gray-50 rounded-xl text-xs">✕</button>
            </div>
        </div>
    );
};

// ── ItemTypeCard ──────────────────────────────────────────────────────────────

const ItemTypeCard: React.FC<{ name: string; onSelect: (t: InventoryType) => void }> = ({ name, onSelect }) => (
    <div className="w-full max-w-[96%] bg-white border border-gray-200 rounded-2xl rounded-bl-sm shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-700 mb-3">
            ¿Qué tipo de ítem es <span className="text-blue-600">"{name}"</span>?
        </p>
        <div className="grid grid-cols-2 gap-2">
            {(Object.entries(TYPE_LABELS_FULL) as [InventoryType, string][]).map(([type, label]) => (
                <button key={type} onClick={() => onSelect(type)}
                    className="py-2 px-3 border border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl text-xs font-semibold text-gray-700 transition-all text-left">
                    {label}
                </button>
            ))}
        </div>
    </div>
);
