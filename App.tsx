
import React, { useState, useEffect, useCallback } from 'react';
import { AddItemModal } from './components/AddItemModal';
import { EditItemModal } from './components/EditItemModal';
import { Dashboard } from './components/Dashboard';
import { Header } from './components/Header';
import { InventoryView } from './components/InventoryView';
import { LogMovementModal } from './components/LogMovementModal';
import { MovementsView } from './components/MovementsView';
import { AddPersonnelModal } from './components/AddPersonnelModal';
import { PersonnelView } from './components/PersonnelView';
import { AddPurchaseOrderModal } from './components/AddPurchaseOrderModal';
import { PurchaseOrdersView } from './components/PurchaseOrdersView';
import { ProjectsView } from './components/ProjectsView';
import { LoansView } from './components/LoansView';
import { ItemHistoryModal } from './components/ItemHistoryModal';
import { UserManagementModal } from './components/UserManagementModal';
import CopilotView from './components/CopilotView';

import { Item, Movement, MovementType, Personnel, PurchaseOrder, UserRole, InventoryType, Project, AppUser, PurchaseOrderStatus } from './types';
import { LoginView } from './components/LoginView';
import { exportToFile, importFromFile } from './storage';
import * as db from './services/supabaseService';

// Icons
import { DashboardIcon } from './components/icons/DashboardIcon';
import { MovementsIcon } from './components/icons/MovementsIcon';
import { PersonnelIcon } from './components/icons/PersonnelIcon';
import { PurchaseOrdersIcon } from './components/icons/PurchaseOrdersIcon';
import { HandToolIcon } from './components/icons/HandToolIcon';
import { ElectricalToolIcon } from './components/icons/ElectricalToolIcon';
import { PpeIcon } from './components/icons/PpeIcon';
import { SingleUseIcon } from './components/icons/SingleUseIcon';
import { HardHatIcon } from './components/icons/HardHatIcon';
import { ClockIcon } from './components/icons/ClockIcon';
import { BrainIcon } from './components/icons/BrainIcon';

type View = 'dashboard' | 'inventory' | 'movements' | 'purchaseOrders' | 'personnel' | 'projects' | 'loans' | 'copilot';

