
export const REMINDER_LOG_KEY = 'bodega_wa_reminders';
export const REMINDER_INTERVAL_DAYS = 8;
export const TEST_PHONE = '573113866341';
export const TEST_PHONE_DISPLAY = '+57 311 386 6341';

export type ReminderLog = Record<string, string>; // movementId → ISO timestamp

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

export const buildLoanReminderUrl = (
    phone: string,
    personName: string,
    itemName: string,
    days: number
): string => {
    const text = encodeURIComponent(
        `Hola ${personName} 👋, te recordamos que tienes en préstamo de la bodega de Grupo Montecielo:\n\n` +
        `*${itemName}* — llevas ${days} día${days !== 1 ? 's' : ''} con eso.\n\n` +
        `📸 Por favor envíanos una foto del estado actual de la herramienta y coordina su devolución.\n\n` +
        `Gracias 🙏`
    );
    return `https://wa.me/${formatPhone(phone)}?text=${text}`;
};

export const buildPersonReminderUrl = (
    phone: string,
    personName: string,
    loanLines: string[]
): string => {
    const list = loanLines.join('\n');
    const text = encodeURIComponent(
        `Hola ${personName} 👋, tienes estos elementos en préstamo de la bodega de Grupo Montecielo:\n\n` +
        `${list}\n\n` +
        `📸 Por favor envíanos una foto del estado de cada herramienta y coordina su devolución.\n\n` +
        `Gracias 🙏`
    );
    return `https://wa.me/${formatPhone(phone)}?text=${text}`;
};

export const buildTestReminderUrl = (): string => {
    const text = encodeURIComponent(
        `✅ *Prueba — Bodega Grupo Montecielo*\n\n` +
        `El sistema de recordatorios WhatsApp está funcionando correctamente.\n` +
        `Este mensaje fue generado automáticamente desde la app de inventario.`
    );
    return `https://wa.me/${TEST_PHONE}?text=${text}`;
};
