
import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { Item, Movement, MovementType, Personnel, PurchaseOrder, PurchaseOrderStatus, UserRole, InventoryType, Project, AppUser } from './types';
import { LoginView } from './components/LoginView';

// Icons for Sidebar
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
import { LogOutIcon } from './components/icons/LogOutIcon';

type View = 'dashboard' | 'inventory' | 'movements' | 'purchaseOrders' | 'personnel' | 'projects' | 'loans';

const INITIALIZED_KEY = 'inventory_system_initialized_v3';

/**
 * Función auxiliar para obtener datos iniciales de forma segura.
 * Si ya fue inicializado anteriormente, devuelve los datos guardados o un array vacío.
 * Si es la primera vez absoluta, devuelve los datos de prueba (mockData).
 */
const getInitialData = <T,>(storageKey: string, defaultValue: T, mockData: T): T => {
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved !== null) {
            // Manejo especial para fechas en movimientos y órdenes
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                return parsed.map(item => {
                    if (item.timestamp) return { ...item, timestamp: new Date(item.timestamp) };
                    if (item.orderDate) return { 
                        ...item, 
                        orderDate: new Date(item.orderDate),
                        expectedDeliveryDate: item.expectedDeliveryDate ? new Date(item.expectedDeliveryDate) : undefined,
                        receivedDate: item.receivedDate ? new Date(item.receivedDate) : undefined
                    };
                    return item;
                }) as unknown as T;
            }
            return parsed;
        }
        
        // Si no hay datos, revisamos si el sistema ya fue marcado como inicializado (resetado o usado)
        const isInitialized = localStorage.getItem(INITIALIZED_KEY);
        if (isInitialized === 'true') {
            return defaultValue; // Retornamos vacío (el usuario lo quiso así)
        }
        
        return mockData; // Primera vez: cargamos los ejemplos
    } catch (e) {
        console.error(`Error cargando ${storageKey}:`, e);
        return defaultValue;
    }
};

