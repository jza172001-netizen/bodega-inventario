
import React, { useState, useEffect } from 'react';
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
import { FloatingChat } from './components/FloatingChat';
import { OnboardingModal } from './components/OnboardingModal';
import { HelpView } from './components/HelpView';
import { requestNotificationPermission, checkAndNotifyOverdueLoans } from './services/notificationService';

import { mockItems, mockMovements, mockPersonnel, mockPurchaseOrders, mockProjects, mockUsers } from './mockData';
import { Item, Movement, MovementType, Personnel, PurchaseOrder, UserRole, InventoryType, Project, AppUser, PurchaseOrderStatus } from './types';
import { LoginView } from './components/LoginView';
import { LandingPage } from './components/LandingPage';
import { InvoiceReaderModal } from './components/InvoiceReaderModal';
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from './storage';
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

type View = 'dashboard' | 'inventory' | 'movements' | 'purchaseOrders' | 'personnel' | 'projects' | 'loans' | 'copilot' | 'help';

const SESSION_KEY = 'bodega_session';
const ONBOARDING_KEY = 'bodega_onboarding_v1';

const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
        try { return !!JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return false; }
    });
    const [showLogin, setShowLogin] = useState(false);
    const [userRole, setUserRole] = useState<UserRole>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
            return s?.role ?? UserRole.OWNER;
        } catch { return UserRole.OWNER; }
    });
    const [userName, setUserName] = useState<string>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
            return s?.name ?? '';
        } catch { return ''; }
    });

    // Carga inicial síncrona desde localStorage (igual que antes), con fallback a mockData
    const [users, setUsers] = useState<AppUser[]>(() => { const s = loadFromLocalStorage(); return s?.users ?? mockUsers; });
    const [items, setItems] = useState<Item[]>(() => { const s = loadFromLocalStorage(); return s?.items ?? mockItems; });
    const [movements, setMovements] = useState<Movement[]>(() => { const s = loadFromLocalStorage(); return s?.movements ?? mockMovements; });
    const [personnel, setPersonnel] = useState<Personnel[]>(() => { const s = loadFromLocalStorage(); return s?.personnel ?? mockPersonnel; });
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => { const s = loadFromLocalStorage(); return s?.purchaseOrders ?? mockPurchaseOrders; });
    const [projects, setProjects] = useState<Project[]>(() => { const s = loadFromLocalStorage(); return s?.projects ?? mockProjects; });

    // Auto-save a localStorage en cada cambio (igual que antes)
    useEffect(() => { saveToLocalStorage({ items, movements, personnel, purchaseOrders, projects, users }); }, [items, movements, personnel, purchaseOrders, projects, users]);

    // Revisar préstamos vencidos y pendientes de recoger cuando los datos estén listos
    useEffect(() => {
        if (isAuthenticated && movements.length > 0) {
            checkAndNotifyOverdueLoans(movements, items, personnel);
        }
    }, [isAuthenticated, movements, items, personnel]);

    // Sync desde Supabase en background al montar (no bloquea la UI)
    useEffect(() => {
        db.fetchUsers().then(data => { if (data.length > 0) setUsers(data); }).catch(() => {});
        db.fetchItems().then(data => { if (data.length > 0) setItems(data); }).catch(() => {});
        db.fetchMovements().then(data => { if (data.length > 0) setMovements(data); }).catch(() => {});
        db.fetchPersonnel().then(data => { if (data.length > 0) setPersonnel(data); }).catch(() => {});
        db.fetchPurchaseOrders().then(data => { if (data.length > 0) setPurchaseOrders(data); }).catch(() => {});
        db.fetchProjects().then(data => { if (data.length > 0) setProjects(data); }).catch(() => {});
    }, []);

    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
    const syncTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const withSync = (promise: Promise<unknown>) => {
        setSyncStatus('syncing');
        if (syncTimer.current) clearTimeout(syncTimer.current);
        promise
            .then(() => {
                setSyncStatus('idle');
                syncTimer.current = setTimeout(() => setSyncStatus('idle'), 2000);
            })
            .catch(() => setSyncStatus('error'));
    };

    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [selectedInventoryType, setSelectedInventoryType] = useState<InventoryType | null>(null);
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    const [isInvoiceReaderOpen, setInvoiceReaderOpen] = useState(false);
    const [isAddItemModalOpen, setAddItemModalOpen] = useState(false);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
    const [isLogMovementModalOpen, setLogMovementModalOpen] = useState(false);
    const [isAddPersonnelModalOpen, setAddPersonnelModalOpen] = useState(false);
    const [isAddPOModalOpen, setAddPOModalOpen] = useState(false);
    const [isUserManagementOpen, setUserManagementOpen] = useState(false);
    const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
    const [itemForHistory, setItemForHistory] = useState<Item | null>(null);
    const [showOnboarding, setShowOnboarding] = useState(false);

    const handleExportData = () => exportToFile({ items, movements, personnel, purchaseOrders, projects, users });
    const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => importFromFile(e, (data) => {
        setItems(data.items || []);
        setMovements(data.movements || []);
        setPersonnel(data.personnel || []);
        setPurchaseOrders(data.purchaseOrders || []);
        if (data.projects) setProjects(data.projects);
        if (data.users) setUsers(data.users);
    }, (msg) => alert(msg));

    const handleLogin = (role: UserRole, name: string = '') => {
        setUserRole(role);
        setUserName(name);
        setIsAuthenticated(true);
        setShowLogin(false);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ role, name }));
        if (!localStorage.getItem(ONBOARDING_KEY)) {
            setShowOnboarding(true);
        }
        requestNotificationPermission();
    };

    const handleOnboardingFinish = () => {
        localStorage.setItem(ONBOARDING_KEY, 'done');
        setShowOnboarding(false);
    };

    // Valida credenciales via Supabase RPC (server-side, sin exponer contraseñas al cliente)
    // Fallback: comparación local si Supabase no está disponible
    const handleLoginAttempt = async (username: string, password: string): Promise<boolean> => {
        try {
            const result = await db.authenticateUser(username, password);
            if (result) {
                handleLogin(result.role);
                return true;
            }
            return false;
        } catch {
            // Fallback offline: comparar contra usuarios en estado local (sin contraseña desde DB)
            const localUser = users.find(u => u.username === username && u.password === password);
            if (localUser) { handleLogin(localUser.role); return true; }
            return false;
        }
    };

    const handleResetAllData = () => {
        if (window.confirm("¿ESTÁS SEGURO? Se borrarán todos los productos, trabajadores y movimientos. Esta acción no se puede deshacer.")) {
            setItems([]);
            setMovements([]);
            setPersonnel([]);
            setPurchaseOrders([]);
            setProjects([]);
            alert("Bodega limpia. Ahora puedes empezar a registrar tus propios materiales.");
        }
    };

    const selectView = (view: View) => {
        setCurrentView(view);
        setSelectedInventoryType(null);
        if (window.innerWidth < 768) setSidebarOpen(false);
    };

    // ── Handlers síncronos (igual que original) + sync Supabase en background ──

    const handleImportItems = (newItems: Array<Omit<Item, 'id'>>, inventoryType?: InventoryType) => {
        const created = newItems.map(i => ({
            ...i,
            id: `i-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            inventoryType: inventoryType ?? i.inventoryType,
        }));
        setItems(prev => [...prev, ...created]);
        created.forEach(i => withSync(db.addItem(i)));
    };

    const handleAddItem = (i: Omit<Item, 'id'>) => {
        const newItem = { ...i, id: `i-${Date.now()}` };
        setItems(prev => [...prev, newItem]);
        withSync(db.addItem(i).then(created => setItems(prev => prev.map(x => x.id === newItem.id ? created : x))));
    };

    const handleAddItemSync = (i: Omit<Item, 'id'>): Item => {
        const newItem = { ...i, id: `i-${Date.now()}` };
        setItems(prev => [...prev, newItem]);
        withSync(db.addItem(i).then(created => setItems(prev => prev.map(x => x.id === newItem.id ? created : x))));
        return newItem;
    };

    const handleEditItem = (updated: Item) => {
        setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
        withSync(db.updateItem(updated));
    };

    const handleDeleteItem = (id: string) => {
        const hasMovements = movements.some(m => m.itemId === id);
        if (hasMovements && !window.confirm('Este artículo tiene movimientos registrados. ¿Eliminar de todas formas? Los registros históricos quedarán sin referencia.')) return;
        setItems(prev => prev.filter(i => i.id !== id));
        withSync(db.deleteItem(id));
    };

    const handleLogMovement = (m: Omit<Movement, 'id'>) => {
        const newMov = { ...m, id: `mov-${Date.now()}`, timestamp: new Date() };
        setMovements(prev => [newMov, ...prev]);
        setItems(prev => prev.map(item => {
            if (item.id === m.itemId) {
                let newQty = item.quantity;
                if (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE) newQty -= m.quantity;
                else newQty += m.quantity;
                db.updateItemQuantity(item.id, newQty).catch(() => {});
                return { ...item, quantity: newQty };
            }
            return item;
        }));
        withSync(db.addMovement({ ...m, timestamp: new Date() })
            .then(created => setMovements(prev => prev.map(x => x.id === newMov.id ? created : x))));
    };

    const handleDeleteMovement = (id: string) => {
        setMovements(prev => prev.filter(m => m.id !== id));
        withSync(db.deleteMovement(id));
    };

    const handleReturnItem = (id: string) => {
        setMovements(prev => prev.map(m => m.id === id ? { ...m, isReturned: true } : m));
        withSync(db.markMovementReturned(id));
    };

    const handleMarkPendingPickup = (id: string, pending: boolean) => {
        setMovements(prev => prev.map(m => m.id === id ? { ...m, pendingPickup: pending } : m));
        withSync(db.markMovementPendingPickup(id, pending));
    };

    const handleAddPersonnel = (p: Omit<Personnel, 'id'>) => {
        const newP = { ...p, id: `per-${Date.now()}` };
        setPersonnel(prev => [...prev, newP]);
        withSync(db.addPersonnel(p).then(created => setPersonnel(prev => prev.map(x => x.id === newP.id ? created : x))));
    };

    const handleAddPersonnelSync = (p: Omit<Personnel, 'id'>): Personnel => {
        const newP = { ...p, id: `per-${Date.now()}` };
        setPersonnel(prev => [...prev, newP]);
        withSync(db.addPersonnel(p).then(created => setPersonnel(prev => prev.map(x => x.id === newP.id ? created : x))));
        return newP;
    };

    const handleEditPersonnel = (p: Personnel) => {
        setPersonnel(prev => prev.map(pers => pers.id === p.id ? p : pers));
        withSync(db.updatePersonnel(p));
    };

    const handleDeletePersonnel = (id: string) => {
        const hasMovements = movements.some(m => m.personnelId === id);
        if (hasMovements && !window.confirm('Este personal tiene movimientos registrados. ¿Eliminar de todas formas?')) return;
        setPersonnel(prev => prev.filter(p => p.id !== id));
        withSync(db.deletePersonnel(id));
    };

    const handleAddProject = (p: Omit<Project, 'id'>) => {
        const newP = { ...p, id: `p-${Date.now()}` };
        setProjects(prev => [...prev, newP]);
        withSync(db.addProject(p).then(created => setProjects(prev => prev.map(x => x.id === newP.id ? created : x))));
    };

    const handleAddProjectSync = (p: Omit<Project, 'id'>): Project => {
        const newP = { ...p, id: `p-${Date.now()}` };
        setProjects(prev => [...prev, newP]);
        withSync(db.addProject(p).then(created => setProjects(prev => prev.map(x => x.id === newP.id ? created : x))));
        return newP;
    };

    const handleDeleteProject = (id: string) => {
        setProjects(prev => prev.filter(p => p.id !== id));
        withSync(db.deleteProject(id));
    };

    const handleAddPurchaseOrder = (o: Omit<PurchaseOrder, 'id'>) => {
        const newO = { ...o, id: `po-${Date.now()}` };
        setPurchaseOrders(prev => [newO, ...prev]);
        withSync(db.addPurchaseOrder(o).then(created => setPurchaseOrders(prev => prev.map(x => x.id === newO.id ? created : x))));
    };

    const handleUpdatePOStatus = (id: string, status: PurchaseOrderStatus) => {
        setPurchaseOrders(prev => prev.map(o => o.id === id
            ? { ...o, status, ...(status === PurchaseOrderStatus.RECEIVED ? { receivedDate: new Date() } : {}) }
            : o
        ));
        withSync(db.updatePurchaseOrderStatus(id, status));
    };

    const handleDeletePO = (id: string) => {
        setPurchaseOrders(prev => prev.filter(o => o.id !== id));
        withSync(db.deletePurchaseOrder(id));
    };

    const handleAddUser = (u: AppUser) => {
        setUsers(prev => [...prev, u]);
        withSync(db.addUser(u));
    };

    const handleEditUser = (u: AppUser) => {
        setUsers(prev => prev.map(user => user.id === u.id ? u : user));
        withSync(db.updateUser(u));
    };

    const handleDeleteUser = (id: string) => {
        setUsers(prev => prev.filter(u => u.id !== id));
        db.deleteUser(id).catch(() => {});
    };

    const handleVisitorLogin = () => {
        handleLogin(UserRole.EMPLOYEE, 'Visitante');
    };

    if (!isAuthenticated) {
        if (showLogin) {
            return <LoginView onLoginSuccess={handleLogin} />;
        }
        return <LandingPage onGetStarted={() => setShowLogin(true)} onVisitorLogin={handleVisitorLogin} />;
    }

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            {/* Backdrop mobile: cierra el sidebar al tocar fuera */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-20 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside className={`bg-white border-r border-gray-200 shadow-xl transition-all duration-300 ease-in-out fixed md:relative inset-y-0 left-0 z-30 transform md:transform-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'} flex flex-col`}>
                <div className="h-16 flex-shrink-0 flex items-center px-6 border-b bg-blue-700 text-white">
                    <h2 className="text-xl font-black tracking-tighter uppercase italic">Bodega Pro</h2>
                </div>

                <div className="flex-1 overflow-y-auto py-4">
                    <nav className="px-2 space-y-1">
                        <NavItem icon={DashboardIcon} label="Resumen" onClick={() => selectView('dashboard')} isActive={currentView === 'dashboard'} />
                        {userRole === UserRole.OWNER && (
                            <NavItem icon={BrainIcon} label="Análisis" onClick={() => selectView('copilot')} isActive={currentView === 'copilot'} />
                        )}
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

                {/* Help & tutorial footer */}
                <div className="flex-shrink-0 px-2 py-3 border-t border-gray-100 space-y-1">
                    <NavItem icon={QuestionMarkIcon} label="Ayuda ❓" onClick={() => selectView('help')} isActive={currentView === 'help'} />
                    <button
                        onClick={() => setShowOnboarding(true)}
                        className="w-full flex items-center text-left px-4 py-2.5 text-xs font-semibold rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"
                    >
                        <span className="mr-3 text-base">🎓</span>
                        Ver tutorial
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Header
                    toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
                    userRole={userRole}
                    userName={userName}
                    onStartNewBusiness={handleResetAllData}
                    onOpenUserManagement={() => setUserManagementOpen(true)}
                    onLogout={() => { setIsAuthenticated(false); setShowLogin(false); localStorage.removeItem(SESSION_KEY); }}
                    onExportData={handleExportData}
                    onImportData={handleImportData}
                    onResetData={handleResetAllData}
                    setUserRole={() => {}}
                    syncStatus={syncStatus}
                    onOpenInvoiceReader={() => setInvoiceReaderOpen(true)}
                />
                <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-gray-50">
                    <div className="max-w-7xl mx-auto">
                        {currentView === 'dashboard' && <Dashboard items={items} movements={movements} purchaseOrders={purchaseOrders} personnel={personnel} />}
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
                                movements={movements}
                                items={items}
                                projects={projects}
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
                                onMarkPendingPickup={handleMarkPendingPickup}
                                onGoBack={() => selectView('dashboard')}
                            />
                        )}
                        {currentView === 'copilot' && (
                            <CopilotView
                                items={items}
                                movements={movements}
                                personnel={personnel}
                                purchaseOrders={purchaseOrders}
                                projects={projects}
                                onLogMovements={batch => batch.forEach(m => handleLogMovement(m))}
                                onCreateItem={handleAddItemSync}
                                onCreateProject={handleAddProjectSync}
                                onCreatePersonnel={handleAddPersonnelSync}
                            />
                        )}
                        {currentView === 'help' && <HelpView />}
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
            <InvoiceReaderModal isOpen={isInvoiceReaderOpen} onClose={() => setInvoiceReaderOpen(false)} onImport={(rows, invType) => handleImportItems(rows, invType)} />
            {showOnboarding && <OnboardingModal onFinish={handleOnboardingFinish} />}
            {isAuthenticated && (
                <FloatingChat
                    items={items}
                    movements={movements}
                    personnel={personnel}
                    purchaseOrders={purchaseOrders}
                />
            )}
        </div>
    );
};

const QuestionMarkIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
);

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
