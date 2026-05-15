import { Movement, Item, Personnel, InventoryType } from '../types';

const NOTIF_LOG_KEY = 'bodega_notif_log'; // { [movementId]: lastNotifiedTimestamp }

function getLog(): Record<string, number> {
    try { return JSON.parse(localStorage.getItem(NOTIF_LOG_KEY) ?? '{}'); } catch { return {}; }
}
function saveLog(log: Record<string, number>) {
    localStorage.setItem(NOTIF_LOG_KEY, JSON.stringify(log));
}

function showNotification(title: string, options: NotificationOptions) {
    // new Notification() throws on mobile Chrome — must use ServiceWorker instead
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready
            .then(sw => sw.showNotification(title, options))
            .catch(() => {});
    } else {
        try { new Notification(title, options); } catch { /* not supported */ }
    }
}

export async function requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
        const result = await Notification.requestPermission();
        return result === 'granted';
    } catch {
        return false;
    }
}

export function checkAndNotifyOverdueLoans(
    movements: Movement[],
    items: Item[],
    personnel: Personnel[]
) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = Date.now();
    const log = getLog();
    const dayOfWeek = new Date().getDay(); // 0=Sunday, 6=Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const activeLoans = movements.filter(m => m.isLoan && !m.isReturned);

    // Only electrical tool loans get overdue notifications
    const electricalLoans = activeLoans.filter(loan => {
        const item = items.find(i => i.id === loan.itemId);
        return item?.inventoryType === InventoryType.ELECTRICAL_TOOL;
    });

    for (const loan of electricalLoans) {
        const daysOut = Math.floor((now - new Date(loan.timestamp).getTime()) / 86400000);
        const lastNotified = log[loan.id] ?? 0;
        const daysSinceNotified = Math.floor((now - lastNotified) / 86400000);

        const shouldNotify = isWeekend
            ? (lastNotified === 0 || daysSinceNotified >= 1)
            : daysOut >= 14 && (lastNotified === 0 || daysSinceNotified >= 7);

        if (!shouldNotify) continue;

        const itemName = items.find(i => i.id === loan.itemId)?.name ?? 'Herramienta';
        const workerName = personnel.find(p => p.id === loan.personnelId)?.name ?? 'Sin asignar';

        const title = isWeekend
            ? '🔄 Devolver herramienta hoy — Bodega Pro'
            : '⚠️ Herramienta sin devolver — Bodega Pro';

        showNotification(title, {
            body: `${itemName} lleva ${daysOut} días con ${workerName}. ${isWeekend ? 'Recuerda traerla hoy.' : 'Recordar devolución.'}`,
            icon: '/vite.svg',
            tag: loan.id,
        });

        log[loan.id] = now;
    }

    // Pending pickup notifications (all types, once per day)
    const pendingPickup = activeLoans.filter(m => m.pendingPickup);
    if (pendingPickup.length > 0) {
        const lastPickupNotif = log['__pickup__'] ?? 0;
        if (Date.now() - lastPickupNotif > 86400000) {
            const names = pendingPickup
                .map(m => items.find(i => i.id === m.itemId)?.name ?? 'Herramienta')
                .join(', ');
            showNotification('📍 Herramientas pendientes de recoger — Bodega Pro', {
                body: `${pendingPickup.length} herramienta(s) marcadas para recoger: ${names}`,
                icon: '/vite.svg',
                tag: '__pickup__',
            });
            log['__pickup__'] = Date.now();
        }
    }

    saveLog(log);
}
