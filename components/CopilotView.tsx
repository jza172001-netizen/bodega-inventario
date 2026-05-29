import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, MovementType, PurchaseOrderStatus, Project, InventoryType } from '../types';
import { generateInventoryAnalysis } from '../services/geminiService';
import { askCopilot, parseExitIntent, parseCreationIntent, parseEditIntent, ParsedExit, ParsedEdit, PendingMovement } from '../services/copilotService';

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
    onEditItem?: (item: Item) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

type ChatMsg = {
    id: string;
    role: 'user' | 'bot';
    text: string;
    parsedExit?: ParsedExit;
    parsedEdit?: ParsedEdit;
    pendingItemCreate?: { name: string; unit: string };
    confirmed?: boolean;
};

type ActivePanel = 'loan' | 'create' | null;

const TYPE_LABELS: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: '⚡ H. Eléctrica',
    [InventoryType.HAND_TOOL]: '🔨 H. Manual',
    [InventoryType.PPE]: '🦺 Seguridad (EPP)',
    [InventoryType.SINGLE_USE]: '📦 Consumible',
};

const CATEGORY_BY_TYPE: Record<InventoryType, string> = {
    [InventoryType.HAND_TOOL]: 'Herramientas',
    [InventoryType.ELECTRICAL_TOOL]: 'Herramientas',
    [InventoryType.PPE]: 'Seguridad',
    [InventoryType.SINGLE_USE]: 'Materiales',
};

const uid = () => Math.random().toString(36).slice(2);

const WELCOME = 'Hola 👋 Puedo registrar salidas, **crear proyectos, trabajadores e ítems** directamente desde aquí.\n\nEjemplos:\n• "saqué 5 cascos para proyecto Torre 5, trabajador Pedro"\n• "crea el proyecto Edificio Centro"\n• "añade al trabajador Miguel Torres"\n• "añade el ítem Tornillo M8"';

