
import { Movement, Item, Personnel, InventoryType, MovementType } from '../types';

export const REMINDER_LOG_KEY = 'bodega_wa_reminders';
export const REMINDER_INTERVAL_DAYS = 8;
export const TEST_PHONE = '573113866341';
export const TEST_PHONE_DISPLAY = '+57 311 386 6341';
export const MELLO_PHONE = '573113866341'; // número de Camilo — actualizar cuando lo tengas
export const MELLO_NAME = 'Camilo';

export type ReminderLog = Record<string, string>; // movementId → ISO timestamp

export interface ReminderGroup {
    emoji: string;
    label: string;
    items: string[];
}

export const loadReminderLog = (): ReminderLog => {
    try { return JSON.parse(localStorage.getItem(REMINDER_LOG_KEY) || '{}'); } catch { return {}; }
};

export const saveReminderLog = (log: ReminderLog): void => {
    try { localStorage.setItem(REMINDER_LOG_KEY, JSON.stringify(log)); } catch {}
};

export const recordReminders = (movementIds: string[]): ReminderLog => {
    const log = loadReminderLog();
    const ts = new Date().toISOString();
    movementIds.forEach(id => { log[id] = ts; });
    saveReminderLog(log);
    return { ...log };
};

export const daysSince = (date: Date | string): number =>
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000);

export const isDueForReminder = (movementId: string, loanDate: Date | string, log: ReminderLog): boolean => {
    if (daysSince(loanDate) < REMINDER_INTERVAL_DAYS) return false;
    const last = log[movementId];
    if (!last) return true;
    return daysSince(last) >= REMINDER_INTERVAL_DAYS;
};

const formatPhone = (phone: string): string => {
    const raw = phone.replace(/\D/g, '');
    return raw.startsWith('57') ? raw : `57${raw}`;
};

/**
 * Qué se le reporta al trabajador. Un préstamo y un consumo son mensajes
 * distintos porque son lógicas distintas: al préstamo se le pide devolución,
 * al consumo se le pide cuenta de en qué se usó. Antes se mandaban siempre los
 * tres bloques juntos, así que tocar "📦 Consumibles" igual le enviaba a la
 * persona el listado de herramientas.
 */
export type ReminderKind = 'loan' | 'consumo' | 'all';

/** Builds categorized reminder groups for a person: loans by type + recent consumable/EPP usage. */
export const buildPersonGroups = (
    person: Personnel,
    movements: Movement[],
    items: Item[],
    windowDays = 7,
    kind: ReminderKind = 'all'
): ReminderGroup[] => {
    const itemMap = new Map(items.map(i => [i.id, i]));
    const sevenDaysAgo = new Date(Date.now() - windowDays * 86400000);

    const activeLoans = movements.filter(
        m => m.personnelId === person.id && m.isLoan && !m.isReturned
    );

    const recentCheckouts = movements.filter(
        m => m.personnelId === person.id &&
             m.type === MovementType.CHECK_OUT &&
             !m.isLoan &&
             new Date(m.timestamp) > sevenDaysAgo
    );

    // Aggregate recent non-loan checkouts by item
    const checkoutTotals = new Map<string, number>();
    recentCheckouts.forEach(m => {
        checkoutTotals.set(m.itemId, (checkoutTotals.get(m.itemId) ?? 0) + m.quantity);
    });

    const loanGroup = (type: InventoryType): string[] =>
        activeLoans
            .filter(m => itemMap.get(m.itemId)?.inventoryType === type)
            .map(m => {
                const item = itemMap.get(m.itemId);
                const days = daysSince(m.timestamp);
                // Con la cantidad: si se llevó 2 martillos, el mensaje debe pedir 2.
                const qty = m.quantity > 1 ? ` x${m.quantity}` : '';
                return `${item?.name ?? 'Herramienta'}${qty} — ${days} día${days !== 1 ? 's' : ''}`;
            });

    const consumableLines = [...checkoutTotals.entries()]
        .filter(([id]) => {
            const inv = itemMap.get(id)?.inventoryType;
            return inv === InventoryType.SINGLE_USE || inv === InventoryType.PPE;
        })
        .map(([id, qty]) => {
            const item = itemMap.get(id);
            return `${qty} ${item?.unit ?? 'und'} de ${item?.name ?? 'consumible'}`;
        });

    const consumableLabel = windowDays <= 7 ? 'Consumibles y EPP esta semana' : 'Consumibles y EPP este mes';

    const groups: ReminderGroup[] = [];
    if (kind === 'loan' || kind === 'all') {
        groups.push(
            { emoji: '🔨', label: 'Herramientas manuales (devolver)',   items: loanGroup(InventoryType.HAND_TOOL) },
            { emoji: '⚡', label: 'Herramientas eléctricas (devolver)', items: loanGroup(InventoryType.ELECTRICAL_TOOL) },
        );
    }
    if (kind === 'consumo' || kind === 'all') {
        groups.push({ emoji: '📦', label: consumableLabel, items: consumableLines });
    }
    return groups;
};

/** Cierre del mensaje según lo que se está reportando. */
const CLOSING: Record<ReminderKind, string> = {
    loan:    '📸 Envíanos una foto del estado de las herramientas y coordina la devolución.',
    consumo: '¿En qué se usaron estos materiales? Cuéntanos para cuadrar el consumo de la obra.',
    all:     '📸 Envíanos una foto del estado de las herramientas y coordina la devolución.',
};

/** Builds the wa.me URL for a person using categorized groups. */
export const buildPersonReminderUrl = (
    phone: string,
    personName: string,
    groups: ReminderGroup[],
    kind: ReminderKind = 'all'
): string => {
    const nonempty = groups.filter(g => g.items.length > 0);
    if (nonempty.length === 0) return `https://wa.me/${formatPhone(phone)}`;
    const body = nonempty
        .map(g => `${g.emoji} *${g.label}:*\n${g.items.map(i => `• ${i}`).join('\n')}`)
        .join('\n\n');
    const text = encodeURIComponent(
        `Hola ${personName} 👋, aquí tu resumen de la bodega de Grupo Montecielo:\n\n` +
        `${body}\n\n` +
        `${CLOSING[kind]}\n\n` +
        `Gracias 🙏`
    );
    return `https://wa.me/${formatPhone(phone)}?text=${text}`;
};

/** Mensaje consolidado con todos los ítems pendientes de recoger, enviado al destinatario elegido. */
export const buildConsolidatedPickupUrl = (
    loans: { itemName: string; qty: number; workerName: string; projectName?: string }[],
    recipientPhone: string,
    recipientName: string
): string => {
    const lines = loans.map(l => {
        const proj = l.projectName ? ` (${l.projectName})` : '';
        return `• ${l.itemName} x${l.qty} — con ${l.workerName}${proj}`;
    });
    const text = encodeURIComponent(
        `📍 *Herramientas a recoger — Bodega Grupo Montecielo*\n\n` +
        `Hola ${recipientName} 👋, estas herramientas están pendientes de recogida:\n\n` +
        `${lines.join('\n')}\n\n` +
        `Por favor pásalas a buscar cuando puedas. Gracias 🙏`
    );
    return `https://wa.me/${formatPhone(recipientPhone)}?text=${text}`;
};

export const buildTestReminderUrl = (): string => {
    const text = encodeURIComponent(
        `✅ *Prueba — Bodega Grupo Montecielo*\n\n` +
        `El sistema de recordatorios WhatsApp está funcionando correctamente.\n` +
        `Este mensaje fue generado desde la app de inventario.`
    );
    return `https://wa.me/${TEST_PHONE}?text=${text}`;
};
