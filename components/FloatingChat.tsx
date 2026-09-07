
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, Project, MovementType, InventoryType, RechazoStock, LoteResultado, AuditLog } from '../types';
import { momentoDeFecha } from '../utils/date';
import { askCopilot } from '../services/copilotService';
import { suggestQuestions } from '../services/warehouseQA';
import { scoreMatch } from '../utils/search';
import { AccesoriosDeItem } from './AccesoriosDeItem';
import { ArbolFamilias } from './ArbolFamilias';
import { COMO_SE_HACE } from '../services/comoSeHace';
import { unidadesCon } from '../utils/unidades';
import { getGenus, familiaDe, esParecido, familiaCanonica, familiasParecidas, coloresDeFamilia, marcasDeFamilia, nombreCorregido, normStr, raizDeFamilia } from '../utils/genus';
import { tonoDe, raizDeColor, coloresUnificados, PALETA } from '../utils/colores';
import { generosDe, denominacionesDe, nombreCompuesto } from '../utils/medida';
import { medidaDe } from '../utils/medida';

/** Las preguntas de uso, tal cual las responde el asistente. */
const PREGUNTAS_DE_AYUDA = COMO_SE_HACE.map(c => c.pregunta);

interface FloatingChatProps {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    purchaseOrders: PurchaseOrder[];
    projects: Project[];
    /** Devuelve cuántos movimientos quedaron realmente registrados: la app puede
     *  rechazar una salida por stock insuficiente y el bot no debe cantar éxito. */
    onLogMovements: (ms: Array<Omit<Movement, 'id'>>) => LoteResultado;
    onCreateItem: (item: Omit<Item, 'id'>) => Item;
    /** Para fijarle la familia a un ítem que ya existía cuando se confirma
     *  que el nuevo es una variante suyo. */
    onEditItem?: (item: Item) => void;
    onCreateProject: (p: Omit<Project, 'id'>) => Project;
    onCreatePersonnel: (p: Omit<Personnel, 'id'>) => Personnel;
    onBehaviorLog?: (action: string, detail: string) => void;
    /**
     * Deshace los ítems que el asistente creó si el bodeguero cancela a mitad.
     * Solo borra los que no alcanzaron a tener movimientos.
     */
    onDescartarItems?: (ids: string[]) => void;
    /** Guarda en la bitácora la misma frase que se acaba de mostrar en el chat,
     *  para que el historial diga lo que el bodeguero vio y no una reconstrucción. */
    onResumenChat?: (texto: string) => void;
    /**
     * La bitácora, para poder mirarla sin salir del chat.
     *
     * El dato ya existía y estaba completo —cada acción con su hora y con quién
     * la hizo—, pero vivía en Trazabilidad, que es otra pantalla y hay que
     * acordarse de entrar. Estando despachando, la pregunta que aparece es
     * "¿quién fue el último que movió esto?", y devolverse rompe lo que se
     * estaba haciendo.
     */
    auditLogs?: AuditLog[];
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
    [InventoryType.ACCESSORY]:       '🔩 Accesorio',
};

