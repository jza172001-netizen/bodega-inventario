
import React, { useState, useRef, useEffect } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, Project, MovementType, InventoryType } from '../types';
import { askCopilot } from '../services/copilotService';

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

type WizardStep =
    | 'select_types'
    | 'select_worker'
    | 'create_worker'
    | 'select_project'
    | 'create_project'
    | 'enter_items'
    | 'confirm';

interface WizardData {
    selectedTypes: InventoryType[];
    worker: Personnel | null;
    newWorkerName: string;
    project: Project | null;
    newProjectName: string;
    itemInputs: Partial<Record<InventoryType, string>>;
}

const LOAN_TYPES = new Set([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL]);

const TYPE_LABELS: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: '⚡ H. Eléctrica',
    [InventoryType.HAND_TOOL]:       '🔨 H. Manual',
    [InventoryType.PPE]:             '🦺 EPP',
    [InventoryType.SINGLE_USE]:      '📦 Consumible',
};

const QUICK = [
    { label: '📦 Stock bajo',     q: '¿Qué materiales tienen stock bajo?' },
    { label: '🔑 Préstamos',      q: '¿Qué herramientas están prestadas?' },
    { label: '🔥 Más consumidos', q: '¿Cuáles son los más consumidos?' },
    { label: '🕒 Movimientos',    q: 'Muestra los últimos movimientos' },
    { label: '🛒 Órdenes',        q: '¿Órdenes de compra pendientes?' },
];

type ChatMsg = { id: string; role: 'user' | 'bot'; text: string };

const uid = () => Math.random().toString(36).slice(2);

const INIT_WIZARD: WizardData = {
    selectedTypes: [], worker: null, newWorkerName: '',
    project: null, newProjectName: '', itemInputs: {},
};

const parseItemList = (text: string) =>
    text.split(',').map(s => s.trim()).filter(Boolean).map(s => {
        const m1 = s.match(/^(\d+)\s*[xX×]?\s+(.+)$/);
        if (m1) return { rawName: m1[2].trim(), quantity: Number(m1[1]) };
        const m2 = s.match(/^(.+?)\s+[xX×]\s*(\d+)$/);
        if (m2) return { rawName: m2[1].trim(), quantity: Number(m2[2]) };
        return { rawName: s, quantity: 1 };
    });

