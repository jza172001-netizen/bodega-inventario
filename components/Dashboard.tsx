import React, { useMemo } from 'react';
import { Item, Movement, Personnel, PurchaseOrder, PurchaseOrderStatus } from '../types';
import StatisticsView from './StatisticsView';
import { WhatsAppRemindersPanel } from './WhatsAppRemindersPanel';

interface DashboardProps {
    items: Item[];
    movements: Movement[];
    purchaseOrders: PurchaseOrder[];
    personnel?: Personnel[];
    onNavigate?: (view: string, tab?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ items, movements, purchaseOrders, personnel = [], onNavigate }) => {
    const alerts = useMemo(() => {
        const daysElapsed = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
        const depleted = items.filter(i => i.quantity === 0 && i.minStock > 0).length;
        const lowStock = items.filter(i => i.quantity > 0 && i.quantity <= i.minStock && i.minStock > 0).length;
        const overdueLoans = movements.filter(m => m.isLoan && !m.isReturned && daysElapsed(m.timestamp) > 7).length;
        const pendingOrders = purchaseOrders.filter(o =>
            o.status === PurchaseOrderStatus.ORDERED || o.status === PurchaseOrderStatus.SHIPPED
        ).length;
        const pendingPickup = movements.filter(m => m.isLoan && !m.isReturned && m.pendingPickup).length;
        return { depleted, lowStock, overdueLoans, pendingOrders, pendingPickup };
    }, [items, movements, purchaseOrders]);

    const hasAlerts = alerts.depleted > 0 || alerts.lowStock > 0 || alerts.overdueLoans > 0 || alerts.pendingOrders > 0 || alerts.pendingPickup > 0;

    return (
        <div className="space-y-6">
            {hasAlerts && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Alertas activas</p>
                    <div className="flex flex-wrap gap-2">
                        {alerts.depleted > 0 && (
                            <button onClick={() => onNavigate?.('kardex', 'inventory')} className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors cursor-pointer">
                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                                {alerts.depleted} ítem{alerts.depleted > 1 ? 's' : ''} agotado{alerts.depleted > 1 ? 's' : ''} →
                            </button>
                        )}
                        {alerts.lowStock > 0 && (
                            <button onClick={() => onNavigate?.('kardex', 'inventory')} className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-orange-100 transition-colors cursor-pointer">
                                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>
                                {alerts.lowStock} bajo stock mínimo →
                            </button>
                        )}
                        {alerts.overdueLoans > 0 && (
                            <button onClick={() => onNavigate?.('kardex', 'loans')} className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-yellow-100 transition-colors cursor-pointer">
                                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span>
                                {alerts.overdueLoans} préstamo{alerts.overdueLoans > 1 ? 's' : ''} vencido{alerts.overdueLoans > 1 ? 's' : ''} (+7d) →
                            </button>
                        )}
                        {alerts.pendingPickup > 0 && (
                            <button onClick={() => onNavigate?.('pickup')} className="flex items-center gap-1.5 bg-orange-50 border border-orange-300 text-orange-700 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-orange-100 transition-colors cursor-pointer">
                                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block animate-pulse"></span>
                                📍 {alerts.pendingPickup} herramienta{alerts.pendingPickup > 1 ? 's' : ''} a recoger →
                            </button>
                        )}
                    </div>
                </div>
            )}

            <WhatsAppRemindersPanel movements={movements} items={items} personnel={personnel} />

            <StatisticsView items={items} movements={movements} personnel={personnel} onNavigate={onNavigate} />
        </div>
    );
};
