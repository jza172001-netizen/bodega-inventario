
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, Project, MovementType, InventoryType } from '../types';
import { momentoDeFecha } from '../utils/date';
import { askCopilot } from '../services/copilotService';
import { suggestQuestions } from '../services/warehouseQA';

interface FloatingChatProps {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    purchaseOrders: PurchaseOrder[];
    projects: Project[];
    /** Devuelve cuántos movimientos quedaron realmente registrados: la app puede
     *  rechazar una salida por stock insuficiente y el bot no debe cantar éxito. */
    onLogMovements: (ms: Array<Omit<Movement, 'id'>>) => number;
    onCreateItem: (item: Omit<Item, 'id'>) => Item;
    onCreateProject: (p: Omit<Project, 'id'>) => Project;
    onCreatePersonnel: (p: Omit<Personnel, 'id'>) => Personnel;
    onBehaviorLog?: (action: string, detail: string) => void;
}

type WizardStep = 'select_types' | 'select_worker' | 'create_worker' | 'select_sub_worker' | 'create_sub_worker' | 'select_project' | 'create_project' | 'enter_items' | 'confirm';
type ActivePanel = 'loan' | 'create' | null;

interface WizardData {
    selectedTypes: InventoryType[];
    worker: Personnel | null;
    newWorkerName: string;
    teamLeaderWorker: Personnel | null;
    project: Project | null;
    newProjectName: string;
}

const LOAN_TYPES = new Set([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL]);

const TYPE_LABELS: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: '⚡ H. Eléctrica',
    [InventoryType.HAND_TOOL]:       '🔨 H. Manual',
    [InventoryType.PPE]:             '🦺 EPP',
    [InventoryType.SINGLE_USE]:      '📦 Consumible',
};

const CATEGORY_BY_TYPE: Record<InventoryType, string> = {
    [InventoryType.HAND_TOOL]:       'Herramientas',
    [InventoryType.ELECTRICAL_TOOL]: 'Herramientas',
    [InventoryType.PPE]:             'Seguridad',
    [InventoryType.SINGLE_USE]:      'Materiales',
};

type ChatMsg = { id: string; role: 'user' | 'bot'; text: string };
/**
 * Pinta el formato mínimo que usan las respuestas: **negrita** y renglones de
 * lista. Salían los asteriscos crudos porque la burbuja era texto plano.
 *
 * A propósito NO se usa un renderizador de markdown completo: el texto incluye
 * nombres escritos por el usuario (ítems, trabajadores), y un renderizador
 * general abriría la puerta a que un nombre inyecte contenido en el chat.
 */
const RichText: React.FC<{ text: string }> = ({ text }) => (
    <>
        {text.split('\n').map((linea, i) => {
            const esItem = /^\s*[-·]\s+/.test(linea);
            const contenido = esItem ? linea.replace(/^\s*[-·]\s+/, '') : linea;
            const sangria = esItem ? (linea.match(/^\s*/)?.[0].length ?? 0) : 0;
            return (
                <span key={i} className="block" style={esItem ? { paddingLeft: 8 + sangria * 4 } : undefined}>
                    {esItem && <span className="text-gray-400 mr-1.5">•</span>}
                    {contenido.split(/(\*\*[^*]+\*\*)/g).map((trozo, j) =>
                        trozo.startsWith('**') && trozo.endsWith('**')
                            ? <strong key={j} className="font-black">{trozo.slice(2, -2)}</strong>
                            : <React.Fragment key={j}>{trozo}</React.Fragment>
                    )}
                </span>
            );
        })}
    </>
);

const uid = () => Math.random().toString(36).slice(2);
const todayISO = () => new Date().toISOString().split('T')[0];

const INIT_WIZARD: WizardData = {
    selectedTypes: [], worker: null, newWorkerName: '',
    teamLeaderWorker: null,
    project: null, newProjectName: '',
};

