import React, { useState } from 'react';
import { Item, Movement } from '../types';
import StatisticsView from './StatisticsView';
import { ReportView } from './ReportView';
import { StatisticsIcon } from './icons/StatisticsIcon';
import { ReportsIcon } from './icons/ReportsIcon';

interface DashboardProps {
    items: Item[];
    movements: Movement[];
}

type DashboardTab = 'statistics' | 'reports';

export const Dashboard: React.FC<DashboardProps> = ({ items, movements }) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('statistics');

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
                        label="Reporte General IA"
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