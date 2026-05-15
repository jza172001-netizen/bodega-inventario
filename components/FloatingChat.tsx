import React, { useState, useRef, useEffect } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, Project, MovementType, InventoryType } from '../types';
import { askCopilot, parseExitIntent, parseCreationIntent, parseBulkAddIntent, ParsedExit, ParsedBulkAdd } from '../services/copilotService';

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
    onReturnItem?: (movementId: string) => void;
}

type WizardStep =
    | 'idle'
    | 'add:waiting_list'
    | 'checkout:waiting_worker'
    | 'checkout:waiting_project'
    | 'checkout:waiting_list'
    | 'full:waiting_project'
    | 'full:waiting_worker'
    | 'full:waiting_list'
    | 'return:waiting_person'
    | 'create:waiting_type'
    | 'create:waiting_name';

type WizardData = {
    project?: Project | null;
    rawProject?: string;
    worker?: Personnel | null;
    rawWorker?: string;
    createType?: 'project' | 'personnel';
};

type ChatMsg = {
    id: string;
    role: 'user' | 'bot';
    text: string;
    wizardMenu?: boolean;
    parsedExit?: ParsedExit;
    parsedBulkAdd?: ParsedBulkAdd;
    pendingItemCreate?: { name: string; unit: string };
    loanCard?: { person: Personnel };
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

const fuzzyFind = <T extends { name: string }>(query: string, list: T[]): T | null => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    return (
        list.find(p => p.name.toLowerCase() === q) ??
        list.find(p => p.name.toLowerCase().includes(q)) ??
        list.find(p => q.includes(p.name.toLowerCase())) ??
        null
    );
};

const LOAN_TYPES = new Set([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL]);

const getPlaceholder = (step: WizardStep): string => {
    switch (step) {
        case 'full:waiting_project':
        case 'checkout:waiting_project':
            return 'Nombre del proyecto (o "ninguno")';
        case 'full:waiting_worker':
        case 'checkout:waiting_worker':
            return 'Nombre del trabajador';
        case 'full:waiting_list':
        case 'add:waiting_list':
        case 'checkout:waiting_list':
            return 'Ej: 1 taladro, 50 tornillos, 2 cascos';
        case 'return:waiting_person':
            return 'Nombre del trabajador';
        case 'create:waiting_type':
            return '1 para Proyecto, 2 para Trabajador';
        case 'create:waiting_name':
            return 'Escribe el nombre...';
        default:
            return 'Escribe tu consulta o elige una opción...';
    }
};