export const FloatingChat: React.FC<FloatingChatProps> = ({
    items, movements, personnel, purchaseOrders, projects,
    onLogMovements, onCreateItem, onCreateProject, onCreatePersonnel,
    onBehaviorLog,
}) => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMsg[]>([
        { id: uid(), role: 'bot', text: '¡Hola! Usa los botones de arriba para registrar salidas, asignar herramientas o agregar ítems al inventario.' },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasNew, setHasNew] = useState(false);

    // Wizard state
    const [wizardIsAddMode, setWizardIsAddMode] = useState(false);
    const [wizardStep, setWizardStep] = useState<WizardStep | null>(null);
    const [wizardData, setWizardData] = useState<WizardData>(INIT_WIZARD);
    const [wizardDate, setWizardDate] = useState<string>(todayISO());
    const [wizardSel, setWizardSel] = useState<Map<string, number>>(new Map());
    const [wizardSubWorkerName, setWizardSubWorkerName] = useState('');
    // Inline create form state for Step 4
    const [wizardCreateType, setWizardCreateType] = useState<InventoryType | null>(null);
    const [wizardCreateName, setWizardCreateName] = useState('');
    const [wizardCreateQty, setWizardCreateQty] = useState(1);
    const [wizardCreateBrand, setWizardCreateBrand] = useState('');
    const [wizardCreateColor, setWizardCreateColor] = useState('');
    const [wizardCreateUnit, setWizardCreateUnit] = useState('unidades');
    const [wizardSpecies, setWizardSpecies] = useState<Array<{brand: string; color: string}>>([{ brand: '', color: '' }]);
    const [createSpecies, setCreateSpecies] = useState<Array<{brand: string; color: string}>>([{ brand: '', color: '' }]);

    // Panel state
    const [activePanel, setActivePanel] = useState<ActivePanel>(null);
    const [loanPersonnelId, setLoanPersonnelId] = useState('');
    const [loanSubWorkerId, setLoanSubWorkerId] = useState('');
    const [loanNewSubWorkerName, setLoanNewSubWorkerName] = useState('');
    const [loanInvType, setLoanInvType] = useState<InventoryType | null>(null);
    const [loanSelected, setLoanSelected] = useState<Map<string, number>>(new Map());
    const [loanProjectId, setLoanProjectId] = useState('');
    const [loanNewProjectName, setLoanNewProjectName] = useState('');
    const [loanDate, setLoanDate] = useState<string>(todayISO());
    const [createInvType, setCreateInvType] = useState<InventoryType | null>(null);
    const [createName, setCreateName] = useState('');
    const [createQty, setCreateQty] = useState(1);
    const [createUnit, setCreateUnit] = useState('unidades');
    // Loan panel: inline create states
    const [loanIsCreating, setLoanIsCreating] = useState(false);
    const [loanCreateName, setLoanCreateName] = useState('');
    const [loanCreateQty, setLoanCreateQty] = useState(1);
    const [loanCreateUnit, setLoanCreateUnit] = useState('unidades');
    const [loanCreateSpecies, setLoanCreateSpecies] = useState<Array<{brand: string; color: string}>>([{ brand: '', color: '' }]);

    const bottomRef = useRef<HTMLDivElement>(null);

    const availableForLoan = useMemo(() => {
        if (!loanInvType) return [];
        return items.filter(i => i.inventoryType === loanInvType && i.quantity > 0)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [items, loanInvType]);

    const sortedPersonnel = useMemo(() =>
        [...personnel].sort((a, b) => a.name.localeCompare(b.name, 'es')), [personnel]);

    const activeProjects = useMemo(() =>
        projects.filter(p => p.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'es')), [projects]);

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

    // El predictor: con el campo vacío muestra lo urgente del día; mientras se
    // escribe, filtra en vivo con el mismo motor tolerante del buscador.
    const sugerencias = useMemo(
        () => suggestQuestions(input, { items, movements, personnel, projects, purchaseOrders }, 8),
        [input, items, movements, personnel, projects, purchaseOrders]
    );

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        setMessages(prev => [...prev, { id: uid(), role: 'user', text: trimmed }]);
        setInput('');
        setLoading(true);
        onBehaviorLog?.('CHAT_MESSAGE', `Escribió en chatbot: ${trimmed}`);
        const resp = await askCopilot(trimmed, { items, movements, personnel, purchaseOrders, projects });
        addBot(resp);
        setLoading(false);
    };

    // ── Wizard ──────────────────────────────────────────────────────────────

    const resetWizardCreate = () => {
        setWizardCreateType(null);
        setWizardCreateName('');
        setWizardCreateQty(1);
        setWizardCreateBrand('');
        setWizardCreateColor('');
        setWizardCreateUnit('unidades');
        setWizardSpecies([{ brand: '', color: '' }]);
    };

    const startWizard = () => {
        setWizardIsAddMode(false);
        setWizardData(INIT_WIZARD);
        setWizardDate(todayISO());
        setWizardSel(new Map());
        setWizardSubWorkerName('');
        resetWizardCreate();
        setWizardStep('select_types');
        setActivePanel(null);
        onBehaviorLog?.('BUTTON', 'Tocó botón: Registrar salida');
    };

    const startAddMode = () => {
        setWizardIsAddMode(true);
        setWizardData(INIT_WIZARD);
        setWizardDate(todayISO());
        setWizardSel(new Map());
        setWizardSubWorkerName('');
        resetWizardCreate();
        setWizardStep('select_types');
        setActivePanel(null);
        onBehaviorLog?.('BUTTON', 'Tocó botón: Agregar al inventario');
    };

    const cancelWizard = () => { setWizardIsAddMode(false); setWizardStep(null); setInput(''); setWizardSel(new Map()); setWizardSubWorkerName(''); resetWizardCreate(); };

    const toggleWizardSel = (itemId: string) => {
        setWizardSel(prev => {
            const next = new Map(prev);
            if (next.has(itemId)) next.delete(itemId); else next.set(itemId, 1);
            return next;
        });
    };

    const setWizardSelQty = (itemId: string, qty: number) => {
        setWizardSel(prev => {
            const next = new Map(prev);
            if (next.has(itemId)) next.set(itemId, Math.max(1, qty));
            return next;
        });
    };

    const handleWizardCreateItem = () => {
        if (!wizardCreateType || !wizardCreateName.trim()) return;
        if (wizardCreateType === InventoryType.ELECTRICAL_TOOL || wizardCreateType === InventoryType.HAND_TOOL) {
            const valid = wizardSpecies.filter(s => s.brand.trim() && s.color.trim());
            if (valid.length === 0) return;
            const newEntries: [string, number][] = [];
            for (const sp of valid) {
                const newItem = onCreateItem({
                    name: `${wizardCreateName.trim()} (${sp.color.trim()} · ${sp.brand.trim()})`,
                    inventoryType: wizardCreateType,
                    quantity: wizardCreateQty,
                    unit: wizardCreateUnit.trim() || 'unidades',
                    category: CATEGORY_BY_TYPE[wizardCreateType],
                    subCategory: 'General',
                    minStock: 0, price: 0,
                    brand: sp.brand.trim(), color: sp.color.trim(),
                });
                newEntries.push([newItem.id, wizardCreateQty]);
            }
            setWizardSel(prev => { const next = new Map(prev); for (const [id, qty] of newEntries) next.set(id, qty); return next; });
        } else {
            const newItem = onCreateItem({
                name: wizardCreateName.trim(),
                inventoryType: wizardCreateType,
                quantity: wizardCreateQty,
                unit: wizardCreateUnit.trim() || 'unidades',
                category: CATEGORY_BY_TYPE[wizardCreateType],
                subCategory: 'General',
                minStock: 0, price: 0,
            });
            setWizardSel(prev => { const next = new Map(prev); next.set(newItem.id, wizardCreateQty); return next; });
        }
        // Mantener el tipo seleccionado para que el usuario pueda crear otro género inmediatamente
        setWizardCreateName(''); setWizardCreateQty(1); setWizardCreateUnit('unidades'); setWizardSpecies([{ brand: '', color: '' }]);
    };

    const handleConfirmWizard = () => {
        // Add mode: items already created via onCreateItem in step 4, just confirm
        if (wizardIsAddMode) {
            const count = wizardSel.size;
            const names = [...wizardSel.keys()].map(id => items.find(i => i.id === id)?.name ?? id);
            addBot(count > 0
                ? `✅ ${count} ítem(s) agregados al inventario: ${names.join(', ')}.`
                : 'No se agregó ningún ítem.');
            cancelWizard();
            return;
        }

        const leaders = personnel.filter(p => p.isTeamLeader);
        const autoLeader = wizardData.teamLeaderWorker ?? (leaders.length === 1 ? leaders[0] : null);
        const worker = wizardData.worker
            ?? (wizardData.newWorkerName.trim()
                ? onCreatePersonnel({ name: wizardData.newWorkerName.trim(), ...(autoLeader ? { teamLeaderId: autoLeader.id } : {}) })
                : null);
        const project = wizardData.project
            ?? (wizardData.newProjectName.trim() ? onCreateProject({ name: wizardData.newProjectName.trim(), status: 'active' }) : null);

        // Validate: consumables require a project
        const hasSingleUseItems = [...wizardSel.keys()].some(id => items.find(i => i.id === id)?.inventoryType === InventoryType.SINGLE_USE);
        if (hasSingleUseItems && !project) {
            addBot('⚠️ Los consumibles requieren un proyecto. Vuelve al Paso 3 y elige uno.');
            return;
        }

        const ts = momentoDeFecha(wizardDate);

        const toLog: Array<Omit<Movement, 'id'>> = [];
        for (const type of wizardData.selectedTypes) {
            for (const [itemId, quantity] of wizardSel.entries()) {
                const item = items.find(i => i.id === itemId && i.inventoryType === type);
                if (!item) continue;
                const isLoan = LOAN_TYPES.has(type);
                toLog.push({ itemId: item.id, type: MovementType.CHECK_OUT, quantity, timestamp: ts, personnelId: worker?.id, projectId: project?.id, notes: '', isLoan, isReturned: false });
            }
        }
        if (toLog.length > 0) {
            const ok = onLogMovements(toLog);
            const dateLabel = wizardDate !== todayISO() ? ` (fecha: ${new Date(wizardDate + 'T12:00:00').toLocaleDateString('es-CO')})` : '';
            if (ok === 0) {
                addBot(`❌ No se registró ninguna salida: la bodega rechazó las ${toLog.length} por falta de stock.`);
            } else if (ok < toLog.length) {
                addBot(`⚠️ Solo ${ok} de ${toLog.length} salida(s) quedaron registradas${worker ? ` para ${worker.name}` : ''}${dateLabel}. Las demás se rechazaron por falta de stock.`);
            } else {
                addBot(`✅ ${ok} salida(s) registradas${worker ? ` para ${worker.name}` : ''}${project ? ` · ${project.name}` : ''}${dateLabel}.`);
            }
        } else {
            addBot('No se registraron salidas (sin artículos válidos).');
        }
        cancelWizard();
    };

    // ── Panels ──────────────────────────────────────────────────────────────

    const openPanel = (p: 'loan' | 'create') => {
        setActivePanel(p);
        setWizardStep(null);
        setLoanPersonnelId(''); setLoanSubWorkerId(''); setLoanNewSubWorkerName('');
        setLoanInvType(null); setLoanSelected(new Map()); setLoanProjectId(''); setLoanNewProjectName('');
        setLoanDate(todayISO());
        setLoanIsCreating(false); setLoanCreateName(''); setLoanCreateQty(1); setLoanCreateUnit('unidades'); setLoanCreateSpecies([{ brand: '', color: '' }]);
        setCreateInvType(null); setCreateName(''); setCreateQty(1); setCreateUnit('unidades'); setCreateSpecies([{ brand: '', color: '' }]);
        onBehaviorLog?.('BUTTON', `Tocó panel "${p === 'loan' ? 'Asignar herramienta' : 'Agregar al inventario'}"`);
    };

    const closePanel = () => {
        setActivePanel(null);
        setCreateName(''); setCreateInvType(null); setCreateQty(1); setCreateUnit('unidades'); setCreateSpecies([{ brand: '', color: '' }]);
        setLoanPersonnelId(''); setLoanSubWorkerId(''); setLoanNewSubWorkerName('');
        setLoanInvType(null); setLoanSelected(new Map()); setLoanProjectId(''); setLoanNewProjectName('');
        setLoanIsCreating(false); setLoanCreateName(''); setLoanCreateQty(1); setLoanCreateUnit('unidades'); setLoanCreateSpecies([{ brand: '', color: '' }]);
    };

    const toggleLoanItem = (itemId: string) => {
        setLoanSelected(prev => {
            const next = new Map(prev);
            if (next.has(itemId)) next.delete(itemId); else next.set(itemId, 1);
            return next;
        });
    };

    const setLoanItemQty = (itemId: string, qty: number) => {
        setLoanSelected(prev => {
            const next = new Map(prev);
            if (next.has(itemId)) next.set(itemId, Math.max(1, qty));
            return next;
        });
    };

    const confirmLoan = () => {
        if (!loanPersonnelId || loanSelected.size === 0) return;
        const ts = momentoDeFecha(loanDate);

        // Sub-trabajador: si el elegido es oficial, usar el sub-trabajador seleccionado/creado
        const leader = personnel.find(p => p.id === loanPersonnelId);
        let effectivePersonnelId = loanPersonnelId;
        if (leader?.isTeamLeader) {
            if (loanSubWorkerId === '__new__' && loanNewSubWorkerName.trim()) {
                const newWorker = onCreatePersonnel({ name: loanNewSubWorkerName.trim(), teamLeaderId: loanPersonnelId });
                effectivePersonnelId = newWorker.id;
            } else if (loanSubWorkerId && loanSubWorkerId !== '__new__') {
                effectivePersonnelId = loanSubWorkerId;
            }
        }

        // Proyecto: crear si eligió "nuevo"
        let projectId = loanProjectId === '__new__' ? undefined : (loanProjectId || undefined);
        if (loanProjectId === '__new__' && loanNewProjectName.trim()) {
            const newProj = onCreateProject({ name: loanNewProjectName.trim(), status: 'active' });
            projectId = newProj.id;
        }

        const isLoan = LOAN_TYPES.has(loanInvType ?? InventoryType.HAND_TOOL);
        const movs: Array<Omit<Movement, 'id'>> = [...loanSelected.entries()].map(([itemId, qty]) => ({
            itemId, type: MovementType.CHECK_OUT, quantity: qty,
            timestamp: ts, personnelId: effectivePersonnelId,
            projectId, notes: '', isLoan, isReturned: false,
        }));
        const ok = onLogMovements(movs);
        const workerName = personnel.find(p => p.id === effectivePersonnelId)?.name ?? personnel.find(p => p.id === loanPersonnelId)?.name ?? 'trabajador';
        const itemNames = [...loanSelected.keys()].map(id => items.find(i => i.id === id)?.name ?? id);
        const dateLabel = loanDate !== todayISO() ? ` (fecha: ${new Date(loanDate + 'T12:00:00').toLocaleDateString('es-CO')})` : '';
        const verb = isLoan ? 'Préstamo registrado' : 'Salida registrada';
        if (ok === 0) {
            addBot(`❌ No se registró nada: la bodega rechazó ${movs.length === 1 ? 'el movimiento' : `los ${movs.length} movimientos`} por falta de stock.`);
        } else if (ok < movs.length) {
            addBot(`⚠️ Solo ${ok} de ${movs.length} quedaron registrados para ${workerName}${dateLabel}. El resto se rechazó por falta de stock.`);
        } else {
            addBot(`✅ ${verb} para ${workerName}: ${itemNames.join(', ')}${dateLabel}.`);
        }
        closePanel();
    };

    const handleLoanCreateItem = () => {
        if (!loanInvType || !loanCreateName.trim()) return;
        if (loanInvType === InventoryType.ELECTRICAL_TOOL || loanInvType === InventoryType.HAND_TOOL) {
            const valid = loanCreateSpecies.filter(s => s.brand.trim() && s.color.trim());
            if (valid.length === 0) return;
            for (const sp of valid) {
                const newItem = onCreateItem({
                    name: `${loanCreateName.trim()} (${sp.color.trim()} · ${sp.brand.trim()})`,
                    inventoryType: loanInvType,
                    quantity: loanCreateQty,
                    unit: 'unidades',
                    category: CATEGORY_BY_TYPE[loanInvType],
                    subCategory: 'General',
                    minStock: 0, price: 0,
                    brand: sp.brand.trim(), color: sp.color.trim(),
                });
                setLoanSelected(prev => { const next = new Map(prev); next.set(newItem.id, loanCreateQty); return next; });
            }
        } else {
            const newItem = onCreateItem({
                name: loanCreateName.trim(),
                inventoryType: loanInvType,
                quantity: loanCreateQty,
                unit: loanCreateUnit.trim() || 'unidades',
                category: CATEGORY_BY_TYPE[loanInvType],
                subCategory: 'General',
                minStock: 0, price: 0,
            });
            setLoanSelected(prev => { const next = new Map(prev); next.set(newItem.id, loanCreateQty); return next; });
        }
        setLoanCreateName(''); setLoanCreateQty(1); setLoanCreateUnit('unidades');
        setLoanCreateSpecies([{ brand: '', color: '' }]);
        setLoanIsCreating(false);
    };

    const confirmCreate = () => {
        if (!createInvType || !createName.trim()) return;
        if (createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) {
            const valid = createSpecies.filter(s => s.brand.trim() && s.color.trim());
            if (valid.length === 0) return;
            const names: string[] = [];
            for (const sp of valid) {
                const it = onCreateItem({
                    name: `${createName.trim()} (${sp.color.trim()} · ${sp.brand.trim()})`,
                    inventoryType: createInvType,
                    quantity: createQty, unit: createUnit.trim() || 'unidades',
                    category: CATEGORY_BY_TYPE[createInvType], subCategory: 'General',
                    minStock: 0, price: 0, brand: sp.brand.trim(), color: sp.color.trim(),
                });
                names.push(it.name);
            }
            addBot(`✅ ${names.length} ítem(s) agregados: ${names.join(', ')}.`);
        } else {
            const it = onCreateItem({
                name: createName.trim(), inventoryType: createInvType,
                quantity: createQty, unit: createUnit.trim() || 'unidades',
                category: CATEGORY_BY_TYPE[createInvType], subCategory: 'General', minStock: 0, price: 0,
            });
            addBot(`✅ ${it.name} agregado al inventario (${createQty} ${createUnit}).`);
        }
        // Mantener el tipo para crear otro ítem sin re-seleccionar
        setCreateName(''); setCreateQty(1); setCreateUnit('unidades'); setCreateSpecies([{ brand: '', color: '' }]);
    };

    // ── Wizard render ────────────────────────────────────────────────────────

    const renderWizard = () => {
        if (wizardStep === 'select_types') {
            const allSelected = Object.values(InventoryType).every(t => wizardData.selectedTypes.includes(t));
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">{wizardIsAddMode ? 'Paso 1 de 2' : 'Paso 1 de 4'}</p>
                        <p className="text-sm font-bold text-gray-800 mb-3">{wizardIsAddMode ? '¿Qué tipo(s) vas a agregar?' : '¿Qué tipo(s) de elementos?'}</p>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            {([InventoryType.ELECTRICAL_TOOL, InventoryType.HAND_TOOL, InventoryType.PPE, InventoryType.SINGLE_USE] as InventoryType[]).map(type => {
                                const sel = wizardData.selectedTypes.includes(type);
                                return (
                                    <button key={type} onClick={() => setWizardData(d => ({ ...d, selectedTypes: sel ? d.selectedTypes.filter(t => t !== type) : [...d.selectedTypes, type] }))}
                                        className={`py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all ${sel ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50'}`}>
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
                        <button onClick={() => setWizardStep(wizardIsAddMode ? 'enter_items' : 'select_worker')} disabled={wizardData.selectedTypes.length === 0}
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
                            {sortedPersonnel.map(p => (
                                <button key={p.id} onClick={() => {
                                    if (p.isTeamLeader) {
                                        setWizardData(d => ({ ...d, teamLeaderWorker: p, worker: null, newWorkerName: '' }));
                                        setWizardSubWorkerName('');
                                        setWizardStep('select_sub_worker');
                                    } else {
                                        setWizardData(d => ({ ...d, worker: p, teamLeaderWorker: null, newWorkerName: '' }));
                                        setWizardStep('select_project');
                                    }
                                }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${wizardData.worker?.id === p.id || wizardData.teamLeaderWorker?.id === p.id ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 hover:bg-blue-50 border border-transparent hover:border-blue-200'}`}>
                                    <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs flex-shrink-0">{p.name.charAt(0)}</span>
                                    <span className="text-sm font-medium text-gray-800 flex-1">{p.name}</span>
                                    {p.isTeamLeader && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">👷 Oficial</span>}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setWizardStep('create_worker')}
                            className="w-full py-2 text-xs font-semibold text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-xl hover:border-blue-500 transition-all">
                            + Nuevo trabajador
                        </button>
                        <button onClick={() => { setWizardData(d => ({ ...d, worker: null, newWorkerName: '' })); setWizardStep('select_project'); }}
                            className="w-full mt-1 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-all">
                            Sin asignar trabajador →
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_types')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                    </div>
                </div>
            );
        }
        if (wizardStep === 'create_worker') {
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Paso 2 de 4</p>
                    <p className="text-sm font-bold text-gray-800">Nombre del nuevo trabajador:</p>
                    <input type="text" value={wizardData.newWorkerName} onChange={e => setWizardData(d => ({ ...d, newWorkerName: e.target.value }))}
                        placeholder="Ej: Carlos García" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && wizardData.newWorkerName.trim()) setWizardStep('select_project'); }}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_worker')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                        <button onClick={() => setWizardStep('select_project')} disabled={!wizardData.newWorkerName.trim()}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                            Siguiente →
                        </button>
                    </div>
                </div>
            );
        }
        if (wizardStep === 'select_sub_worker') {
            const leader = wizardData.teamLeaderWorker!;
            const subWorkers = personnel
                .filter(p => p.teamLeaderId === leader.id)
                .sort((a, b) => a.name.localeCompare(b.name, 'es'));
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Paso 2 de 4 — Cuadrilla</p>
                        <p className="text-sm font-bold text-gray-800 mb-1">¿Qué trabajador de <span className="text-blue-600">{leader.name}</span> se lo llevó?</p>
                        <p className="text-[11px] text-gray-400 mb-3">Elige de la lista o crea uno nuevo</p>
                        {subWorkers.length === 0
                            ? <p className="text-xs text-gray-400 text-center py-2 mb-2">Sin trabajadores registrados aún.<br/>Usa "+ Nuevo trabajador" para agregar.</p>
                            : <div className="space-y-1 max-h-44 overflow-y-auto mb-2 pr-1">
                                {subWorkers.map(p => (
                                    <button key={p.id} onClick={() => { setWizardData(d => ({ ...d, worker: p })); setWizardStep('select_project'); }}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${wizardData.worker?.id === p.id ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 hover:bg-blue-50 border border-transparent hover:border-blue-200'}`}>
                                        <span className="w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-black text-xs flex-shrink-0">{p.name.charAt(0)}</span>
                                        <span className="text-sm font-medium text-gray-800">{p.name}</span>
                                    </button>
                                ))}
                              </div>
                        }
                        <button onClick={() => { setWizardSubWorkerName(''); setWizardStep('create_sub_worker'); }}
                            className="w-full py-2 text-xs font-semibold text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-xl hover:border-blue-500 transition-all">
                            + Nuevo trabajador de {leader.name}
                        </button>
                        <button onClick={() => { setWizardData(d => ({ ...d, worker: leader })); setWizardStep('select_project'); }}
                            className="w-full mt-1 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-all">
                            Continuar con {leader.name} (sin especificar) →
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_worker')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                    </div>
                </div>
            );
        }
        if (wizardStep === 'create_sub_worker') {
            const leader = wizardData.teamLeaderWorker!;
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Paso 2 de 4 — Cuadrilla</p>
                    <p className="text-sm font-bold text-gray-800">Nuevo trabajador de <span className="text-blue-600">{leader.name}</span>:</p>
                    <input type="text" value={wizardSubWorkerName}
                        onChange={e => setWizardSubWorkerName(e.target.value)}
                        placeholder="Ej: Pedro Ramírez" autoFocus
                        onKeyDown={e => {
                            if (e.key === 'Enter' && wizardSubWorkerName.trim()) {
                                const newP = onCreatePersonnel({ name: wizardSubWorkerName.trim(), teamLeaderId: leader.id });
                                setWizardData(d => ({ ...d, worker: newP }));
                                setWizardStep('select_project');
                            }
                        }}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_sub_worker')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                        <button
                            onClick={() => {
                                if (!wizardSubWorkerName.trim()) return;
                                const newP = onCreatePersonnel({ name: wizardSubWorkerName.trim(), teamLeaderId: leader.id });
                                setWizardData(d => ({ ...d, worker: newP }));
                                setWizardStep('select_project');
                            }}
                            disabled={!wizardSubWorkerName.trim()}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                            Guardar y continuar →
                        </button>
                    </div>
                </div>
            );
        }
        if (wizardStep === 'select_project') {
            const requiresProject = wizardData.selectedTypes.includes(InventoryType.SINGLE_USE);
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Paso 3 de 4</p>
                        <p className="text-sm font-bold text-gray-800 mb-3">¿A qué proyecto va?</p>
                        {requiresProject && (
                            <p className="text-[11px] text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-2">
                                📦 Los consumibles requieren proyecto obligatoriamente.
                            </p>
                        )}
                        <div className="space-y-1 max-h-44 overflow-y-auto mb-2 pr-1">
                            {activeProjects.map(p => (
                                <button key={p.id} onClick={() => { setWizardData(d => ({ ...d, project: p, newProjectName: '' })); setWizardStep('enter_items'); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${wizardData.project?.id === p.id ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 hover:bg-blue-50 border border-transparent hover:border-blue-200'}`}>
                                    <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs flex-shrink-0">P</span>
                                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setWizardStep('create_project')}
                            className="w-full py-2 text-xs font-semibold text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-xl hover:border-blue-500 transition-all">
                            + Nuevo proyecto
                        </button>
                        {!requiresProject && (
                            <button onClick={() => { setWizardData(d => ({ ...d, project: null, newProjectName: '' })); setWizardStep('enter_items'); }}
                                className="w-full mt-1 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-all">
                                Sin proyecto →
                            </button>
                        )}
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
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Paso 3 de 4</p>
                    <p className="text-sm font-bold text-gray-800">Nombre del nuevo proyecto:</p>
                    <input type="text" value={wizardData.newProjectName} onChange={e => setWizardData(d => ({ ...d, newProjectName: e.target.value }))}
                        placeholder="Ej: Edificio Torres del Norte" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && wizardData.newProjectName.trim()) setWizardStep('enter_items'); }}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_project')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                        <button onClick={() => setWizardStep('enter_items')} disabled={!wizardData.newProjectName.trim()}
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

            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">{wizardIsAddMode ? 'Paso 2 de 2' : 'Paso 4 de 4'}</p>
                        <p className="text-sm font-bold text-gray-800 mb-0.5">{wizardIsAddMode ? 'Ítems a agregar al inventario' : 'Artículos a despachar'}</p>
                        {!wizardIsAddMode && <p className="text-[11px] text-gray-400 mb-3">Para <strong>{workerName}</strong> · {projectName}</p>}

                        {wizardData.selectedTypes.map(type => {
                            const available = items
                                .filter(i => i.inventoryType === type && i.quantity > 0)
                                .sort((a, b) => a.name.localeCompare(b.name, 'es'));
                            const selectedCount = [...wizardSel.entries()]
                                .filter(([id]) => items.find(i => i.id === id)?.inventoryType === type).length;
                            const isCreating = wizardCreateType === type;

                            return (
                                <div key={type} className="mb-3">
                                    <label className="text-xs font-bold text-gray-600 block mb-1">
                                        {TYPE_LABELS[type]}
                                        {selectedCount > 0 && <span className="ml-1 font-normal text-blue-500">({selectedCount} selec.)</span>}
                                    </label>

                                    {available.length > 0 && !wizardIsAddMode && (
                                        <div className="space-y-1 max-h-36 overflow-y-auto border border-gray-200 rounded-xl p-1 mb-1">
                                            {available.map(item => {
                                                const isSelected = wizardSel.has(item.id);
                                                const qty = wizardSel.get(item.id) ?? 1;
                                                return (
                                                    <div key={item.id} onClick={() => toggleWizardSel(item.id)}
                                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-transparent hover:border-blue-200 hover:bg-blue-50'}`}>
                                                        <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                                                        <span className="flex-1 text-sm text-gray-800 truncate">{item.name}</span>
                                                        <span className="text-[10px] text-gray-400 flex-shrink-0">{item.quantity} disp.</span>
                                                        {isSelected && (
                                                            <input type="number" value={qty} min={1} max={item.quantity}
                                                                onChange={e => setWizardSelQty(item.id, parseInt(e.target.value) || 1)}
                                                                onClick={e => e.stopPropagation()}
                                                                className="w-11 text-xs text-center border border-blue-300 rounded-lg px-1 py-0.5 bg-white focus:outline-none" />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {available.length === 0 && !isCreating && !wizardIsAddMode && (
                                        <p className="text-xs text-gray-400 py-1 text-center mb-1">Sin stock. Usa "+ Crear nuevo".</p>
                                    )}

                                    {isCreating ? (
                                        <div className="border border-dashed border-blue-300 rounded-xl p-3 bg-blue-50 space-y-2 mb-1">
                                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Nuevo ítem</p>
                                            <input type="text" value={wizardCreateName}
                                                onChange={e => setWizardCreateName(e.target.value)}
                                                placeholder={(type === InventoryType.ELECTRICAL_TOOL || type === InventoryType.HAND_TOOL) ? 'Género (ej: Pulidora, Martillo) *' : 'Nombre del ítem *'} autoFocus
                                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                            {(type === InventoryType.ELECTRICAL_TOOL || type === InventoryType.HAND_TOOL) ? null : (
                                                <input type="number" value={wizardCreateQty} min={1}
                                                    onChange={e => setWizardCreateQty(parseInt(e.target.value) || 1)}
                                                    placeholder="Cantidad *"
                                                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                            )}
                                            {(type === InventoryType.ELECTRICAL_TOOL || type === InventoryType.HAND_TOOL) && (
                                                <div className="space-y-1.5">
                                                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider">Especies (color + marca)</p>
                                                    {wizardSpecies.map((sp, idx) => (
                                                        <div key={idx} className="relative pr-6">
                                                            <div className="flex flex-col gap-1">
                                                                <input value={sp.color}
                                                                    onChange={e => setWizardSpecies(prev => prev.map((s, i) => i === idx ? { ...s, color: e.target.value } : s))}
                                                                    placeholder="Color *"
                                                                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                                                <input value={sp.brand}
                                                                    onChange={e => setWizardSpecies(prev => prev.map((s, i) => i === idx ? { ...s, brand: e.target.value } : s))}
                                                                    placeholder="Marca *"
                                                                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                                            </div>
                                                            {wizardSpecies.length > 1 && (
                                                                <button onClick={() => setWizardSpecies(prev => prev.filter((_, i) => i !== idx))}
                                                                    className="absolute top-0 right-0 text-gray-400 hover:text-red-400 text-base leading-none p-1">×</button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <button onClick={() => setWizardSpecies(prev => [...prev, { brand: '', color: '' }])}
                                                        className="w-full py-1 text-[10px] text-blue-500 border border-dashed border-blue-200 rounded-lg hover:border-blue-400 bg-white">
                                                        + Agregar especie
                                                    </button>
                                                    {wizardSpecies.filter(s => s.brand.trim() && s.color.trim()).length > 0 && (
                                                        <p className="text-[10px] text-blue-600 font-bold text-center">
                                                            Se crearán {wizardSpecies.filter(s => s.brand.trim() && s.color.trim()).length} ítem(s) — 1 unidad c/u
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                            {(type === InventoryType.PPE || type === InventoryType.SINGLE_USE) && (
                                                <input type="text" value={wizardCreateUnit}
                                                    onChange={e => setWizardCreateUnit(e.target.value)}
                                                    placeholder="Unidad (ej: unidades, pares, cajas)"
                                                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                            )}
                                            <div className="flex gap-2">
                                                <button onClick={resetWizardCreate}
                                                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white">
                                                    Cancelar
                                                </button>
                                                <button onClick={handleWizardCreateItem}
                                                    disabled={!wizardCreateName.trim() || ((type === InventoryType.ELECTRICAL_TOOL || type === InventoryType.HAND_TOOL) && !wizardSpecies.some(s => s.brand.trim() && s.color.trim()))}
                                                    className="flex-1 py-1.5 text-xs font-black bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg transition-all">
                                                    ✓ Guardar y seleccionar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => { resetWizardCreate(); setWizardCreateType(type); }}
                                            className="w-full py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-xl hover:border-blue-500 bg-white transition-all">
                                            + Crear nuevo
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep(wizardIsAddMode ? 'select_types' : 'select_project')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Atrás</button>
                        <button onClick={() => setWizardStep('confirm')} disabled={wizardSel.size === 0}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                            {wizardIsAddMode ? 'Confirmar →' : 'Revisar →'}
                        </button>
                    </div>
                </div>
            );
        }
        if (wizardStep === 'confirm') {
            const baseWorkerName = (wizardData.worker?.name ?? wizardData.newWorkerName) || 'Sin asignar';
            const workerName = wizardData.teamLeaderWorker && wizardData.worker?.id !== wizardData.teamLeaderWorker.id
                ? `${baseWorkerName} (cuadrilla de ${wizardData.teamLeaderWorker.name})`
                : baseWorkerName;
            const projectName = (wizardData.project?.name ?? wizardData.newProjectName) || 'Sin proyecto';
            const preview = wizardData.selectedTypes.flatMap(type =>
                [...wizardSel.entries()]
                    .filter(([id]) => items.find(i => i.id === id)?.inventoryType === type)
                    .map(([id, quantity]) => ({ rawName: items.find(i => i.id === id)?.name ?? id, quantity, type }))
            );
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-2">{wizardIsAddMode ? 'Confirmar — Agregar al inventario' : 'Confirmar salida'}</p>
                        {!wizardIsAddMode && (
                            <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-1">
                                <div className="flex gap-2 text-xs"><span className="text-gray-400 w-20 flex-shrink-0">Trabajador</span><span className="font-semibold text-gray-800">{workerName}</span></div>
                                <div className="flex gap-2 text-xs"><span className="text-gray-400 w-20 flex-shrink-0">Proyecto</span><span className="font-semibold text-gray-800">{projectName}</span></div>
                                <div className="flex gap-2 text-xs"><span className="text-gray-400 w-20 flex-shrink-0">Artículos</span><span className="font-semibold text-gray-800">{preview.length} elemento(s)</span></div>
                            </div>
                        )}
                        <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
                            {preview.map((it, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white border border-gray-100">
                                    <span>{TYPE_LABELS[it.type].split(' ')[0]}</span>
                                    <span className="font-bold text-gray-700">{it.quantity}×</span>
                                    <span className="text-gray-600 truncate flex-1">{it.rawName}</span>
                                    {!wizardIsAddMode && LOAN_TYPES.has(it.type) && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">Préstamo</span>}
                                </div>
                            ))}
                        </div>
                        {/* Fecha retroactiva — solo en modo despacho */}
                        {!wizardIsAddMode && (
                            <div>
                                <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">Fecha del movimiento</label>
                                <input type="date" value={wizardDate} onChange={e => setWizardDate(e.target.value)}
                                    max={todayISO()}
                                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('enter_items')} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl">← Editar</button>
                        <button onClick={cancelWizard} className="px-3 py-2 text-xs text-red-400 hover:text-red-600 border border-red-200 rounded-xl">Cancelar</button>
                        <button onClick={handleConfirmWizard} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition-all">
                            {wizardIsAddMode ? '✅ Agregar al inventario' : '🚀 Confirmar'}
                        </button>
                    </div>
                </div>
            );
        }
        return null;
    };

    // ── Panel: Asignar herramienta ───────────────────────────────────────────

    const renderLoanPanel = () => (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-black text-blue-700 uppercase tracking-wide">⚡ Salida rápida</p>
                <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <div>
                <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">Trabajador *</label>
                <select value={loanPersonnelId} onChange={e => { setLoanPersonnelId(e.target.value); setLoanSubWorkerId(''); setLoanNewSubWorkerName(''); }}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">— Elegir trabajador —</option>
                    {sortedPersonnel.map(p => <option key={p.id} value={p.id}>{p.name}{p.isTeamLeader ? ' 👷 (oficial)' : ''}</option>)}
                </select>
            </div>

            {/* Sub-trabajador: solo si el elegido es oficial */}
            {(() => {
                const leader = personnel.find(p => p.id === loanPersonnelId);
                if (!leader?.isTeamLeader) return null;
                const subWorkers = personnel.filter(p => p.teamLeaderId === loanPersonnelId);
                return (
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block">
                            Trabajador de la cuadrilla de {leader.name.split(' ')[0]}
                        </label>
                        <select value={loanSubWorkerId} onChange={e => { setLoanSubWorkerId(e.target.value); setLoanNewSubWorkerName(''); }}
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
                            <option value="">— Sin sub-trabajador (asignar al oficial) —</option>
                            {subWorkers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            <option value="__new__">➕ Crear nuevo trabajador...</option>
                        </select>
                        {loanSubWorkerId === '__new__' && (
                            <input type="text" value={loanNewSubWorkerName}
                                onChange={e => setLoanNewSubWorkerName(e.target.value)}
                                placeholder={`Nombre del trabajador de ${leader.name.split(' ')[0]} *`}
                                className="w-full text-sm border border-blue-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        )}
                    </div>
                );
            })()}

            <div>
                <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">Tipo *</label>
                <div className="grid grid-cols-2 gap-1.5">
                    {([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL, InventoryType.PPE, InventoryType.SINGLE_USE] as InventoryType[]).map(t => (
                        <button key={t} onClick={() => { setLoanInvType(t); setLoanSelected(new Map()); setLoanIsCreating(false); setLoanCreateName(''); setLoanCreateSpecies([{ brand: '', color: '' }]); }}
                            className={`py-2 rounded-xl text-xs font-black border transition-all ${loanInvType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'}`}>
                            {TYPE_LABELS[t]}
                        </button>
                    ))}
                </div>
            </div>

            {loanInvType && (
                <div>
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">
                        Ítems disponibles *{loanSelected.size > 0 && <span className="normal-case font-normal text-blue-500 ml-1">({loanSelected.size} selec.)</span>}
                    </label>
                    {availableForLoan.length === 0 && !loanIsCreating && (
                        <p className="text-xs text-gray-400 text-center py-2">Sin stock. Usa "+ Crear nuevo".</p>
                    )}
                    {availableForLoan.length > 0 && (
                        <div className="space-y-1 max-h-36 overflow-y-auto mb-1">
                            {availableForLoan.map(item => {
                                const isSelected = loanSelected.has(item.id);
                                const qty = loanSelected.get(item.id) ?? 1;
                                return (
                                    <div key={item.id} onClick={() => toggleLoanItem(item.id)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                                        <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                                        <span className="flex-1 text-sm text-gray-800 truncate">{item.name}</span>
                                        <span className="text-[10px] text-gray-400 flex-shrink-0">{item.quantity} disp.</span>
                                        {isSelected && (
                                            <input type="number" value={qty} min={1} max={item.quantity}
                                                onChange={e => setLoanItemQty(item.id, parseInt(e.target.value) || 1)}
                                                onClick={e => e.stopPropagation()}
                                                className="w-12 text-xs text-center border border-blue-300 rounded-lg px-1 py-0.5 bg-white focus:outline-none" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {loanIsCreating ? (
                        <div className="border border-dashed border-blue-300 rounded-xl p-3 bg-blue-50 space-y-2">
                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Nuevo ítem</p>
                            <input type="text" value={loanCreateName} onChange={e => setLoanCreateName(e.target.value)}
                                placeholder={(loanInvType === InventoryType.ELECTRICAL_TOOL || loanInvType === InventoryType.HAND_TOOL) ? 'Género (ej: Pulidora, Martillo) *' : 'Nombre del ítem *'}
                                autoFocus
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                            {(loanInvType !== InventoryType.ELECTRICAL_TOOL && loanInvType !== InventoryType.HAND_TOOL) && (
                                <>
                                    <input type="number" value={loanCreateQty} min={1}
                                        onChange={e => setLoanCreateQty(parseInt(e.target.value) || 1)}
                                        placeholder="Cantidad *"
                                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                    <input type="text" value={loanCreateUnit} onChange={e => setLoanCreateUnit(e.target.value)}
                                        placeholder="Unidad (ej: unidades, pares, cajas)"
                                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                </>
                            )}
                            {(loanInvType === InventoryType.ELECTRICAL_TOOL || loanInvType === InventoryType.HAND_TOOL) && (
                                <div className="space-y-1.5">
                                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider">Especies (color + marca)</p>
                                    {loanCreateSpecies.map((sp, idx) => (
                                        <div key={idx} className="relative pr-6">
                                            <div className="flex flex-col gap-1">
                                                <input value={sp.color}
                                                    onChange={e => setLoanCreateSpecies(prev => prev.map((s, i) => i === idx ? { ...s, color: e.target.value } : s))}
                                                    placeholder="Color *"
                                                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                                <input value={sp.brand}
                                                    onChange={e => setLoanCreateSpecies(prev => prev.map((s, i) => i === idx ? { ...s, brand: e.target.value } : s))}
                                                    placeholder="Marca *"
                                                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                            </div>
                                            {loanCreateSpecies.length > 1 && (
                                                <button onClick={() => setLoanCreateSpecies(prev => prev.filter((_, i) => i !== idx))}
                                                    className="absolute top-0 right-0 text-gray-400 hover:text-red-400 text-base leading-none p-1">×</button>
                                            )}
                                        </div>
                                    ))}
                                    <button onClick={() => setLoanCreateSpecies(prev => [...prev, { brand: '', color: '' }])}
                                        className="w-full py-1 text-[10px] text-blue-500 border border-dashed border-blue-200 rounded-lg hover:border-blue-400 bg-white">
                                        + Agregar especie
                                    </button>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button onClick={() => { setLoanIsCreating(false); setLoanCreateName(''); setLoanCreateSpecies([{ brand: '', color: '' }]); }}
                                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white">
                                    Cancelar
                                </button>
                                <button onClick={handleLoanCreateItem}
                                    disabled={!loanCreateName.trim() || ((loanInvType === InventoryType.ELECTRICAL_TOOL || loanInvType === InventoryType.HAND_TOOL) && !loanCreateSpecies.some(s => s.brand.trim() && s.color.trim()))}
                                    className="flex-1 py-1.5 text-xs font-black bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg transition-all">
                                    ✓ Guardar y seleccionar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setLoanIsCreating(true)}
                            className="w-full py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-xl hover:border-blue-500 bg-white transition-all">
                            + Crear nuevo
                        </button>
                    )}
                </div>
            )}

            <div>
                <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">Proyecto (opcional)</label>
                <select value={loanProjectId} onChange={e => { setLoanProjectId(e.target.value); setLoanNewProjectName(''); }}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">— Sin proyecto —</option>
                    {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="__new__">➕ Crear nuevo proyecto...</option>
                </select>
                {loanProjectId === '__new__' && (
                    <input type="text" value={loanNewProjectName} onChange={e => setLoanNewProjectName(e.target.value)}
                        placeholder="Nombre del proyecto *"
                        className="mt-1.5 w-full text-sm border border-blue-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                )}
            </div>

            {/* Fecha retroactiva */}
            <div>
                <label className="text-[10px] font-black text-blue-600 uppercase tracking-wide block mb-1">Fecha del préstamo</label>
                <input type="date" value={loanDate} onChange={e => setLoanDate(e.target.value)}
                    max={todayISO()}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <button onClick={confirmLoan} disabled={!loanPersonnelId || loanSelected.size === 0}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl text-sm transition-all">
                ✅ {loanInvType && !LOAN_TYPES.has(loanInvType) ? 'Confirmar salida' : 'Confirmar préstamo'}{loanSelected.size > 0 ? ` (${loanSelected.size})` : ''}
            </button>
        </div>
    );

    // ── Panel: Agregar al inventario ─────────────────────────────────────────

    const renderCreatePanel = () => (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-black text-green-700 uppercase tracking-wide">➕ Agregar al inventario</p>
                <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <div>
                <label className="text-[10px] font-black text-green-700 uppercase tracking-wide block mb-1">Tipo *</label>
                <div className="grid grid-cols-2 gap-1.5">
                    {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([type, label]) => (
                        <button key={type} onClick={() => setCreateInvType(type)}
                            className={`py-2 rounded-xl text-xs font-bold border transition-all ${createInvType === type ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="text-[10px] font-black text-green-700 uppercase tracking-wide block mb-1">
                    {(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) ? 'Género (nombre base) *' : 'Nombre *'}
                </label>
                <input type="text" value={createName} onChange={e => setCreateName(e.target.value)}
                    placeholder={(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) ? 'Ej: Pulidora, Martillo, Pala' : 'Ej: Palustres, Cascos...'}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>

            {(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) && (
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-green-700 uppercase tracking-wide block">Especies (color + marca) *</label>
                    {createSpecies.map((sp, idx) => (
                        <div key={idx} className="relative pr-7">
                            <div className="flex flex-col gap-1">
                                <input value={sp.color}
                                    onChange={e => setCreateSpecies(prev => prev.map((s, i) => i === idx ? { ...s, color: e.target.value } : s))}
                                    placeholder="Color (ej: roja)"
                                    className="w-full text-xs border border-gray-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400" />
                                <input value={sp.brand}
                                    onChange={e => setCreateSpecies(prev => prev.map((s, i) => i === idx ? { ...s, brand: e.target.value } : s))}
                                    placeholder="Marca (ej: Bosch)"
                                    className="w-full text-xs border border-gray-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400" />
                            </div>
                            {createSpecies.length > 1 && (
                                <button onClick={() => setCreateSpecies(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute top-0 right-0 text-gray-400 hover:text-red-500 text-lg leading-none p-1">×</button>
                            )}
                        </div>
                    ))}
                    <button onClick={() => setCreateSpecies(prev => [...prev, { brand: '', color: '' }])}
                        className="w-full py-1.5 text-xs text-green-600 border border-dashed border-green-300 rounded-xl hover:border-green-500 bg-white">
                        + Agregar especie
                    </button>
                    {createSpecies.filter(s => s.brand.trim() && s.color.trim()).length > 0 && (
                        <p className="text-[10px] text-green-700 font-bold text-center">
                            Se crearán {createSpecies.filter(s => s.brand.trim() && s.color.trim()).length} ítem(s) — 1 unidad c/u
                        </p>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] font-black text-green-700 uppercase tracking-wide block mb-1">Cantidad</label>
                    {(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) ? (
                        <div className="w-full text-sm border border-gray-100 bg-gray-50 rounded-xl px-3 py-2 text-gray-400 text-center">
                            {createSpecies.filter(s => s.brand.trim() && s.color.trim()).length || 1} ítem(s)
                        </div>
                    ) : (
                        <input type="number" value={createQty} min={1} onChange={e => setCreateQty(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400" />
                    )}
                </div>
                <div>
                    <label className="text-[10px] font-black text-green-700 uppercase tracking-wide block mb-1">Unidad</label>
                    <input type="text" value={createUnit} onChange={e => setCreateUnit(e.target.value)} placeholder="unidades"
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
            </div>

            <button onClick={confirmCreate}
                disabled={!createInvType || !createName.trim() || ((createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) && !createSpecies.some(s => s.brand.trim() && s.color.trim()))}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl text-sm transition-all">
                ✅ {(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) ? `Guardar ${createSpecies.filter(s => s.brand.trim() && s.color.trim()).length} ítem(s)` : 'Guardar ítem'}
            </button>
        </div>
    );

    // ── Render ───────────────────────────────────────────────────────────────

    const inAction = !!wizardStep || !!activePanel;

    return (
        <>
            {open && (
                <div className="fixed bottom-24 right-4 sm:right-6 z-[70] w-[340px] sm:w-[390px] flex flex-col rounded-2xl shadow-2xl border border-gray-200 overflow-hidden bg-white"
                    style={{ maxHeight: 'min(600px, calc(100vh - 110px))' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-600 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🤖</span>
                            <div>
                                <p className="text-white font-bold text-sm leading-tight">Asistente de Bodega</p>
                                <p className="text-blue-200 text-[10px]">
                                    {wizardStep ? (wizardIsAddMode ? 'Agregando al inventario…' : 'Registrando salida…') : activePanel === 'loan' ? 'Asignando herramienta…' : 'Consultar · Registrar'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {inAction && (
                                <button onClick={() => { cancelWizard(); closePanel(); }} className="text-blue-200 hover:text-white text-xs font-semibold px-2 py-1 rounded-lg hover:bg-blue-700 transition-colors">
                                    ✕ Cancelar
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-blue-700 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Botones de acción — solo en modo chat */}
                    {!inAction && (
                        <div className="px-3 pt-3 pb-1 flex gap-2 flex-shrink-0">
                            <button onClick={startWizard}
                                className="flex-1 py-2 pb-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm">
                                <span className="font-bold text-xs">🚀 Despacho</span>
                                <span className="text-[9px] opacity-70 leading-tight text-center px-1">Salidas grandes · varios tipos a la vez</span>
                            </button>
                            <button onClick={() => openPanel('loan')}
                                className="flex-1 py-2 pb-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm">
                                <span className="font-bold text-xs">⚡ Rápido</span>
                                <span className="text-[9px] opacity-70 leading-tight text-center px-1">Un ítem rápido · herramienta o consumible</span>
                            </button>
                            <button onClick={startAddMode}
                                className="flex-1 py-2 pb-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm">
                                <span className="font-bold text-xs">➕ Agregar</span>
                                <span className="text-[9px] opacity-70 leading-tight text-center px-1">Agrega ítems nuevos al inventario</span>
                            </button>
                        </div>
                    )}

                    {/* Contenido principal */}
                    {wizardStep ? <div key={wizardStep} style={{ display: 'contents' }}>{renderWizard()}</div>
                        : activePanel === 'loan' ? renderLoanPanel()
                        : activePanel === 'create' ? renderCreatePanel()
                        : (
                            <>
                                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
                                    {messages.map(msg => (
                                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                                                {msg.role === 'bot' ? <RichText text={msg.text} /> : msg.text}
                                            </div>
                                        </div>
                                    ))}
                                    {loading && (
                                        <div className="flex justify-start">
                                            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                                                {[0, 1, 2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }}/>)}
                                            </div>
                                        </div>
                                    )}
                                    <div ref={bottomRef}/>
                                </div>
                                {sugerencias.length > 0 && (
                                    <div className="border-t border-gray-100 px-3 py-2 flex gap-1.5 overflow-x-auto scrollbar-hide flex-shrink-0">
                                        {sugerencias.map(q => (
                                            <button
                                                key={q}
                                                onClick={() => { onBehaviorLog?.('CHAT_SUGGESTION', `Tocó sugerencia: ${q}`); handleSend(q); }}
                                                className="flex-shrink-0 px-3 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-100 transition-colors whitespace-nowrap"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="border-t border-gray-200 px-3 py-2 flex gap-2 items-end flex-shrink-0">
                                    <textarea value={input} onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                                        placeholder="Escribí o tocá una sugerencia…" rows={2}
                                        className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        style={{ maxHeight: '80px' }} />
                                    <button onClick={() => handleSend(input)} disabled={!input.trim() || loading}
                                        className="h-9 w-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl transition-all flex-shrink-0">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                                        </svg>
                                    </button>
                                </div>
                            </>
                        )
                    }
                </div>
            )}

            {/* FAB */}
            <button onClick={() => { setOpen(v => { if (!v) onBehaviorLog?.('CHAT_OPENED', 'Abrió el chatbot'); return !v; }); }}
                className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[70] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-xl flex items-center justify-center transition-all duration-200"
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
