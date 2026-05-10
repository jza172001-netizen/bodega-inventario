import React, { useState, useRef, useEffect } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, MovementType, PurchaseOrderStatus, Project } from '../types';
import { generateInventoryAnalysis } from '../services/geminiService';
import { askCopilot, parseExitIntent, ParsedExit, PendingMovement } from '../services/copilotService';

interface CopilotViewProps {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    purchaseOrders: PurchaseOrder[];
    projects: Project[];
    onLogMovements: (movements: Array<Omit<Movement, 'id'>>) => void;
}

type ChatMsg = {
    id: string;
    role: 'user' | 'bot';
    text: string;
    parsedExit?: ParsedExit;
    confirmed?: boolean;
};

const uid = () => Math.random().toString(36).slice(2);
const days = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

const WELCOME = 'Hola 👋 Puedo ayudarte a registrar salidas de material con lenguaje natural.\n\nEjemplo: "saqué 30 tornillos 2 pulgadas y 2 taladros para proyecto torre 5, trabajador carlos"\n\nTambién puedo responder consultas sobre stock, préstamos, consumo y más.';

const CopilotView: React.FC<CopilotViewProps> = ({ items, movements, personnel, purchaseOrders, projects, onLogMovements }) => {
    const [messages, setMessages] = useState<ChatMsg[]>([
        { id: uid(), role: 'bot', text: WELCOME }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    // per-message candidate selections: msgId → movIdx → itemId
    const [selections, setSelections] = useState<Record<string, Record<number, string>>>({});
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addBot = (text: string, parsedExit?: ParsedExit) => {
        setMessages(prev => [...prev, { id: uid(), role: 'bot', text, parsedExit }]);
    };

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const msgId = uid();
        setMessages(prev => [...prev, { id: msgId, role: 'user', text: trimmed }]);
        setInput('');
        setLoading(true);

        const parsed = parseExitIntent(trimmed, items, projects, personnel);
        if (parsed.isExitIntent) {
            const allUnknown = parsed.movements.every(m => !m.matchedItem && !m.candidates.length);
            if (parsed.movements.length === 0 || allUnknown) {
                addBot('No pude identificar ningún material en tu mensaje. Intenta ser más específico con el nombre, por ejemplo: "saqué 5 cascos de seguridad".');
            } else {
                addBot('', parsed);
            }
        } else {
            const ctx = { items, movements, personnel, purchaseOrders };
            if (/informe|reporte|análisis completo/i.test(trimmed)) {
                try {
                    const txt = await generateInventoryAnalysis(items, movements);
                    addBot(txt);
                } catch {
                    addBot('Error generando el informe.');
                }
            } else {
                const resp = await askCopilot(trimmed, ctx);
                addBot(resp);
            }
        }
        setLoading(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); }
    };

    const handleConfirm = (msg: ChatMsg) => {
        const exit = msg.parsedExit!;
        const sel = selections[msg.id] ?? {};

        const toLog: Array<Omit<Movement, 'id'>> = exit.movements.map((pm, idx) => {
            const item = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) ?? null : null);
            if (!item) return null;
            return {
                itemId: item.id,
                type: MovementType.CHECK_OUT,
                quantity: pm.quantity,
                timestamp: new Date(),
                personnelId: exit.matchedPersonnel?.id,
                projectId: exit.matchedProject?.id,
                notes: '',
                isLoan: false,
                isReturned: false,
            };
        }).filter(Boolean) as Array<Omit<Movement, 'id'>>;

        if (toLog.length === 0) { addBot('No hay materiales confirmados para registrar.'); return; }

        onLogMovements(toLog);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
        addBot(`✅ Registradas ${toLog.length} salida(s) correctamente.`);
    };

    const handleCancel = (msgId: string) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, confirmed: true } : m));
        addBot('Cancelado. Puedes volver a intentarlo cuando quieras.');
    };

    const setSelection = (msgId: string, movIdx: number, itemId: string) => {
        setSelections(prev => ({ ...prev, [msgId]: { ...(prev[msgId] ?? {}), [movIdx]: itemId } }));
    };

    const QUICK = [
        { label: '📦 Stock bajo', q: 'Que materiales tienen stock bajo?' },
        { label: '🔑 Préstamos activos', q: 'Que herramientas estan prestadas?' },
        { label: '🔥 Más consumidos', q: 'Cuales son los mas consumidos?' },
        { label: '🕒 Últimos movimientos', q: 'Muestra los ultimos movimientos' },
        { label: '🛒 Órdenes pendientes', q: 'Ordenes de compra pendientes?' },
        { label: '📊 Informe completo', q: 'Generar informe completo' },
    ];

    return (
        <div className="flex flex-col h-full max-h-[calc(100vh-9rem)]">
            <div className="mb-4">
                <h1 className="text-2xl font-black text-gray-800">Asistente de Bodega</h1>
                <p className="text-gray-500 text-sm mt-0.5">Registra salidas en lenguaje natural o consulta el inventario.</p>
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 mb-4">
                {QUICK.map(q => (
                    <button key={q.q} onClick={() => handleSend(q.q)}
                        className="px-3 py-1.5 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded-full text-xs font-semibold transition-all">
                        {q.label}
                    </button>
                ))}
            </div>

            {/* Chat area */}
            <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4 min-h-[250px]">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.parsedExit && !msg.confirmed ? (
                            <ExitConfirmCard
                                exit={msg.parsedExit}
                                items={items}
                                sel={selections[msg.id] ?? {}}
                                onSelect={(idx, id) => setSelection(msg.id, idx, id)}
                                onConfirm={() => handleConfirm(msg)}
                                onCancel={() => handleCancel(msg.id)}
                            />
                        ) : (
                            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-sm'
                                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                            }`}>
                                {msg.text}
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

            {/* Input */}
            <div className="mt-3 flex gap-2 items-end">
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder='Escribe "saqué 5 cascos y 2 taladros para proyecto X, trabajador Y" o cualquier consulta…'
                    rows={2}
                    className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                    onClick={() => handleSend(input)}
                    disabled={!input.trim() || loading}
                    className="h-[3.5rem] px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-all flex-shrink-0"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    </svg>
                </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
    );
};

// ─── ExitConfirmCard ──────────────────────────────────────────────────────────

interface ExitConfirmCardProps {
    exit: ParsedExit;
    items: Item[];
    sel: Record<number, string>;
    onSelect: (idx: number, itemId: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

const ExitConfirmCard: React.FC<ExitConfirmCardProps> = ({ exit, items, sel, onSelect, onConfirm, onCancel }) => {
    const canConfirm = exit.movements.some(pm => pm.matchedItem || sel[exit.movements.indexOf(pm)]);

    return (
        <div className="w-full max-w-[90%] bg-white border border-blue-200 rounded-2xl rounded-bl-sm shadow-md p-4">
            <p className="text-xs font-black text-blue-500 uppercase tracking-widest mb-3">📋 Confirmar salidas</p>

            <div className="space-y-2 mb-4">
                {exit.movements.map((pm, idx) => (
                    <MovementRow key={idx} pm={pm} idx={idx} items={items} sel={sel} onSelect={onSelect} />
                ))}
            </div>

            {(exit.matchedProject || exit.matchedPersonnel) && (
                <div className="flex flex-wrap gap-3 mb-4 text-xs">
                    {exit.matchedProject && (
                        <span className="flex items-center gap-1 text-gray-600 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                            📌 <span className="font-semibold">{exit.matchedProject.name}</span>
                        </span>
                    )}
                    {exit.matchedPersonnel && (
                        <span className="flex items-center gap-1 text-gray-600 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                            👤 <span className="font-semibold">{exit.matchedPersonnel.name}</span>
                        </span>
                    )}
                </div>
            )}

            {exit.projectCandidates.length > 0 && (
                <p className="text-xs text-amber-600 mb-2">⚠️ Proyecto no encontrado exactamente.</p>
            )}

            <div className="flex gap-2">
                <button
                    onClick={onConfirm}
                    disabled={!canConfirm}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-sm transition-all"
                >
                    ✅ Confirmar y registrar
                </button>
                <button onClick={onCancel} className="px-4 py-2 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-xl text-sm font-semibold">
                    ✕
                </button>
            </div>
        </div>
    );
};

const MovementRow: React.FC<{
    pm: PendingMovement;
    idx: number;
    items: Item[];
    sel: Record<number, string>;
    onSelect: (idx: number, id: string) => void;
}> = ({ pm, idx, items, sel, onSelect }) => {
    const chosen = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) ?? null : null);

    return (
        <div className="flex items-start gap-3 p-2 rounded-xl bg-gray-50">
            <span className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 ${chosen ? 'bg-green-400' : pm.candidates.length ? 'bg-amber-400' : 'bg-red-300'}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-black text-gray-700">{pm.quantity}</span>
                    <span className="text-sm text-gray-500 italic truncate">"{pm.rawName}"</span>
                </div>
                {chosen ? (
                    <p className="text-xs text-green-700 font-semibold mt-0.5">→ {chosen.name}</p>
                ) : pm.candidates.length > 0 ? (
                    <div className="mt-1">
                        <p className="text-xs text-amber-600 mb-1">¿Cuál de estos?</p>
                        <div className="flex flex-wrap gap-1">
                            {pm.candidates.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => onSelect(idx, c.id)}
                                    className={`text-xs px-2 py-0.5 rounded-full border transition-all ${sel[idx] === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-red-500 mt-0.5">No encontrado en inventario</p>
                )}
            </div>
        </div>
    );
};

export default CopilotView;