const CATEGORY_BY_TYPE: Record<InventoryType, string> = {
    [InventoryType.HAND_TOOL]:       'Herramientas',
    [InventoryType.ELECTRICAL_TOOL]: 'Herramientas',
    [InventoryType.PPE]:             'Seguridad',
    [InventoryType.SINGLE_USE]:      'Materiales',
    [InventoryType.ACCESSORY]:       'Accesorios',
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
                    {esItem && <span className="text-tinta-tenue mr-1.5">•</span>}
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
    onLogMovements, onCreateItem, onEditItem, onCreateProject, onCreatePersonnel,
    onBehaviorLog, auditLogs = [], onDescartarItems, onResumenChat,
}) => {
    const [open, setOpen] = useState(false);
    /** El historial del asistente: lo que se hizo DESDE acá, no toda la app. */
    const [verHistorial, setVerHistorial] = useState(false);
    /** Cuál operación del historial está abierta mostrando su detalle. */
    const [operacionAbierta, setOperacionAbierta] = useState<string | null>(null);
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
    /**
     * El «+» de «¿De qué color?», igual al de la Lista de pedidos.
     *
     * Acá los chips salían solo con lo que la familia YA tenía: si la Pulidora
     * nunca había sido amarilla, no había dónde escribir «amarilla» — y si la
     * familia no tenía ni un color, el renglón entero desaparecía. Quedaba el
     * campo de texto de abajo, que para una herramienta ni se mira.
     *
     * Mismo camino de allá: `null` cerrado; 'elegir' pregunta de qué se trata;
     * 'color' pide un color y ofrece el resto de la paleta; 'denominacion' pide
     * una palabra —*acero*, *hierro*, *madera*— y no ofrece paleta ninguna,
     * porque no hay nada que pintar. Los dos escriben en la misma casilla.
     */
    const [anadiendoColor, setAnadiendoColor] = useState<null | 'elegir' | 'color' | 'denominacion'>(null);
    /**
     * Las cuatro piezas con que la bodega nombra un consumible, en el orden en
     * que Juli las dijo: «clavos 1, hierro 2, 2" 3, 20 unidades 4».
     *
     * Familia, género, denominación y cantidad. Hasta hoy el formulario pedía un
     * nombre libre y después color y marca —que para un clavo no significan
     * nada—, así que para meter clavos de acero de otra pulgada había que
     * adivinar que la medida iba escrita dentro del nombre. La estructura ya
     * existía en el árbol; lo que faltaba era preguntarla.
     *
     * El nombre se ARMA con las piezas (`nombreCompuesto`), que es exactamente
     * la forma que `familiaDe`, `materialDe` y `medidaDe` saben descomponer: el
     * árbol lo agrupa solo, sin tocar nada más.
     */
    const [wizardGenero, setWizardGenero] = useState('');
    const [wizardDenom, setWizardDenom] = useState('');
    const [nuevoGenero, setNuevoGenero] = useState<string | null>(null);
    const [nuevaDenom, setNuevaDenom] = useState<string | null>(null);
    const [colorNuevoChat, setColorNuevoChat] = useState('');
    const [wizardCreateUnit, setWizardCreateUnit] = useState('unidades');
    const [wizardSpecies, setWizardSpecies] = useState<Array<{brand: string; color: string}>>([{ brand: '', color: '' }]);
    // El grupo (sub-clasificación). Antes se escribía 'General' a mano en los seis
    // puntos de creación del chatbot, así que TODO lo creado por acá caía en el
    // mismo montón y no había manera de agrupar nada en el histórico.
    // La familia que el bodeguero ELIGE. Antes acá vivía el "grupo" (Golpe,
    // Albañilería, Acabados): una taxonomía que la app se inventó y que en la
    // bodega nadie usa. Lo que sí usa es la familia — las lechadas, los clavos,
    // los taladros — y es lo que hay que preguntarle.
    const [wizardCreateFamilia, setWizardCreateFamilia] = useState('');
    /**
     * Qué es lo que sobra del nombre después de la familia.
     *
     * En "Lechada beige", el "beige" es el COLOR — no parte del nombre. En
     * "Clavos 2", el 2 son las pulgadas. La app no puede saber cuál es cuál, y
     * adivinar mal deja el color metido dentro del nombre y el ítem sin color,
     * que es exactamente el desorden que hay hoy en la bodega.
     * Se pregunta una vez y se guarda donde corresponde.
     */
    const [restoDecidido, setRestoDecidido] = useState(false);
    // Cuando el nombre se parece a algo que ya existe, se para antes de crear y
    // se pregunta. Unir por parecido sin preguntar juntaría cosas distintas.
    /**
     * Lo que la bodega no dejó salir, esperando decisión. No es un aviso: es el
     * lugar donde se resuelve. El chat existe para no tener que salirse a
     * arreglar nada, y decir «no hay stock» y cerrar era mandarlo a arreglarlo
     * por otro lado.
     */
    const [reposicion, setReposicion] = useState<RechazoStock[] | null>(null);
    const [reponerQty, setReponerQty] = useState<Map<string, number>>(new Map());
    const [parecidoPendiente, setParecidoPendiente] = useState<Item[] | null>(null);
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

    /**
     * Lo que se puede despachar por la salida rápida.
     *
     * Antes filtraba `quantity > 0` y escondía todo lo agotado. En la bodega de
     * verdad eso dejaba la lista de consumibles con dos renglones —Clavos y
     * Polvo enchape— mientras había otros nueve ítems que sencillamente estaban
     * en cero. Juli lo reportó como "solo me salen clavos y polvo de enchape
     * pero hay más consumibles".
     *
     * Y no es solo incómodo: sin verlos, uno cree que no existen y crea un
     * duplicado de algo que ya está en la bodega. Ese razonamiento ya está
     * escrito en el despacho grande, donde el filtro se quitó hace tiempo; lo
     * que pasó es que el arreglo se hizo allá y nunca se trajo acá.
     *
     * Ahora se ven todos, los agotados marcados como tales y de últimos.
     */
    const availableForLoan = useMemo(() => {
        if (!loanInvType) return [];
        return items.filter(i => i.inventoryType === loanInvType)
            .sort((a, b) => (a.quantity > 0 ? 0 : 1) - (b.quantity > 0 ? 0 : 1)
                          || a.name.localeCompare(b.name, 'es'));
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

    /**
     * Lo mismo que `addBot`, pero además queda guardado.
     *
     * La conversación vive solo en este teléfono: a Juli se le apagó el celular
     * y se le borró entera. Lo que hizo NO se perdió —eso está en la bitácora—,
     * pero el resumen legible, el del chulito, sí. Con esto la frase que él ve
     * es la misma que queda escrita, y sobrevive al apagón y se ve desde
     * cualquier celular.
     *
     * Se usa solo cuando de verdad PASÓ algo en la bodega. Los saludos y las
     * respuestas a preguntas no se guardan: eso sería llenar la bitácora de
     * conversación.
     */
    const addBotYGuarda = (text: string) => {
        addBot(text);
        onResumenChat?.(text);
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

    /**
     * El nombre completo no cabe en una línea de celular: "Taladro Inhalambrico
     * (Amarillo · Dwalt)" se cortaba justo antes de la marca, que es lo único
     * que distingue un taladro amarillo de otro. Se parte en dos renglones para
     * que el color y la marca SIEMPRE se vean.
     */
    const FilaItem = ({ item, detalle }: { item: Item; detalle?: string }) => {
        const familia = getGenus(item.name);
        const variante = detalle ?? (item.name.match(/\(([^)]+)\)/)?.[1]
            ?? [item.color, item.brand].filter(Boolean).join(' · '));
        // Dentro del árbol la familia y la rama ya están arriba: repetir el
        // nombre completo en la hoja es gastar el único renglón que hay.
        const titulo = detalle !== undefined ? (detalle ? '' : item.name) : familia;
        return (
            <div className="flex-1 min-w-0">
                {titulo && <p className="text-sm text-tinta truncate">{titulo}</p>}
                {variante && (
                    <p className={`truncate font-semibold text-marca-oscuro flex items-center gap-1 ${titulo ? 'text-[10px]' : 'text-sm'}`}>
                        {/* El color, del color que es. Leerlo es más lento que verlo. */}
                        {tonoDe(item.color ?? '') && (
                            <span className="w-2 h-2 rounded-full border border-black/10 flex-shrink-0"
                                style={{ backgroundColor: tonoDe(item.color ?? '')! }} />
                        )}
                        <span className="truncate">{variante}</span>
                    </p>
                )}
                {/* Lo que sale pegado: hay que saber que la pulidora lleva disco
                    ANTES de entregarla, no cuando el disco ya no aparece. */}
                <AccesoriosDeItem item={item} className="mt-0.5" />
            </div>
        );
    };

    /**
     * Grupos de arranque por tipo. Sin esto, la primera vez que se crea algo de
     * un tipo la lista sale vacía —no hay grupos previos que ofrecer— y el
     * bodeguero queda mirando una caja de texto sin saber qué escribir. Son
     * sugerencias: se toca una, o se escribe la propia.
     */
    /** Ítems cuyo nombre se parece al que está escribiendo. 600 es el umbral de
     *  "una palabra completa coincide" del buscador: por debajo empiezan las
     *  coincidencias por casualidad. */
    const parecidosA = (nombre: string, tipo: InventoryType | null): Item[] => {
        const q = nombre.trim();
        if (q.length < 3) return [];
        // Dos criterios. El puntaje pilla "Gafas" vs "Gafas de seguridad", pero
        // daba CERO con "Lechada veige" vs "Lechada gris claro": son dos nombres
        // que se separan después de la primera palabra. Por eso la familia
        // cuenta como parecido por sí sola — y es justo el caso de consumibles
        // y EPP, que se nombran con la variante suelta.
        return items
            .filter(i => !tipo || i.inventoryType === tipo)
            .map(i => ({
                i,
                // esParecido cubre lo que el puntaje de texto no ve: misma
                // primera palabra, o un error de dedo en ella.
                s: esParecido(q, i) ? 1000 : Math.max(scoreMatch(q, i.name), scoreMatch(i.name, q)),
            }))
            .filter(x => x.s >= 600)
            .sort((a, b) => b.s - a.s)
            .slice(0, 4)
            .map(x => x.i);
    };

    /** Para los atajos de creación rápida, donde no cabe preguntar: hereda el
     *  grupo del ítem más parecido que ya exista. Sigue siendo mejor que
     *  mandar todo a "General", que es lo que hacía antes. */
    const grupoSugerido = (nombre: string, tipo: InventoryType | null): string =>
        parecidosA(nombre, tipo)[0]?.subCategory?.trim() || 'General';

    /** Lo mismo para la familia: los atajos rápidos no la guardaban, así que un
     *  ítem creado por ahí nacía suelto y no se agrupaba con nadie. */
    const familiaSugerida = (nombre: string, tipo: InventoryType | null): string => {
        const parecido = parecidosA(nombre, tipo)[0];
        return familiaCanonica(parecido?.familia?.trim() || familiaDe(nombre), items);
    };

    const resetWizardCreate = () => {
        setWizardCreateType(null);
        setWizardCreateName('');
        setWizardCreateQty(1);
        setWizardCreateBrand('');
        setWizardCreateColor('');
        setAnadiendoColor(null); setColorNuevoChat('');
        setWizardGenero(''); setWizardDenom(''); setNuevoGenero(null); setNuevaDenom(null);
        setWizardCreateUnit('unidades');
        { setWizardCreateFamilia(''); setRestoDecidido(false); };
        setParecidoPendiente(null);
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

    /**
     * Los ítems que este asistente creó y que todavía no se han confirmado.
     *
     * El asistente crea el ítem en el paso 4 para poder seleccionarlo por id, no
     * al confirmar. Así que si el bodeguero se arrepiente y cancela, el ítem ya
     * había nacido y se quedaba en el inventario — Juli lo reprodujo con la
     * «Pulidora (Amarilla · Brickell)». Acá se lleva la cuenta para poder
     * deshacerlo si cancela.
     */
    const [creadosPorAsistente, setCreadosPorAsistente] = useState<string[]>([]);

    /**
     * @param descartar true solo cuando el bodeguero CANCELA. Al confirmar, los
     * ítems creados se quedan: para eso los creó.
     */
    const cancelWizard = (descartar = false) => {
        /**
         * En qué paso se salió.
         *
         * En producción el registro se abrió 88 veces y en seis de los nueve días
         * con actividad se abrió 47 veces sin guardar un solo movimiento. Sé que
         * pasa; no sé por qué, y adivinarlo sería peor que medirlo. Esto anota el
         * paso exacto donde se abandona, que es el dato que falta para poder
         * decidir qué arreglar.
         */
        if (descartar && wizardStep) {
            onBehaviorLog?.('WIZARD_ABANDONADO',
                `Salió del ${wizardIsAddMode ? 'agregar al inventario' : 'registro de salida'} en el paso "${wizardStep}"`);
        }
        if (descartar && creadosPorAsistente.length > 0) onDescartarItems?.(creadosPorAsistente);
        setCreadosPorAsistente([]);
        setWizardIsAddMode(false); setWizardStep(null); setInput(''); setWizardSel(new Map()); setWizardSubWorkerName(''); resetWizardCreate();
    };

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

    /** Crea de verdad. `grupo` viene aparte porque al elegir "es una variante de X"
     *  se hereda el grupo de X, para que las dos queden juntas en el histórico. */
    const crearItemDelAsistente = (grupo: string, familia?: string) => {
        if (!wizardCreateType || !wizardCreateName.trim()) return;
        // La familia se guarda como YA está escrita en la bodega: sin esto,
        // "clavos" y "Clavos" quedan como dos familias distintas — y ya pasó.
        const famCruda = familia?.trim() || familiaDe(wizardCreateName);
        const famCanon = familiaCanonica(famCruda, items);
        // Si eligió la familia "Pulidora" habiendo escrito "Peludora", ya dijo
        // cuál es la palabra buena. Guardar el error de dedo después de eso es
        // quedarse con la peor de las dos versiones.
        // El nombre ya viene armado con familia + género + denominación cuando es
        // consumible; en herramientas es lo que se escribió.
        const nombreBase = nombreCorregido(nombreDelNuevo(), famCanon);
        // El grupo dejó de preguntarse. Si la familia ya vive en algún lado del
        // inventario, el ítem nuevo cae donde están sus hermanos.
        const hermano = items.find(i => (i.familia?.trim() || familiaDe(i.name)).toLowerCase() === famCanon.toLowerCase());
        const subCategory = grupo.trim() || hermano?.subCategory || 'General';
        // La familia queda GRABADA, no supuesta: es lo que el bodeguero acaba
        // de decidir en el aviso de parecidos.
        const fam = famCanon;
        if (wizardCreateType === InventoryType.ELECTRICAL_TOOL || wizardCreateType === InventoryType.HAND_TOOL) {
            // Color y marca solo son obligatorios en las ELÉCTRICAS: ahí es lo
            // único que distingue a un taladro de otro taladro. Un martillo o una
            // espátula no tienen por qué tenerlos, y exigirlos obligaba a inventar
            // «(N · N)» — que es lo que quedó en la bodega: "Almadana (N · N)".
            const exigeEspecie = wizardCreateType === InventoryType.ELECTRICAL_TOOL;
            const conDatos = wizardSpecies.filter(s => s.brand.trim() || s.color.trim());
            const valid = exigeEspecie
                ? wizardSpecies.filter(s => s.brand.trim() && s.color.trim())
                : (conDatos.length > 0 ? conDatos : [{ brand: '', color: '' }]);
            if (valid.length === 0) return;
            const newEntries: [string, number][] = [];
            for (const sp of valid) {
                const variante = [sp.color.trim(), sp.brand.trim()].filter(Boolean).join(' · ');
                const newItem = onCreateItem({
                    name: variante ? `${nombreBase} (${variante})` : nombreBase,
                    inventoryType: wizardCreateType,
                    quantity: wizardCreateQty,
                    unit: wizardCreateUnit.trim() || 'unidades',
                    category: CATEGORY_BY_TYPE[wizardCreateType],
                    subCategory, familia: fam,
                    minStock: 0, price: 0,
                    ...(sp.brand.trim() ? { brand: sp.brand.trim() } : {}),
                    ...(sp.color.trim() ? { color: sp.color.trim() } : {}),
                });
                newEntries.push([newItem.id, wizardCreateQty]);
            }
            setCreadosPorAsistente(prev => [...prev, ...newEntries.map(([id]) => id)]);
            setWizardSel(prev => { const next = new Map(prev); for (const [id, qty] of newEntries) next.set(id, qty); return next; });
        } else {
            // Color y marca también acá: unos guantes negros y unos rojos son dos
            // ítems distintos, pero de la misma familia. Son opcionales — pedirlos
            // a la fuerza para unos clavos sería un estorbo.
            const color = wizardCreateColor.trim(), marca = wizardCreateBrand.trim();
            const variante = [color, marca].filter(Boolean).join(' · ');
            const newItem = onCreateItem({
                name: variante ? `${nombreBase} (${variante})` : nombreBase,
                inventoryType: wizardCreateType,
                quantity: wizardCreateQty,
                unit: wizardCreateUnit.trim() || 'unidades',
                category: CATEGORY_BY_TYPE[wizardCreateType],
                subCategory, familia: fam,
                minStock: 0, price: 0,
                ...(marca ? { brand: marca } : {}),
                ...(color ? { color } : {}),
            });
            // Faltaba llevar la cuenta acá: un consumible creado por el asistente
            // no quedaba anotado, y al cancelar no había qué deshacer. Con las
            // herramientas sí se hacía; con los consumibles, no.
            setCreadosPorAsistente(prev => [...prev, newItem.id]);
            setWizardSel(prev => { const next = new Map(prev); next.set(newItem.id, wizardCreateQty); return next; });
        }
        // Mantener el tipo seleccionado para que el usuario pueda crear otro género inmediatamente
        setWizardCreateName(''); setWizardCreateQty(1); setWizardCreateUnit('unidades');
        setWizardSpecies([{ brand: '', color: '' }]); setWizardCreateColor(''); setWizardCreateBrand('');
        setAnadiendoColor(null); setColorNuevoChat('');
        setWizardGenero(''); setWizardDenom(''); setNuevoGenero(null); setNuevaDenom(null);
        setParecidoPendiente(null);
    };

    /**
     * El que ya existe y es EXACTAMENTE este: mismo tipo, mismo nombre, mismo
     * color, misma marca. No parecido — el mismo.
     *
     * El 7 de septiembre quedaron en la bodega dos ítems llamados igual,
     * "Bisturi" y "Bisturi", mismo tipo y misma familia, creados el mismo día.
     * La causa está justo abajo.
     */
    /**
     * El nombre que se va a crear de verdad.
     *
     * En un consumible el bodeguero ya no escribe el nombre entero: escribe la
     * familia y elige género y denominación aparte. El nombre se arma con las
     * tres piezas, y así el árbol lo agrupa solo. En una herramienta el nombre
     * es lo escrito, como siempre.
     */
    const nombreDelNuevo = (): string => {
        const esConsumible = wizardCreateType === InventoryType.PPE
                          || wizardCreateType === InventoryType.SINGLE_USE;
        return esConsumible
            ? nombreCompuesto(wizardCreateName, wizardGenero, wizardDenom)
            : wizardCreateName.trim();
    };

    const elIdenticoDe = (): Item | undefined => {
        if (!wizardCreateType || !wizardCreateName.trim()) return undefined;
        const esHerramienta = wizardCreateType === InventoryType.ELECTRICAL_TOOL
                           || wizardCreateType === InventoryType.HAND_TOOL;
        const g     = normStr(getGenus(nombreDelNuevo()));
        const color = normStr((esHerramienta ? wizardSpecies[0]?.color : wizardCreateColor) ?? '');
        const marca = normStr((esHerramienta ? wizardSpecies[0]?.brand : wizardCreateBrand) ?? '');
        return items.find(i =>
            i.inventoryType === wizardCreateType &&
            normStr(getGenus(i.name)) === g &&
            normStr(i.color ?? '') === color &&
            normStr(i.brand ?? '') === marca);
    };

    const handleWizardCreateItem = () => {
        if (!wizardCreateType || !wizardCreateName.trim()) return;
        // Si ya hay algo parecido, se para acá y se pregunta. Decidir solo por
        // parecido juntaría "Gafas" con "Gafas de soldar", que no son lo mismo.
        //
        // Pero si YA eligió familia arriba, esa es la respuesta: volver a
        // preguntarlo acá es preguntar dos veces lo mismo, y el bodeguero está
        // parado en la bodega con la herramienta en la mano.
        //
        // Y en un consumible, elegir género o denominación TAMBIÉN es haber
        // respondido: decir "familia Clavos, género hierro, denominación 3\"" es
        // decir exactamente con quién se agrupa y en qué se diferencia. Volver a
        // preguntarle por parecidos después de eso es preguntarle dos veces lo
        // mismo, con el bodeguero parado en la bodega.
        const esConsumible = wizardCreateType === InventoryType.PPE
                          || wizardCreateType === InventoryType.SINGLE_USE;
        const yaDecidio = wizardCreateFamilia.trim().length > 0
            || (esConsumible && (wizardGenero.trim().length > 0 || wizardDenom.trim().length > 0));

        /**
         * Salvo que sea el MISMO, y ahí siempre se para.
         *
         * Elegir familia responde "¿con quién se agrupa esto?", no "¿es el mismo
         * ítem que ya tengo?". Son dos preguntas distintas, y el atajo de arriba
         * las trataba como una: tocado el chip de la familia, el aviso de
         * repetidos se apagaba entero y se podía crear un gemelo exacto sin que
         * nadie dijera nada. Así nacieron los dos "Bisturi".
         */
        const identico = elIdenticoDe();
        const parecidos = parecidosA(wizardCreateName, wizardCreateType);
        if (identico && !parecidoPendiente) {
            // El idéntico va de primero: es la respuesta más probable.
            setParecidoPendiente([identico, ...parecidos.filter(p => p.id !== identico.id)]);
            return;
        }
        if (parecidos.length > 0 && !parecidoPendiente && !yaDecidio) {
            setParecidoPendiente(parecidos);
            return;
        }
        crearItemDelAsistente('', wizardCreateFamilia);
    };

    /** "Es una variante de X": el nuevo hereda la familia de X. Y si X todavía
     *  no tenía familia decidida, se le fija también — así la decisión queda
     *  tomada para los dos y no se vuelve a preguntar. */
    const crearComoVarianteDe = (base: Item) => {
        const fam = base.familia?.trim() || familiaDe(base.name);
        if (!base.familia?.trim()) onEditItem?.({ ...base, familia: fam });
        crearItemDelAsistente(base.subCategory, fam);
    };

    /** "Es algo distinto": se le fija familia propia, para que la app NO se lo
     *  vuelva a proponer junto con aquel. La app aprende del "no". */
    const crearComoDistinto = () => {
        const propia = `${familiaDe(wizardCreateName)} · ${wizardCreateName.trim()}`;
        crearItemDelAsistente('', propia);
    };

    /** "Es la misma": no se crea nada, se usa la que ya existe. */
    const usarItemExistente = (it: Item) => {
        setWizardSel(prev => { const next = new Map(prev); next.set(it.id, wizardCreateQty); return next; });
        setWizardCreateName(''); setWizardCreateQty(1); setWizardCreateUnit('unidades');
        setWizardSpecies([{ brand: '', color: '' }]); setWizardCreateColor(''); setWizardCreateBrand('');
        setAnadiendoColor(null); setColorNuevoChat('');
        setWizardGenero(''); setWizardDenom(''); setNuevoGenero(null); setNuevaDenom(null);
        setParecidoPendiente(null);
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
        // Antes, con UN solo oficial registrado, todo trabajador nuevo se le
        // asignaba solo y en silencio: así Rafael quedó de cuadrilla de Alex sin
        // que nadie lo decidiera, creado a las 08:11 en mitad de un despacho.
        // Ahora la asignación automática solo ocurre si el despacho YA venía por
        // el camino de la cuadrilla; si no, se pregunta (ver `preguntarCuadrilla`).
        const autoLeader = wizardData.teamLeaderWorker ?? null;
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
            const r = onLogMovements(toLog);
            const dateLabel = wizardDate !== todayISO() ? ` (fecha: ${new Date(wizardDate + 'T12:00:00').toLocaleDateString('es-CO')})` : '';
            if (r.ok > 0) {
                addBotYGuarda(`✅ ${r.ok} salida(s) registradas${worker ? ` para ${worker.name}` : ''}${project ? ` · ${project.name}` : ''}${dateLabel}.`);
            }
            if (r.rechazos.length > 0) {
                // Nada de "falta de stock" a secas: se abre la reposición con el
                // faltante ya calculado, para resolverlo sin devolverse.
                setReponerQty(new Map(r.rechazos.map(x => [x.itemId, Math.max(1, x.pedido - x.hay)])));
                setReposicion(r.rechazos);
                cancelWizard();
                return;
            }
        } else {
            addBot('No se registraron salidas (sin artículos válidos).');
        }
        cancelWizard();
    };

    /**
     * Repone y despacha en un solo toque. La entrada de stock y la salida van en
     * el MISMO lote: la entrada sube el restante y la salida ya encuentra con qué
     * salir, que es lo que antes obligaba a devolverse hasta el primer paso.
     */
    const reponerYDespachar = (r: RechazoStock) => {
        const cuanto = reponerQty.get(r.itemId) ?? Math.max(1, r.pedido - r.hay);
        const entrada: Omit<Movement, 'id'> = {
            itemId: r.itemId, type: MovementType.CHECK_IN, quantity: cuanto,
            timestamp: r.movimiento.timestamp, notes: 'Reposición desde el despacho',
            isLoan: false, isReturned: false,
        };
        const res = onLogMovements([entrada, r.movimiento]);
        if (res.rechazos.length === 0) {
            addBotYGuarda(`✅ Entraron ${cuanto} ${r.unidad} de **${r.nombre}** y salieron ${r.pedido}.`);
        } else {
            addBotYGuarda(`⚠️ Entraron ${cuanto} ${r.unidad} de **${r.nombre}**, pero la salida no alcanzó. Revisá la cantidad.`);
        }
        onBehaviorLog?.('ACTION', `Repuso ${cuanto} de "${r.nombre}" sin salir del despacho`);
        const quedan = (reposicion ?? []).filter(x => x.itemId !== r.itemId);
        setReposicion(quedan.length > 0 ? quedan : null);
    };

    const descartarRechazo = (r: RechazoStock) => {
        addBot(`Se dejó **${r.nombre}** fuera del pedido.`);
        const quedan = (reposicion ?? []).filter(x => x.itemId !== r.itemId);
        setReposicion(quedan.length > 0 ? quedan : null);
    };

    const renderReposicion = () => (
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
            <div>
                <p className="text-sm font-black text-tinta">Falta stock para terminar</p>
                <p className="text-[11px] text-tinta-tenue mt-0.5">
                    Ingresá cuánto entra y sale de una. No hay que devolverse.
                </p>
            </div>
            {(reposicion ?? []).map(r => (
                <div key={r.itemId} className="border border-atencion bg-atencion-suave rounded-2xl p-3 space-y-2">
                    <p className="text-sm font-bold text-tinta">{r.nombre}</p>
                    <p className="text-[11px] text-atencion">
                        Hay <strong>{r.hay} {r.unidad}</strong> y pediste <strong>{r.pedido}</strong>.
                    </p>
                    <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-tinta-suave flex-shrink-0">¿Cuántos entran?</label>
                        <input
                            type="number" min={1}
                            value={reponerQty.get(r.itemId) ?? Math.max(1, r.pedido - r.hay)}
                            onFocus={e => e.target.select()}
                            onChange={e => setReponerQty(prev => {
                                const n = new Map(prev);
                                n.set(r.itemId, Math.max(1, parseInt(e.target.value) || 1));
                                return n;
                            })}
                            className="w-16 text-sm text-center border border-atencion rounded-lg px-1 py-1 bg-papel focus:outline-none"
                        />
                        <span className="text-[11px] text-tinta-tenue">{r.unidad}</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => descartarRechazo(r)}
                            className="px-3 py-2 text-xs font-bold text-tinta-tenue border border-papel-borde bg-papel rounded-xl">
                            Sacar del pedido
                        </button>
                        <button onClick={() => reponerYDespachar(r)}
                            className="flex-1 py-2 text-xs font-black bg-bien hover:bg-bien text-papel rounded-xl">
                            Ingresar y despachar
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );

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
        const r = onLogMovements(movs);
        const ok = r.ok;
        const workerName = personnel.find(p => p.id === effectivePersonnelId)?.name ?? personnel.find(p => p.id === loanPersonnelId)?.name ?? 'trabajador';
        const itemNames = [...loanSelected.keys()].map(id => items.find(i => i.id === id)?.name ?? id);
        const dateLabel = loanDate !== todayISO() ? ` (fecha: ${new Date(loanDate + 'T12:00:00').toLocaleDateString('es-CO')})` : '';
        const verb = isLoan ? 'Préstamo registrado' : 'Salida registrada';
        if (ok === 0) {
            addBotYGuarda(`❌ No se registró nada: la bodega rechazó ${movs.length === 1 ? 'el movimiento' : `los ${movs.length} movimientos`} por falta de stock.`);
        } else if (ok < movs.length) {
            addBotYGuarda(`⚠️ Solo ${ok} de ${movs.length} quedaron registrados para ${workerName}${dateLabel}. El resto se rechazó por falta de stock.`);
        } else {
            addBotYGuarda(`✅ ${verb} para ${workerName}: ${itemNames.join(', ')}${dateLabel}.`);
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
                    subCategory: grupoSugerido(loanCreateName, loanInvType), familia: familiaSugerida(loanCreateName, loanInvType),
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
                subCategory: grupoSugerido(loanCreateName, loanInvType), familia: familiaSugerida(loanCreateName, loanInvType),
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
                    category: CATEGORY_BY_TYPE[createInvType], subCategory: grupoSugerido(createName, createInvType), familia: familiaSugerida(createName, createInvType),
                    minStock: 0, price: 0, brand: sp.brand.trim(), color: sp.color.trim(),
                });
                names.push(it.name);
            }
            addBotYGuarda(`✅ ${names.length} ítem(s) agregados: ${names.join(', ')}.`);
        } else {
            const it = onCreateItem({
                name: createName.trim(), inventoryType: createInvType,
                quantity: createQty, unit: createUnit.trim() || 'unidades',
                category: CATEGORY_BY_TYPE[createInvType], subCategory: grupoSugerido(createName, createInvType), familia: familiaSugerida(createName, createInvType), minStock: 0, price: 0,
            });
            addBotYGuarda(`✅ ${it.name} agregado al inventario (${createQty} ${createUnit}).`);
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
                        <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest mb-1">{wizardIsAddMode ? 'Paso 1 de 2' : 'Paso 1 de 4'}</p>
                        <p className="text-sm font-bold text-tinta mb-3">{wizardIsAddMode ? '¿Qué tipo(s) vas a agregar?' : '¿Qué tipo(s) de elementos?'}</p>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            {([InventoryType.ELECTRICAL_TOOL, InventoryType.HAND_TOOL, InventoryType.PPE, InventoryType.SINGLE_USE] as InventoryType[]).map(type => {
                                const sel = wizardData.selectedTypes.includes(type);
                                return (
                                    <button key={type} onClick={() => setWizardData(d => ({ ...d, selectedTypes: sel ? d.selectedTypes.filter(t => t !== type) : [...d.selectedTypes, type] }))}
                                        className={`py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all ${sel ? 'border-marca bg-marca-suave text-marca-oscuro' : 'border-papel-borde bg-papel text-tinta-suave hover:border-marca-borde hover:bg-marca-suave'}`}>
                                        {TYPE_LABELS[type]}
                                    </button>
                                );
                            })}
                        </div>
                        <button onClick={() => setWizardData(d => ({ ...d, selectedTypes: allSelected ? [] : Object.values(InventoryType) }))}
                            className="w-full py-2 text-xs font-semibold text-tinta-tenue hover:text-marca-oscuro border border-dashed border-papel-borde rounded-xl hover:border-marca-borde transition-all">
                            {allSelected ? '☐ Deseleccionar todas' : '☑ Seleccionar todas'}
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => cancelWizard(true)} className="px-3 py-2 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-xl">Cancelar</button>
                        <button onClick={() => setWizardStep(wizardIsAddMode ? 'enter_items' : 'select_worker')} disabled={wizardData.selectedTypes.length === 0}
                            className="flex-1 py-2 bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta font-bold rounded-xl text-xs transition-all">
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
                        <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest mb-1">Paso 2 de 4</p>
                        <p className="text-sm font-bold text-tinta mb-3">¿Para quién es la salida?</p>
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
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${wizardData.worker?.id === p.id || wizardData.teamLeaderWorker?.id === p.id ? 'bg-marca-suave border border-marca-borde' : 'bg-papel-hondo hover:bg-marca-suave border border-transparent hover:border-marca-borde'}`}>
                                    <span className="w-7 h-7 rounded-full bg-marca-suave text-marca-oscuro flex items-center justify-center font-black text-xs flex-shrink-0">{p.name.charAt(0)}</span>
                                    <span className="text-sm font-medium text-tinta flex-1">{p.name}</span>
                                    {p.isTeamLeader && <span className="text-[10px] bg-atencion-suave text-atencion px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">👷 Oficial</span>}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setWizardStep('create_worker')}
                            className="w-full py-2 text-xs font-semibold text-marca-oscuro hover:text-marca-oscuro border border-dashed border-marca-borde rounded-xl hover:border-marca transition-all">
                            + Nuevo trabajador
                        </button>
                        <button onClick={() => { setWizardData(d => ({ ...d, worker: null, newWorkerName: '' })); setWizardStep('select_project'); }}
                            className="w-full mt-1 py-2 text-xs font-semibold text-tinta-tenue hover:text-tinta-suave border border-dashed border-papel-borde rounded-xl hover:border-tinta-tenue transition-all">
                            Sin asignar trabajador →
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_types')} className="px-3 py-2 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-xl">← Atrás</button>
                    </div>
                </div>
            );
        }
        if (wizardStep === 'create_worker') {
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest">Paso 2 de 4</p>
                    <p className="text-sm font-bold text-tinta">Nombre del nuevo trabajador:</p>
                    <input type="text" value={wizardData.newWorkerName} onChange={e => setWizardData(d => ({ ...d, newWorkerName: e.target.value }))}
                        placeholder="Ej: Carlos García" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && wizardData.newWorkerName.trim()) setWizardStep('select_project'); }}
                        className="w-full border border-papel-borde rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca" />
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_worker')} className="px-3 py-2 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-xl">← Atrás</button>
                        <button onClick={() => setWizardStep('select_project')} disabled={!wizardData.newWorkerName.trim()}
                            className="flex-1 py-2 bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta font-bold rounded-xl text-xs transition-all">
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
                        <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest mb-1">Paso 2 de 4 — Cuadrilla</p>
                        <p className="text-sm font-bold text-tinta mb-1">¿Qué trabajador de <span className="text-marca-oscuro">{leader.name}</span> se lo llevó?</p>
                        <p className="text-[11px] text-tinta-tenue mb-3">Elige de la lista o crea uno nuevo</p>
                        {subWorkers.length === 0
                            ? <p className="text-xs text-tinta-tenue text-center py-2 mb-2">Sin trabajadores registrados aún.<br/>Usa "+ Nuevo trabajador" para agregar.</p>
                            : <div className="space-y-1 max-h-44 overflow-y-auto mb-2 pr-1">
                                {subWorkers.map(p => (
                                    <button key={p.id} onClick={() => { setWizardData(d => ({ ...d, worker: p })); setWizardStep('select_project'); }}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${wizardData.worker?.id === p.id ? 'bg-marca-suave border border-marca-borde' : 'bg-papel-hondo hover:bg-marca-suave border border-transparent hover:border-marca-borde'}`}>
                                        <span className="w-7 h-7 rounded-full bg-bien-suave text-bien flex items-center justify-center font-black text-xs flex-shrink-0">{p.name.charAt(0)}</span>
                                        <span className="text-sm font-medium text-tinta">{p.name}</span>
                                    </button>
                                ))}
                              </div>
                        }
                        <button onClick={() => { setWizardSubWorkerName(''); setWizardStep('create_sub_worker'); }}
                            className="w-full py-2 text-xs font-semibold text-marca-oscuro hover:text-marca-oscuro border border-dashed border-marca-borde rounded-xl hover:border-marca transition-all">
                            + Nuevo trabajador de {leader.name}
                        </button>
                        <button onClick={() => { setWizardData(d => ({ ...d, worker: leader })); setWizardStep('select_project'); }}
                            className="w-full mt-1 py-2 text-xs font-semibold text-tinta-tenue hover:text-tinta-suave border border-dashed border-papel-borde rounded-xl hover:border-tinta-tenue transition-all">
                            Continuar con {leader.name} (sin especificar) →
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_worker')} className="px-3 py-2 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-xl">← Atrás</button>
                    </div>
                </div>
            );
        }
        if (wizardStep === 'create_sub_worker') {
            const leader = wizardData.teamLeaderWorker!;
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest">Paso 2 de 4 — Cuadrilla</p>
                    <p className="text-sm font-bold text-tinta">Nuevo trabajador de <span className="text-marca-oscuro">{leader.name}</span>:</p>
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
                        className="w-full border border-papel-borde rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca" />
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_sub_worker')} className="px-3 py-2 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-xl">← Atrás</button>
                        <button
                            onClick={() => {
                                if (!wizardSubWorkerName.trim()) return;
                                const newP = onCreatePersonnel({ name: wizardSubWorkerName.trim(), teamLeaderId: leader.id });
                                setWizardData(d => ({ ...d, worker: newP }));
                                setWizardStep('select_project');
                            }}
                            disabled={!wizardSubWorkerName.trim()}
                            className="flex-1 py-2 bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta font-bold rounded-xl text-xs transition-all">
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
                        <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest mb-1">Paso 3 de 4</p>
                        <p className="text-sm font-bold text-tinta mb-3">¿A qué proyecto va?</p>
                        {requiresProject && (
                            <p className="text-[11px] text-atencion bg-atencion-suave border border-atencion rounded-lg px-3 py-2 mb-2">
                                📦 Los consumibles requieren proyecto obligatoriamente.
                            </p>
                        )}
                        <div className="space-y-1 max-h-44 overflow-y-auto mb-2 pr-1">
                            {activeProjects.map(p => (
                                <button key={p.id} onClick={() => { setWizardData(d => ({ ...d, project: p, newProjectName: '' })); setWizardStep('enter_items'); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${wizardData.project?.id === p.id ? 'bg-marca-suave border border-marca-borde' : 'bg-papel-hondo hover:bg-marca-suave border border-transparent hover:border-marca-borde'}`}>
                                    <span className="w-7 h-7 rounded-full bg-marca-suave text-marca-oscuro flex items-center justify-center font-black text-xs flex-shrink-0">P</span>
                                    <span className="text-sm font-medium text-tinta">{p.name}</span>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setWizardStep('create_project')}
                            className="w-full py-2 text-xs font-semibold text-marca-oscuro hover:text-marca-oscuro border border-dashed border-marca-borde rounded-xl hover:border-marca transition-all">
                            + Nuevo proyecto
                        </button>
                        {!requiresProject && (
                            <button onClick={() => { setWizardData(d => ({ ...d, project: null, newProjectName: '' })); setWizardStep('enter_items'); }}
                                className="w-full mt-1 py-2 text-xs font-semibold text-tinta-tenue hover:text-tinta-suave border border-dashed border-papel-borde rounded-xl hover:border-tinta-tenue transition-all">
                                Sin proyecto →
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_worker')} className="px-3 py-2 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-xl">← Atrás</button>
                    </div>
                </div>
            );
        }
        if (wizardStep === 'create_project') {
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest">Paso 3 de 4</p>
                    <p className="text-sm font-bold text-tinta">Nombre del nuevo proyecto:</p>
                    <input type="text" value={wizardData.newProjectName} onChange={e => setWizardData(d => ({ ...d, newProjectName: e.target.value }))}
                        placeholder="Ej: Edificio Torres del Norte" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && wizardData.newProjectName.trim()) setWizardStep('enter_items'); }}
                        className="w-full border border-papel-borde rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca" />
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('select_project')} className="px-3 py-2 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-xl">← Atrás</button>
                        <button onClick={() => setWizardStep('enter_items')} disabled={!wizardData.newProjectName.trim()}
                            className="flex-1 py-2 bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta font-bold rounded-xl text-xs transition-all">
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
                        <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest mb-1">{wizardIsAddMode ? 'Paso 2 de 2' : 'Paso 4 de 4'}</p>
                        <p className="text-sm font-bold text-tinta mb-0.5">{wizardIsAddMode ? 'Ítems a agregar al inventario' : 'Artículos a despachar'}</p>
                        {!wizardIsAddMode && <p className="text-[11px] text-tinta-tenue mb-3">Para <strong>{workerName}</strong> · {projectName}</p>}

                        {wizardData.selectedTypes.map(type => {
                            // Antes esto escondía todo lo que estuviera en cero, y el
                            // vacío decía «Sin stock, usa + Crear nuevo»: empujaba a
                            // crear un duplicado de algo que YA existía en la bodega.
                            // Ahora se ven, marcados, y pedir de más abre la reposición.
                            const available = items
                                .filter(i => i.inventoryType === type)
                                .sort((a, b) => (a.quantity > 0 ? 0 : 1) - (b.quantity > 0 ? 0 : 1)
                                              || a.name.localeCompare(b.name, 'es'));
                            const selectedCount = [...wizardSel.entries()]
                                .filter(([id]) => items.find(i => i.id === id)?.inventoryType === type).length;
                            const isCreating = wizardCreateType === type;

                            return (
                                <div key={type} className="mb-3">
                                    <label className="text-xs font-bold text-tinta-suave block mb-1">
                                        {TYPE_LABELS[type]}
                                        {selectedCount > 0 && <span className="ml-1 font-normal text-marca-oscuro">({selectedCount} selec.)</span>}
                                    </label>

                                    {available.length > 0 && !wizardIsAddMode && (
                                        <div className="max-h-52 overflow-y-auto border border-papel-borde rounded-xl p-1 mb-1">
                                            {/* Once taladros en fila no se leen en un celular; cuatro
                                                colores sí. Es el árbol que pidió con los clavos, acá
                                                y en el resto de la app. */}
                                            <ArbolFamilias
                                                items={available}
                                                escogidos={new Set(wizardSel.keys())}
                                                abrirTodo={available.length <= 6}
                                                fila={(item, detalle) => {
                                                    const isSelected = wizardSel.has(item.id);
                                                    const qty = wizardSel.get(item.id) ?? 1;
                                                    return (
                                                        <div onClick={() => toggleWizardSel(item.id)}
                                                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-marca-suave border-marca-borde' : 'bg-papel border-transparent hover:border-marca-borde hover:bg-marca-suave'}`}>
                                                            <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 accent-marca flex-shrink-0" />
                                                            <FilaItem item={item} detalle={detalle} />
                                                            <span className={`text-[10px] flex-shrink-0 ${item.quantity > 0 ? 'text-tinta-tenue' : 'font-black text-atencion'}`}>
                                                                {item.quantity > 0 ? `${item.quantity} disp.` : 'agotado'}
                                                            </span>
                                                            {isSelected && (
                                                                <input type="number" onFocus={e => e.target.select()} value={qty} min={1}
                                                                    onChange={e => setWizardSelQty(item.id, parseInt(e.target.value) || 1)}
                                                                    onClick={e => e.stopPropagation()}
                                                                    className="w-11 text-xs text-center border border-marca-borde rounded-lg px-1 py-0.5 bg-papel focus:outline-none" />
                                                            )}
                                                        </div>
                                                    );
                                                }}
                                            />
                                        </div>
                                    )}
                                    {available.length === 0 && !isCreating && !wizardIsAddMode && (
                                        <p className="text-xs text-tinta-tenue py-1 text-center mb-1">Todavía no hay nada de este tipo. Usa "+ Crear nuevo".</p>
                                    )}

                                    {isCreating ? (
                                        <div className="border border-dashed border-marca-borde rounded-xl p-3 bg-marca-suave space-y-2 mb-1">
                                            <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest">Nuevo ítem</p>
                                            <input type="text" value={wizardCreateName}
                                                onChange={e => setWizardCreateName(e.target.value)}
                                                placeholder={(type === InventoryType.ELECTRICAL_TOOL || type === InventoryType.HAND_TOOL) ? 'Género (ej: Pulidora, Martillo) *' : '1. Familia (ej: Clavos) *'} autoFocus
                                                className="w-full border border-papel-borde rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />

                                            {/* Género y denominación: las dos piezas que hasta hoy había
                                                que adivinar escribiéndolas dentro del nombre.
                                                Las dos son OPCIONALES — "Polvo enchape" no tiene
                                                ninguna—, y las dos ofrecen lo que esa familia ya
                                                tiene, para que nadie escriba "acero" de tres maneras. */}
                                            {(type === InventoryType.PPE || type === InventoryType.SINGLE_USE) && wizardCreateName.trim() && (() => {
                                                const fam = wizardCreateFamilia.trim() || wizardCreateName.trim();
                                                const deLaFamilia = items.filter(i =>
                                                    i.inventoryType === type &&
                                                    raizDeFamilia(i.familia?.trim() || familiaDe(i.name)) === raizDeFamilia(fam));
                                                const generos = generosDe(deLaFamilia);
                                                const denoms  = denominacionesDe(deLaFamilia, wizardGenero || undefined);
                                                const chip = (activo: boolean) =>
                                                    `px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                                        activo ? 'border-marca bg-marca text-tinta' : 'border-papel-borde bg-papel text-tinta-suave hover:border-marca'}`;
                                                return (
                                                <div className="space-y-2">
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black text-tinta-tenue uppercase tracking-wider">2. Género (opcional)</p>
                                                        <div className="flex flex-wrap gap-1 items-center">
                                                            <button type="button" title="Agregar un género que no está"
                                                                onClick={() => setNuevoGenero(nuevoGenero === null ? '' : null)}
                                                                className={`w-6 h-6 flex items-center justify-center rounded-full border text-sm font-black leading-none ${
                                                                    nuevoGenero !== null ? 'border-marca bg-marca text-tinta' : 'border-papel-borde bg-papel text-tinta-suave hover:border-marca'}`}>+</button>
                                                            {generos.map(g => (
                                                                <button key={g} type="button" className={chip(wizardGenero === g)}
                                                                    onClick={() => { setWizardGenero(wizardGenero === g ? '' : g); setWizardDenom(''); }}>{g}</button>
                                                            ))}
                                                            {wizardGenero && !generos.includes(wizardGenero) && (
                                                                <button type="button" className={chip(true)} onClick={() => setWizardGenero('')}>{wizardGenero} ✕</button>
                                                            )}
                                                        </div>
                                                        {nuevoGenero !== null && (
                                                            <div className="flex gap-1.5">
                                                                <input value={nuevoGenero} autoFocus placeholder="Escribí el género (ej: hierro)"
                                                                    onChange={e => setNuevoGenero(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (nuevoGenero.trim()) { setWizardGenero(nuevoGenero.trim()); setNuevoGenero(null); } } }}
                                                                    className="flex-1 min-w-0 text-xs border border-papel-borde rounded-lg px-2 py-1 bg-papel focus:outline-none focus:ring-2 focus:ring-marca" />
                                                                <button type="button" disabled={!nuevoGenero.trim()}
                                                                    onClick={() => { setWizardGenero(nuevoGenero.trim()); setNuevoGenero(null); }}
                                                                    className="px-2 py-1 text-[10px] font-black bg-marca disabled:bg-papel-borde disabled:text-tinta-suave text-tinta rounded-lg">Poner</button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-black text-tinta-tenue uppercase tracking-wider">3. Denominación (opcional)</p>
                                                        <div className="flex flex-wrap gap-1 items-center">
                                                            <button type="button" title="Agregar una denominación que no está"
                                                                onClick={() => setNuevaDenom(nuevaDenom === null ? '' : null)}
                                                                className={`w-6 h-6 flex items-center justify-center rounded-full border text-sm font-black leading-none ${
                                                                    nuevaDenom !== null ? 'border-marca bg-marca text-tinta' : 'border-papel-borde bg-papel text-tinta-suave hover:border-marca'}`}>+</button>
                                                            {denoms.map(d => (
                                                                <button key={d} type="button" className={chip(wizardDenom === d)}
                                                                    onClick={() => setWizardDenom(wizardDenom === d ? '' : d)}>{d}</button>
                                                            ))}
                                                            {wizardDenom && !denoms.includes(wizardDenom) && (
                                                                <button type="button" className={chip(true)} onClick={() => setWizardDenom('')}>{wizardDenom} ✕</button>
                                                            )}
                                                        </div>
                                                        {nuevaDenom !== null && (
                                                            <div className="flex gap-1.5">
                                                                <input value={nuevaDenom} autoFocus placeholder={'Escribí la denominación (ej: 3")'}
                                                                    onChange={e => setNuevaDenom(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (nuevaDenom.trim()) { setWizardDenom(nuevaDenom.trim()); setNuevaDenom(null); } } }}
                                                                    className="flex-1 min-w-0 text-xs border border-papel-borde rounded-lg px-2 py-1 bg-papel focus:outline-none focus:ring-2 focus:ring-marca" />
                                                                <button type="button" disabled={!nuevaDenom.trim()}
                                                                    onClick={() => { setWizardDenom(nuevaDenom.trim()); setNuevaDenom(null); }}
                                                                    className="px-2 py-1 text-[10px] font-black bg-marca disabled:bg-papel-borde disabled:text-tinta-suave text-tinta rounded-lg">Poner</button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Cómo va a quedar. Se ve antes de guardar, no después. */}
                                                    <p className="text-[10px] text-marca-oscuro font-bold">
                                                        Va a quedar: «{nombreCompuesto(wizardCreateName, wizardGenero, wizardDenom)}»
                                                    </p>
                                                </div>
                                                );
                                            })()}
                                            {(type === InventoryType.ELECTRICAL_TOOL || type === InventoryType.HAND_TOOL) ? null : (
                                                <input type="number" onFocus={e => e.target.select()} value={wizardCreateQty} min={1}
                                                    onChange={e => setWizardCreateQty(parseInt(e.target.value) || 1)}
                                                    placeholder="4. Cantidad *"
                                                    className="w-full border border-papel-borde rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                            )}
                                            {(type === InventoryType.ELECTRICAL_TOOL || type === InventoryType.HAND_TOOL) && (
                                                <div className="space-y-1.5">
                                                    <p className="text-[9px] font-black text-marca-oscuro uppercase tracking-wider">{type === InventoryType.ELECTRICAL_TOOL ? 'Especies (color + marca)' : 'Color y marca (opcional)'}</p>
                                                    {wizardSpecies.map((sp, idx) => (
                                                        <div key={idx} className="relative pr-6">
                                                            <div className="flex flex-col gap-1">
                                                                <input value={sp.color}
                                                                    onChange={e => setWizardSpecies(prev => prev.map((s, i) => i === idx ? { ...s, color: e.target.value } : s))}
                                                                    placeholder={type === InventoryType.ELECTRICAL_TOOL ? "Color *" : "Color"}
                                                                    className="w-full border border-papel-borde rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                                                <input value={sp.brand}
                                                                    onChange={e => setWizardSpecies(prev => prev.map((s, i) => i === idx ? { ...s, brand: e.target.value } : s))}
                                                                    placeholder={type === InventoryType.ELECTRICAL_TOOL ? "Marca *" : "Marca"}
                                                                    className="w-full border border-papel-borde rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                                            </div>
                                                            {wizardSpecies.length > 1 && (
                                                                <button onClick={() => setWizardSpecies(prev => prev.filter((_, i) => i !== idx))}
                                                                    className="absolute top-0 right-0 text-tinta-tenue hover:text-tinta-tenue text-base leading-none p-1">×</button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <button onClick={() => setWizardSpecies(prev => [...prev, { brand: '', color: '' }])}
                                                        className="w-full py-1 text-[10px] text-marca-oscuro border border-dashed border-marca-borde rounded-lg hover:border-marca bg-papel">
                                                        + Agregar especie
                                                    </button>
                                                    {(() => {
                                                        /**
                                                         * Cuántas se van a crear DE VERDAD, y cuántas filas se
                                                         * van a ignorar.
                                                         *
                                                         * Juli agregó dos especies y le salió una sola Pica. La
                                                         * app hizo lo correcto —una fila sin color ni marca no
                                                         * crea nada, porque serían dos ítems idénticos— pero no
                                                         * se lo dijo: el aviso de "se crearán N" solo aparecía
                                                         * cuando la fila tenía color Y marca, que es la regla de
                                                         * las eléctricas. En una manual, donde basta uno de los
                                                         * dos, no salía nunca.
                                                         *
                                                         * Cada rama cuenta con su propia regla, y las filas
                                                         * vacías se nombran en vez de desaparecer en silencio.
                                                         */
                                                        const exigeAmbos = type === InventoryType.ELECTRICAL_TOOL;
                                                        const sirven = wizardSpecies.filter(sp => exigeAmbos
                                                            ? (sp.brand.trim() && sp.color.trim())
                                                            : (sp.brand.trim() || sp.color.trim()));
                                                        const vacias = wizardSpecies.length - sirven.length;
                                                        if (wizardSpecies.length === 1 && sirven.length === 0) return null;
                                                        return (
                                                            <div className="text-[10px] text-center space-y-0.5">
                                                                <p className="text-marca-oscuro font-bold">
                                                                    {sirven.length > 0
                                                                        ? `Se crearán ${sirven.length} ítem(s) — ${wizardCreateQty} c/u`
                                                                        : 'Se creará 1 ítem, sin color ni marca'}
                                                                </p>
                                                                {vacias > 0 && sirven.length > 0 && (
                                                                    <p className="text-atencion font-bold">
                                                                        {vacias === 1 ? 'Hay 1 fila vacía y no se va a crear' : `Hay ${vacias} filas vacías y no se van a crear`}
                                                                        {exigeAmbos ? ' — una eléctrica necesita color y marca.' : ' — poné color o marca.'}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                            {(type === InventoryType.PPE || type === InventoryType.SINGLE_USE) && (
                                                <>
                                                    {/* Lista, no texto libre: escrito a mano salían "und",
                                                        "Und" y "unidades" como tres unidades distintas. */}
                                                    <select value={wizardCreateUnit}
                                                        onChange={e => setWizardCreateUnit(e.target.value)}
                                                        className="w-full border border-papel-borde rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel">
                                                        {unidadesCon(wizardCreateUnit).map(u => <option key={u} value={u}>{u}</option>)}
                                                    </select>
                                                    {/* Opcionales: unos guantes negros y unos rojos son dos ítems
                                                        de la misma familia. Sin esto solo se podía tener "Guantes". */}
                                                    <div className="flex gap-1.5">
                                                        <input type="text" value={wizardCreateColor}
                                                            onChange={e => setWizardCreateColor(e.target.value)}
                                                            placeholder="Color (opcional)"
                                                            className="flex-1 min-w-0 border border-papel-borde rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                                        <input type="text" value={wizardCreateBrand}
                                                            onChange={e => setWizardCreateBrand(e.target.value)}
                                                            placeholder="Marca (opcional)"
                                                            className="flex-1 min-w-0 border border-papel-borde rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                                    </div>
                                                </>
                                            )}
                                            {/* La FAMILIA, que es lo que se usa en la bodega. Acá había
                                                unos "grupos" (Golpe, Albañilería, Acabados) que la app se
                                                inventó y que nadie usaba. */}
                                            {(() => {
                                                const sugerida = familiaDe(wizardCreateName);
                                                const candidatas = familiasParecidas(wizardCreateName, items);
                                                const elegida = wizardCreateFamilia.trim();
                                                // Lo que sobra del nombre una vez quitada la familia.
                                                const resto = elegida && !elegida.includes(' · ')
                                                    ? wizardCreateName.trim().split(/\s+/).slice(1).join(' ')
                                                    : '';
                                                const colores = elegida ? coloresUnificados(coloresDeFamilia(elegida, items)) : [];
                                                const marcas  = elegida ? marcasDeFamilia(elegida, items) : [];
                                                // En una herramienta el color y la marca viven en `wizardSpecies`;
                                                // en un consumible, en sus propios campos. El chip tiene que
                                                // escribir donde el botón Guardar va a mirar.
                                                const esHerramienta = type === InventoryType.ELECTRICAL_TOOL || type === InventoryType.HAND_TOOL;
                                                const colorActual = esHerramienta ? (wizardSpecies[0]?.color ?? '') : wizardCreateColor;
                                                const marcaActual = esHerramienta ? (wizardSpecies[0]?.brand ?? '') : wizardCreateBrand;
                                                const ponerColor = (c: string) => esHerramienta
                                                    ? setWizardSpecies(prev => prev.map((s, i) => i === 0 ? { ...s, color: c } : s))
                                                    : setWizardCreateColor(c);
                                                const ponerMarca = (m: string) => esHerramienta
                                                    ? setWizardSpecies(prev => prev.map((s, i) => i === 0 ? { ...s, brand: m } : s))
                                                    : setWizardCreateBrand(m);
                                                if (!wizardCreateName.trim()) return null;
                                                return (
                                                    <div className="space-y-1.5">
                                                        <p className="text-[9px] font-black text-marca-oscuro uppercase tracking-wider">
                                                            {candidatas.length > 0
                                                                ? `¿Pertenece a la familia ${candidatas[0]}?`
                                                                : '¿Con qué se agrupa?'}
                                                        </p>
                                                        <div className="flex flex-wrap gap-1">
                                                            {[...new Set([...candidatas, sugerida])].filter(Boolean).map(f => (
                                                                <button key={f} onClick={() => { setWizardCreateFamilia(f); setRestoDecidido(false); }}
                                                                    className={`px-2 py-1 rounded-full text-[10px] font-black transition-all ${
                                                                        elegida.toLowerCase() === f.toLowerCase()
                                                                            ? 'bg-marca text-tinta'
                                                                            : 'bg-papel text-tinta-suave border border-papel-borde hover:border-marca'}`}>
                                                                    {f}
                                                                </button>
                                                            ))}
                                                            <button onClick={() => { setWizardCreateFamilia(`${sugerida} · ${wizardCreateName.trim()}`); setRestoDecidido(true); }}
                                                                className={`px-2 py-1 rounded-full text-[10px] font-black transition-all ${
                                                                    elegida.includes(' · ')
                                                                        ? 'bg-atencion text-papel'
                                                                        : 'bg-papel text-papel border border-atencion hover:border-atencion'}`}>
                                                                Es diferente a esas
                                                            </button>
                                                        </div>

                                                        {/* Los colores y marcas que esa familia YA tiene.
                                                            Tocarlos LLENA los campos: antes escribían en
                                                            wizardCreateColor, que para una herramienta no lo
                                                            mira nadie, así que el botón Guardar se quedaba
                                                            gris para siempre por más chips que se tocaran. */}
                                                        {/* ¿Y "beige" qué es? La app no puede saberlo, y meterlo
                                                            en el nombre a ciegas deja el ítem sin color. */}
                                                        {resto && !restoDecidido && (
                                                            <div className="space-y-1 pt-0.5 border-t border-marca-borde">
                                                                <p className="text-[9px] font-black text-tinta-tenue uppercase tracking-wider">
                                                                    «{resto}» ¿qué es?
                                                                </p>
                                                                <div className="flex flex-wrap gap-1">
                                                                    <button onClick={() => { ponerColor(resto); setWizardCreateName(elegida); setRestoDecidido(true); }}
                                                                        className="px-2 py-1 rounded-full text-[10px] font-black bg-papel text-tinta-suave border border-papel-borde hover:border-tinta-tenue">
                                                                        Color
                                                                    </button>
                                                                    <button onClick={() => { ponerMarca(resto); setWizardCreateName(elegida); setRestoDecidido(true); }}
                                                                        className="px-2 py-1 rounded-full text-[10px] font-black bg-papel text-tinta-suave border border-papel-borde hover:border-tinta-tenue">
                                                                        Marca
                                                                    </button>
                                                                    <button onClick={() => setRestoDecidido(true)}
                                                                        className="px-2 py-1 rounded-full text-[10px] font-black bg-papel text-tinta-suave border border-papel-borde hover:border-tinta-tenue">
                                                                        Medida{medidaDe(wizardCreateName) ? ` (${medidaDe(wizardCreateName)})` : ''}
                                                                    </button>
                                                                    <button onClick={() => setRestoDecidido(true)}
                                                                        className="px-2 py-1 rounded-full text-[10px] font-black bg-papel text-tinta-suave border border-papel-borde hover:border-tinta-tenue">
                                                                        Parte del nombre
                                                                    </button>
                                                                </div>
                                                                <p className="text-[9px] text-tinta-tenue">
                                                                    La medida y el nombre se quedan escritos; el color y la marca se guardan en su casilla.
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* El renglón va SIEMPRE, tenga la familia colores o no:
                                                            si la Pulidora nunca fue amarilla, antes no había dónde
                                                            escribirlo. El «+» va de primero, a la izquierda, igual
                                                            que en la Lista de pedidos. */}
                                                        <div className="space-y-1 pt-0.5">
                                                            <p className="text-[9px] font-black text-tinta-tenue uppercase tracking-wider">
                                                                ¿De qué color?
                                                            </p>
                                                            <div className="flex flex-wrap gap-1 items-center">
                                                                <button type="button"
                                                                    onClick={() => { setAnadiendoColor(a => a ? null : 'elegir'); setColorNuevoChat(''); }}
                                                                    title="Añadir un color o una denominación que no está"
                                                                    className={`w-6 h-6 flex items-center justify-center rounded-full border text-sm font-black leading-none transition-all ${
                                                                        anadiendoColor ? 'border-marca bg-marca text-tinta' : 'border-papel-borde bg-papel text-tinta-suave hover:border-marca'}`}>
                                                                    +
                                                                </button>
                                                                {colores.map(c => {
                                                                    const puesto = raizDeColor(colorActual) === raizDeColor(c);
                                                                    const tono = tonoDe(c);
                                                                    return (
                                                                        <button key={c} onClick={() => ponerColor(c)}
                                                                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all border ${
                                                                                puesto ? 'border-tinta bg-papel-hondo text-tinta' : 'border-papel-borde bg-papel text-tinta-suave hover:border-tinta-tenue'}`}>
                                                                            <span className="w-2.5 h-2.5 rounded-full border border-black/15 flex-shrink-0"
                                                                                style={{ backgroundColor: tono ?? 'transparent' }} />
                                                                            {c}
                                                                        </button>
                                                                    );
                                                                })}
                                                                {/* Lo que se acaba de escribir a mano todavía no está en la
                                                                    familia: sin esto se guarda bien pero no se ve puesto. */}
                                                                {colorActual.trim() && !colores.some(c => raizDeColor(c) === raizDeColor(colorActual)) && (
                                                                    <button onClick={() => ponerColor('')}
                                                                        className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border border-tinta bg-papel-hondo text-tinta">
                                                                        <span className="w-2.5 h-2.5 rounded-full border border-black/15 flex-shrink-0"
                                                                            style={{ backgroundColor: tonoDe(colorActual) ?? 'transparent' }} />
                                                                        {colorActual.trim()} ✕
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* El «+» no lleva derecho a «escribe el color»: primero
                                                            pregunta de qué se trata lo que falta. Para los clavos,
                                                            *acero* y *hierro* no son colores — son la denominación. */}
                                                        {anadiendoColor === 'elegir' && (
                                                            <div className="rounded-xl border border-dashed border-marca-borde bg-papel p-2 flex gap-1.5">
                                                                <button type="button" onClick={() => setAnadiendoColor('color')}
                                                                    className="flex-1 py-2 text-[10px] font-black bg-papel-hondo hover:bg-marca-suave text-tinta-suave rounded-xl">
                                                                    🎨 Un color
                                                                </button>
                                                                <button type="button" onClick={() => setAnadiendoColor('denominacion')}
                                                                    className="flex-1 py-2 text-[10px] font-black bg-papel-hondo hover:bg-marca-suave text-tinta-suave rounded-xl">
                                                                    🏷 Otra denominación
                                                                </button>
                                                            </div>
                                                        )}

                                                        {(anadiendoColor === 'color' || anadiendoColor === 'denominacion') && (() => {
                                                            const vistos = new Set(colores.map(raizDeColor));
                                                            const restoDeLaPaleta = PALETA.filter(c => !vistos.has(raizDeColor(c)));
                                                            const ponerYCerrar = (c: string) => {
                                                                const v = c.trim();
                                                                if (!v) return;
                                                                ponerColor(v);
                                                                setAnadiendoColor(null);
                                                                setColorNuevoChat('');
                                                            };
                                                            return (
                                                                <div className="rounded-xl border border-dashed border-marca-borde bg-papel p-2 space-y-2">
                                                                    <div className="flex gap-1.5">
                                                                        <input type="text" value={colorNuevoChat} autoFocus
                                                                            placeholder={anadiendoColor === 'color'
                                                                                ? 'Escribe el color (ej: blanco)'
                                                                                : 'Escribe la denominación (ej: madera)'}
                                                                            onChange={e => setColorNuevoChat(e.target.value)}
                                                                            onKeyDown={e => {
                                                                                if (e.key === 'Enter') { e.preventDefault(); ponerYCerrar(colorNuevoChat); }
                                                                                if (e.key === 'Escape') { setAnadiendoColor(null); setColorNuevoChat(''); }
                                                                            }}
                                                                            className="flex-1 min-w-0 text-xs border border-papel-borde rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                                                        <button type="button" onClick={() => ponerYCerrar(colorNuevoChat)}
                                                                            disabled={!colorNuevoChat.trim()}
                                                                            className="px-3 py-1.5 text-[10px] font-black bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta rounded-xl flex-shrink-0">
                                                                            Poner
                                                                        </button>
                                                                    </div>
                                                                    {/* La paleta solo en el camino del color: una
                                                                        denominación no tiene nada que pintar. */}
                                                                    {anadiendoColor === 'color' && restoDeLaPaleta.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {restoDeLaPaleta.map(c => (
                                                                                <button key={c} type="button" onClick={() => ponerYCerrar(c)}
                                                                                    className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border border-papel-borde bg-papel text-tinta-suave hover:border-marca">
                                                                                    <span className="w-2.5 h-2.5 rounded-full border border-black/10"
                                                                                        style={{ backgroundColor: tonoDe(c)! }} />
                                                                                    {c}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}

                                                        {marcas.length > 0 && (
                                                            <div className="space-y-1 pt-0.5">
                                                                <p className="text-[9px] font-black text-tinta-tenue uppercase tracking-wider">
                                                                    ¿De qué marca?
                                                                </p>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {marcas.map(m => (
                                                                        <button key={m} onClick={() => ponerMarca(m)}
                                                                            className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all border ${
                                                                                marcaActual.trim().toLowerCase() === m.toLowerCase()
                                                                                    ? 'border-tinta bg-papel-hondo text-tinta'
                                                                                    : 'border-papel-borde bg-papel text-tinta-suave hover:border-tinta-tenue'}`}>
                                                                            {m}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            {parecidoPendiente && parecidoPendiente.length > 0 && (
                                                <div className="border border-atencion bg-atencion-suave rounded-xl p-2.5 space-y-2">
                                                    {/* El primero puede ser el gemelo exacto, no un parecido:
                                                        entonces el aviso lo dice con esas palabras. Antes decía
                                                        "algo parecido" para los dos casos y se leía igual de
                                                        blando, así que se tocaba "créalo aparte" sin pensarlo. */}
                                                    <p className="text-[11px] font-black text-atencion">
                                                        {elIdenticoDe()
                                                            ? 'Esto ya está en la bodega, igualito. ¿Es el mismo?'
                                                            : 'Ya tenés algo parecido. ¿Qué hacemos?'}
                                                    </p>
                                                    {parecidoPendiente.map(it => (
                                                        <div key={it.id} className="space-y-1">
                                                            <p className="text-[11px] font-bold text-tinta-suave">
                                                                {it.name}
                                                                <span className="font-normal text-tinta-tenue">
                                                                    {' · '}{it.quantity > 0 ? `${it.quantity} ${it.unit}` : 'agotado'}
                                                                </span>
                                                            </p>
                                                            <div className="flex gap-1">
                                                                <button onClick={() => usarItemExistente(it)}
                                                                    className="flex-1 py-1 text-[10px] font-black bg-bien hover:bg-bien text-papel rounded-lg">
                                                                    Es la misma
                                                                </button>
                                                                {/* Hereda el grupo del que ya existe: así las dos quedan juntas. */}
                                                                <button onClick={() => crearComoVarianteDe(it)}
                                                                    className="flex-1 py-1 text-[10px] font-black bg-marca hover:bg-marca-fuerte text-tinta rounded-lg">
                                                                    Es una variante
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <button onClick={crearComoDistinto}
                                                        className="w-full py-1 text-[10px] font-black text-tinta-suave bg-papel border border-papel-borde rounded-lg hover:border-tinta-tenue">
                                                        Es algo distinto, créalo aparte
                                                    </button>
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <button onClick={resetWizardCreate}
                                                    className="px-3 py-1.5 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-lg bg-papel">
                                                    Cancelar
                                                </button>
                                                <button onClick={handleWizardCreateItem}
                                                    disabled={!wizardCreateName.trim() || (type === InventoryType.ELECTRICAL_TOOL && !wizardSpecies.some(s => s.brand.trim() && s.color.trim()))}
                                                    className="flex-1 py-1.5 text-xs font-black bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta rounded-lg transition-all">
                                                    ✓ Guardar y seleccionar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => { resetWizardCreate(); setWizardCreateType(type); }}
                                            className="w-full py-1.5 text-xs font-semibold text-marca-oscuro hover:text-marca-oscuro border border-dashed border-marca-borde rounded-xl hover:border-marca bg-papel transition-all">
                                            + Crear nuevo
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep(wizardIsAddMode ? 'select_types' : 'select_project')} className="px-3 py-2 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-xl">← Atrás</button>
                        <button onClick={() => setWizardStep('confirm')} disabled={wizardSel.size === 0}
                            className="flex-1 py-2 bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta font-bold rounded-xl text-xs transition-all">
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
                    // La unidad va con la cantidad: "4" no dice nada, "4 kg" sí.
                    .map(([id, quantity]) => ({ rawName: items.find(i => i.id === id)?.name ?? id,
                                                unidad: items.find(i => i.id === id)?.unit ?? '', quantity, type }))
            );
            return (
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    <div>
                        <p className="text-[10px] font-black text-bien uppercase tracking-widest mb-2">{wizardIsAddMode ? 'Confirmar — Agregar al inventario' : 'Confirmar salida'}</p>
                        {!wizardIsAddMode && (
                            <div className="bg-papel-hondo rounded-xl p-3 mb-3 space-y-1">
                                <div className="flex gap-2 text-xs"><span className="text-tinta-tenue w-20 flex-shrink-0">Trabajador</span><span className="font-semibold text-tinta">{workerName}</span></div>
                                <div className="flex gap-2 text-xs"><span className="text-tinta-tenue w-20 flex-shrink-0">Proyecto</span><span className="font-semibold text-tinta">{projectName}</span></div>
                                <div className="flex gap-2 text-xs"><span className="text-tinta-tenue w-20 flex-shrink-0">Artículos</span><span className="font-semibold text-tinta">{preview.length} elemento(s)</span></div>
                            </div>
                        )}
                        <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
                            {preview.map((it, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-papel border border-papel-borde">
                                    <span>{TYPE_LABELS[it.type].split(' ')[0]}</span>
                                    <span className="font-bold text-tinta-suave flex-shrink-0">{it.quantity} {it.unidad}</span>
                                    <span className="text-tinta-suave truncate flex-1">{it.rawName}</span>
                                    {!wizardIsAddMode && LOAN_TYPES.has(it.type) && <span className="text-[10px] bg-atencion-suave text-atencion px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">Préstamo</span>}
                                </div>
                            ))}
                        </div>
                        {/* Fecha retroactiva — solo en modo despacho */}
                        {!wizardIsAddMode && (
                            <div>
                                <label className="text-[10px] font-black text-marca-oscuro uppercase tracking-wide block mb-1">Fecha del movimiento</label>
                                <input type="date" value={wizardDate} onChange={e => setWizardDate(e.target.value)}
                                    max={todayISO()}
                                    className="w-full text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca" />
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setWizardStep('enter_items')} className="px-3 py-2 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-xl">← Editar</button>
                        <button onClick={() => cancelWizard(true)} className="px-3 py-2 text-xs text-tinta-tenue hover:text-alerta border border-alerta rounded-xl">Cancelar</button>
                        <button onClick={handleConfirmWizard} className="flex-1 py-2 bg-bien hover:bg-bien text-papel font-bold rounded-xl text-xs transition-all">
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
                <p className="text-xs font-black text-marca-oscuro uppercase tracking-wide">⚡ Salida rápida</p>
                <button onClick={closePanel} className="text-tinta-tenue hover:text-tinta-suave text-lg leading-none">✕</button>
            </div>

            <div>
                <label className="text-[10px] font-black text-marca-oscuro uppercase tracking-wide block mb-1">Trabajador *</label>
                <select value={loanPersonnelId} onChange={e => { setLoanPersonnelId(e.target.value); setLoanSubWorkerId(''); setLoanNewSubWorkerName(''); }}
                    className="w-full text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca">
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
                        <label className="text-[10px] font-black text-marca-oscuro uppercase tracking-wide block">
                            Trabajador de la cuadrilla de {leader.name.split(' ')[0]}
                        </label>
                        <select value={loanSubWorkerId} onChange={e => { setLoanSubWorkerId(e.target.value); setLoanNewSubWorkerName(''); }}
                            className="w-full text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca">
                            <option value="">— Sin sub-trabajador (asignar al oficial) —</option>
                            {subWorkers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            <option value="__new__">➕ Crear nuevo trabajador...</option>
                        </select>
                        {loanSubWorkerId === '__new__' && (
                            <input type="text" value={loanNewSubWorkerName}
                                onChange={e => setLoanNewSubWorkerName(e.target.value)}
                                placeholder={`Nombre del trabajador de ${leader.name.split(' ')[0]} *`}
                                className="w-full text-sm border border-marca-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca" />
                        )}
                    </div>
                );
            })()}

            <div>
                <label className="text-[10px] font-black text-marca-oscuro uppercase tracking-wide block mb-1">Tipo *</label>
                <div className="grid grid-cols-2 gap-1.5">
                    {([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL, InventoryType.PPE, InventoryType.SINGLE_USE] as InventoryType[]).map(t => (
                        <button key={t} onClick={() => { setLoanInvType(t); setLoanSelected(new Map()); setLoanIsCreating(false); setLoanCreateName(''); setLoanCreateSpecies([{ brand: '', color: '' }]); }}
                            className={`py-2 rounded-xl text-xs font-black border transition-all ${loanInvType === t ? 'bg-marca text-tinta border-marca' : 'bg-papel text-tinta-suave border-papel-borde hover:border-marca'}`}>
                            {TYPE_LABELS[t]}
                        </button>
                    ))}
                </div>
            </div>

            {loanInvType && (
                <div>
                    <label className="text-[10px] font-black text-marca-oscuro uppercase tracking-wide block mb-1">
                        Ítems disponibles *{loanSelected.size > 0 && <span className="normal-case font-normal text-marca-oscuro ml-1">({loanSelected.size} selec.)</span>}
                    </label>
                    {availableForLoan.length === 0 && !loanIsCreating && (
                        <p className="text-xs text-tinta-tenue text-center py-2">Todavía no hay nada de este tipo. Usa "+ Crear nuevo".</p>
                    )}
                    {availableForLoan.length > 0 && (
                        <div className="max-h-48 overflow-y-auto mb-1">
                            {/* El mismo árbol del despacho: familia → rama → color y marca. */}
                            <ArbolFamilias
                                items={availableForLoan}
                                escogidos={new Set(loanSelected.keys())}
                                abrirTodo={availableForLoan.length <= 6}
                                fila={(item, detalle) => {
                                    const isSelected = loanSelected.has(item.id);
                                    const qty = loanSelected.get(item.id) ?? 1;
                                    return (
                                        <div onClick={() => toggleLoanItem(item.id)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-marca-suave border-marca-borde' : 'bg-papel border-papel-borde hover:border-marca-borde'}`}>
                                            <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 accent-marca flex-shrink-0" />
                                            <FilaItem item={item} detalle={detalle} />
                                            <span className={`text-[10px] flex-shrink-0 ${item.quantity > 0 ? 'text-tinta-tenue' : 'font-black text-atencion'}`}>
                                                {item.quantity > 0 ? `${item.quantity} disp.` : 'agotado'}
                                            </span>
                                            {isSelected && (
                                                <input type="number" onFocus={e => e.target.select()} value={qty} min={1} max={item.quantity}
                                                    onChange={e => setLoanItemQty(item.id, parseInt(e.target.value) || 1)}
                                                    onClick={e => e.stopPropagation()}
                                                    className="w-12 text-xs text-center border border-marca-borde rounded-lg px-1 py-0.5 bg-papel focus:outline-none" />
                                            )}
                                        </div>
                                    );
                                }}
                            />
                        </div>
                    )}
                    {loanIsCreating ? (
                        <div className="border border-dashed border-marca-borde rounded-xl p-3 bg-marca-suave space-y-2">
                            <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-widest">Nuevo ítem</p>
                            <input type="text" value={loanCreateName} onChange={e => setLoanCreateName(e.target.value)}
                                placeholder={(loanInvType === InventoryType.ELECTRICAL_TOOL || loanInvType === InventoryType.HAND_TOOL) ? 'Género (ej: Pulidora, Martillo) *' : 'Nombre del ítem *'}
                                autoFocus
                                className="w-full border border-papel-borde rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                            {(loanInvType !== InventoryType.ELECTRICAL_TOOL && loanInvType !== InventoryType.HAND_TOOL) && (
                                <>
                                    <input type="number" onFocus={e => e.target.select()} value={loanCreateQty} min={1}
                                        onChange={e => setLoanCreateQty(parseInt(e.target.value) || 1)}
                                        placeholder="4. Cantidad *"
                                        className="w-full border border-papel-borde rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                    <select value={loanCreateUnit} onChange={e => setLoanCreateUnit(e.target.value)}
                                        className="w-full border border-papel-borde rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel">
                                        {unidadesCon(loanCreateUnit).map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </>
                            )}
                            {(loanInvType === InventoryType.ELECTRICAL_TOOL || loanInvType === InventoryType.HAND_TOOL) && (
                                <div className="space-y-1.5">
                                    <p className="text-[9px] font-black text-marca-oscuro uppercase tracking-wider">Especies (color + marca)</p>
                                    {loanCreateSpecies.map((sp, idx) => (
                                        <div key={idx} className="relative pr-6">
                                            <div className="flex flex-col gap-1">
                                                <input value={sp.color}
                                                    onChange={e => setLoanCreateSpecies(prev => prev.map((s, i) => i === idx ? { ...s, color: e.target.value } : s))}
                                                    placeholder="Color *"
                                                    className="w-full border border-papel-borde rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                                <input value={sp.brand}
                                                    onChange={e => setLoanCreateSpecies(prev => prev.map((s, i) => i === idx ? { ...s, brand: e.target.value } : s))}
                                                    placeholder="Marca *"
                                                    className="w-full border border-papel-borde rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                            </div>
                                            {loanCreateSpecies.length > 1 && (
                                                <button onClick={() => setLoanCreateSpecies(prev => prev.filter((_, i) => i !== idx))}
                                                    className="absolute top-0 right-0 text-tinta-tenue hover:text-tinta-tenue text-base leading-none p-1">×</button>
                                            )}
                                        </div>
                                    ))}
                                    <button onClick={() => setLoanCreateSpecies(prev => [...prev, { brand: '', color: '' }])}
                                        className="w-full py-1 text-[10px] text-marca-oscuro border border-dashed border-marca-borde rounded-lg hover:border-marca bg-papel">
                                        + Agregar especie
                                    </button>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button onClick={() => { setLoanIsCreating(false); setLoanCreateName(''); setLoanCreateSpecies([{ brand: '', color: '' }]); }}
                                    className="px-3 py-1.5 text-xs text-tinta-tenue hover:text-tinta-suave border border-papel-borde rounded-lg bg-papel">
                                    Cancelar
                                </button>
                                <button onClick={handleLoanCreateItem}
                                    disabled={!loanCreateName.trim() || ((loanInvType === InventoryType.ELECTRICAL_TOOL || loanInvType === InventoryType.HAND_TOOL) && !loanCreateSpecies.some(s => s.brand.trim() && s.color.trim()))}
                                    className="flex-1 py-1.5 text-xs font-black bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta rounded-lg transition-all">
                                    ✓ Guardar y seleccionar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setLoanIsCreating(true)}
                            className="w-full py-1.5 text-xs font-semibold text-marca-oscuro hover:text-marca-oscuro border border-dashed border-marca-borde rounded-xl hover:border-marca bg-papel transition-all">
                            + Crear nuevo
                        </button>
                    )}
                </div>
            )}

            <div>
                <label className="text-[10px] font-black text-marca-oscuro uppercase tracking-wide block mb-1">Proyecto (opcional)</label>
                <select value={loanProjectId} onChange={e => { setLoanProjectId(e.target.value); setLoanNewProjectName(''); }}
                    className="w-full text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca">
                    <option value="">— Sin proyecto —</option>
                    {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="__new__">➕ Crear nuevo proyecto...</option>
                </select>
                {loanProjectId === '__new__' && (
                    <input type="text" value={loanNewProjectName} onChange={e => setLoanNewProjectName(e.target.value)}
                        placeholder="Nombre del proyecto *"
                        className="mt-1.5 w-full text-sm border border-marca-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca" />
                )}
            </div>

            {/* Fecha retroactiva */}
            <div>
                <label className="text-[10px] font-black text-marca-oscuro uppercase tracking-wide block mb-1">Fecha del préstamo</label>
                <input type="date" value={loanDate} onChange={e => setLoanDate(e.target.value)}
                    max={todayISO()}
                    className="w-full text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca" />
            </div>

            <button onClick={confirmLoan} disabled={!loanPersonnelId || loanSelected.size === 0}
                className="w-full py-2.5 bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta font-black rounded-xl text-sm transition-all">
                ✅ {loanInvType && !LOAN_TYPES.has(loanInvType) ? 'Confirmar salida' : 'Confirmar préstamo'}{loanSelected.size > 0 ? ` (${loanSelected.size})` : ''}
            </button>
        </div>
    );

    // ── Panel: Agregar al inventario ─────────────────────────────────────────

    const renderCreatePanel = () => (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-black text-bien uppercase tracking-wide">➕ Agregar al inventario</p>
                <button onClick={closePanel} className="text-tinta-tenue hover:text-tinta-suave text-lg leading-none">✕</button>
            </div>

            <div>
                <label className="text-[10px] font-black text-bien uppercase tracking-wide block mb-1">Tipo *</label>
                <div className="grid grid-cols-2 gap-1.5">
                    {(Object.entries(TYPE_LABELS) as [InventoryType, string][]).map(([type, label]) => (
                        <button key={type} onClick={() => setCreateInvType(type)}
                            className={`py-2 rounded-xl text-xs font-bold border transition-all ${createInvType === type ? 'bg-bien text-papel border-bien' : 'bg-papel text-papel border-papel-borde hover:border-bien'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="text-[10px] font-black text-bien uppercase tracking-wide block mb-1">
                    {(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) ? 'Género (nombre base) *' : 'Nombre *'}
                </label>
                <input type="text" value={createName} onChange={e => setCreateName(e.target.value)}
                    placeholder={(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) ? 'Ej: Pulidora, Martillo, Pala' : 'Ej: Palustres, Cascos...'}
                    className="w-full text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bien" />
            </div>

            {(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) && (
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-bien uppercase tracking-wide block">Especies (color + marca) *</label>
                    {createSpecies.map((sp, idx) => (
                        <div key={idx} className="relative pr-7">
                            <div className="flex flex-col gap-1">
                                <input value={sp.color}
                                    onChange={e => setCreateSpecies(prev => prev.map((s, i) => i === idx ? { ...s, color: e.target.value } : s))}
                                    placeholder="Color (ej: roja)"
                                    className="w-full text-xs border border-papel-borde rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-bien" />
                                <input value={sp.brand}
                                    onChange={e => setCreateSpecies(prev => prev.map((s, i) => i === idx ? { ...s, brand: e.target.value } : s))}
                                    placeholder="Marca (ej: Bosch)"
                                    className="w-full text-xs border border-papel-borde rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-bien" />
                            </div>
                            {createSpecies.length > 1 && (
                                <button onClick={() => setCreateSpecies(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute top-0 right-0 text-tinta-tenue hover:text-alerta text-lg leading-none p-1">×</button>
                            )}
                        </div>
                    ))}
                    <button onClick={() => setCreateSpecies(prev => [...prev, { brand: '', color: '' }])}
                        className="w-full py-1.5 text-xs text-bien border border-dashed border-bien rounded-xl hover:border-bien bg-papel">
                        + Agregar especie
                    </button>
                    {createSpecies.filter(s => s.brand.trim() && s.color.trim()).length > 0 && (
                        <p className="text-[10px] text-bien font-bold text-center">
                            Se crearán {createSpecies.filter(s => s.brand.trim() && s.color.trim()).length} ítem(s) — 1 unidad c/u
                        </p>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] font-black text-bien uppercase tracking-wide block mb-1">Cantidad</label>
                    {(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) ? (
                        <div className="w-full text-sm border border-papel-borde bg-papel-hondo rounded-xl px-3 py-2 text-tinta-tenue text-center">
                            {createSpecies.filter(s => s.brand.trim() && s.color.trim()).length || 1} ítem(s)
                        </div>
                    ) : (
                        <input type="number" onFocus={e => e.target.select()} value={createQty} min={1} onChange={e => setCreateQty(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bien" />
                    )}
                </div>
                <div>
                    <label className="text-[10px] font-black text-bien uppercase tracking-wide block mb-1">Unidad</label>
                    <select value={createUnit} onChange={e => setCreateUnit(e.target.value)}
                        className="w-full text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bien bg-papel">
                        {unidadesCon(createUnit).map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>
            </div>

            <button onClick={confirmCreate}
                disabled={!createInvType || !createName.trim() || ((createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) && !createSpecies.some(s => s.brand.trim() && s.color.trim()))}
                className="w-full py-2.5 bg-bien hover:bg-bien disabled:bg-papel-borde disabled:text-papel text-papel font-black rounded-xl text-sm transition-all">
                ✅ {(createInvType === InventoryType.ELECTRICAL_TOOL || createInvType === InventoryType.HAND_TOOL) ? `Guardar ${createSpecies.filter(s => s.brand.trim() && s.color.trim()).length} ítem(s)` : 'Guardar ítem'}
            </button>
        </div>
    );

    // La ayuda vive acá adentro, no en la barra lateral: cuando uno no sabe qué
    // hacer, le pregunta al asistente — es el sitio donde ya se está parado.
    const [ayuda, setAyuda] = useState(false);

    // ── Render ───────────────────────────────────────────────────────────────

    const inAction = !!wizardStep || !!activePanel;

    return (
        <>
            {open && (
                <div className="fixed bottom-24 right-4 sm:right-6 z-[70] w-[340px] sm:w-[390px] flex flex-col rounded-2xl shadow-2xl border border-papel-borde overflow-hidden bg-papel"
                    style={{ maxHeight: 'min(600px, calc(100vh - 110px))' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-marca flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🤖</span>
                            <div>
                                <p className="text-tinta font-bold text-sm leading-tight">Asistente de Bodega</p>
                                <p className="text-tinta-tenue text-[10px]">
                                    {wizardStep ? (wizardIsAddMode ? 'Agregando al inventario…' : 'Registrando salida…') : activePanel === 'loan' ? 'Asignando herramienta…' : 'Consultar · Registrar'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {inAction && (
                                <button onClick={() => { cancelWizard(true); closePanel(); }} className="text-tinta-tenue hover:text-tinta text-xs font-semibold px-2 py-1 rounded-lg hover:bg-marca-fuerte transition-colors">
                                    ✕ Cancelar
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} className="text-tinta-tenue hover:text-tinta p-1 rounded-lg hover:bg-marca-fuerte transition-colors">
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
                                className="flex-1 py-2 pb-2.5 bg-tinta hover:bg-tinta text-papel rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm">
                                <span className="font-bold text-xs">🚀 Despacho</span>
                                <span className="text-[9px] opacity-70 leading-tight text-center px-1">Salidas grandes · varios tipos a la vez</span>
                            </button>
                            <button onClick={() => openPanel('loan')}
                                className="flex-1 py-2 pb-2.5 bg-marca hover:bg-marca-fuerte text-tinta rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm">
                                <span className="font-bold text-xs">⚡ Rápido</span>
                                <span className="text-[9px] opacity-70 leading-tight text-center px-1">Un ítem rápido · herramienta o consumible</span>
                            </button>
                            <button onClick={startAddMode}
                                className="flex-1 py-2 pb-2.5 bg-bien hover:bg-bien text-papel rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all shadow-sm">
                                <span className="font-bold text-xs">➕ Agregar</span>
                                <span className="text-[9px] opacity-70 leading-tight text-center px-1">Agrega ítems nuevos al inventario</span>
                            </button>
                        </div>
                    )}

                    {/* Contenido principal */}
                    {reposicion ? renderReposicion()
                        : wizardStep ? <div key={wizardStep} style={{ display: 'contents' }}>{renderWizard()}</div>
                        : activePanel === 'loan' ? renderLoanPanel()
                        : activePanel === 'create' ? renderCreatePanel()
                        : (
                            <>
                                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
                                    {messages.map(msg => (
                                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-marca text-tinta rounded-br-sm whitespace-pre-wrap' : 'bg-papel-hondo text-tinta rounded-bl-sm'}`}>
                                                {msg.role === 'bot' ? <RichText text={msg.text} /> : msg.text}
                                            </div>
                                        </div>
                                    ))}
                                    {loading && (
                                        <div className="flex justify-start">
                                            <div className="bg-papel-hondo rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                                                {[0, 1, 2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-papel-borde animate-bounce" style={{ animationDelay: `${i * 0.15}s` }}/>)}
                                            </div>
                                        </div>
                                    )}
                                    <div ref={bottomRef}/>
                                </div>
                                {/* El historial de todos, sin salir del chat. Va
                                    semitransparente y debajo de los botones: es una
                                    consulta, no una acción — no compite con Despacho,
                                    Rápido ni Agregar. */}
                                {verHistorial && (() => {
                                    /**
                                     * Lo que se hizo DESDE ACÁ, no toda la app.
                                     *
                                     * Antes este panel mostraba la bitácora entera —lo
                                     * mismo que la vista de Trazabilidad—, que no es lo
                                     * que se pidió. Lo que hacía falta era el historial
                                     * del asistente: lo que uno despachó, creó o asignó
                                     * hablándole a él.
                                     *
                                     * Sale de la misma bitácora, filtrando por su origen,
                                     * y por eso se ve igual en todos los celulares sin
                                     * hacer nada más: la bitácora ya se sincroniza sola.
                                     * La conversación en sí sigue siendo de este teléfono.
                                     */
                                    const mios = auditLogs.filter(l => l.origen === 'chat');

                                    /**
                                     * Un renglón por COSA HECHA, no por apunte suelto.
                                     *
                                     * Una salida de tres vainas deja cinco o seis apuntes
                                     * en la bitácora, y para el bodeguero eso fue una sola
                                     * cosa. Se agrupan por el número de operación y manda
                                     * el resumen —la frase con chulito que él ya vio en el
                                     * chat—; los apuntes quedan adentro, para el que
                                     * quiera abrir y mirar el detalle.
                                     *
                                     * Lo de antes de que existiera el número de operación
                                     * queda como estaba, cada uno por su lado: no hay de
                                     * dónde sacar a qué toque perteneció.
                                     */
                                    type Bloque = { clave: string; titulo: string; cuando: Date; quien: string; detalles: typeof mios };
                                    const bloques: Bloque[] = [];
                                    const porOperacion = new Map<string, Bloque>();
                                    for (const l of mios) {
                                        if (!l.operacionId) {
                                            bloques.push({ clave: l.id, titulo: l.description, cuando: new Date(l.timestamp), quien: l.actor, detalles: [] });
                                            continue;
                                        }
                                        let b = porOperacion.get(l.operacionId);
                                        if (!b) {
                                            b = { clave: l.operacionId, titulo: '', cuando: new Date(l.timestamp), quien: l.actor, detalles: [] };
                                            porOperacion.set(l.operacionId, b);
                                            bloques.push(b);
                                        }
                                        // El resumen es el título; lo demás, el detalle.
                                        if (l.action === 'CHAT_RESUMEN') b.titulo = l.description;
                                        else b.detalles.push(l);
                                    }
                                    // Una operación sin resumen guardado (las de antes de
                                    // este cambio) se anuncia con lo que tenga adentro.
                                    for (const b of bloques) {
                                        if (b.titulo) continue;
                                        b.titulo = b.detalles.length === 1
                                            ? b.detalles[0].description
                                            : `${b.detalles.length} apuntes`;
                                    }

                                    return (
                                    <div className="border-t border-papel-borde bg-papel-hondo max-h-56 overflow-y-auto flex-shrink-0">
                                        {bloques.length === 0 ? (
                                            <div className="px-3 py-3 space-y-1">
                                                <p className="text-xs text-tinta-tenue">Todavía no has hecho nada desde acá.</p>
                                                <p className="text-[10px] text-tinta-tenue">
                                                    Lo que hagas con el asistente queda en esta lista y se
                                                    ve desde cualquier celular, aunque se apague este.
                                                </p>
                                            </div>
                                        ) : bloques.slice(0, 40).map(b => {
                                            const abierto = operacionAbierta === b.clave;
                                            return (
                                            <div key={b.clave} className="border-b border-papel-borde last:border-0">
                                                <button type="button"
                                                    onClick={() => setOperacionAbierta(abierto ? null : b.clave)}
                                                    className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-papel">
                                                    <span className="flex-1 min-w-0">
                                                        <span className="block text-xs text-tinta">{b.titulo}</span>
                                                        <span className="block text-[10px] text-tinta-tenue">
                                                            {b.cuando.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                                                            {b.quien ? ` · ${b.quien}` : ''}
                                                            {b.detalles.length > 0 && ` · ${b.detalles.length} detalle${b.detalles.length === 1 ? '' : 's'}`}
                                                        </span>
                                                    </span>
                                                    {b.detalles.length > 0 && (
                                                        <span className="text-[10px] text-tinta-tenue flex-shrink-0 mt-0.5">{abierto ? '▲' : '▼'}</span>
                                                    )}
                                                </button>
                                                {abierto && b.detalles.length > 0 && (
                                                    <ul className="px-3 pb-2 space-y-0.5">
                                                        {b.detalles.map(d => (
                                                            <li key={d.id} className="text-[11px] text-tinta-suave">• {d.description}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                            );
                                        })}
                                    </div>
                                    );
                                })()}
                                <div className="border-t border-papel-borde px-3 py-1.5 flex-shrink-0">
                                    <button
                                        onClick={() => { setVerHistorial(v => !v); onBehaviorLog?.('BUTTON', verHistorial ? 'Cerró el historial del chat' : 'Abrió el historial del chat'); }}
                                        className="w-full text-[11px] font-bold text-tinta-tenue/70 hover:text-tinta-suave py-1 rounded-lg hover:bg-papel-hondo transition-colors"
                                    >
                                        {verHistorial ? '✕ Cerrar' : 'Lo que se ha hecho desde acá →'}
                                    </button>
                                </div>
                                {/* Las sugerencias de siempre, con un «?» chiquito pegado
                                    a la izquierda. Tocándolo, esos mismos chips pasan a
                                    ser las preguntas de ayuda — y se vuelve con otro
                                    toque. La ayuda no se toma el chat: usa su renglón. */}
                                <div className="border-t border-papel-borde px-3 py-2 flex gap-1.5 items-center flex-shrink-0">
                                    <button
                                        onClick={() => { setAyuda(a => !a); onBehaviorLog?.('BUTTON', ayuda ? 'Cerró ayuda del chat' : 'Abrió ayuda del chat'); }}
                                        title={ayuda ? 'Volver a las sugerencias' : 'Cómo se hace cada cosa'}
                                        className={`flex-shrink-0 w-7 h-7 rounded-full text-xs font-black border transition-colors ${ayuda
                                            ? 'bg-tinta text-papel border-tinta'
                                            : 'bg-papel text-tinta-tenue border-papel-borde hover:text-tinta hover:border-marca'}`}
                                    >
                                        {ayuda ? '✕' : '?'}
                                    </button>
                                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
                                        {(ayuda ? PREGUNTAS_DE_AYUDA : sugerencias).map(q => (
                                            <button
                                                key={q}
                                                onClick={() => {
                                                    onBehaviorLog?.(ayuda ? 'CHAT_AYUDA' : 'CHAT_SUGGESTION', `Tocó ${ayuda ? 'ayuda' : 'sugerencia'}: ${q}`);
                                                    setAyuda(false);
                                                    handleSend(q);
                                                }}
                                                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${ayuda
                                                    ? 'bg-papel-hondo text-tinta-suave border-papel-borde hover:border-tinta'
                                                    : 'bg-marca-suave text-marca-oscuro border-marca-borde'}`}
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="border-t border-papel-borde px-3 py-2 flex gap-2 items-end flex-shrink-0">
                                    <textarea value={input} onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                                        placeholder="Escribí o tocá una sugerencia…" rows={2}
                                        className="flex-1 resize-none border border-papel-borde rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca"
                                        style={{ maxHeight: '80px' }} />
                                    <button onClick={() => handleSend(input)} disabled={!input.trim() || loading}
                                        className="h-9 w-9 flex items-center justify-center bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-suave text-tinta rounded-xl transition-all flex-shrink-0">
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
                className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[70] w-14 h-14 rounded-full bg-marca hover:bg-marca-fuerte active:scale-95 shadow-xl flex items-center justify-center transition-all duration-200"
                aria-label="Abrir asistente">
                {open
                    ? <svg className="w-6 h-6 text-papel" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    : <svg className="w-6 h-6 text-papel" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
                }
                {hasNew && !open && <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-alerta rounded-full border-2 border-papel animate-pulse"/>}
            </button>
        </>
    );
};