const App: React.FC = () => {
    // Authentication State
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userRole, setUserRole] = useState<UserRole>(UserRole.OWNER);

    // Core Data State
    const [users, setUsers] = useState<AppUser[]>(() => getInitialData('inventory_users', mockUsers, mockUsers));
    const [items, setItems] = useState<Item[]>(() => getInitialData('inventory_items', [], mockItems));
    const [movements, setMovements] = useState<Movement[]>(() => getInitialData('inventory_movements', [], mockMovements));
    const [personnel, setPersonnel] = useState<Personnel[]>(() => getInitialData('inventory_personnel', [], mockPersonnel));
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => getInitialData('inventory_purchase_orders', [], mockPurchaseOrders));
    const [projects, setProjects] = useState<Project[]>(() => getInitialData('inventory_projects', [], mockProjects));

    // Persistencia Automática
    useEffect(() => { localStorage.setItem('inventory_users', JSON.stringify(users)); }, [users]);
    useEffect(() => { localStorage.setItem('inventory_items', JSON.stringify(items)); }, [items]);
    useEffect(() => { localStorage.setItem('inventory_movements', JSON.stringify(movements)); }, [movements]);
    useEffect(() => { localStorage.setItem('inventory_personnel', JSON.stringify(personnel)); }, [personnel]);
    useEffect(() => { localStorage.setItem('inventory_purchase_orders', JSON.stringify(purchaseOrders)); }, [purchaseOrders]);
    useEffect(() => { localStorage.setItem('inventory_projects', JSON.stringify(projects)); }, [projects]);

    // Marcar como inicializado tras el primer render con éxito
    useEffect(() => {
        if (localStorage.getItem(INITIALIZED_KEY) !== 'true') {
            localStorage.setItem(INITIALIZED_KEY, 'true');
        }
    }, []);

    // UI State
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
    const [selectedInventoryType, setSelectedInventoryType] = useState<InventoryType | null>(null);
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    // Modal State
    const [isAddItemModalOpen, setAddItemModalOpen] = useState(false);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
    const [isLogMovementModalOpen, setLogMovementModalOpen] = useState(false);
    const [isAddPersonnelModalOpen, setAddPersonnelModalOpen] = useState(false);
    const [isAddPOModalOpen, setAddPOModalOpen] = useState(false);
    const [isUserManagementOpen, setUserManagementOpen] = useState(false);
    const [itemForHistory, setItemForHistory] = useState<Item | null>(null);
    const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);

    // Handlers
    const handleLogin = (role: UserRole) => {
        setUserRole(role);
        setIsAuthenticated(true);
    };
    
    const handleLogout = () => {
        setIsAuthenticated(false);
        setCurrentView('dashboard');
    };

    const handleResetData = () => {
        const password = prompt("⚠️ LIMPIEZA TOTAL DEL SISTEMA\n\nEsto borrará todos los productos, movimientos y proyectos.\nIngrese la clave maestra (00) para confirmar:");
        
        if (password === '00') {
            if (window.confirm('¿Confirmar el inicio de la bodega desde cero? (Se mantendrá su acceso de administrador)')) {
                // 1. Limpiar estados de React (Inmediato en UI)
                setItems([]);
                setMovements([]);
                setPersonnel([]);
                setProjects([]);
                setPurchaseOrders([]);
                
                // 2. Limpiar LocalStorage físicamente
                localStorage.removeItem('inventory_items');
                localStorage.removeItem('inventory_movements');
                localStorage.removeItem('inventory_personnel');
                localStorage.removeItem('inventory_projects');
                localStorage.removeItem('inventory_purchase_orders');
                
                // 3. Bloquear recarga de Mocks
                localStorage.setItem(INITIALIZED_KEY, 'true');
                
                alert('¡Sistema Limpio! La bodega ahora está en 0. Puede comenzar a cargar sus materiales.');
                setCurrentView('dashboard');
            }
        } else if (password !== null) {
            alert("Clave de reset incorrecta.");
        }
    };

    const filteredItems = useMemo(() => {
        let result = items;
        if (selectedInventoryType) result = result.filter(item => item.inventoryType === selectedInventoryType);
        if (selectedSubCategory) result = result.filter(item => item.subCategory === selectedSubCategory);
        return result;
    }, [items, selectedInventoryType, selectedSubCategory]);

    const handleAddItem = (item: Omit<Item, 'id'>) => {
        const newItem: Item = { ...item, id: `item-${Date.now()}` };
        setItems(prev => [...prev, newItem]);
    };

    const handleEditItem = (updatedItem: Item) => {
        setItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
    };

    const handleDeleteItem = (itemId: string) => {
        if (window.confirm('¿Eliminar artículo definitivamente?')) {
            setItems(prev => prev.filter(item => item.id !== itemId));
        }
    };

    const handleLogMovement = (movement: Omit<Movement, 'id' | 'timestamp'>) => {
        const newMovement: Movement = { ...movement, id: `move-${Date.now()}`, timestamp: new Date(), isReturned: false };
        setMovements(prev => [newMovement, ...prev]);

        const item = items.find(i => i.id === movement.itemId);
        if (item) {
            let newQuantity = item.quantity;
            if (movement.type === MovementType.CHECK_OUT || movement.type === MovementType.WASTE) {
                newQuantity -= movement.quantity;
            } else {
                newQuantity += movement.quantity;
            }
            handleEditItem({ ...item, quantity: newQuantity });
        }
    };

    const selectView = (view: View) => {
        setCurrentView(view);
        setSelectedSubCategory(null);
        setSelectedInventoryType(null);
        if (window.innerWidth < 768) setSidebarOpen(false);
    };
    
    const selectInventoryTypeFilter = (type: InventoryType) => {
        setCurrentView('inventory');
        setSelectedInventoryType(type);
        setSelectedSubCategory(null);
        if (window.innerWidth < 768) setSidebarOpen(false);
    };

    if (!isAuthenticated) return <LoginView onLoginSuccess={handleLogin} users={users} />;

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            {isSidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-20 md:hidden" />}
            
            <aside className={`bg-white border-r border-gray-200 shadow-xl transition-all duration-300 ease-in-out fixed md:relative inset-y-0 left-0 z-30 transform md:transform-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'} flex flex-col`}>
                <div className="h-16 flex-shrink-0 flex items-center px-6 border-b bg-blue-700 text-white">
                    <h2 className="text-xl font-black tracking-tighter uppercase">Bodega Maestra</h2>
                </div>
                
                <div className="flex-1 overflow-y-auto py-4 scrollbar-hide">
                    <nav className="px-2 space-y-1">
                        <NavItem icon={DashboardIcon} label="Tablero Principal" onClick={() => selectView('dashboard')} isActive={currentView === 'dashboard'} />
                        <NavHeader label="Proyectos" />
                        <NavItem icon={HardHatIcon} label="Obras y Gastos" onClick={() => selectView('projects')} isActive={currentView === 'projects'} />
                        <NavItem icon={ClockIcon} label="Herramienta en Préstamo" onClick={() => selectView('loans')} isActive={currentView === 'loans'} />
                        <NavItem icon={DashboardIcon} label="Kardex General" onClick={() => selectView('movements')} isActive={currentView === 'movements'} />
                        
                        <NavHeader label="Inventario" />
                        <NavItem icon={HandToolIcon} label="Herramienta Manual" onClick={() => selectInventoryTypeFilter(InventoryType.HAND_TOOL)} isActive={currentView === 'inventory' && selectedInventoryType === InventoryType.HAND_TOOL} />
                        <NavItem icon={ElectricalToolIcon} label="Herramienta Eléctrica" onClick={() => selectInventoryTypeFilter(InventoryType.ELECTRICAL_TOOL)} isActive={currentView === 'inventory' && selectedInventoryType === InventoryType.ELECTRICAL_TOOL} />
                        <NavItem icon={PpeIcon} label="Indumentaria (EPP)" onClick={() => selectInventoryTypeFilter(InventoryType.PPE)} isActive={currentView === 'inventory' && selectedInventoryType === InventoryType.PPE} />
                        <NavItem icon={SingleUseIcon} label="Material de Consumo" onClick={() => selectInventoryTypeFilter(InventoryType.SINGLE_USE)} isActive={currentView === 'inventory' && selectedInventoryType === InventoryType.SINGLE_USE} />
                        
                        <NavHeader label="Empresa" />
                        <NavItem icon={PurchaseOrdersIcon} label="Órdenes de Compra" onClick={() => selectView('purchaseOrders')} isActive={currentView === 'purchaseOrders'}/>
                        <NavItem icon={PersonnelIcon} label="Personal" onClick={() => selectView('personnel')} isActive={currentView === 'personnel'} />
                        
                        <div className="pt-8 px-2">
                             <button onClick={handleLogout} className="w-full flex items-center justify-center p-3 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors font-bold text-xs">
                                <LogOutIcon className="w-5 h-5 mr-2" />
                                SALIR DEL SISTEMA
                             </button>
                        </div>
                    </nav>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Header 
                    toggleSidebar={() => setSidebarOpen(!isSidebarOpen)} 
                    userRole={userRole} 
                    setUserRole={setUserRole} 
                    onExportData={() => {}} 
                    onImportData={() => {}} 
                    onResetData={handleResetData} 
                    onOpenUserManagement={() => setUserManagementOpen(true)} 
                    onLogout={handleLogout} 
                />
                <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-gray-50">
                    <div className="max-w-7xl mx-auto">
                        {currentView === 'dashboard' && <Dashboard items={items} movements={movements} />}
                        {currentView === 'inventory' && (
                            <InventoryView 
                                items={filteredItems} 
                                openAddItemModal={() => setAddItemModalOpen(true)} 
                                onEditItem={(item) => { setItemToEdit(item); setEditModalOpen(true); }} 
                                onDeleteItem={handleDeleteItem} 
                                onItemHistory={(item) => { setItemForHistory(item); setHistoryModalOpen(true); }} 
                                userRole={userRole} 
                                category={selectedSubCategory || selectedInventoryType || 'Todos'} 
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
                            />
                        )}
                        {currentView === 'purchaseOrders' && (
                            <PurchaseOrdersView 
                                purchaseOrders={purchaseOrders} 
                                items={items} 
                                openAddPurchaseOrderModal={() => setAddPOModalOpen(true)} 
                                onUpdateStatus={() => {}} 
                                userRole={userRole} 
                                onGoBack={() => selectView('dashboard')} 
                            />
                        )}
                        {currentView === 'personnel' && (
                            <PersonnelView 
                                personnel={personnel} 
                                openAddPersonnelModal={() => setAddPersonnelModalOpen(true)} 
                                onGoBack={() => selectView('dashboard')} 
                            />
                        )}
                        {currentView === 'projects' && (
                            <ProjectsView 
                                projects={projects} 
                                movements={movements} 
                                items={items} 
                                personnel={personnel} 
                                onAddProject={(p) => setProjects(prev => [...prev, { ...p, id: `proj-${Date.now()}` }])} 
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

            <AddItemModal isOpen={isAddItemModalOpen} onClose={() => setAddItemModalOpen(false)} onAddItem={handleAddItem} userRole={userRole} />
            <EditItemModal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} onEditItem={handleEditItem} itemToEdit={itemToEdit} />
            <LogMovementModal isOpen={isLogMovementModalOpen} onClose={() => setLogMovementModalOpen(false)} onLogMovement={handleLogMovement} items={items} personnel={personnel} projects={projects} userRole={userRole} />
            <AddPersonnelModal isOpen={isAddPersonnelModalOpen} onClose={() => setAddPersonnelModalOpen(false)} onAddPersonnel={(p) => setPersonnel(prev => [...prev, { ...p, id: `person-${Date.now()}` }])} />
            <AddPurchaseOrderModal isOpen={isAddPOModalOpen} onClose={() => setAddPOModalOpen(false)} onAddPurchaseOrder={(o) => setPurchaseOrders(prev => [{ ...o, id: `po-${Date.now()}` }, ...prev])} items={items} />
            <ItemHistoryModal isOpen={isHistoryModalOpen} onClose={() => setHistoryModalOpen(false)} item={itemForHistory} movements={movements} personnel={personnel} />
            <UserManagementModal isOpen={isUserManagementOpen} onClose={() => setUserManagementOpen(false)} users={users} onAddUser={(u) => setUsers(prev => [...prev, u])} onDeleteUser={(id) => setUsers(prev => prev.filter(u => u.id !== id))} onEditUser={(u) => setUsers(prev => prev.map(user => user.id === u.id ? u : user))} />
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
