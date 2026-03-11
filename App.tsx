
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

import { mockItems, mockMovements, mockPersonnel, mockPurchaseOrders, mockProjects, mockUsers } from './mockData';
import { Item, Movement, MovementType, Personnel, PurchaseOrder, UserRole, InventoryType, Project, AppUser } from './types';
import { LoginView } from './components/LoginView';
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from './storage';

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

type View = 'dashboard' | 'inventory' | 'movements' | 'purchaseOrders' | 'personnel' | 'projects' | 'loans';

const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userRole, setUserRole] = useState<UserRole>(UserRole.OWNER);

    // Estados con carga inicial
    const [users, setUsers] = useState<AppUser[]>(() => { const s = loadFromLocalStorage(); return s?.users ?? mockUsers; });
    const [items, setItems] = useState<Item[]>(() => { const s = loadFromLocalStorage(); return s?.items ?? mockItems; });
    const [movements, setMovements] = useState<Movement[]>(() => { const s = loadFromLocalStorage(); return s?.movements ?? mockMovements; });
    const [personnel, setPersonnel] = useState<Personnel[]>(() => { const s = loadFromLocalStorage(); return s?.personnel ?? mockPersonnel; });
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => { const s = loadFromLocalStorage(); return s?.purchaseOrders ?? mockPurchaseOrders; });
    const [projects, setProjects] = useState<Project[]>(() => { const s = loadFromLocalStorage(); return s?.projects ?? mockProjects; });

    useEffect(() => { saveToLocalStorage({ items, movements, personnel, purchaseOrders, projects, users }); }, [items, movements, personnel, purchaseOrders, projects, users]);

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

    const handleExportData = () => exportToFile({ items, movements, personnel, purchaseOrders, projects, users });
    const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => importFromFile(e, (data) => { 
        setItems(data.items || []); 
        setMovements(data.movements || []); 
        setPersonnel(data.personnel || []); 
        setPurchaseOrders(data.purchaseOrders || []); 
        if(data.projects) setProjects(data.projects); 
        if(data.users) setUsers(data.users); 
    }, (msg) => alert(msg));

    const handleLogin = (role: UserRole) => {
        setUserRole(role);
        setIsAuthenticated(true);
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
                        <NavItem icon={PurchaseOrdersIcon} label="Compras" onClick={() => selectView('purchaseOrders')} isActive={currentView === 'purchaseOrders'}/>
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
                                onDeleteItem={(id) => setItems(prev => prev.filter(i => i.id !== id))} 
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
                                onDeleteMovement={(id) => setMovements(prev => prev.filter(m => m.id !== id))}
                            />
                        )}
                        {currentView === 'purchaseOrders' && (
                            <PurchaseOrdersView 
                                purchaseOrders={purchaseOrders} 
                                items={items} 
                                openAddPurchaseOrderModal={() => setAddPOModalOpen(true)} 
                                onUpdateStatus={(id, s) => setPurchaseOrders(prev => prev.map(o => o.id === id ? { ...o, status: s } : o))} 
                                userRole={userRole} 
                                onGoBack={() => selectView('dashboard')} 
                                onDeleteOrder={(id) => setPurchaseOrders(prev => prev.filter(o => o.id !== id))}
                            />
                        )}
                        {currentView === 'personnel' && (
                            <PersonnelView 
                                personnel={personnel} 
                                openAddPersonnelModal={() => setAddPersonnelModalOpen(true)} 
                                onGoBack={() => selectView('dashboard')} 
                                onEditPersonnel={(p) => setPersonnel(prev => prev.map(pers => pers.id === p.id ? p : pers))} 
                                onDeletePersonnel={(id) => setPersonnel(prev => prev.filter(pers => pers.id !== id))} 
                                userRole={userRole} 
                            />
                        )}
                        {currentView === 'projects' && (
                            <ProjectsView 
                                projects={projects} 
                                movements={movements} 
                                items={items} 
                                personnel={personnel} 
                                onAddProject={(p) => setProjects(prev => [...prev, { ...p, id: `p-${Date.now()}` }])} 
                                onDeleteProject={(id) => setProjects(prev => prev.filter(p => p.id !== id))}
                                onGoBack={() => selectView('dashboard')} 
                                userRole={userRole} 
                            />
                        )}
                        {currentView === 'loans' && (
                            <LoansView 
                                movements={movements} 
                                items={items} 
                                personnel={personnel} 
                                onReturnItem={(id) => setMovements(prev => prev.map(m => m.id === id ? { ...m, isReturned: true } : m))} 
                                onGoBack={() => selectView('dashboard')} 
                            />
                        )}
                    </div>
                </main>
            </div>

            <AddItemModal isOpen={isAddItemModalOpen} onClose={() => setAddItemModalOpen(false)} onAddItem={(i) => setItems(p => [...p, { ...i, id: `i-${Date.now()}` }])} userRole={userRole} />
            <EditItemModal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} onEditItem={(u) => setItems(p => p.map(i => i.id === u.id ? u : i))} itemToEdit={itemToEdit} />
            <LogMovementModal isOpen={isLogMovementModalOpen} onClose={() => setLogMovementModalOpen(false)} onLogMovement={(m) => {
                setMovements(p => [{ ...m, id: `mov-${Date.now()}`, timestamp: new Date() }, ...p]);
                setItems(prev => prev.map(item => {
                    if (item.id === m.itemId) {
                        let newQty = item.quantity;
                        if (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE) newQty -= m.quantity;
                        else newQty += m.quantity;
                        return { ...item, quantity: newQty };
                    }
                    return item;
                }));
            }} items={items} personnel={personnel} projects={projects} userRole={userRole} />
            <AddPersonnelModal isOpen={isAddPersonnelModalOpen} onClose={() => setAddPersonnelModalOpen(false)} onAddPersonnel={(p) => setPersonnel(prev => [...prev, { ...p, id: `per-${Date.now()}` }])} />
            <AddPurchaseOrderModal isOpen={isAddPOModalOpen} onClose={() => setAddPOModalOpen(false)} onAddPurchaseOrder={(o) => setPurchaseOrders(p => [{ ...o, id: `po-${Date.now()}` }, ...p])} items={items} />
            <ItemHistoryModal isOpen={isHistoryModalOpen} onClose={() => setHistoryModalOpen(false)} item={itemForHistory} movements={movements} personnel={personnel} />
            <UserManagementModal isOpen={isUserManagementOpen} onClose={() => setUserManagementOpen(false)} users={users} onAddUser={(u) => setUsers(p => [...p, u])} onDeleteUser={(id) => setUsers(p => p.filter(u => u.id !== id))} onEditUser={(u) => setUsers(p => p.map(user => user.id === u.id ? u : user))} />
        </div>
    );
};

const NavItem: React.FC<{ icon: React.ElementType, label: string, onClick: () => void, isActive: boolean }> = ({ icon: Icon, label, onClick, isActive }) => (
    <button onClick={onClick} className={`w-full flex items-center text-left px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
        <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-gray-400'}`} />
        {label}
    </button>
);

const NavHeader: React.FC<{label: string}> = ({label}) => (
    <h3 className="px-5 pt-6 pb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</h3>
);

export default App;