export const FloatingChat: React.FC<FloatingChatProps> = ({
    items, movements, personnel, purchaseOrders, projects,
    onLogMovements, onCreateItem, onCreateProject, onCreatePersonnel, onReturnItem,
}) => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasNew, setHasNew] = useState(false);
    const [wizardStep, setWizardStep] = useState<WizardStep>('idle');
    const [wizardData, setWizardData] = useState<WizardData>({});
    const [exitSelections, setExitSelections] = useState<Record<string, Record<number, string>>>({});
    const [bulkTypes, setBulkTypes] = useState<Record<string, Record<number, InventoryType>>>({});
    const [loanSels, setLoanSels] = useState<Record<string, Set<string>>>({});
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setHasNew(false);
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
            if (messages.length === 0) showMenu('¡Hola! 👋 ¿Qué necesitas hoy?');
        }
    }, [open]);

    useEffect(() => {
        if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, [messages]);

    const addMsg = (msg: Omit<ChatMsg, 'id'>): ChatMsg => {
        const m: ChatMsg = { id: uid(), ...msg };
        setMessages(prev => [...prev, m]);
        if (!open && msg.role === 'bot') setHasNew(true);
        return m;
    };

    const addBot = (text: string, extra?: Partial<ChatMsg>): ChatMsg =>
        addMsg({ role: 'bot', text, ...extra });

    const addUser = (text: string) => addMsg({ role: 'user', text });

    const showMenu = (greeting?: string) => {
        addBot(greeting ?? '¿Qué más necesitas?', { wizardMenu: true });
        setWizardStep('idle');
        setWizardData({});
    };

    const resetWizard = () => {
        setWizardStep('idle');
        setWizardData({});
    };

    // ── MAIN SEND ROUTER ────────────────────────────────────────────────────
    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        setInput('');

        if (/^(cancelar|salir|cancel|menu|menú|inicio)$/i.test(trimmed)) {
            addUser(trimmed);
            showMenu('Entendido. ¿Qué más necesitas?');
            return;
        }

        switch (wizardStep) {
            case 'full:waiting_project':    return handleFullProject(trimmed);
            case 'full:waiting_worker':     return handleFullWorker(trimmed);
            case 'full:waiting_list':       return handleFullList(trimmed);
            case 'add:waiting_list':        return handleAddList(trimmed);
            case 'checkout:waiting_worker': return handleCheckoutWorker(trimmed);
            case 'checkout:waiting_project':return handleCheckoutProject(trimmed);
            case 'checkout:waiting_list':   return handleCheckoutList(trimmed);
            case 'return:waiting_person':   return handleReturnPerson(trimmed);
            case 'create:waiting_type':     return handleCreateType(trimmed);
            case 'create:waiting_name':     return handleCreateName(trimmed);
            default:                        return handleIdle(trimmed);
        }
    };

    // ── IDLE: texto libre ───────────────────────────────────────────────────
    const handleIdle = async (text: string) => {
        addUser(text);
        setLoading(true);

        const creation = parseCreationIntent(text);
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
                    addBot(`✅ Ítem **${it.name}** creado como ${TYPE_LABELS[creation.inventoryType]}.`);
                } else {
                    addBot(`¿Qué tipo es **"${creation.name}"**?`, { pendingItemCreate: { name: creation.name, unit: creation.unit } });
                }
            }
            setLoading(false);
            return;
        }

        const bulk = parseBulkAddIntent(text, items, projects, personnel);
        if (bulk.isBulkAdd) {
            addBot('Clasifiqué la lista así 👇 — verifica y ajusta si algo no está bien:', { parsedBulkAdd: bulk });
            setLoading(false);
            return;
        }

        const parsed = parseExitIntent(text, items, projects, personnel);
        if (parsed.isExitIntent && parsed.movements.length > 0) {
            addBot('', { parsedExit: parsed });
            setLoading(false);
            return;
        }

        const resp = await askCopilot(text, { items, movements, personnel, purchaseOrders });
        addBot(resp);
        setLoading(false);
    };

    // ── WIZARD: TODO A LA VEZ ───────────────────────────────────────────────
    const handleFullProject = (text: string) => {
        addUser(text);
        const isNone = /^(no|ninguno|sin|n\/a|ningún|omitir)$/i.test(text.trim());
        const matched = isNone ? null : fuzzyFind(text, projects);
        setWizardData(prev => ({ ...prev, project: isNone ? null : matched, rawProject: isNone ? '' : text.trim() }));
        const label = isNone ? 'sin proyecto' : matched ? `📌 **${matched.name}**` : `📌 **${text.trim()}** (nuevo)`;
        addBot(`${label} ✅\n\n¿A quién le entrego los materiales? (nombre del trabajador)`);
        setWizardStep('full:waiting_worker');
    };

    const handleFullWorker = (text: string) => {
        addUser(text);
        const matched = fuzzyFind(text, personnel);
        setWizardData(prev => ({ ...prev, worker: matched, rawWorker: text.trim() }));
        const label = matched ? `👷 **${matched.name}**` : `👷 **${text.trim()}** (nuevo)`;
        addBot(`${label} ✅\n\n¿Qué materiales lleva? Pega la lista:\n_(ej: 1 taladro, 50 tornillos, 2 cascos)_`);
        setWizardStep('full:waiting_list');
    };

    const handleFullList = (text: string) => {
        addUser(text);
        const bulk = parseBulkAddIntent(text, items, [], []);
        if (!bulk.isBulkAdd || bulk.items.length === 0) {
            addBot('No pude identificar materiales. Intenta así:\n"1 taladro, 50 tornillos, 2 cascos"');
            return;
        }
        const enriched: ParsedBulkAdd = {
            ...bulk,
            matchedPersonnel: wizardData.worker ?? null,
            rawPersonnel: wizardData.rawWorker ?? '',
            matchedProject: wizardData.project ?? null,
            rawProject: wizardData.rawProject ?? '',
        };
        addBot('Clasifiqué la lista así 👇 — verifica el tipo de cada ítem antes de confirmar:', { parsedBulkAdd: enriched });
        resetWizard();
    };

    // ── WIZARD: SOLO AGREGAR ────────────────────────────────────────────────
    const handleAddList = (text: string) => {
        addUser(text);
        const bulk = parseBulkAddIntent(text, items, [], []);
        if (!bulk.isBulkAdd || bulk.items.length === 0) {
            addBot('No pude identificar materiales. Intenta:\n"1 taladro, 50 tornillos, 2 cascos"');
            return;
        }
        addBot('Clasifiqué la lista así 👇 — verifica y ajusta si es necesario:', { parsedBulkAdd: bulk });
        resetWizard();
    };

    // ── WIZARD: SOLO DESPACHAR ──────────────────────────────────────────────
    const handleCheckoutWorker = (text: string) => {
        addUser(text);
        const matched = fuzzyFind(text, personnel);
        setWizardData(prev => ({ ...prev, worker: matched, rawWorker: text.trim() }));
        const label = matched ? `👷 **${matched.name}**` : `👷 **${text.trim()}** (nuevo)`;
        addBot(`${label} ✅\n\n¿Para qué proyecto son los materiales?\n_(escribe "ninguno" si no aplica)_`);
        setWizardStep('checkout:waiting_project');
    };

    const handleCheckoutProject = (text: string) => {
        addUser(text);
        const isNone = /^(no|ninguno|sin|n\/a|omitir)$/i.test(text.trim());
        const matched = isNone ? null : fuzzyFind(text, projects);
        setWizardData(prev => ({ ...prev, project: isNone ? null : matched, rawProject: isNone ? '' : text.trim() }));
        const workerName = wizardData.worker?.name ?? wizardData.rawWorker ?? 'el trabajador';
        addBot(`✅\n\n¿Qué materiales lleva **${workerName}**? Pega la lista:`);
        setWizardStep('checkout:waiting_list');
    };

    const handleCheckoutList = (text: string) => {
        addUser(text);
        const parsed = parseExitIntent(text, items, [], []);
        if (parsed.isExitIntent && parsed.movements.length > 0) {
            const enriched: ParsedExit = { ...parsed, matchedPersonnel: wizardData.worker ?? null, rawPersonnel: wizardData.rawWorker ?? '', matchedProject: wizardData.project ?? null, rawProject: wizardData.rawProject ?? '' };
            addBot('Confirma las salidas 👇', { parsedExit: enriched });
            resetWizard();
            return;
        }
        const bulk = parseBulkAddIntent(text, items, [], []);
        if (bulk.isBulkAdd && bulk.items.length > 0) {
            const enriched: ParsedBulkAdd = { ...bulk, matchedPersonnel: wizardData.worker ?? null, rawPersonnel: wizardData.rawWorker ?? '', matchedProject: wizardData.project ?? null, rawProject: wizardData.rawProject ?? '' };
            addBot('Clasifiqué los materiales 👇 — verifica y confirma:', { parsedBulkAdd: enriched });
            resetWizard();
            return;
        }
        addBot('No pude identificar materiales. Intenta:\n"1 pala, 3 cascos, 50 tornillos"');
    };

    // ── WIZARD: DEVOLVER HERRAMIENTAS ───────────────────────────────────────
    const handleReturnPerson = (text: string) => {
        addUser(text);
        const person = fuzzyFind(text, personnel);
        if (!person) {
            addBot(`No encontré a nadie llamado "${text}".\n¿Cómo se llama exactamente?`);
            return;
        }
        const activeLoans = movements.filter(m => m.isLoan && !m.isReturned && m.personnelId === person.id);
        if (activeLoans.length === 0) {
            addBot(`**${person.name}** no tiene herramientas prestadas actualmente. ✅`);
            resetWizard();
            showMenu();
            return;
        }
        const msg = addBot(`Estas son las herramientas de **${person.name}** 👇\nMarca las que devolvió:`, { loanCard: { person } });
        setLoanSels(prev => ({ ...prev, [msg.id]: new Set(activeLoans.map(m => m.id)) }));
        resetWizard();
    };

    // ── WIZARD: CREAR ───────────────────────────────────────────────────────
    const handleCreateType = (text: string) => {
        addUser(text);
        if (/^(1|proyecto|project)$/i.test(text.trim())) {
            setWizardData(prev => ({ ...prev, createType: 'project' }));
            addBot('¿Cómo se llama el proyecto?');
            setWizardStep('create:waiting_name');
        } else if (/^(2|trabajador|persona|personal)$/i.test(text.trim())) {
            setWizardData(prev => ({ ...prev, createType: 'personnel' }));
            addBot('¿Cómo se llama el trabajador?');
            setWizardStep('create:waiting_name');
        } else {
            addBot('Escribe **1** para Proyecto o **2** para Trabajador:');
        }
    };

    const handleCreateName = (text: string) => {
        addUser(text);
        const name = text.trim();
        if (!name) { addBot('Escribe un nombre válido:'); return; }
        if (wizardData.createType === 'project') {
            const p = onCreateProject({ name, status: 'active' });
            addBot(`✅ Proyecto **${p.name}** creado.`);
        } else {
            const p = onCreatePersonnel({ name });
            addBot(`✅ Trabajador **${p.name}** registrado.`);
        }
        showMenu();
    };

    // ── CONFIRM: SALIDA (ExitCard) ──────────────────────────────────────────
    const handleConfirmExit = (msg: ChatMsg) => {
        const exit = msg.parsedExit!;
        const sel = exitSelections[msg.id] ?? {};
        const toLog = exit.movements.map((pm, idx) => {
            const item = pm.matchedItem ?? (sel[idx] ? items.find(i => i.id === sel[idx]) : undefined);
            if (!item) return null;
            const isLoan = LOAN_TYPES.has(item.inventoryType);
            return { itemId: item.id, type: MovementType.CHECK_OUT, quantity: pm.quantity, timestamp: new Date(), personnelId: exit.matchedPersonnel?.id, projectId: exit.matchedProject?.id, notes: '', isLoan, isReturned: false };
        }).filter(Boolean) as Array<Omit<Movement, 'id'>>;
        if (!toLog.length) { addBot('No hay materiales confirmados.'); return; }
        onLogMovements(toLog);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
        const workerName = exit.matchedPersonnel?.name;
        addBot(`✅ ${toLog.length} salida(s) registradas.${workerName ? `\n👤 Asignadas a **${workerName}**.` : ''}`);
    };

    // ── CONFIRM: AGREGAR (BulkAddCard) ──────────────────────────────────────
    const handleConfirmBulk = (msg: ChatMsg, withDispatch: boolean) => {
        const bulk = msg.parsedBulkAdd!;
        const myTypes = bulkTypes[msg.id] ?? {};
        const createdByIdx: Record<number, Item> = {};

        bulk.items.forEach((bi, idx) => {
            if (!bi.matchedItem) {
                const itemType = myTypes[idx] ?? bi.guessedType;
                const it = onCreateItem({ name: bi.rawName, inventoryType: itemType, quantity: 0, unit: bi.unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0 });
                createdByIdx[idx] = it;
            }
        });

        const checkIns: Array<Omit<Movement, 'id'>> = bulk.items.map((bi, idx) => {
            const item = bi.matchedItem ?? createdByIdx[idx];
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
                const item = bi.matchedItem ?? createdByIdx[idx];
                if (!item) return null;
                const isLoan = LOAN_TYPES.has(myTypes[idx] ?? bi.guessedType ?? item.inventoryType);
                return { itemId: item.id, type: MovementType.CHECK_OUT, quantity: bi.quantity, timestamp: new Date(), personnelId: worker?.id, projectId: project?.id, notes: '', isLoan, isReturned: false };
            }).filter(Boolean) as Array<Omit<Movement, 'id'>>;
            onLogMovements(checkOuts);
        }

        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
        const newCount = Object.keys(createdByIdx).length;
        const workerName = bulk.matchedPersonnel?.name ?? bulk.rawPersonnel;
        let reply = `✅ ${bulk.items.length} ítem(s) agregados al inventario.`;
        if (newCount > 0) reply += ` (${newCount} nuevos)`;
        if (withDispatch && workerName) reply += `\n📤 Despachados a **${workerName}**.`;
        if (withDispatch && (bulk.matchedProject?.name ?? bulk.rawProject)) reply += `\n📌 Proyecto: **${bulk.matchedProject?.name ?? bulk.rawProject}**.`;
        addBot(reply);
    };

    // ── CONFIRM: DEVOLUCIÓN (LoanReturnCard) ────────────────────────────────
    const handleConfirmReturn = (msgId: string, selectedIds: string[]) => {
        if (!onReturnItem || selectedIds.length === 0) {
            addBot('No se marcó ninguna devolución.');
            return;
        }
        selectedIds.forEach(id => onReturnItem(id));
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, confirmed: true } : m));
        addBot(`✅ ${selectedIds.length} herramienta(s) marcadas como devueltas.`);
    };

    // ── BOTONES DEL MENÚ ────────────────────────────────────────────────────
    const startOption = (opt: number) => {
        switch (opt) {
            case 1:
                addUser('Agregar materiales');
                addBot('¿Qué materiales vas a agregar?\nPega la lista:\n_(ej: 1 taladro, 50 tornillos, 2 cascos)_');
                setWizardStep('add:waiting_list');
                break;
            case 2:
                addUser('Registrar salida');
                addBot('¿A quién le despachas los materiales?\n(nombre del trabajador)');
                setWizardStep('checkout:waiting_worker');
                break;
            case 3:
                addUser('Crear proyecto o trabajador');
                addBot('¿Qué quieres crear?\n**1** → Proyecto\n**2** → Trabajador');
                setWizardStep('create:waiting_type');
                break;
            case 4:
                addUser('Marcar herramientas devueltas');
                addBot('¿De quién son las herramientas que devolvieron?\n(nombre del trabajador)');
                setWizardStep('return:waiting_person');
                break;
            case 5:
                addUser('Todo a la vez');
                addBot('Vamos paso a paso 💪\n\n¿Para dónde van los materiales?\n(nombre del proyecto, o "ninguno" si son consumibles)');
                setWizardStep('full:waiting_project');
                break;
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); }
    };

    // ── RENDER ──────────────────────────────────────────────────────────────
    const renderMessage = (msg: ChatMsg) => {
        if (msg.wizardMenu && !msg.confirmed) {
            return <MenuCard key={msg.id} text={msg.text} onSelect={startOption} />;
        }

        if (msg.parsedExit && !msg.confirmed) {
            return (
                <ExitCard key={msg.id} msg={msg} items={items}
                    sel={exitSelections[msg.id] ?? {}}
                    onSelect={(i, id) => setExitSelections(prev => ({ ...prev, [msg.id]: { ...(prev[msg.id] ?? {}), [i]: id } }))}
                    onConfirm={() => handleConfirmExit(msg)}
                    onCancel={() => {
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
                        addBot('Cancelado.');
                        resetWizard();
                    }}
                />
            );
        }

        if (msg.parsedBulkAdd && !msg.confirmed) {
            return (
                <BulkAddCard key={msg.id} msg={msg}
                    myTypes={bulkTypes[msg.id] ?? {}}
                    onTypeChange={(i, t) => setBulkTypes(prev => ({ ...prev, [msg.id]: { ...(prev[msg.id] ?? {}), [i]: t } }))}
                    onConfirm={(dispatch) => handleConfirmBulk(msg, dispatch)}
                    onCancel={() => {
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
                        addBot('Cancelado.');
                        resetWizard();
                    }}
                />
            );
        }

        if (msg.pendingItemCreate && !msg.confirmed) {
            return (
                <TypePickCard key={msg.id} name={msg.pendingItemCreate.name}
                    onSelect={(t) => {
                        const it = onCreateItem({ name: msg.pendingItemCreate!.name, inventoryType: t, quantity: 0, unit: msg.pendingItemCreate!.unit, category: 'Sin clasificar', subCategory: 'General', minStock: 0 });
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
                        addBot(`✅ **${it.name}** creado como ${TYPE_LABELS[t]}.`);
                    }}
                />
            );
        }

        if (msg.loanCard && !msg.confirmed) {
            const { person } = msg.loanCard;
            const activeLoans = movements.filter(m => m.isLoan && !m.isReturned && m.personnelId === person.id);
            const sel = loanSels[msg.id] ?? new Set<string>();
            return (
                <LoanReturnCard key={msg.id} loans={activeLoans} items={items} selected={sel}
                    onToggle={(movId) => setLoanSels(prev => {
                        const s = new Set(prev[msg.id] ?? new Set<string>());
                        s.has(movId) ? s.delete(movId) : s.add(movId);
                        return { ...prev, [msg.id]: s };
                    })}
                    onConfirm={() => handleConfirmReturn(msg.id, Array.from(sel))}
                    onCancel={() => {
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
                        addBot('Cancelado.');
                    }}
                />
            );
        }

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
                <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[340px] sm:w-[390px] flex flex-col rounded-2xl shadow-2xl border border-gray-200 overflow-hidden bg-white"
                    style={{ maxHeight: 'min(600px, calc(100vh - 110px))' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-600 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🤖</span>
                            <div>
                                <p className="text-white font-bold text-sm leading-tight">Asistente de Bodega</p>
                                <p className="text-blue-200 text-[10px]">Crear · Agregar · Despachar · Devolver</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => showMenu()} title="Menú principal"
                                className="text-blue-200 hover:text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                                </svg>
                            </button>
                            <button onClick={() => setOpen(false)}
                                className="text-blue-200 hover:text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
                        {messages.map(msg => renderMessage(msg))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                                    {[0, 1, 2].map(i => (
                                        <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                                            style={{ animationDelay: `${i * 0.15}s` }}/>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef}/>
                    </div>

                    {/* Input */}
                    <div className="border-t border-gray-200 px-3 py-2 flex gap-2 items-end flex-shrink-0">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKey}
                            placeholder={getPlaceholder(wizardStep)}
                            rows={2}
                            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            style={{ maxHeight: '80px' }}
                        />
                        <button
                            onClick={() => handleSend(input)}
                            disabled={!input.trim() || loading}
                            className="h-9 w-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl transition-all flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* FAB */}
            <button onClick={() => setOpen(v => !v)}
                className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-xl flex items-center justify-center transition-all duration-200">
                {open
                    ? <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    : <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
                }
                {hasNew && !open && (
                    <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white animate-pulse"/>
                )}
            </button>
        </>
    );
};

// ── SUB-COMPONENTES ──────────────────────────────────────────────────────────

const MenuCard: React.FC<{ text: string; onSelect: (opt: number) => void }> = ({ text, onSelect }) => (
    <div className="flex justify-start">
        <div className="max-w-[94%] space-y-2">
            <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed">
                {text}
            </div>
            <div className="space-y-1.5">
                {[
                    { n: 1, icon: '📥', label: 'Agregar materiales al inventario' },
                    { n: 2, icon: '📤', label: 'Registrar salida (despachar)' },
                    { n: 3, icon: '➕', label: 'Crear proyecto o trabajador' },
                    { n: 4, icon: '🔄', label: 'Marcar herramientas devueltas' },
                    { n: 5, icon: '⚡', label: 'Todo a la vez (agregar + despachar)' },
                ].map(({ n, icon, label }) => (
                    <button key={n} onClick={() => onSelect(n)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-xl text-sm font-medium transition-all text-left">
                        <span className="text-base flex-shrink-0">{icon}</span>
                        <span>{label}</span>
                    </button>
                ))}
            </div>
        </div>
    </div>
);

const LoanReturnCard: React.FC<{
    loans: Movement[];
    items: Item[];
    selected: Set<string>;
    onToggle: (id: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ loans, items, selected, onToggle, onConfirm, onCancel }) => (
    <div className="w-full bg-white border border-green-200 rounded-2xl rounded-bl-sm shadow-md p-3">
        <p className="text-xs font-black text-green-600 uppercase tracking-widest mb-2">🔄 Marcar como devueltas</p>
        <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
            {loans.map(loan => {
                const item = items.find(i => i.id === loan.itemId);
                const checked = selected.has(loan.id);
                return (
                    <button key={loan.id} onClick={() => onToggle(loan.id)}
                        className={`w-full flex items-center gap-2 p-2 rounded-xl transition-all text-left ${checked ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-transparent hover:border-gray-200'}`}>
                        <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${checked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                            {checked && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                                </svg>
                            )}
                        </span>
                        <span className="text-sm font-medium text-gray-700 flex-1">{loan.quantity}× {item?.name ?? '?'}</span>
                        <span className="text-xs text-gray-400">{new Date(loan.timestamp).toLocaleDateString('es-CO')}</span>
                    </button>
                );
            })}
        </div>
        <div className="flex gap-2">
            <button onClick={onConfirm} disabled={selected.size === 0}
                className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                ✅ Confirmar devolución
            </button>
            <button onClick={onCancel} className="px-3 py-1.5 border border-gray-200 text-gray-400 hover:bg-gray-50 rounded-xl text-xs font-semibold">✕</button>
        </div>
    </div>
);

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
            <p className="text-xs font-black text-blue-500 uppercase tracking-widest mb-2">📋 Revisar clasificación</p>
            <div className="space-y-1.5 mb-3">
                {bulk.items.map((bi, idx) => {
                    const currentType = myTypes[idx] ?? bi.matchedItem?.inventoryType ?? bi.guessedType;
                    const isNew = !bi.matchedItem;
                    return (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50">
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isNew ? 'bg-blue-400' : 'bg-green-400'}`}/>
                            <span className="text-sm font-bold text-gray-700 min-w-0 flex-1 truncate">
                                {bi.quantity}× {bi.rawName}
                                {isNew && <span className="text-xs text-blue-500 font-normal ml-1">(nuevo)</span>}
                            </span>
                            <select
                                value={currentType}
                                onChange={e => onTypeChange(idx, e.target.value as InventoryType)}
                                className="text-[10px] border border-gray-300 rounded-lg px-1.5 py-0.5 bg-white text-gray-600 flex-shrink-0 cursor-pointer">
                                {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([t, l]) => (
                                    <option key={t} value={t}>{l}</option>
                                ))}
                            </select>
                        </div>
                    );
                })}
            </div>
            {(bulk.matchedPersonnel || bulk.rawPersonnel) && (
                <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-600 bg-blue-50 rounded-lg px-2 py-1.5">
                    <span>👤</span>
                    <span className="font-semibold">{bulk.matchedPersonnel?.name ?? bulk.rawPersonnel}</span>
                    {(bulk.matchedProject || bulk.rawProject) && (
                        <><span className="text-gray-400">·</span><span>📌 {bulk.matchedProject?.name ?? bulk.rawProject}</span></>
                    )}
                </div>
            )}
            <div className="flex gap-2">
                <button onClick={() => onConfirm(false)}
                    className="flex-1 py-1.5 border border-blue-500 text-blue-600 hover:bg-blue-50 font-bold rounded-xl text-xs transition-all">
                    📥 Solo inventario
                </button>
                {hasWorker && (
                    <button onClick={() => onConfirm(true)}
                        className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all">
                        📤 Agregar y despachar
                    </button>
                )}
                <button onClick={onCancel}
                    className="px-3 py-1.5 border border-gray-200 text-gray-400 hover:bg-gray-50 rounded-xl text-xs font-semibold">✕</button>
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
                            {!chosen && !pm.candidates.length && (
                                <p className="text-xs text-red-400 ml-5 mt-0.5">No encontrado en inventario</p>
                            )}
                        </div>
                    );
                })}
            </div>
            {exit.matchedPersonnel && (
                <div className="mb-2 text-xs text-gray-600 flex items-center gap-1.5 bg-orange-50 rounded-lg px-2 py-1.5">
                    <span>👤</span><span className="font-semibold">{exit.matchedPersonnel.name}</span>
                    {exit.matchedProject && <><span className="text-gray-400">·</span><span>📌 {exit.matchedProject.name}</span></>}
                </div>
            )}
            <div className="flex gap-2">
                <button onClick={onConfirm} disabled={!canConfirm}
                    className="flex-1 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-all">
                    ✅ Confirmar y registrar
                </button>
                <button onClick={onCancel}
                    className="px-3 py-1.5 border border-gray-200 text-gray-400 hover:bg-gray-50 rounded-xl text-xs font-semibold">✕</button>
            </div>
        </div>
    );
};

const TypePickCard: React.FC<{ name: string; onSelect: (t: InventoryType) => void }> = ({ name, onSelect }) => (
    <div className="w-full bg-white border border-gray-200 rounded-2xl rounded-bl-sm p-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-700 mb-2">
            ¿Qué tipo es <span className="text-blue-600">"{name}"</span>?
        </p>
        <div className="grid grid-cols-2 gap-1.5">
            {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([type, label]) => (
                <button key={type} onClick={() => onSelect(type)}
                    className={`py-2 px-2 border rounded-xl text-xs font-semibold transition-all text-left hover:border-blue-400 hover:bg-blue-50 ${TYPE_COLORS[type]}`}>
                    {label}
                </button>
            ))}
        </div>
    </div>
);