const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userRole, setUserRole] = useState<UserRole>(UserRole.OWNER);
    const [isLoading, setIsLoading] = useState(true);

    const [users, setUsers] = useState<AppUser[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [personnel, setPersonnel] = useState<Personnel[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);

    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [selectedInventoryType, setSelectedInventoryType] = useState<InventoryType | null>(null);
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    const [isAddItemModalOpen, setAddItemModalOpen] = useState(false);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
    const [isLogMovementModalOpen, setLogMovementModalOpen] = useState(false);
    const [isAddPersonnelModalOpen, setAddPersonnelModalOpen] = useState(false);
    const [isAddPOModalOpen, setAddPOModalOpen] = useState(false);
    const [isUserManagementOpen, setUserManagementOpen] = useState(false);
    const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
    const [itemForHistory, setItemForHistory] = useState<Item | null>(null);

    // Carga inicial desde Supabase
    const loadAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [fetchedItems, fetchedMovements, fetchedPersonnel, fetchedOrders, fetchedProjects, fetchedUsers] =
                await Promise.all([
                    db.fetchItems(),
                    db.fetchMovements(),
                    db.fetchPersonnel(),
                    db.fetchPurchaseOrders(),
                    db.fetchProjects(),
                    db.fetchUsers(),
                ]);
            setItems(fetchedItems);
            setMovements(fetchedMovements);
            setPersonnel(fetchedPersonnel);
            setPurchaseOrders(fetchedOrders);
            setProjects(fetchedProjects);
            setUsers(fetchedUsers);
        } catch (e) {
            console.error('Error cargando datos de Supabase:', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadAllData(); }, [loadAllData]);

    // ── Export / Import ──────────────────────────────────────────────────────
    const handleExportData = () =>
        exportToFile({ items, movements, personnel, purchaseOrders, projects, users });

    const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) =>
        importFromFile(e, async (data) => {
            try {
                await Promise.all([
                    ...( data.items || []).map(i => db.addItem(i)),
                    ...(data.personnel || []).map(p => db.addPersonnel(p)),
                    ...(data.projects || []).map(p => db.addProject(p)),
                ]);
                await loadAllData();
            } catch (err) {
                alert('Error al importar datos: ' + (err as Error).message);
            }
        }, (msg) => alert(msg));

    const handleLogin = (role: UserRole) => {
        setUserRole(role);
        setIsAuthenticated(true);
    };

    const handleResetAllData = async () => {
        if (!window.confirm('¿ESTÁS SEGURO? Se borrarán todos los datos de la base de datos. Esta acción no se puede deshacer.')) return;
        try {
            await Promise.all([
                ...movements.map(m => db.deleteMovement(m.id)),
                ...purchaseOrders.map(o => db.deletePurchaseOrder(o.id)),
            ]);
            await Promise.all([
                ...items.map(i => db.deleteItem(i.id)),
                ...personnel.map(p => db.deletePersonnel(p.id)),
                ...projects.map(p => db.deleteProject(p.id)),
            ]);
            await loadAllData();
            alert('Bodega limpia. Ahora puedes empezar a registrar tus propios materiales.');
        } catch (err) {
            alert('Error al limpiar datos: ' + (err as Error).message);
        }
    };

    const selectView = (view: View) => {
        setCurrentView(view);
        setSelectedInventoryType(null);
        if (window.innerWidth < 768) setSidebarOpen(false);
    };

    // ── Items ────────────────────────────────────────────────────────────────
    const handleAddItem = async (i: Omit<Item, 'id'>) => {
        const created = await db.addItem(i);
        setItems(prev => [...prev, created]);
    };

    const handleEditItem = async (updated: Item) => {
        await db.updateItem(updated);
        setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    };

    const handleDeleteItem = async (id: string) => {
        await db.deleteItem(id);
        setItems(prev => prev.filter(i => i.id !== id));
    };

    // ── Movements ────────────────────────────────────────────────────────────
    const handleLogMovement = async (m: Omit<Movement, 'id'>) => {
        const created = await db.addMovement({ ...m, timestamp: new Date() });
        setMovements(prev => [created, ...prev]);

        // Actualizar stock en DB y en estado local
        const item = items.find(i => i.id === m.itemId);
        if (item) {
            let newQty = item.quantity;
            if (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE) {
                newQty -= m.quantity;
            } else {
                newQty += m.quantity;
            }
            await db.updateItemQuantity(m.itemId, newQty);
            setItems(prev => prev.map(i => i.id === m.itemId ? { ...i, quantity: newQty } : i));
        }
    };

    const handleDeleteMovement = async (id: string) => {
        await db.deleteMovement(id);
        setMovements(prev => prev.filter(m => m.id !== id));
    };

    const handleReturnItem = async (id: string) => {
        await db.markMovementReturned(id);
        setMovements(prev => prev.map(m => m.id === id ? { ...m, isReturned: true } : m));
    };

    // ── Personnel ────────────────────────────────────────────────────────────
    const handleAddPersonnel = async (p: Omit<Personnel, 'id'>) => {
        const created = await db.addPersonnel(p);
        setPersonnel(prev => [...prev, created]);
    };

    const handleEditPersonnel = async (p: Personnel) => {
        await db.updatePersonnel(p);
        setPersonnel(prev => prev.map(pers => pers.id === p.id ? p : pers));
    };

    const handleDeletePersonnel = async (id: string) => {
        await db.deletePersonnel(id);
        setPersonnel(prev => prev.filter(p => p.id !== id));
    };

    // ── Projects ─────────────────────────────────────────────────────────────
    const handleAddProject = async (p: Omit<Project, 'id'>) => {
        const created = await db.addProject(p);
        setProjects(prev => [...prev, created]);
    };

    const handleDeleteProject = async (id: string) => {
        await db.deleteProject(id);
        setProjects(prev => prev.filter(p => p.id !== id));
    };

    // ── Purchase Orders ──────────────────────────────────────────────────────
    const handleAddPurchaseOrder = async (o: Omit<PurchaseOrder, 'id'>) => {
        const created = await db.addPurchaseOrder(o);
        setPurchaseOrders(prev => [created, ...prev]);
    };

    const handleUpdatePOStatus = async (id: string, status: PurchaseOrderStatus) => {
        await db.updatePurchaseOrderStatus(id, status);
        setPurchaseOrders(prev =>
            prev.map(o => o.id === id
                ? { ...o, status, ...(status === PurchaseOrderStatus.RECEIVED ? { receivedDate: new Date() } : {}) }
                : o
            )
        );
    };

    const handleDeletePO = async (id: string) => {
        await db.deletePurchaseOrder(id);
        setPurchaseOrders(prev => prev.filter(o => o.id !== id));
    };

    // ── Users ────────────────────────────────────────────────────────────────
    const handleAddUser = async (u: AppUser) => {
        const created = await db.addUser(u);
        setUsers(prev => [...prev, created]);
    };

    const handleEditUser = async (u: AppUser) => {
        await db.updateUser(u);
        setUsers(prev => prev.map(user => user.id === u.id ? u : user));
    };

    const handleDeleteUser = async (id: string) => {
        await db.deleteUser(id);
        setUsers(prev => prev.filter(u => u.id !== id));
    };

    // ── Render ───────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">Cargando bodega…</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) return <LoginView onLoginSuccess={handleLogin} users={users} />;

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            <aside className={`bg-white border-r border-gray-200 shadow-xl transition-all duration-300 ease-in-out fixed md:relative inset-y-0 left-0 z-30 transform md:transform-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'} flex flex-col`}>
                <div className="h-16 flex-shrink-0 flex items-center px-6 border-b bg-blue-700 text-white">
                    <h2 className="text-xl font-black tracking-tighter uppercase italic">Bodega Pro</h2>
                </div>

                <div className="flex-1 overflow-y-auto py-4">
                    <nav className="px-2 space-y-1">
                        <NavItem icon={DashboardIcon} label="Resumen" onClick={() => selectView('dashboard')} isActive={currentView === 'dashboard'} />
                        <NavItem icon={BrainIcon} label="Copiloto IA" onClick={() => selectView('copilot')} isActive={currentView === 'copilot'} />
                        <NavHeader label="Gestión" />
                        <NavItem icon={HardHatIcon} label="Proyectos" onClick={() => selectView('projects')} isActive={currentView === 'projects'} />
                        <NavItem icon={MovementsIcon} label="Kardex" onClick={() => selectView('movements')} isActive={currentView === 'movements'} />
                        <NavItem icon={ClockIcon} label="Préstamos" onClick={() => selectView('loans')} isActive={currentView === 'loans'} />

                        <NavHeader label="Inventarios" />
                        <NavItem icon={HandToolIcon} label="H. Manual" onClick={() => { setCurrentView('inventory'); setSelectedInventoryType(InventoryType.HAND_TOOL); }} isActive={currentView === 'inventory' && selectedInventoryType === InventoryType.HAND_TOOL} />
                        <NavItem icon={ElectricalToolIcon} label="H. Eléctrica" onClick={() => { setCurrentView('inventory'); setSelectedInventoryType(InventoryType.ELECTRICAL_TOOL); }} isActive={currentView === 'inventory' && selectedInventoryType === InventoryType.ELECTRICAL_TOOL} />
                        <NavItem icon={PpeIcon} label="Seguridad" onClick={() => { setCurrentView('inventory'); setSelectedInventoryType(InventoryType.PPE); }} isActive={currentView === 'inventory' && selectedInventoryType === InventoryType.PPE} />
                        <NavItem icon={SingleUseIcon} label="Consumibles" onClick={() => { setCurrentView('inventory'); setSelectedInventoryType(InventoryType.SINGLE_USE); }} isActive={currentView === 'inventory' && selectedInventoryType === InventoryType.SINGLE_USE} />

                        <NavHeader label="Admin" />
                        <NavItem icon={PersonnelIcon} label="Personal" onClick={() => selectView('personnel')} isActive={currentView === 'personnel'} />
                        <NavItem icon={PurchaseOrdersIcon} label="Compras" onClick={() => selectView('purchaseOrders')} isActive={currentView === 'purchaseOrders'} />
                    </nav>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Header
                    toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
                    userRole={userRole}
                    onStartNewBusiness={handleResetAllData}
                    onOpenUserManagement={() => setUserManagementOpen(true)}
                    onLogout={() => setIsAuthenticated(false)}
                    onExportData={handleExportData}
                    onImportData={handleImportData}
                    onResetData={handleResetAllData}
                    setUserRole={() => {}}
                />
                <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-gray-50">
                    <div className="max-w-7xl mx-auto">
                        {currentView === 'dashboard' && <Dashboard items={items} movements={movements} />}
                        {currentView === 'inventory' && (
                            <InventoryView
                                items={selectedInventoryType ? items.filter(i => i.inventoryType === selectedInventoryType) : items}
                                openAddItemModal={() => setAddItemModalOpen(true)}
                                onEditItem={(i) => { setItemToEdit(i); setEditModalOpen(true); }}
                                onDeleteItem={handleDeleteItem}
                                onItemHistory={(i) => { setItemForHistory(i); setHistoryModalOpen(true); }}
                                userRole={userRole}
                                category={selectedInventoryType || 'Todos'}
                                onGoBack={() => selectView('dashboard')}
                            />
                        )}
                        {currentView === 'movements' && (
                            <MovementsView
                                movements={movements}
                                items={items}
                                personnel={personnel}
                                openLogMovementModal={() => setLogMovementModalOpen(true)}
                                onGoBack={() => selectView('dashboard')}
                                onDeleteMovement={handleDeleteMovement}
                            />
                        )}
                        {currentView === 'purchaseOrders' && (
                            <PurchaseOrdersView
                                purchaseOrders={purchaseOrders}
                                items={items}
                                openAddPurchaseOrderModal={() => setAddPOModalOpen(true)}
                                onUpdateStatus={handleUpdatePOStatus}
                                userRole={userRole}
                                onGoBack={() => selectView('dashboard')}
                                onDeleteOrder={handleDeletePO}
                            />
                        )}
                        {currentView === 'personnel' && (
                            <PersonnelView
                                personnel={personnel}
                                openAddPersonnelModal={() => setAddPersonnelModalOpen(true)}
                                onGoBack={() => selectView('dashboard')}
                                onEditPersonnel={handleEditPersonnel}
                                onDeletePersonnel={handleDeletePersonnel}
                                userRole={userRole}
                            />
                        )}
                        {currentView === 'projects' && (
                            <ProjectsView
                                projects={projects}
                                movements={movements}
                                items={items}
                                personnel={personnel}
                                onAddProject={handleAddProject}
                                onDeleteProject={handleDeleteProject}
                                onGoBack={() => selectView('dashboard')}
                                userRole={userRole}
                            />
                        )}
                        {currentView === 'loans' && (
                            <LoansView
                                movements={movements}
                                items={items}
                                personnel={personnel}
                                onReturnItem={handleReturnItem}
                                onGoBack={() => selectView('dashboard')}
                            />
                        )}
                        {currentView === 'copilot' && (
                            <CopilotView
                                items={items}
                                movements={movements}
                                personnel={personnel}
                                purchaseOrders={purchaseOrders}
                            />
                        )}
                    </div>
                </main>
            </div>

            <AddItemModal isOpen={isAddItemModalOpen} onClose={() => setAddItemModalOpen(false)} onAddItem={handleAddItem} userRole={userRole} />
            <EditItemModal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} onEditItem={handleEditItem} itemToEdit={itemToEdit} />
            <LogMovementModal isOpen={isLogMovementModalOpen} onClose={() => setLogMovementModalOpen(false)} onLogMovement={handleLogMovement} items={items} personnel={personnel} projects={projects} userRole={userRole} />
            <AddPersonnelModal isOpen={isAddPersonnelModalOpen} onClose={() => setAddPersonnelModalOpen(false)} onAddPersonnel={handleAddPersonnel} />
            <AddPurchaseOrderModal isOpen={isAddPOModalOpen} onClose={() => setAddPOModalOpen(false)} onAddPurchaseOrder={handleAddPurchaseOrder} items={items} />
            <ItemHistoryModal isOpen={isHistoryModalOpen} onClose={() => setHistoryModalOpen(false)} item={itemForHistory} movements={movements} personnel={personnel} />
            <UserManagementModal isOpen={isUserManagementOpen} onClose={() => setUserManagementOpen(false)} users={users} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} onEditUser={handleEditUser} />
        </div>
    );
};

const NavItem: React.FC<{ icon: React.ElementType, label: string, onClick: () => void, isActive: boolean }> = ({ icon: Icon, label, onClick, isActive }) => (
    <button onClick={onClick} className={`w-full flex items-center text-left px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
        <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-gray-400'}`} />
        {label}
    </button>
);

const NavHeader: React.FC<{ label: string }> = ({ label }) => (
    <h3 className="px-5 pt-6 pb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</h3>
);

export default App;