export const FloatingChat: React.FC<FloatingChatProps> = ({
    items, movements, personnel, purchaseOrders, projects,
    onLogMovements, onCreateItem, onCreateProject, onCreatePersonnel,
}) => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMsg[]>([
        { id: uid(), role: 'bot', text: '¡Hola! Usa los botones rápidos para consultar el inventario, o pulsa "Registrar salida" para despachar artículos.' },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasNew, setHasNew] = useState(false);
    const [wizardStep, setWizardStep] = useState<WizardStep | null>(null);
    const [wizardData, setWizardData] = useState<WizardData>(INIT_WIZARD);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setHasNew(false);
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
    }, [messages, open]);

    const addBot = (text: string) => {
        setMessages(prev => [...prev, { id: uid(), role: 'bot', text }]);
        if (!open) setHasNew(true);
    };

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        setMessages(prev => [...prev, { id: uid(), role: 'user', text: trimmed }]);
        setInput('');
        setLoading(true);
        const resp = await askCopilot(trimmed, { items, movements, personnel, purchaseOrders });
        addBot(resp);
        setLoading(false);
    };

    const startWizard = () => {
        setWizardData(INIT_WIZARD);
        setWizardStep('select_types');
    };

    const cancelWizard = () => {
        setWizardStep(null);
        setInput('');
    };

    const handleConfirmWizard = () => {
        const worker = wizardData.worker
            ?? (wizardData.newWorkerName.trim() ? onCreatePersonnel({ name: wizardData.newWorkerName.trim() }) : null);
        const project = wizardData.project
            ?? (wizardData.newProjectName.trim() ? onCreateProject({ name: wizardData.newProjectName.trim(), status: 'active' }) : null);

        const toLog: Array<Omit<Movement, 'id'>> = [];

        for (const type of wizardData.selectedTypes) {
            const parsed = parseItemList(wizardData.itemInputs[type] ?? '');
            for (const { rawName, quantity } of parsed) {
                if (!rawName) continue;
                let item = items.find(i => i.inventoryType === type && i.name.toLowerCase() === rawName.toLowerCase());
                if (!item) item = items.find(i => i.inventoryType === type && i.name.toLowerCase().includes(rawName.toLowerCase()));
                if (!item) item = onCreateItem({ name: rawName, inventoryType: type, quantity: 0, unit: 'unidad', category: 'Sin clasificar', subCategory: 'General', minStock: 0, price: 0 });
                toLog.push({
                    itemId: item.id, type: MovementType.CHECK_OUT, quantity,
                    timestamp: new Date(), personnelId: worker?.id, projectId: project?.id,
                    notes: '', isLoan: LOAN_TYPES.has(type), isReturned: false,
                });
            }
        }

        if (toLog.length > 0) {
            onLogMovements(toLog);
            addBot(`✅ ${toLog.length} salida(s) registradas${worker ? ` para ${worker.name}` : ''}${project ? ` · ${project.name}` : ''}.`);
        } else {
            addBot('No se registraron salidas (sin artículos válidos).');
        }
        cancelWizard();
    };

    // ── WIZARD PANEL ────────────────────────────────────────────────────────

    const renderWizard = () => {
        if (wizardStep === 'select_types') {
            const allSelected = Object.values(InventoryType).every(t => wizardData.selectedTypes.includes(t));
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Paso 1 de 4</p>
                        <p className="text-sm font-bold text-gray-800 mb-3">¿Qué tipo(s) de elementos deseas registrar?</p>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            {([InventoryType.ELECTRICAL_TOOL, InventoryType.HAND_TOOL, InventoryType.PPE, InventoryType.SINGLE_USE] as InventoryType[]).map(type => {
                                const sel = wizardData.selectedTypes.includes(type);
                                return (
                                    <button key={type} onClick={() => setWizardData(d => ({
                                        ...d,
                                        selectedTypes: sel ? d.selectedTypes.filter(t => t !== type) : [...d.selectedTypes, type],
                                    }))} className={`py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all ${sel ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50'}`}>
                                        {TYPE_LABELS[type]}
                                    </button>
                                );
                            })}
                        </div>
                        <button onClick={() => setWizardData(d => ({ ...d, selectedTypes: allSelected ? [] : Object.values(InventoryType) }))}
                            className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-blue-600 border border-dashed border-gray-300 rounded-xl hover:border-blue-300 transition-all">
                            {allSelected ? '☐ Deseleccionar todas' : '☑ Seleccionar todas'}
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={cancelWizard} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">Cancelar</button>
                        <button onClick={() => setWizardStep('select_worker')}
                            disabled={wizardData.selectedTypes.length === 0}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                            Siguiente →
                        </button>
                    </div>
                </div>
            );
        }

        if (wizardStep === 'select_worker') {
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Paso 2 de 4</p>
                        <p className="text-sm font-bold text-gray-800 mb-3">¿Para quién es la salida?</p>
                        <div className="space-y-1 max-h-44 overflow-y-auto mb-2 pr-1">
                            {personnel.map(p => (
                                <button key={p.id} onClick={() => { setWizardData(d => ({ ...d, worker: p, newWorkerName: '' })); setWizardStep('select_project'); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left">
                                    <div className="w-7 h-7 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{p.name.charAt(0)}</div>
                                    <span className="text-sm font-medium text-gray-700 truncate">{p.name}</span>
                                </button>
                            ))}
                            {personnel.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">Sin personal registrado</p>}
                        </div>
                        <button onClick={() => setWizardStep('create_worker')}
                            className="w-full py-2 text-xs font-semibold text-blue-600 border border-dashed border-blue-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all">
                            + Crear nuevo trabajador
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_types')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                        <button onClick={() => { setWizardData(d => ({ ...d, worker: null, newWorkerName: '' })); setWizardStep('select_project'); }}
                            className="flex-1 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold rounded-xl text-xs transition-all">
                            Sin asignar →
                        </button>
                    </div>
                </div>
            );
        }

        if (wizardStep === 'create_worker') {
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Paso 2 de 4</p>
                        <p className="text-sm font-bold text-gray-800 mb-3">Nombre del nuevo trabajador:</p>
                        <input type="text" value={wizardData.newWorkerName}
                            onChange={e => setWizardData(d => ({ ...d, newWorkerName: e.target.value }))}
                            placeholder="Ej: Carlos Rodríguez"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter' && wizardData.newWorkerName.trim()) setWizardStep('select_project'); }}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_worker')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                        <button onClick={() => setWizardStep('select_project')}
                            disabled={!wizardData.newWorkerName.trim()}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                            Siguiente →
                        </button>
                    </div>
                </div>
            );
        }

        if (wizardStep === 'select_project') {
            const activeProjects = projects.filter(p => p.status === 'active');
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Paso 3 de 4</p>
                        <p className="text-sm font-bold text-gray-800 mb-3">¿Para qué proyecto?</p>
                        <div className="space-y-1 max-h-36 overflow-y-auto mb-2 pr-1">
                            {activeProjects.map(p => (
                                <button key={p.id} onClick={() => { setWizardData(d => ({ ...d, project: p, newProjectName: '' })); setWizardStep('enter_items'); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left">
                                    <span className="text-sm">🏗</span>
                                    <span className="text-sm font-medium text-gray-700 truncate">{p.name}</span>
                                </button>
                            ))}
                            {activeProjects.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">Sin proyectos activos</p>}
                        </div>
                        <button onClick={() => setWizardStep('create_project')}
                            className="w-full py-2 text-xs font-semibold text-blue-600 border border-dashed border-blue-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all mb-1">
                            + Crear nuevo proyecto
                        </button>
                        <button onClick={() => { setWizardData(d => ({ ...d, project: null, newProjectName: '' })); setWizardStep('enter_items'); }}
                            className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-all">
                            Sin proyecto →
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_worker')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                    </div>
                </div>
            );
        }

        if (wizardStep === 'create_project') {
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Paso 3 de 4</p>
                        <p className="text-sm font-bold text-gray-800 mb-3">Nombre del nuevo proyecto:</p>
                        <input type="text" value={wizardData.newProjectName}
                            onChange={e => setWizardData(d => ({ ...d, newProjectName: e.target.value }))}
                            placeholder="Ej: Edificio Torres del Norte"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter' && wizardData.newProjectName.trim()) setWizardStep('enter_items'); }}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_project')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                        <button onClick={() => setWizardStep('enter_items')}
                            disabled={!wizardData.newProjectName.trim()}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                            Siguiente →
                        </button>
                    </div>
                </div>
            );
        }

        if (wizardStep === 'enter_items') {
            const workerName = (wizardData.worker?.name ?? wizardData.newWorkerName) || 'Sin asignar';
            const projectName = (wizardData.project?.name ?? wizardData.newProjectName) || 'Sin proyecto';
            const hasAnyItem = wizardData.selectedTypes.some(t => (wizardData.itemInputs[t] ?? '').trim());
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Paso 4 de 4</p>
                        <p className="text-sm font-bold text-gray-800 mb-0.5">Ingresa los artículos a despachar</p>
                        <p className="text-[11px] text-gray-400 mb-3">Para <strong>{workerName}</strong> · {projectName}</p>
                        {wizardData.selectedTypes.map(type => (
                            <div key={type} className="mb-3">
                                <label className="text-xs font-bold text-gray-600 block mb-1">{TYPE_LABELS[type]}</label>
                                <textarea
                                    value={wizardData.itemInputs[type] ?? ''}
                                    onChange={e => setWizardData(d => ({ ...d, itemInputs: { ...d.itemInputs, [type]: e.target.value } }))}
                                    placeholder="Ej: 2 taladros, 1 pulidora, 3 llaves"
                                    rows={2}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_project')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                        <button onClick={() => setWizardStep('confirm')}
                            disabled={!hasAnyItem}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                            Revisar →
                        </button>
                    </div>
                </div>
            );
        }

        if (wizardStep === 'confirm') {
            const workerName = (wizardData.worker?.name ?? wizardData.newWorkerName) || 'Sin asignar';
            const projectName = (wizardData.project?.name ?? wizardData.newProjectName) || 'Sin proyecto';
            const preview = wizardData.selectedTypes.flatMap(type =>
                parseItemList(wizardData.itemInputs[type] ?? '').map(p => ({ ...p, type }))
            );
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-2">Confirmar salida</p>
                        <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-1">
                            <div className="flex gap-2 text-xs"><span className="text-gray-400 w-20 flex-shrink-0">Trabajador</span><span className="font-semibold text-gray-800">{workerName}</span></div>
                            <div className="flex gap-2 text-xs"><span className="text-gray-400 w-20 flex-shrink-0">Proyecto</span><span className="font-semibold text-gray-800">{projectName}</span></div>
                            <div className="flex gap-2 text-xs"><span className="text-gray-400 w-20 flex-shrink-0">Artículos</span><span className="font-semibold text-gray-800">{preview.length} elemento(s)</span></div>
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {preview.map((item, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white border border-gray-100">
                                    <span>{TYPE_LABELS[item.type].split(' ')[0]}</span>
                                    <span className="font-bold text-gray-700">{item.quantity}×</span>
                                    <span className="text-gray-600 truncate flex-1">{item.rawName}</span>
                                    {LOAN_TYPES.has(item.type) && (
                                        <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">Préstamo</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('enter_items')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Editar</button>
                        <button onClick={cancelWizard} className="px-3 py-2 text-xs text-red-400 hover:text-red-600 border border-red-200 rounded-xl">Cancelar</button>
                        <button onClick={handleConfirmWizard}
                            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition-all">
                            🚀 Confirmar
                        </button>
                    </div>
                </div>
            );
        }

        return null;
    };

    // ── RENDER ───────────────────────────────────────────────────────────────

    return (
        <>
            {open && (
                <div
                    className="fixed bottom-24 right-4 sm:right-6 z-50 w-[340px] sm:w-[390px] flex flex-col rounded-2xl shadow-2xl border border-gray-200 overflow-hidden bg-white"
                    style={{ maxHeight: 'min(580px, calc(100vh - 110px))' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-600 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🤖</span>
                            <div>
                                <p className="text-white font-bold text-sm leading-tight">Asistente de Bodega</p>
                                <p className="text-blue-200 text-[10px]">{wizardStep ? 'Registrando salida…' : 'Consultar · Registrar'}</p>
                            </div>
                        </div>
                        <button onClick={() => setOpen(false)} className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-blue-700 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    {/* Quick buttons — only in chat mode */}
                    {!wizardStep && (
                        <div className="bg-gray-50 px-3 py-2 flex flex-wrap gap-1.5 border-b border-gray-200 flex-shrink-0">
                            {QUICK.map(q => (
                                <button key={q.q} onClick={() => handleSend(q.q)} disabled={loading}
                                    className="px-2.5 py-1 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded-full text-[11px] font-semibold transition-all disabled:opacity-50">
                                    {q.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Wizard or Chat */}
                    {wizardStep ? renderWizard() : (
                        <>
                            {/* Start wizard button */}
                            <div className="px-3 pt-3 pb-1 flex-shrink-0">
                                <button onClick={startWizard}
                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-sm">
                                    🚀 Registrar salida / préstamo
                                </button>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
                                {messages.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                                            {msg.text}
                                        </div>
                                    </div>
                                ))}
                                {loading && (
                                    <div className="flex justify-start">
                                        <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                                            {[0, 1, 2].map(i => (
                                                <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }}/>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div ref={bottomRef}/>
                            </div>

                            {/* Text input for Q&A */}
                            <div className="border-t border-gray-200 px-3 py-2 flex gap-2 items-end flex-shrink-0">
                                <textarea
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                                    placeholder="Consulta: stock, préstamos, movimientos…"
                                    rows={2}
                                    className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    style={{ maxHeight: '80px' }}
                                />
                                <button onClick={() => handleSend(input)} disabled={!input.trim() || loading}
                                    className="h-9 w-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl transition-all flex-shrink-0">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                                    </svg>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* FAB */}
            <button onClick={() => setOpen(v => !v)}
                className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-xl flex items-center justify-center transition-all duration-200"
                aria-label="Abrir asistente">
                {open
                    ? <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    : <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
                }
                {hasNew && !open && <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white animate-pulse"/>}
            </button>
        </>
    );
};
