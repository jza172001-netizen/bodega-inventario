import React, { useMemo } from 'react';
import { Item, Movement, Personnel } from '../types';
import StatisticsView from './StatisticsView';

interface DashboardProps {
    items: Item[];
    movements: Movement[];
    personnel?: Personnel[];
}

export const Dashboard: React.FC<DashboardProps> = ({ items, movements, personnel = [] }) => {
    const alerts = useMemo(() => {
        const daysElapsed = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
        const depleted = items.filter(i => i.quantity === 0 && i.minStock > 0).length;
        const lowStock = items.filter(i => i.quantity > 0 && i.quantity <= i.minStock && i.minStock > 0).length;
        const overdueLoans = movements.filter(m => m.isLoan && !m.isReturned && daysElapsed(m.timestamp) > 7).length;
        return { depleted, lowStock, overdueLoans };
    }, [items, movements]);

    const hasAlerts = alerts.depleted > 0 || alerts.lowStock > 0 || alerts.overdueLoans > 0;

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
                    </div>
                </div>
            )}

            <StatisticsView items={items} movements={movements} personnel={personnel} />
        </div>
    );
};
