/**
 * storage.ts — Persistencia automática local
 * ==========================================
 * Guarda todos los datos en localStorage cada vez que cambian.
 * Al abrir la app, carga automáticamente los datos guardados.
 * También permite exportar/importar como archivo JSON local.
 */

import { Item, Movement, Personnel, PurchaseOrder, Project, AppUser, AuditLog } from './types';

const STORAGE_KEY = 'warehouse_inventory_pro_data';
const STORAGE_VERSION = '3.0';

export interface AppData {
    version: string;
    savedAt: string;
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    purchaseOrders: PurchaseOrder[];
    projects: Project[];
    users: AppUser[];
    auditLogs?: AuditLog[];
}

// ── AUTO-SAVE: guarda en localStorage ──────────────────────
export function saveToLocalStorage(data: Omit<AppData, 'version' | 'savedAt'>): void {
    try {
        const payload: AppData = {
            version: STORAGE_VERSION,
            savedAt: new Date().toISOString(),
            ...data,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('Error guardando en localStorage:', e);
    }
}

// ── AUTO-LOAD: carga desde localStorage al iniciar ─────────
export function loadFromLocalStorage(): Partial<AppData> | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw) as AppData;
        if (data.version !== STORAGE_VERSION) return null;
        // Restaurar fechas (JSON serializa Date como string)
        data.movements = data.movements.map(m => ({
            ...m,
            timestamp: new Date(m.timestamp),
        }));
        data.purchaseOrders = data.purchaseOrders.map(po => ({
            ...po,
            orderDate: new Date(po.orderDate),
            expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : undefined,
            receivedDate: po.receivedDate ? new Date(po.receivedDate) : undefined,
        }));
        if (data.auditLogs) {
            data.auditLogs = data.auditLogs.map(l => ({ ...l, timestamp: new Date(l.timestamp) }));
        }
        return data;
    } catch (e) {
        console.warn('Error cargando desde localStorage:', e);
        return null;
    }
}

// ── EXPORT: descarga archivo JSON ──────────────────────────
export function exportToFile(data: Omit<AppData, 'version' | 'savedAt'>): void {
    const payload: AppData = {
        version: STORAGE_VERSION,
        savedAt: new Date().toISOString(),
        ...data,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fecha = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `bodega_backup_${fecha}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── IMPORT: carga desde archivo JSON seleccionado ──────────
export function importFromFile(
    e: React.ChangeEvent<HTMLInputElement>,
    onSuccess: (data: AppData) => void,
    onError?: (msg: string) => void
): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target?.result as string) as AppData;
            // Restaurar fechas
            data.movements = (data.movements || []).map(m => ({
                ...m,
                timestamp: new Date(m.timestamp),
            }));
            data.purchaseOrders = (data.purchaseOrders || []).map(po => ({
                ...po,
                orderDate: new Date(po.orderDate),
                expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : undefined,
                receivedDate: po.receivedDate ? new Date(po.receivedDate) : undefined,
            }));
            if (data.auditLogs) {
                data.auditLogs = data.auditLogs.map(l => ({ ...l, timestamp: new Date(l.timestamp) }));
            }
            onSuccess(data);
        } catch {
            onError?.('Archivo inválido. Asegúrate de importar un JSON exportado desde esta app.');
        }
    };
    reader.readAsText(file);
    // Reset input para permitir reimportar el mismo archivo
    e.target.value = '';
}

// ── CLEAR: borra localStorage ──────────────────────────────
export function clearLocalStorage(): void {
    localStorage.removeItem(STORAGE_KEY);
}
