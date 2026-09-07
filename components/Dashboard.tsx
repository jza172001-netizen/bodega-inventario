import React, { useMemo } from 'react';
import { AuditLog, Item, Movement, Personnel, PurchaseOrder, PurchaseOrderStatus, UserRole } from '../types';
import StatisticsView from './StatisticsView';
import { CotejoPanel } from './CotejoPanel';

interface DashboardProps {
    items: Item[];
    movements: Movement[];
    purchaseOrders: PurchaseOrder[];
    personnel?: Personnel[];
    auditLogs?: AuditLog[];
    onNavigate?: (view: string, tab?: string) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
    onAuditLog?: (action: string, description: string) => void;
    /** Para que el cotejo sepa si quien mira puede marcar o solo leer. */
    userRole?: UserRole;
}

/** Un renglón de «esto hay que hacerlo hoy». */
interface Pendiente {
    clave: string;
    icono: string;
    texto: string;
    urgente: boolean;
    ir: () => void;
}

/**
 * Lo primero que se ve al abrir la app.
 *
 * Antes abría con una tarjeta titulada «ALERTAS ACTIVAS» que contenía una sola
 * pastilla, después el botón de exportar suelto en mitad del camino, y luego
 * tres tarjetas de KPI cada una con su propio idioma de color: etiqueta azul,
 * etiqueta verde, tarjeta amarilla. Tres lenguajes en la primera pantalla.
 *
 * Juli lo escogió así: primero lo que hay que hacer hoy. Cada cosa es un
 * renglón que se toca y lleva al sitio — no una tarjeta con título.
 *
 * Y cuando no hay nada pendiente NO arranca en blanco, que es el riesgo de
 * poner los pendientes primero: sale un renglón tranquilo y los números suben
 * a ocupar ese lugar.
 */
export const Dashboard: React.FC<DashboardProps> = ({ items, movements, purchaseOrders, personnel = [], auditLogs = [], onNavigate, onBehaviorLog, onAuditLog, userRole }) => {
    const pendientes = useMemo<Pendiente[]>(() => {
        const dias = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
        const fuera = movements.filter(m => m.isLoan && !m.isReturned);
        const aRecoger = fuera.filter(m => m.pendingPickup).length;
        const vencidos = fuera.filter(m => dias(m.timestamp) > 7).length;
        const pedidos  = purchaseOrders.filter(o =>
            o.status === PurchaseOrderStatus.ORDERED || o.status === PurchaseOrderStatus.SHIPPED).length;
        const agotados = items.filter(i => i.minStock > 0 && i.quantity <= 0).length;
        const bajos    = items.filter(i => i.minStock > 0 && i.quantity > 0 && i.quantity <= i.minStock).length;

        const l: Pendiente[] = [];
        const anota = (clave: string, icono: string, texto: string, urgente: boolean, ir: () => void) =>
            l.push({ clave, icono, texto, urgente, ir });

        if (aRecoger > 0) anota('recoger', '📍',
            `${aRecoger} herramienta${aRecoger > 1 ? 's' : ''} por recoger`, true,
            () => onNavigate?.('pickup'));

        /**
         * Marcadas para recoger, y a esa persona nadie le ha escrito.
         *
         * En la bitácora de producción: 16 veces se marcó algo «a recoger» y una
         * sola vez se avisó. Dos WhatsApp en tres meses. La función servía hasta
         * la mitad — marcar — y ahí se quedaba, porque nada volvía a acordarse.
         *
         * El cruce es por persona y por fecha: se busca el último WhatsApp que
         * se le mandó a quien tiene la herramienta, y se compara contra cuándo
         * se marcó (que es cuando el movimiento se tocó por última vez). Si el
         * aviso es más viejo que la marca, o no hay aviso, todavía falta.
         */
        const avisadoEl = (nombre: string): number => {
            let ultimo = 0;
            for (const l of auditLogs) {
                if (l.action !== 'WHATSAPP_SENT') continue;
                if (!l.description?.includes(nombre)) continue;
                const t = new Date(l.timestamp).getTime();
                if (t > ultimo) ultimo = t;
            }
            return ultimo;
        };
        const sinAvisar = fuera.filter(m => {
            if (!m.pendingPickup) return false;
            const quien = personnel.find(p => p.id === m.personnelId);
            if (!quien) return true;          // sin dueño conocido, nadie le avisó
            const marcadoEl = new Date(m.updatedAt ?? m.timestamp).getTime();
            return avisadoEl(quien.name) < marcadoEl;
        });
        if (sinAvisar.length > 0) {
            const masViejo = Math.max(...sinAvisar.map(m => dias(m.updatedAt ?? m.timestamp)));
            // Corto a propósito: en un celular de 390 px el renglón se corta con
            // puntos suspensivos y se pierde justo el final, que es el dato.
            anota('sin-avisar', '📵',
                `${sinAvisar.length} sin avisar${masViejo > 0 ? ` · ${masViejo}d` : ''}`,
                true,
                () => onNavigate?.('whatsapp'));
        }
        if (vencidos > 0) anota('vencidos', '⏰',
            `${vencidos} préstamo${vencidos > 1 ? 's' : ''} de más de una semana`, true,
            () => onNavigate?.('kardex', 'loans'));
        if (agotados > 0) anota('agotados', '📦',
            `${agotados} ítem${agotados > 1 ? 's' : ''} agotado${agotados > 1 ? 's' : ''}`, true,
            () => onNavigate?.('kardex', 'inventory'));
        if (bajos > 0) anota('bajos', '📉',
            `${bajos} por debajo del mínimo`, false,
            () => onNavigate?.('kardex', 'inventory'));
        if (pedidos > 0) anota('pedidos', '🚚',
            `${pedidos} orden${pedidos > 1 ? 'es' : ''} de compra en camino`, false,
            () => onNavigate?.('kardex'));
        return l;
    }, [items, movements, purchaseOrders, onNavigate]);

    return (
        <div className="space-y-2 md:space-y-4">
            {pendientes.length > 0 ? (
                <div className="bg-papel border border-papel-borde rounded-xl overflow-hidden divide-y divide-papel-borde">
                    {pendientes.map(p => (
                        <button key={p.clave}
                            onClick={() => { onBehaviorLog?.('BUTTON', `Pendiente: ${p.texto}`); p.ir(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-papel-hondo active:bg-marca-suave transition-colors">
                            <span className="text-base leading-none flex-shrink-0">{p.icono}</span>
                            <span className={`flex-1 min-w-0 truncate text-sm font-bold ${p.urgente ? 'text-tinta' : 'text-tinta-suave'}`}>
                                {p.texto}
                            </span>
                            {p.urgente && <span className="w-2 h-2 rounded-full bg-marca flex-shrink-0" />}
                            <span className="text-tinta-tenue text-sm flex-shrink-0">›</span>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bien-suave border border-bien/30">
                    <span className="text-base leading-none">✅</span>
                    <p className="text-sm font-bold text-bien">Todo al día — nada pendiente</p>
                </div>
            )}

            <StatisticsView items={items} movements={movements} personnel={personnel} onNavigate={onNavigate} onAuditLog={onAuditLog} />

            {/* El cotejo, al final del Resumen. Estaba solo dentro de Trazabilidad,
                donde hay que acordarse de entrar. Él lo pidió acá y acá va. */}
            <div className="pt-1">
                <CotejoPanel items={items} movements={movements} personnel={personnel}
                    auditLogs={auditLogs} onAuditLog={onAuditLog} userRole={userRole} />
            </div>
        </div>
    );
};
