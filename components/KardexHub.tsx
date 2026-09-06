
import React, { useState, useEffect } from 'react';
import { Item, Movement, Personnel, Project, InventoryType, UserRole, AuditLog, BehaviorLog, AppUser } from '../types';
import { MovementsView } from './MovementsView';
import { LoansView, LoansLens } from './LoansView';
import { InventoryView } from './InventoryView';
import { ProjectsView } from './ProjectsView';
import { ReturnToolModal } from './ReturnToolModal';

type KardexTab = 'movements' | 'loans' | 'inventory' | 'projects';

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
    /** Lente con el que abre la pestaña Préstamos: préstamo activo o consumo. */
    initialLoansLens?: LoansLens;
    onGoBack: () => void;
    // movements handlers
    openLogMovementModal: () => void;
    onDeleteMovement?: (id: string) => void;
    onReturnLoan?: (movementId: string) => void;
    // loans handlers
    onReturnItem: (movementId: string, condition?: string, notes?: string) => void;
    onMarkPendingPickup: (movementId: string, pending: boolean) => void;
    // inventory handlers
    openAddItemModal: () => void;
    onEditItem: (item: Item) => void;
    /** Guarda el ítem directo, sin abrir el modal. */
    onSaveItem?: (item: Item) => void;
    /** Crea un ítem y lo devuelve — para el accesorio que todavía no existe. */
    onCreateItem?: (item: Omit<Item, 'id'>) => Item;
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
    { id: 'movements',  label: 'Historial',  icon: '📋' },
    { id: 'loans',      label: 'Préstamos',  icon: '🔑' },
    { id: 'inventory',  label: 'Inventario', icon: '📦' },
    { id: 'projects',   label: 'Proyectos',  icon: '🏗' },
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
    initialTab = 'movements', initialInventoryType = null, initialLoansLens = 'loans',
    onGoBack, onTabChange, onBehaviorLog,
    openLogMovementModal, onDeleteMovement, onReturnLoan,
    onReturnItem, onMarkPendingPickup,
    openAddItemModal, onEditItem, onSaveItem, onCreateItem, onDeleteItem, onItemHistory, onOpenInvoiceReader,
    onAddProject, onDeleteProject, showEconomicValues = false,
}) => {
    const [activeTab, setActiveTab] = useState<KardexTab>(initialTab);
    const [invType, setInvType] = useState<InventoryType | null>(initialInventoryType);
    // Devolver desde el Historial abría nada: llamaba a la devolución directo y
    // se saltaba el estado y la revisión de accesorios.
    const [devolviendo, setDevolviendo] = useState<Movement | null>(null);

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
            <div className="bg-papel rounded-xl shadow-sm border border-papel-borde mb-1.5 overflow-hidden">
                <div className="flex">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-1 py-2 px-1 text-xs font-bold transition-all border-b-2 ${
                                activeTab === tab.id
                                    ? 'border-marca text-marca-oscuro bg-marca-suave'
                                    : 'border-transparent text-tinta-tenue hover:text-tinta-suave hover:bg-papel-hondo'
                            }`}
                        >
                            {/* En una línea, no apilados: el icono encima de la palabra
                                gastaba 106 px de las 844 que tiene el celular. */}
                            <span className="text-sm">{tab.icon}</span>
                            <span className="text-[11px] leading-none">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {activeTab === 'inventory' && (
                    <div className="flex gap-1.5 px-3 py-1.5 border-t border-papel-borde overflow-x-auto">
                        {INV_TYPES.map(t => (
                            <button
                                key={String(t.type)}
                                onClick={() => { setInvType(t.type); onBehaviorLog?.('FILTER', `Filtro inventario: ${t.label}`); }}
                                className={`flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
                                    invType === t.type
                                        ? 'bg-marca text-tinta border-marca'
                                        : 'bg-papel text-tinta-suave border-papel-borde hover:border-marca'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {devolviendo && (() => {
                const item = items.find(i => i.id === devolviendo.itemId);
                if (!item) return null;
                return (
                    <ReturnToolModal
                        item={item}
                        personName={personnel.find(p => p.id === devolviendo.personnelId)?.name ?? 'Sin asignar'}
                        movementIds={[devolviendo.id]}
                        onConfirm={(ids, condition, notes) => {
                            ids.forEach(id => onReturnItem(id, condition, notes));
                            setDevolviendo(null);
                        }}
                        onClose={() => setDevolviendo(null)}
                    />
                );
            })()}

            {activeTab === 'movements' && (
                <MovementsView
                    movements={movements}
                    items={items}
                    personnel={personnel}
                    openLogMovementModal={openLogMovementModal}
                    onDeleteMovement={onDeleteMovement}
                    onReturnLoan={onReturnLoan}
                    onReturnWithForm={setDevolviendo}
                    onItemHistory={onItemHistory}
                    onGoBack={onGoBack}
                    userRole={userRole}
                    onBehaviorLog={onBehaviorLog}
                />
            )}

            {activeTab === 'loans' && (
                <LoansView
                    onEditItem={onSaveItem}
                    onCreateItem={onCreateItem}
                    onItemHistory={onItemHistory}
                    movements={movements}
                    items={items}
                    personnel={personnel}
                    onReturnItem={onReturnItem}
                    onMarkPendingPickup={onMarkPendingPickup}
                    onGoBack={onGoBack}
                    userRole={userRole}
                    onBehaviorLog={onBehaviorLog}
                    initialLens={initialLoansLens}
                />
            )}

            {activeTab === 'inventory' && (
                <InventoryView
                    items={filteredItems}
                    movements={movements}
                    personnel={personnel}
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
        </div>
    );
};
