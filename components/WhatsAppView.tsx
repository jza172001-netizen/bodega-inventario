
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Movement, Item, Personnel, InventoryType, MovementType } from '../types';
import {
    ReminderLog,
    ReminderKind,
    loadReminderLog,
    recordReminders,
    isDueForReminder,
    buildPersonGroups,
    buildPersonReminderUrl,
    buildPersonReminderText,
    daysSince,
    REMINDER_INTERVAL_DAYS,
} from '../services/whatsappService';
import { isConsumable, CONSUMABLE_TYPES } from '../utils/inventory';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    readOnly?: boolean;
    onBehaviorLog?: (action: string, detail: string) => void;
    /** Mandarle un mensaje a un trabajador sale de la app: va a la bitácora. */
    onAuditLog?: (action: string, description: string) => void;
}

interface PersonGroup {
    person: Personnel;
    loans: Movement[];
    /** Consumo reciente de EPP/material. Sin esto, los botones 🦺 EPP y 📦
     *  Consumibles nacían en (0): la lista se armaba solo desde préstamos
     *  activos, y un consumible nunca es préstamo. */
    consumos: Movement[];
    hasPhone: boolean;
    isDue: boolean;
}

/** Ventana de consumo. Más larga que la de préstamos porque el gasto se
 *  analiza por acumulado, no por mora. */
const CONSUMO_WINDOW_DAYS = 30;

const isConsumableCat = (catKey: string): boolean => CONSUMABLE_TYPES.has(catKey as InventoryType);

type WeeklyLog = {
    week: string;
    sent: Partial<Record<string, string[]>>;
};

const WEEKLY_LOG_KEY = 'wa_weekly_v1';
// v2: la cola ahora recuerda también qué tipo de mensaje se está enviando, para
// que al volver de WhatsApp el siguiente de la fila reciba el mismo mensaje.
const QUEUE_KEY      = 'wa_remind_queue_v2';
const STEP_KEY       = 'wa_remind_step_v2';

interface RemindQueue {
    batch: PersonGroup[];
    kind: ReminderKind;
    windowDays: number;
    label: string;
}

const getWeekKey = (): string => {
    const d = new Date();
    const dow = d.getDay() || 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - (dow - 1));
    return mon.toISOString().split('T')[0];
};

const loadWeeklyLog = (): WeeklyLog => {
    try {
        const raw = localStorage.getItem(WEEKLY_LOG_KEY);
        if (!raw) return { week: getWeekKey(), sent: {} };
        const parsed: WeeklyLog = JSON.parse(raw);
        return parsed.week === getWeekKey() ? parsed : { week: getWeekKey(), sent: {} };
    } catch { return { week: getWeekKey(), sent: {} }; }
};

const CATEGORY_BTNS = [
    { key: InventoryType.HAND_TOOL,       label: '🔨 Manual',      active: 'bg-amber-500 hover:bg-amber-600' },
    { key: InventoryType.ELECTRICAL_TOOL, label: '⚡ Eléctrica',   active: 'bg-yellow-500 hover:bg-yellow-600' },
    { key: InventoryType.PPE,             label: '🦺 EPP',         active: 'bg-orange-500 hover:bg-orange-600' },
    { key: InventoryType.SINGLE_USE,      label: '📦 Consumibles', active: 'bg-purple-500 hover:bg-purple-600' },
] as const;

