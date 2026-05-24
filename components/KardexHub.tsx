
import React, { useState, useEffect } from 'react';
import { Item, Movement, Personnel, Project, InventoryType, UserRole, AuditLog, BehaviorLog, AppUser } from '../types';
import { MovementsView } from './MovementsView';
import { LoansView } from './LoansView';
import { InventoryView } from './InventoryView';
import { ProjectsView } from './ProjectsView';
import { TraceabilityView } from './TraceabilityView';

type KardexTab = 'movements' | 'loans' | 'inventory' | 'projects' | 'traceability';

interface KardexHubProps {
    // data
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    projects: Project[];
    auditLogs: AuditLog[];
    behaviorLogs: BehaviorLog[];
    users: AppUser[];
    userRole: UserRole;
    initialTab?: KardexTab;
    initialInventoryType?: InventoryType | null;
    onGoBack: () => void;
    // movements handlers
    openLogMovementModal: () => void;
    onDeleteMovement?: (id: string) => void;
    onReturnLoan?: (movementId: string) => void;
    // loans handlers
    onReturnItem: (movementId: string) => void;
    onMarkPendingPickup: (movementId: string, pending: boolean) => void;
    // inventory handlers
    openAddItemModal: () => void;
    onEditItem: (item: Item) => void;
    onDeleteItem: (itemId: string) => void;
    onItemHistory: (item: Item) => void;
    onOpenInvoiceReader?: () => void;
    // project handlers
    onAddProject: (p: Omit<Project, 'id'>) => void;
    onDeleteProject?: (id: string) => void;
    showEconomicValues?: boolean;
    onTabChange?: (tab: KardexTab) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

const TABS: Array<{ id: KardexTab; label: string; icon: string }> = [
    { id: 'movements',    label: 'Historial',      icon: '📋' },
    { id: 'loans',        label: 'Préstamos',      icon: '🔑' },
    { id: 'inventory',    label: 'Inventario',     icon: '📦' },
    { id: 'projects',     label: 'Proyectos',      icon: '🏗' },
    { id: 'traceability', label: 'Trazabilidad',   icon: '🔍' },
];

const INV_TYPES: Array<{ type: InventoryType | null; label: string }> = [
    { type: null,                        label: 'Todos' },
    { type: InventoryType.HAND_TOOL,     label: '🔨 H. Manual' },
    { type: InventoryType.ELECTRICAL_TOOL, label: '⚡ H. Eléctrica' },
    { type: InventoryType.PPE,           label: '🦺 Seguridad' },
    { type: InventoryType.SINGLE_USE,    label: '📦 Consumibles' },
];

export const KardexHub: React.FC<KardexHubProps> = ({
    items, movements, personnel, projects, auditLogs, behaviorLogs, users, userRole,
    initialTab = 'movements', initialInventoryType = null,
    onGoBack, onTabChange, onBehaviorLog,
    openLogMovementModal, onDeleteMovement, onReturnLoan,
    onReturnItem, onMarkPendingPickup,
    openAddItemModal, onEditItem, onDeleteItem, onItemHistory, onOpenInvoiceReader,
    onAddProject, onDeleteProject, showEconomicValues = false,
}) => {
    const [activeTab, setActiveTab] = useState<KardexTab>(initialTab);
    const [invType, setInvType] = useState<InventoryType | null>(initialInventoryType);

    useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

    const handleTabClick = (tab: KardexTab) => {
        setActiveTab(tab);
        onTabChange?.(tab);
        const tabLabel = TABS.find(t => t.id === tab)?.label ?? tab;
        onBehaviorLog?.('NAV', `Kardex → ${tabLabel}`);
    };

    const filteredItems = invType ? items.filter(i => i.inventoryType === invType) : items;
    const categoryLabel = INV_TYPES.find(t => t.type === invType)?.label ?? 'Todos';

    return (
        <div className="flex flex-col gap-0">
            {/* Tab bar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 overflow-hidden">
                <div className="flex">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`flex-1 flex flex-col items-center py-3 px-1 text-xs font-bold transition-all border-b-2 ${
                                activeTab === tab.id
                                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <span className="text-base mb-0.5">{tab.icon}</span>
                            <span className="hidden sm:block">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {activeTab === 'inventory' && (
                    <div className="flex gap-1.5 px-3 py-2 border-t border-gray-100 overflow-x-auto">
                        {INV_TYPES.map(t => (
                            <button
                                key={String(t.type)}
                                onClick={() => { setInvType(t.type); onBehaviorLog?.('FILTER', `Filtro inventario: ${t.label}`); }}
                                className={`flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
                                    invType === t.type
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {activeTab === 'movements' && (
                <MovementsView
                    movements={movements}
                    items={items}
                    personnel={personnel}
                    openLogMovementModal={openLogMovementModal}
                    onDeleteMovement={onDeleteMovement}
                    onReturnLoan={onReturnLoan}
                    onGoBack={onGoBack}
                    userRole={userRole}
                    onBehaviorLog={onBehaviorLog}
                />
            )}

            {activeTab === 'loans' && (
                <LoansView
                    movements={movements}
                    items={items}
                    personnel={personnel}
                    onReturnItem={onReturnItem}
                    onMarkPendingPickup={onMarkPendingPickup}
                    onGoBack={onGoBack}
                    userRole={userRole}
                    onBehaviorLog={onBehaviorLog}
                />
            )}

            {activeTab === 'inventory' && (
                <InventoryView
                    items={filteredItems}
                    openAddItemModal={openAddItemModal}
                    onEditItem={onEditItem}
                    onDeleteItem={onDeleteItem}
                    onItemHistory={onItemHistory}
                    onOpenInvoiceReader={onOpenInvoiceReader}
                    userRole={userRole}
                    category={categoryLabel}
                    onGoBack={onGoBack}
                    onBehaviorLog={onBehaviorLog}
                />
            )}

            {activeTab === 'projects' && (
                <ProjectsView
                    projects={projects}
                    movements={movements}
                    items={items}
                    personnel={personnel}
                    onAddProject={onAddProject}
                    onDeleteProject={onDeleteProject}
                    onGoBack={onGoBack}
                    userRole={userRole}
                    showEconomicValues={showEconomicValues}
                    onBehaviorLog={onBehaviorLog}
                />
            )}

            {activeTab === 'traceability' && (
                <TraceabilityView
                    movements={movements}
                    items={items}
                    personnel={personnel}
                    projects={projects}
                    auditLogs={auditLogs}
                    behaviorLogs={behaviorLogs}
                    users={users}
                    onBehaviorLog={onBehaviorLog}
                />
            )}
        </div>
    );
};
