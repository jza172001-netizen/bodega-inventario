import { Movement, Item } from '../types';

function showNotification(title: string, options: NotificationOptions) {
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

export function checkAndNotifyPickup(movements: Movement[], items: Item[]) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const pending = movements.filter(m => m.isLoan && !m.isReturned && m.pendingPickup);
    if (pending.length === 0) return;

    const names = pending
        .map(m => items.find(i => i.id === m.itemId)?.name ?? 'Herramienta')
        .join(', ');

    showNotification(`📍 ${pending.length} herramienta${pending.length > 1 ? 's' : ''} por recoger`, {
        body: names,
        icon: '/vite.svg',
        tag: '__pickup__',
    });
}