export const WhatsAppView: React.FC<Props> = ({ movements, items, personnel, readOnly = false, onBehaviorLog, onAuditLog }) => {
    const [log, setLog] = useState<ReminderLog>(loadReminderLog);
    const [weeklyLog, setWeeklyLog] = useState<WeeklyLog>(loadWeeklyLog);
    const bottomRef = useRef<HTMLDivElement>(null);

    const [queue, setQueue] = useState<RemindQueue | null>(() => {
        try { const s = sessionStorage.getItem(QUEUE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
    });
    const [step, setStep] = useState<number>(() => {
        try { const s = sessionStorage.getItem(STEP_KEY); return s ? parseInt(s, 10) : 0; } catch { return 0; }
    });

    useEffect(() => {
        if (queue === null) {
            sessionStorage.removeItem(QUEUE_KEY);
            sessionStorage.removeItem(STEP_KEY);
        } else {
            sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
            sessionStorage.setItem(STEP_KEY, String(step));
        }
    }, [queue, step]);

    /**
     * Lo que está esperando confirmación. Mandar un WhatsApp sale de la app y no
     * se puede deshacer: es de las pocas acciones de la bodega con esa
     * característica, y era la única sin confirmar.
     */
    const [porConfirmar, setPorConfirmar] = useState<{ titulo: string; mensaje: string; hacer: () => void } | null>(null);

    const itemMap = new Map(items.map(i => [i.id, i]));
    const activeLoans = movements.filter(m => m.isLoan && !m.isReturned);

    const consumoCutoff = new Date(Date.now() - CONSUMO_WINDOW_DAYS * 86400000);
    const recentConsumos = movements.filter(m =>
        m.type === MovementType.CHECK_OUT &&
        !m.isLoan &&
        new Date(m.timestamp) > consumoCutoff &&
        isConsumable(itemMap.get(m.itemId))
    );

    // Una persona entra a la lista si tiene algo pendiente O si consumió algo
    // hace poco: las dos cosas ameritan un mensaje, aunque sean mensajes distintos.
    const groups: PersonGroup[] = [];
    const seen = new Set<string>();
    for (const mov of [...activeLoans, ...recentConsumos]) {
        const person = personnel.find(p => p.id === mov.personnelId);
        if (!person || seen.has(person.id)) continue;
        seen.add(person.id);
        const personLoans = activeLoans.filter(m => m.personnelId === person.id);
        const personConsumos = recentConsumos.filter(m => m.personnelId === person.id);
        const hasPhone = !!person.phone;
        // La mora aplica solo a préstamos: un consumible ya se gastó, no está vencido.
        const isDue = hasPhone && personLoans.some(m => isDueForReminder(m.id, m.timestamp, log));
        groups.push({ person, loans: personLoans, consumos: personConsumos, hasPhone, isDue });
    }
    groups.sort((a, b) => a.person.name.localeCompare(b.person.name, 'es'));

    const dueGroups     = groups.filter(g => g.isDue);
    const onTrackGroups = groups.filter(g => g.hasPhone && !g.isDue);
    const noPhoneGroups = groups.filter(g => !g.hasPhone);

    // Marca a la persona en el registro semanal. Solo las categorías del tipo de
    // mensaje que se envió: mandar el reporte de consumo no debe dar por
    // recordadas las herramientas.
    const markSentInLog = (g: PersonGroup, currentLog: WeeklyLog, kind: ReminderKind): WeeklyLog => {
        const newWL: WeeklyLog = { week: currentLog.week, sent: { ...currentLog.sent } };
        const covered: Movement[] = [
            ...(kind === 'loan'    || kind === 'all' ? g.loans    : []),
            ...(kind === 'consumo' || kind === 'all' ? g.consumos : []),
        ];
        for (const m of covered) {
            const catKey = itemMap.get(m.itemId)?.inventoryType;
            if (!catKey) continue;
            const existing = newWL.sent[catKey] ?? [];
            if (!existing.includes(g.person.id))
                newWL.sent[catKey] = [...existing, g.person.id];
        }
        return newWL;
    };

    const saveWeekly = (updated: WeeklyLog) => {
        localStorage.setItem(WEEKLY_LOG_KEY, JSON.stringify(updated));
        setWeeklyLog(updated);
    };

    /**
     * Abre WhatsApp con el mensaje del tipo pedido. Devuelve false si no había
     * nada que reportar, para no abrir un chat en blanco.
     * Registra en los dos logs: el de 8 días (por movimiento) y el semanal (por
     * categoría). Antes el semanal solo se escribía desde la cola, así que los
     * botones individuales "Semana"/"Mes" no dejaban rastro y el ✓ nunca aparecía.
     */
    const remind = (g: PersonGroup, windowDays = 7, kind: ReminderKind = 'all'): boolean => {
        if (!g.person.phone) return false;
        const grps = buildPersonGroups(g.person, movements, items, windowDays, kind);
        if (grps.every(x => x.items.length === 0)) return false;

        window.open(buildPersonReminderUrl(g.person.phone, g.person.name, grps, kind), '_blank');
        const queReporta = kind === 'consumo' ? 'consumo' : kind === 'loan' ? 'préstamos' : 'préstamos y consumo';
        onAuditLog?.('WHATSAPP_SENT', `Abrió WhatsApp para ${g.person.name} (${g.person.phone}) — reporte de ${queReporta}, ventana de ${windowDays} días`);

        const covered = kind === 'consumo' ? [] : g.loans;
        if (covered.length > 0) setLog({ ...recordReminders(covered.map(m => m.id)) });
        saveWeekly(markSentInLog(g, weeklyLog, kind));
        return true;
    };

    const remindMonthly = (g: PersonGroup) => remind(g, 30, 'all');

    /** Pide confirmación mostrando el mensaje exacto que va a recibir la persona. */
    const confirmarEnvio = (g: PersonGroup, windowDays: number, kind: ReminderKind) => {
        if (!g.person.phone) return;
        const grps = buildPersonGroups(g.person, movements, items, windowDays, kind);
        const texto = buildPersonReminderText(g.person.name, grps, kind);
        if (!texto) { alert(`No hay nada que reportarle a ${g.person.name} en esta ventana.`); return; }
        setPorConfirmar({
            titulo: `Enviar WhatsApp a ${g.person.name}`,
            mensaje: `Se le va a enviar al ${g.person.phone}\n\nEsto es lo que va a recibir:\n────────────────\n${texto}`,
            // La apertura ocurre DENTRO del clic de confirmar: los navegadores solo
            // permiten abrir una ventana dentro de un gesto real del usuario, y si
            // esto quedara detrás de una promesa el celular lo bloquearía en silencio.
            hacer: () => { remind(g, windowDays, kind); },
        });
    };

    /** Confirma un lote: se listan los nombres, no los mensajes completos — con
     *  ocho personas la pantalla se vuelve ilegible y la confirmación deja de
     *  cumplir su función. */
    const confirmarLote = (batch: PersonGroup[], label: string, kind: ReminderKind, windowDays: number) => {
        if (batch.length === 0) return;
        const queReporta = kind === 'consumo' ? 'Reporte de consumo' : kind === 'loan' ? 'Reporte de préstamos' : 'Reporte de préstamos y consumo';
        setPorConfirmar({
            titulo: `Enviar ${batch.length} mensaje(s)`,
            mensaje: `Se van a enviar uno por uno, a:\n\n${batch.map(g => `• ${g.person.name}`).join('\n')}\n\n${queReporta} · ventana de ${windowDays} días`,
            hacer: () => { startBatchQueue(batch, label, kind, windowDays); },
        });
    };

    // ── Due-queue (Recordar a todos) ──────────────────────────────────────
    const startRemindAll = () => {
        if (dueGroups.length === 0) return;
        confirmarLote([...dueGroups], 'Recordar a todos', 'loan', 7);
    };

    // ── Batch queue — shared for category + general ───────────────────────
    const startBatchQueue = (batch: PersonGroup[], label: string, kind: ReminderKind, windowDays: number) => {
        if (batch.length === 0) return;
        setQueue({ batch, kind, windowDays, label });
        setStep(0);
        remind(batch[0], windowDays, kind);
        onBehaviorLog?.('ACTION', `Inició cola ${label}: ${batch[0].person.name} (1/${batch.length})`);
    };

    const remindCategory = (catKey: string) => {
        const esConsumo = isConsumableCat(catKey);
        const kind: ReminderKind = esConsumo ? 'consumo' : 'loan';
        const windowDays = esConsumo ? CONSUMO_WINDOW_DAYS : 7;
        // Excluye a quien ya recibió esta categoría esta semana. El ✓ era
        // informativo y el lote se rearmaba completo, así que la misma persona
        // podía recibir el mismo mensaje varias veces.
        const yaEnviado = weeklyLog.sent[catKey] ?? [];
        const batch = getGroupsForCategory(catKey).filter(g => !yaEnviado.includes(g.person.id));
        if (batch.length === 0) {
            const total = getGroupsForCategory(catKey).length;
            if (total > 0) alert(`Ya le enviaste esta categoría a las ${total} persona(s) esta semana.\n\nPara reenviar, usa el botón individual de cada tarjeta.`);
            return;
        }
        confirmarLote(batch, `categoría ${catKey}`, kind, windowDays);
    };

    const remindGeneralWeekly = () => {
        const allSent = new Set(Object.values(weeklyLog.sent).flat());
        const batch = groups.filter(g => g.hasPhone && !allSent.has(g.person.id));
        if (batch.length === 0) {
            alert('Ya le enviaste a todas las personas con número esta semana.\n\nPara reenviar, usa el botón individual de cada tarjeta.');
            return;
        }
        confirmarLote(batch, 'General', 'all', 7);
    };

    // ── Advance queue step ────────────────────────────────────────────────
    const nextStep = () => {
        if (!queue) return;
        const next = step + 1;
        if (next >= queue.batch.length) {
            setQueue(null);
            setStep(0);
            return;
        }
        setStep(next);
        remind(queue.batch[next], queue.windowDays, queue.kind);
        // Scroll so the next person's card is visible
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 150);
        onBehaviorLog?.('ACTION', `Cola paso ${next + 1}/${queue.batch.length}: ${queue.batch[next].person.name}`);
    };

    // ── Category helpers ──────────────────────────────────────────────────
    // Para herramienta se mira lo prestado; para EPP/consumible, lo consumido.
    const getGroupsForCategory = (catKey: string) =>
        groups.filter(g => g.hasPhone && (isConsumableCat(catKey) ? g.consumos : g.loans)
            .some(m => itemMap.get(m.itemId)?.inventoryType === catKey));

    const isCategoryDone = (catKey: string): boolean => {
        const cat = getGroupsForCategory(catKey);
        if (cat.length === 0) return false;
        const sent = weeklyLog.sent[catKey] ?? [];
        return cat.every(g => sent.includes(g.person.id));
    };

    const generalSentCount = (): number => {
        const allSent = new Set(Object.values(weeklyLog.sent).flat());
        return groups.filter(g => g.hasPhone && allSent.has(g.person.id)).length;
    };

    const hasPhoneUsers = groups.some(g => g.hasPhone);
    const totalWithPhone = groups.filter(g => g.hasPhone).length;
    const generalDone = totalWithPhone > 0 && generalSentCount() >= totalWithPhone;

    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    // Map: letter → first person.id that appears in render order (due → onTrack → noPhone)
    const firstOfLetterMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const g of [...dueGroups, ...onTrackGroups, ...noPhoneGroups]) {
            const letter = g.person.name.charAt(0).toUpperCase();
            if (!map.has(letter)) map.set(letter, g.person.id);
        }
        return map;
    }, [dueGroups, onTrackGroups, noPhoneGroups]);
    const activeLetters = useMemo(() => new Set(firstOfLetterMap.keys()), [firstOfLetterMap]);
    const jumpToLetter = useCallback((letter: string) => {
        const el = document.querySelector(`[data-person-letter="${letter}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const wrapCard = (g: PersonGroup, node: React.ReactNode) => {
        const letter = g.person.name.charAt(0).toUpperCase();
        if (firstOfLetterMap.get(letter) !== g.person.id) return node;
        return <div key={`az-${g.person.id}`} data-person-letter={letter}>{node}</div>;
    };

    const PersonCard: React.FC<{ g: PersonGroup; highlight?: boolean }> = ({ g, highlight }) => {
        // Una persona puede estar en la lista solo por consumo, sin préstamos:
        // Math.max() de un arreglo vacío da -Infinity.
        const maxDays = g.loans.length > 0 ? Math.max(...g.loans.map(m => daysSince(m.timestamp))) : 0;
        const unidadesConsumidas = g.consumos.reduce((s, m) => s + m.quantity, 0);
        const itemNames = g.loans.length > 0
            ? g.loans.map(m => itemMap.get(m.itemId)?.name ?? '—').join(', ')
            : `${unidadesConsumidas} ud consumidas · sin préstamos`;
        const lastRemindedTs = g.loans.map(m => log[m.id]).filter(Boolean).sort().reverse()[0];
        const daysSinceReminder = lastRemindedTs ? daysSince(lastRemindedTs) : null;

        return (
            <div className={`rounded-2xl p-4 border flex items-center gap-3 transition-all ${
                highlight ? 'bg-green-50 border-green-400 ring-2 ring-green-400' : g.isDue ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'
            }`}>
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-base flex-shrink-0">
                    {g.person.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{g.person.name}</p>
                        {g.isDue && (
                            <span className="text-[10px] font-black bg-green-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">recordar</span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{itemNames}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {g.loans.length > 0 && (
                            <span className={`text-[10px] font-semibold ${maxDays > 14 ? 'text-red-500' : maxDays > 7 ? 'text-yellow-600' : 'text-gray-400'}`}>
                                {maxDays}d fuera
                            </span>
                        )}
                        {unidadesConsumidas > 0 && g.loans.length > 0 && (
                            <span className="text-[10px] font-semibold text-emerald-600">• {unidadesConsumidas} ud consumidas</span>
                        )}
                        {g.person.phone && <span className="text-[10px] text-gray-400">{g.person.phone}</span>}
                        {daysSinceReminder !== null && (
                            <span className="text-[10px] text-green-600">• recordado hace {daysSinceReminder}d</span>
                        )}
                    </div>
                </div>
                {g.hasPhone ? (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                        <button onClick={() => { onBehaviorLog?.('BUTTON', `Pidió recordatorio semana: ${g.person.name}`); confirmarEnvio(g, 7, 'all'); }}
                            className={`flex items-center gap-1 px-3 py-2 text-xs font-black rounded-xl transition-all ${
                                g.isDue ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-100 hover:bg-green-200 text-green-800'
                            }`}>
                            📲 Semana
                        </button>
                        <button onClick={() => { onBehaviorLog?.('BUTTON', `Pidió recordatorio mes: ${g.person.name}`); confirmarEnvio(g, 30, 'all'); }}
                            className="flex items-center gap-1 px-3 py-2 text-xs font-black bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-xl transition-all">
                            📅 Mes
                        </button>
                    </div>
                ) : (
                    <span className="flex-shrink-0 text-[10px] text-gray-300 text-right max-w-[72px] leading-tight">Sin número en Personal</span>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4 max-w-2xl mx-auto pr-6">
            {readOnly && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-amber-700">
                    👁️ Modo visitante — solo lectura
                </div>
            )}
            <div className="relative">
            {readOnly && <div className="absolute inset-0 z-10 cursor-not-allowed" />}

            {/* ── Contador de pasos al tope (visible siempre que haya cola) ── */}
            {queue && (
                <div className="sticky top-0 z-20 bg-green-600 text-white px-4 py-3 rounded-2xl flex items-center justify-between gap-3 shadow-lg mb-3">
                    <div>
                        <p className="font-black text-sm">Paso {step + 1} de {queue.batch.length} — {queue.batch[step]?.person.name}</p>
                        <p className="text-xs text-green-100">WhatsApp abierto → toca Enviar → vuelve aquí</p>
                    </div>
                    <button
                        onClick={nextStep}
                        className="flex-shrink-0 px-4 py-2 bg-white text-green-700 font-black text-xs rounded-xl hover:bg-green-50 transition-colors"
                    >
                        {step < queue.batch.length - 1 ? 'Siguiente →' : '✓ Listo'}
                    </button>
                </div>
            )}

            {/* ── Header ── */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-black text-gray-900">📱 WhatsApp Recordatorios</h1>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {activeLoans.length} herramienta{activeLoans.length !== 1 ? 's' : ''} fuera de bodega
                        {dueGroups.length > 0 && ` · ${dueGroups.length} persona${dueGroups.length > 1 ? 's' : ''} sin recordar`}
                    </p>
                </div>
            </div>

            {/* ── Botones de categoría ── */}
            {hasPhoneUsers && activeLoans.length > 0 && (
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                        Recordar por categoría — semana actual
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {CATEGORY_BTNS.map(btn => {
                            const catGroups = getGroupsForCategory(btn.key);
                            const noData = catGroups.length === 0;
                            const done = isCategoryDone(btn.key);
                            return (
                                <button
                                    key={btn.key}
                                    onClick={() => !noData && remindCategory(btn.key)}
                                    disabled={noData}
                                    className={`flex-shrink-0 px-3 py-2 text-xs font-black rounded-xl transition-all ${
                                        noData
                                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                            : done
                                                ? `${btn.active} text-white opacity-70`
                                                : `${btn.active} text-white`
                                    }`}
                                    title={noData ? 'Sin préstamos en esta categoría' : done ? 'Enviado esta semana — toca para re-enviar' : `Recordar a ${catGroups.length} persona${catGroups.length !== 1 ? 's' : ''}`}
                                >
                                    {btn.label}{done ? ' ✓' : ` (${catGroups.length})`}
                                </button>
                            );
                        })}
                        {/* General button */}
                        <button
                            onClick={() => !(!hasPhoneUsers) && remindGeneralWeekly()}
                            disabled={!hasPhoneUsers}
                            className={`flex-shrink-0 px-3 py-2 text-xs font-black rounded-xl transition-all ${
                                !hasPhoneUsers
                                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                    : generalDone
                                        ? 'bg-green-600 hover:bg-green-700 text-white opacity-70'
                                        : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                            title={generalDone ? 'Todos recordados esta semana — toca para re-enviar' : `Recordar a los ${totalWithPhone} trabajadores`}
                        >
                            🌐 General{generalDone ? ' ✓' : ` (${totalWithPhone})`}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Contenido ── */}
            {activeLoans.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 text-gray-400">
                    <p className="text-4xl mb-3">🎉</p>
                    <p className="font-semibold">¡Todo está en bodega!</p>
                    <p className="text-sm mt-1">No hay herramientas prestadas.</p>
                </div>
            ) : (
                <>
                    {/* Pendientes */}
                    {dueGroups.length > 0 && (
                        <div className="bg-white rounded-2xl border border-green-200 overflow-hidden shadow-sm">
                            <div className="bg-green-600 px-4 py-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-white">🔔 Necesitan recordatorio</p>
                                    <p className="text-xs text-green-100">Sin contactar hace +{REMINDER_INTERVAL_DAYS} días</p>
                                </div>
                                {!queue && (
                                    <button
                                        onClick={startRemindAll}
                                        className="flex-shrink-0 text-xs font-black bg-white text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-xl transition-colors"
                                    >
                                        Recordar a todos ({dueGroups.length}) →
                                    </button>
                                )}
                            </div>
                            <div className="p-3 space-y-2">
                                {dueGroups.map(g => wrapCard(g, (
                                    <PersonCard
                                        key={g.person.id}
                                        g={g}
                                        highlight={!!queue && queue.batch[step]?.person.id === g.person.id}
                                    />
                                )))}
                            </div>
                        </div>
                    )}

                    {dueGroups.length === 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                            <span className="text-2xl">✅</span>
                            <div>
                                <p className="text-sm font-black text-green-900">Al día con los recordatorios</p>
                                <p className="text-xs text-green-700">Nadie lleva más de {REMINDER_INTERVAL_DAYS} días sin recibir mensaje.</p>
                            </div>
                        </div>
                    )}

                    {onTrackGroups.length > 0 && (
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">📋 Préstamos activos — al día</p>
                            <div className="space-y-2">
                                {onTrackGroups.map(g => wrapCard(g, (
                                    <PersonCard
                                        key={g.person.id}
                                        g={g}
                                        highlight={!!queue && queue.batch[step]?.person.id === g.person.id}
                                    />
                                )))}
                            </div>
                        </div>
                    )}

                    {noPhoneGroups.length > 0 && (
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">⚠️ Sin número de WhatsApp</p>
                            <div className="space-y-2">
                                {noPhoneGroups.map(g => wrapCard(g, <PersonCard key={g.person.id} g={g} />))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 text-center">
                                Agrega el teléfono en la sección Personal → toca el nombre del trabajador → editar.
                            </p>
                        </div>
                    )}
                </>
            )}

            <div ref={bottomRef} className="h-px" />

            {/* Índice A-Z lateral derecho */}
            {activeLetters.size > 0 && (
                <div className="fixed right-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-30">
                    {ALPHABET.map(letter => {
                        const active = activeLetters.has(letter);
                        return (
                            <button
                                key={letter}
                                onClick={() => active && jumpToLetter(letter)}
                                disabled={!active}
                                className={`w-5 h-5 flex items-center justify-center text-[10px] font-black rounded-full transition-all ${
                                    active
                                        ? 'text-green-600 hover:text-white hover:bg-green-500 cursor-pointer'
                                        : 'text-gray-300 cursor-default'
                                }`}
                            >
                                {letter}
                            </button>
                        );
                    })}
                </div>
            )}
            </div>
            {porConfirmar && (
                <ConfirmDialog
                    title={porConfirmar.titulo}
                    message={porConfirmar.mensaje}
                    confirmLabel="Sí, enviar"
                    onConfirm={porConfirmar.hacer}
                    onClose={() => setPorConfirmar(null)}
                />
            )}
        </div>
    );
};
