import React, { useState, useMemo } from 'react';
import { Item, Movement, PurchaseOrder, PurchaseOrderStatus } from '../types';
import StatisticsView from './StatisticsView';
import { ReportView } from './ReportView';
import { StatisticsIcon } from './icons/StatisticsIcon';
import { ReportsIcon } from './icons/ReportsIcon';

interface DashboardProps {
    items: Item[];
    movements: Movement[];
    purchaseOrders: PurchaseOrder[];
}

type DashboardTab = 'statistics' | 'reports';

export const Dashboard: React.FC<DashboardProps> = ({ items, movements, purchaseOrders }) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('statistics');

    const alerts = useMemo(() => {
        const daysElapsed = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
        const depleted = items.filter(i => i.quantity === 0 && i.minStock > 0).length;
        const lowStock = items.filter(i => i.quantity > 0 && i.quantity <= i.minStock && i.minStock > 0).length;
        const overdueLoans = movements.filter(m => m.isLoan && !m.isReturned && daysElapsed(m.timestamp) > 7).length;
        const pendingOrders = purchaseOrders.filter(o =>
            o.status === PurchaseOrderStatus.ORDERED || o.status === PurchaseOrderStatus.SHIPPED
        ).length;
        return { depleted, lowStock, overdueLoans, pendingOrders };
    }, [items, movements, purchaseOrders]);

    const hasAlerts = alerts.depleted > 0 || alerts.lowStock > 0 || alerts.overdueLoans > 0 || alerts.pendingOrders > 0;

    const TabButton: React.FC<{
        label: string;
        icon: React.ElementType;
        isActive: boolean;
        onClick: () => void;
    }> = ({ label, icon: Icon, isActive, onClick }) => (
        <button
            onClick={onClick}
            className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
        </button>
    );

    return (
        <div className="space-y-6">
            {hasAlerts && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Alertas activas</p>
                    <div className="flex flex-wrap gap-2">
                        {alerts.depleted > 0 && (
                            <span className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                                {alerts.depleted} ítem{alerts.depleted > 1 ? 's' : ''} agotado{alerts.depleted > 1 ? 's' : ''}
                            </span>
                        )}
                        {alerts.lowStock > 0 && (
                            <span className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold px-3 py-1.5 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>
                                {alerts.lowStock} bajo stock mínimo
                            </span>
                        )}
                        {alerts.overdueLoans > 0 && (
                            <span className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-bold px-3 py-1.5 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span>
                                {alerts.overdueLoans} préstamo{alerts.overdueLoans > 1 ? 's' : ''} vencido{alerts.overdueLoans > 1 ? 's' : ''} (+7d)
                            </span>
                        )}
                        {alerts.pendingOrders > 0 && (
                            <span className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                                {alerts.pendingOrders} orden{alerts.pendingOrders > 1 ? 'es' : ''} de compra pendiente{alerts.pendingOrders > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-white p-4 rounded-xl shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <h1 className="text-2xl font-bold text-gray-800 mb-3 sm:mb-0">
                    Dashboard de Análisis
                </h1>
                <div className="flex space-x-2 bg-gray-200/60 p-1 rounded-lg">
                    <TabButton
                        label="Estadísticas y KPIs"
                        icon={StatisticsIcon}
                        isActive={activeTab === 'statistics'}
                        onClick={() => setActiveTab('statistics')}
                    />
                    <TabButton
                        label="Reporte General"
                        icon={ReportsIcon}
                        isActive={activeTab === 'reports'}
                        onClick={() => setActiveTab('reports')}
                    />
                </div>
            </div>

            <div>
                {activeTab === 'statistics' && <StatisticsView items={items} movements={movements} />}
                {activeTab === 'reports' && <ReportView items={items} movements={movements} />}
            </div>
        </div>
    );
};
