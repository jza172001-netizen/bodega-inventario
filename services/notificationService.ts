import { Movement, Item, Personnel } from '../types';

const NOTIF_LOG_KEY = 'bodega_notif_log'; // { [movementId]: lastNotifiedTimestamp }

function getLog(): Record<string, number> {
    try { return JSON.parse(localStorage.getItem(NOTIF_LOG_KEY) ?? '{}'); } catch { return {}; }
}
function saveLog(log: Record<string, number>) {
    localStorage.setItem(NOTIF_LOG_KEY, JSON.stringify(log));
}

export async function requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

export function checkAndNotifyOverdueLoans(
    movements: Movement[],
    items: Item[],
    personnel: Personnel[]
) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = Date.now();
    const log = getLog();

    const activeLoans = movements.filter(m => m.isLoan && !m.isReturned);

    for (const loan of activeLoans) {
        const daysOut = Math.floor((now - new Date(loan.timestamp).getTime()) / 86400000);
        if (daysOut < 14) continue;

        const lastNotified = log[loan.id] ?? 0;
        const daysSinceNotified = Math.floor((now - lastNotified) / 86400000);

        // Primera notif a las 2 semanas; luego cada semana
        const shouldNotify = lastNotified === 0 || daysSinceNotified >= 7;
        if (!shouldNotify) continue;

        const itemName = items.find(i => i.id === loan.itemId)?.name ?? 'Herramienta';
        const workerName = personnel.find(p => p.id === loan.personnelId)?.name ?? 'Sin asignar';

        new Notification('⚠️ Herramienta sin devolver — Bodega Pro', {
            body: `${itemName} lleva ${daysOut} días con ${workerName}. Recordar devolución.`,
            icon: '/vite.svg',
            tag: loan.id,
        });

        log[loan.id] = now;
    }

    // Notificar herramientas pendientes de recoger
    const pendingPickup = activeLoans.filter(m => m.pendingPickup);
    if (pendingPickup.length > 0) {
        const lastPickupNotif = log['__pickup__'] ?? 0;
        if (Date.now() - lastPickupNotif > 86400000) { // una vez por día
            const names = pendingPickup
                .map(m => items.find(i => i.id === m.itemId)?.name ?? 'Herramienta')
                .join(', ');
            new Notification('📍 Herramientas pendientes de recoger — Bodega Pro', {
                body: `${pendingPickup.length} herramienta(s) marcadas para recoger: ${names}`,
                icon: '/vite.svg',
                tag: '__pickup__',
            });
            log['__pickup__'] = Date.now();
        }
    }

    saveLog(log);
}