const CopilotView: React.FC<CopilotViewProps> = ({
    items, movements, personnel, purchaseOrders, projects,
    onLogMovements, onCreateItem, onCreateProject, onCreatePersonnel, onEditItem, onBehaviorLog,
}) => {
    const [messages, setMessages] = useState<ChatMsg[]>([
        { id: uid(), role: 'bot', text: WELCOME }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [selections, setSelections] = useState<Record<string, Record<number, string>>>({});
    const bottomRef = useRef<HTMLDivElement>(null);

    // ── Panels ──────────────────────────────────────────────────────────────
    const [activePanel, setActivePanel] = useState<ActivePanel>(null);

    // Loan panel state
    const [loanPersonnelId, setLoanPersonnelId] = useState('');
    const [loanInvType, setLoanInvType] = useState<InventoryType | null>(null);
    const [loanSelected, setLoanSelected] = useState<Map<string, number>>(new Map());
    const [loanProjectId, setLoanProjectId] = useState('');

    // Create item panel state
    const [createInvType, setCreateInvType] = useState<InventoryType | null>(null);
    const [createName, setCreateName] = useState('');
    const [createQty, setCreateQty] = useState(1);
    const [createUnit, setCreateUnit] = useState('unidades');

    const availableForLoan = useMemo(() => {
        if (!loanInvType) return [];
        return items.filter(i => i.inventoryType === loanInvType && i.quantity > 0)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [items, loanInvType]);

    const sortedPersonnel = useMemo(() =>
        [...personnel].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        [personnel]
    );

    const activeProjects = useMemo(() =>
        [...projects].filter(p => p.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'es')),
        [projects]
    );

    const openPanel = (p: ActivePanel) => {
        setActivePanel(p);
        // Reset loan state
        setLoanPersonnelId(''); setLoanInvType(null); setLoanSelected(new Map()); setLoanProjectId('');
        // Reset create state
        setCreateInvType(null); setCreateName(''); setCreateQty(1); setCreateUnit('unidades');
    };

    const closePanel = () => setActivePanel(null);

    const toggleLoanItem = (itemId: string, qty: number) => {
        setLoanSelected(prev => {
            const next = new Map(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.set(itemId, qty);
            return next;
        });
    };

    const setLoanQty = (itemId: string, qty: number) => {
        setLoanSelected(prev => {
            const next = new Map(prev);
            if (next.has(itemId)) next.set(itemId, Math.max(1, qty));
            return next;
        });
    };

    const confirmLoan = () => {
        if (!loanPersonnelId || loanSelected.size === 0) return;
        const movs: Array<Omit<Movement, 'id'>> = [...loanSelected.entries()].map(([itemId, qty]) => ({
            itemId, type: MovementType.CHECK_OUT, quantity: qty,
            timestamp: new Date(), personnelId: loanPersonnelId,
            projectId: loanProjectId || undefined, notes: '', isLoan: true, isReturned: false,
        }));
        onLogMovements(movs);
        const workerName = sortedPersonnel.find(p => p.id === loanPersonnelId)?.name ?? 'trabajador';
        const itemNames = [...loanSelected.keys()].map(id => items.find(i => i.id === id)?.name ?? id);
        addBot(`✅ Préstamo registrado para **${workerName}**: ${itemNames.join(', ')}.`);
        closePanel();
    };

    const confirmCreate = () => {
        if (!createInvType || !createName.trim()) return;
        const it = onCreateItem({
            name: createName.trim(), inventoryType: createInvType,
            quantity: createQty, unit: createUnit.trim() || 'unidades',
            category: CATEGORY_BY_TYPE[createInvType], subCategory: 'General',
            minStock: 0,
        });
        addBot(`✅ **${it.name}** agregado al inventario (${createQty} ${createUnit}).`);
        closePanel();
    };

    // ── Chat ────────────────────────────────────────────────────────────────

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addBot = (text: string, extra?: Partial<ChatMsg>) => {
        setMessages(prev => [...prev, { id: uid(), role: 'bot', text, ...extra }]);
    };

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        onBehaviorLog?.('CHAT_MESSAGE', `Escribió en copilot: ${trimmed.slice(0, 80)}`);
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
                    const it = onCreateItem({ name: creation.name, inventoryType: creation.inventoryType, quantity: 0, unit: creation.unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0 });
                    addBot(`✅ Ítem **${it.name}** agregado como ${TYPE_LABELS[creation.inventoryType]}.`);
                } else {
                    addBot(`¿Qué tipo de ítem es **"${creation.name}"**?`, { pendingItemCreate: { name: creation.name, unit: creation.unit } });
                }
            }
            setLoading(false);
            return;
        }

        const editIntent = parseEditIntent(trimmed, items);
        if (editIntent) {
            addBot('', { parsedEdit: editIntent });
            setLoading(false);
            return;
        }

        const parsed = parseExitIntent(trimmed, items, projects, personnel);
        if (parsed.isExitIntent) {
            const allUnknown = parsed.movements.every(m => !m.matchedItem && !m.candidates.length);
            if (parsed.movements.length === 0 || allUnknown) {
                addBot('No pude identificar ningún material. Intenta especificar el nombre, por ej: "saqué 5 cascos de seguridad".');
            } else {
                addBot('', { parsedExit: parsed });
            }
        } else {
            if (/informe|reporte|análisis completo/i.test(trimmed)) {
                onBehaviorLog?.('BUTTON', 'Generó reporte en Copilot');
                try { const txt = await generateInventoryAnalysis(items, movements); addBot(txt); }
                catch { addBot('Error generando el informe.'); }
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
            return { itemId: item.id, type: MovementType.CHECK_OUT, quantity: pm.quantity, timestamp: new Date(), personnelId: exit.matchedPersonnel?.id, projectId: exit.matchedProject?.id, notes: '', isLoan: false, isReturned: false };
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

    const handleConfirmEdit = (msg: ChatMsg) => {
        const edit = msg.parsedEdit!;
        const updated = { ...edit.item, [edit.field]: edit.newValue };
        onEditItem?.(updated);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
        const fieldLabel = edit.field === 'brand' ? 'Marca' : 'Color';
        addBot(`✅ **${edit.item.name}** actualizado. ${fieldLabel}: **${edit.newValue}**.`);
    };

    const handleCancelEdit = (msgId: string) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, confirmed: true } : m));
        addBot('Cancelado.');
    };

    const setSelection = (msgId: string, movIdx: number, itemId: string) =>
        setSelections(prev => ({ ...prev, [msgId]: { ...(prev[msgId] ?? {}), [movIdx]: itemId } }));

    const handleInlineItemCreate = (msgId: string, movIdx: number, name: string, unit: string, type: InventoryType) => {
        const newItem = onCreateItem({ name, inventoryType: type, quantity: 0, unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0 });
        setSelection(msgId, movIdx, newItem.id);
    };

    const handleInlineProjectCreate = (msgId: string, name: string) => {
        const p = onCreateProject({ name, status: 'active' });
        setMessages(prev => prev.map(m => m.id === msgId && m.parsedExit ? { ...m, parsedExit: { ...m.parsedExit!, matchedProject: p } } : m));
    };

    const handleInlinePersonnelCreate = (msgId: string, name: string) => {
        const p = onCreatePersonnel({ name });
        setMessages(prev => prev.map(m => m.id === msgId && m.parsedExit ? { ...m, parsedExit: { ...m.parsedExit!, matchedPersonnel: p } } : m));
    };

    const handlePendingItemType = (msgId: string, name: string, unit: string, type: InventoryType) => {
        const it = onCreateItem({ name, inventoryType: type, quantity: 0, unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0 });
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
                            <ExitConfirmCard msgId={msg.id} exit={msg.parsedExit} items={items} sel={selections[msg.id] ?? {}}
                                onSelect={(idx, id) => setSelection(msg.id, idx, id)}
                                onCreateItem={(idx, name, unit, type) => handleInlineItemCreate(msg.id, idx, name, unit, type)}
                                onCreateProject={(name) => handleInlineProjectCreate(msg.id, name)}
                                onCreatePersonnel={(name) => handleInlinePersonnelCreate(msg.id, name)}
                                onConfirm={() => handleConfirmExit(msg)} onCancel={() => handleCancelExit(msg.id)} />
                        ) : msg.parsedEdit && !msg.confirmed ? (
                            <EditConfirmCard
                                edit={msg.parsedEdit}
                                onConfirm={() => handleConfirmEdit(msg)}
                                onCancel={() => handleCancelEdit(msg.id)}
                            />
                        ) : msg.pendingItemCreate && !msg.confirmed ? (
                            <PendingItemTypeCard name={msg.pendingItemCreate.name} unit={msg.pendingItemCreate.unit}
                                onSelect={(type) => handlePendingItemType(msg.id, msg.pendingItemCreate!.name, msg.pendingItemCreate!.unit, type)} />
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

            {/* ── Action buttons ── */}
            <div className="flex gap-2 mt-3">
                <button
                    onClick={() => openPanel(activePanel === 'loan' ? null : 'loan')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black border transition-all ${
                        activePanel === 'loan'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                    }`}
                >
                    📦 Asignar herramienta
                </button>
                <button
                    onClick={() => openPanel(activePanel === 'create' ? null : 'create')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black border transition-all ${
                        activePanel === 'create'
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-green-700 border-green-200 hover:bg-green-50'
                    }`}
                >
                    ➕ Agregar al inventario
                </button>
            </div>

            {/* ── Panel: Asignar herramienta ── */}
            {activePanel === 'loan' && (
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-blue-700 uppercase tracking-wide">📦 Asignar herramienta a trabajador</p>
                        <button onClick={closePanel} className="text-blue-400 hover:text-blue-700 text-lg leading-none">✕</button>
                    </div>

                    {/* Trabajador */}
                    <div>
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">Trabajador *</label>
                        <select value={loanPersonnelId} onChange={e => setLoanPersonnelId(e.target.value)}
                            className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                            <option value="">— Elegir trabajador —</option>
                            {sortedPersonnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* Tipo de herramienta */}
                    <div>
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">Tipo de herramienta *</label>
                        <div className="flex gap-2">
                            {([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL] as InventoryType[]).map(t => (
                                <button key={t} onClick={() => { setLoanInvType(t); setLoanSelected(new Map()); }}
                                    className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                                        loanInvType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                                    }`}>
                                    {t === InventoryType.HAND_TOOL ? '🔨 Manual' : '⚡ Eléctrica'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Lista de herramientas disponibles */}
                    {loanInvType && (
                        <div>
                            <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">
                                Herramientas disponibles * {loanSelected.size > 0 && <span className="normal-case font-normal text-blue-500">({loanSelected.size} seleccionada{loanSelected.size !== 1 ? 's' : ''})</span>}
                            </label>
                            {availableForLoan.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">No hay herramientas de este tipo en stock.</p>
                            ) : (
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {availableForLoan.map(item => {
                                        const isSelected = loanSelected.has(item.id);
                                        const qty = loanSelected.get(item.id) ?? 1;
                                        return (
                                            <div key={item.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${isSelected ? 'bg-blue-100 border-blue-300' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                                                <input type="checkbox" checked={isSelected}
                                                    onChange={() => toggleLoanItem(item.id, 1)}
                                                    className="w-4 h-4 accent-blue-600 flex-shrink-0 cursor-pointer" />
                                                <span className="flex-1 text-sm text-gray-800 truncate cursor-pointer" onClick={() => toggleLoanItem(item.id, 1)}>
                                                    {item.name}
                                                </span>
                                                <span className="text-[10px] text-gray-400 flex-shrink-0">{item.quantity} en stock</span>
                                                {isSelected && (
                                                    <input type="number" value={qty} min={1} max={item.quantity}
                                                        onChange={e => setLoanQty(item.id, parseInt(e.target.value) || 1)}
                                                        onClick={e => e.stopPropagation()}
                                                        className="w-12 text-xs text-center border border-blue-300 rounded-lg px-1 py-0.5 bg-white focus:outline-none" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Proyecto (opcional) */}
                    <div>
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">Proyecto (opcional)</label>
                        <select value={loanProjectId} onChange={e => setLoanProjectId(e.target.value)}
                            className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                            <option value="">— Sin proyecto —</option>
                            {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    <button onClick={confirmLoan} disabled={!loanPersonnelId || loanSelected.size === 0}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl text-sm transition-all">
                        ✅ Confirmar préstamo {loanSelected.size > 0 && `(${loanSelected.size} ítem${loanSelected.size !== 1 ? 's' : ''})`}
                    </button>
                </div>
            )}

            {/* ── Panel: Agregar al inventario ── */}
            {activePanel === 'create' && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-green-700 uppercase tracking-wide">➕ Agregar al inventario</p>
                        <button onClick={closePanel} className="text-green-400 hover:text-green-700 text-lg leading-none">✕</button>
                    </div>

                    {/* Tipo */}
                    <div>
                        <label className="text-[10px] font-black text-green-700 uppercase tracking-wide block mb-1">Tipo *</label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([type, label]) => (
                                <button key={type} onClick={() => setCreateInvType(type)}
                                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                                        createInvType === type ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                                    }`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Aviso para herramientas eléctricas */}
                    {createInvType === InventoryType.ELECTRICAL_TOOL && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                            <span className="text-amber-500 text-sm flex-shrink-0">⚠️</span>
                            <p className="text-[11px] text-amber-800 leading-snug">
                                Para herramientas eléctricas incluí color, marca y número en el nombre para trazabilidad exacta.<br/>
                                <span className="font-bold">Ej: "Taladro 3 verde Stanley"</span>
                            </p>
                        </div>
                    )}

                    {/* Nombre */}
                    <div>
                        <label className="text-[10px] font-black text-green-700 uppercase tracking-wide block mb-1">Nombre *</label>
                        <input type="text" value={createName} onChange={e => setCreateName(e.target.value)}
                            placeholder={createInvType === InventoryType.ELECTRICAL_TOOL ? 'Ej: Taladro 3 verde Stanley' : 'Ej: Palustres, Cascos, Tornillos M8...'}
                            className="w-full text-sm border border-green-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400" />
                    </div>

                    {/* Cantidad y unidad */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-black text-green-700 uppercase tracking-wide block mb-1">Cantidad</label>
                            <input type="number" value={createQty} min={1} onChange={e => setCreateQty(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full text-sm border border-green-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-green-700 uppercase tracking-wide block mb-1">Unidad</label>
                            <input type="text" value={createUnit} onChange={e => setCreateUnit(e.target.value)}
                                placeholder="unidades"
                                className="w-full text-sm border border-green-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400" />
                        </div>
                    </div>

                    <button onClick={confirmCreate} disabled={!createInvType || !createName.trim()}
                        className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl text-sm transition-all">
                        ✅ Guardar ítem
                    </button>
                </div>
            )}

            {/* ── Text input (hidden when panel is open) ── */}
            {!activePanel && (
                <>
                    <div className="mt-2 flex gap-2 items-end">
                        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                            placeholder='Ej: "saqué 5 cascos para proyecto X, trabajador Y" · "crea el proyecto Torre"'
                            rows={2}
                            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                        <button onClick={() => handleSend(input)} disabled={!input.trim() || loading}
                            className="h-[3.5rem] px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-all flex-shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                            </svg>
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5 text-center">Enter para enviar · Shift+Enter para nueva línea</p>
                </>
            )}
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
    msgId: string; exit: ParsedExit; items: Item[]; sel: Record<number, string>;
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
                    <MovementRow key={idx} pm={pm} idx={idx} items={items} sel={sel} onSelect={onSelect} onCreateItem={onCreateItem} />
                ))}
            </div>
            <div className="mb-2">
                {exit.matchedProject ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                        📌 <span className="font-semibold">{exit.matchedProject.name}</span>
                    </span>
                ) : exit.rawProject ? (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600">📌 Proyecto "{exit.rawProject}" no existe.</span>
                        <button onClick={() => onCreateProject(exit.rawProject)} className="text-xs font-black text-blue-600 hover:underline">+ Crear</button>
                    </div>
                ) : null}
            </div>
            <div className="mb-3">
                {exit.matchedPersonnel ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                        👤 <span className="font-semibold">{exit.matchedPersonnel.name}</span>
                    </span>
                ) : exit.rawPersonnel ? (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600">👤 Trabajador "{exit.rawPersonnel}" no existe.</span>
                        <button onClick={() => onCreatePersonnel(exit.rawPersonnel)} className="text-xs font-black text-blue-600 hover:underline">+ Crear</button>
                    </div>
                ) : null}
            </div>
            <div className="flex gap-2">
                <button onClick={onConfirm} disabled={!canConfirm}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-sm transition-all">
                    ✅ Confirmar y registrar
                </button>
                <button onClick={onCancel} className="px-4 py-2 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-xl text-sm font-semibold">✕</button>
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
    const [mode, setMode] = useState<'idle' | 'browse' | 'create'>('idle');
    const [search, setSearch] = useState('');
    const chosen = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) ?? null : null);

    const filteredItems = search.trim()
        ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
        : items;

    const handleSelect = (id: string) => { onSelect(idx, id); setMode('idle'); setSearch(''); };

    return (
        <div className="flex items-start gap-3 p-2.5 rounded-xl bg-gray-50">
            <span className={`mt-0.5 w-3 h-3 rounded-full flex-shrink-0 ${chosen ? 'bg-green-400' : pm.candidates.length ? 'bg-amber-400' : 'bg-red-300'}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-black text-gray-700">{pm.quantity}</span>
                    <span className="text-sm text-gray-500 italic truncate">"{pm.rawName}"</span>
                </div>

                {chosen ? (
                    <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-green-700 font-semibold">→ {chosen.name}</p>
                        <button onClick={() => { setMode('browse'); setSearch(''); }}
                            className="text-[10px] text-gray-400 hover:text-blue-500 underline">cambiar</button>
                    </div>
                ) : mode === 'browse' ? (
                    <div className="mt-1 space-y-1">
                        <input
                            autoFocus
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar ítem..."
                            className="w-full text-xs border border-blue-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                            {filteredItems.slice(0, 20).map(i => (
                                <button key={i.id} onClick={() => handleSelect(i.id)}
                                    className="w-full text-left text-xs px-2 py-1 rounded-lg hover:bg-blue-50 hover:text-blue-700 text-gray-700 transition-colors">
                                    {i.name}
                                    <span className="ml-1 text-gray-400">({i.quantity} {i.unit})</span>
                                </button>
                            ))}
                            {filteredItems.length === 0 && <p className="text-xs text-gray-400 px-2">Sin resultados</p>}
                        </div>
                        <div className="flex gap-1 pt-1 border-t border-gray-100">
                            <button onClick={() => setMode('create')}
                                className="text-[10px] font-black text-green-600 hover:underline">+ Crear ítem nuevo</button>
                            <span className="text-gray-300">·</span>
                            <button onClick={() => setMode('idle')}
                                className="text-[10px] text-gray-400 hover:underline">Cancelar</button>
                        </div>
                    </div>
                ) : mode === 'create' ? (
                    <div className="mt-1 space-y-1">
                        <p className="text-[10px] text-gray-500">¿Qué tipo de ítem es <span className="font-bold">"{pm.rawName}"</span>?</p>
                        <div className="grid grid-cols-2 gap-1">
                            {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([type, label]) => (
                                <button key={type} onClick={() => { onCreateItem(idx, pm.rawName, pm.unit, type); setMode('idle'); }}
                                    className="py-1 px-2 border border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-lg text-[10px] font-semibold text-gray-600 transition-all text-left">
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setMode('browse')}
                            className="text-[10px] text-gray-400 hover:underline">← Volver a la lista</button>
                    </div>
                ) : pm.candidates.length > 0 ? (
                    <div className="mt-1 space-y-1">
                        <div className="flex flex-wrap gap-1">
                            <p className="text-xs text-amber-600 w-full mb-0.5">¿Cuál de estos?</p>
                            {pm.candidates.map(c => (
                                <button key={c.id} onClick={() => onSelect(idx, c.id)}
                                    className={`text-xs px-2 py-0.5 rounded-full border transition-all ${sel[idx] === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                                    {c.name}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => { setMode('browse'); setSearch(''); }}
                            className="text-[10px] text-gray-400 hover:text-blue-500 underline">Ver todos los ítems</button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-red-500">No encontrado</p>
                        <button onClick={() => { setMode('browse'); setSearch(''); }}
                            className="text-xs font-black text-blue-600 hover:underline">Seleccionar</button>
                        <span className="text-gray-300 text-xs">·</span>
                        <button onClick={() => setMode('create')}
                            className="text-xs font-black text-green-600 hover:underline">+ Crear</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── EditConfirmCard ──────────────────────────────────────────────────────────

const EditConfirmCard: React.FC<{ edit: ParsedEdit; onConfirm: () => void; onCancel: () => void }> = ({ edit, onConfirm, onCancel }) => {
    const currentVal = edit.field === 'brand' ? edit.item.brand : edit.item.color;
    const fieldLabel = edit.field === 'brand' ? 'Marca' : 'Color';
    return (
        <div className="w-full max-w-[92%] bg-white border border-purple-200 rounded-2xl rounded-bl-sm shadow-md p-4">
            <p className="text-xs font-black text-purple-500 uppercase tracking-widest mb-3">✏️ Actualizar herramienta</p>
            <p className="text-sm font-semibold text-gray-800 mb-1">{edit.item.name}</p>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                <span className="font-semibold">{fieldLabel}:</span>
                <span className="text-gray-400 line-through">{currentVal || '—'}</span>
                <span>→</span>
                <span className="font-bold text-purple-700">{edit.newValue}</span>
            </div>
            <div className="flex gap-2">
                <button onClick={onConfirm}
                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm transition-all">
                    ✅ Confirmar
                </button>
                <button onClick={onCancel}
                    className="px-4 py-2 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-xl text-sm font-semibold">
                    ✕
                </button>
            </div>
        </div>
    );
};

export default CopilotView;
