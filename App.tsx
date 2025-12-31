
import React, { useState, useMemo, useEffect } from 'react';
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
import { InventoryIcon } from './components/icons/InventoryIcon';
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

const App: React.FC = () => {
    // State Management
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    
    // Users Management State
    const [users, setUsers] = useState<AppUser[]>(() => {
        try {
            const savedUsers = localStorage.getItem('inventory_users');
            return savedUsers ? JSON.parse(savedUsers) : mockUsers;
        } catch (e) {
            console.error("Failed to parse users", e);
            return mockUsers;
        }
    });

    const [items, setItems] = useState<Item[]>(() => {
        try {
            const savedItems = localStorage.getItem('inventory_items');
            return savedItems ? JSON.parse(savedItems) : mockItems;
        } catch (e) {
            console.error("Failed to parse items", e);
            return mockItems;
        }
    });

    const [movements, setMovements] = useState<Movement[]>(() => {
        try {
            const savedMovements = localStorage.getItem('inventory_movements');
            if (savedMovements) {
                return JSON.parse(savedMovements).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
            }
            return mockMovements;
        } catch (e) {
            console.error("Failed to parse movements", e);
            return mockMovements;
        }
    });

    const [personnel, setPersonnel] = useState<Personnel[]>(() => {
        try {
            const savedPersonnel = localStorage.getItem('inventory_personnel');
            return savedPersonnel ? JSON.parse(savedPersonnel) : mockPersonnel;
        } catch (e) {
            console.error("Failed to parse personnel", e);
            return mockPersonnel;
        }
    });

    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
        try {
            const savedPOs = localStorage.getItem('inventory_purchase_orders');
            if (savedPOs) {
                return JSON.parse(savedPOs).map((po: any) => ({
                    ...po,
                    orderDate: new Date(po.orderDate),
                    expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : undefined,
                    receivedDate: po.receivedDate ? new Date(po.receivedDate) : undefined,
                }));
            }
            return mockPurchaseOrders;
        } catch (e) {
            console.error("Failed to parse purchase orders", e);
            return mockPurchaseOrders;
        }
    });

    const [projects, setProjects] = useState<Project[]>(() => {
        try {
            const savedProjects = localStorage.getItem('inventory_projects');
            return savedProjects ? JSON.parse(savedProjects) : mockProjects;
        } catch (e) {
            console.error("Failed to parse projects", e);
            return mockProjects;
        }
    });

    const [userRole, setUserRole] = useState<UserRole>(UserRole.OWNER);

    // Persist Data Hooks
    useEffect(() => {
        localStorage.setItem('inventory_users', JSON.stringify(users));
    }, [users]);
    useEffect(() => {
        localStorage.setItem('inventory_items', JSON.stringify(items));
    }, [items]);
    useEffect(() => {
        localStorage.setItem('inventory_movements', JSON.stringify(movements));
    }, [movements]);
    useEffect(() => {
        localStorage.setItem('inventory_personnel', JSON.stringify(personnel));
    }, [personnel]);
    useEffect(() => {
        localStorage.setItem('inventory_purchase_orders', JSON.stringify(purchaseOrders));
    }, [purchaseOrders]);
    useEffect(() => {
        localStorage.setItem('inventory_projects', JSON.stringify(projects));
    }, [projects]);


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
    
    // Kardex State
    const [itemForHistory, setItemForHistory] = useState<Item | null>(null);
    const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);

    const uniqueSubCategories = useMemo(() => {
        const subCategories = new Set(items.map(item => item.subCategory));
        return Array.from(subCategories).sort();
    }, [items]);

    // Computed filtered items based on active filters to resolve line 427 error
    const filteredItems = useMemo(() => {
        let result = items;
        if (selectedInventoryType) {
            result = result.filter(item => item.inventoryType === selectedInventoryType);
        }
        if (selectedSubCategory) {
            result = result.filter(item => item.subCategory === selectedSubCategory);
        }
        return result;
    }, [items, selectedInventoryType, selectedSubCategory]);

    // Handlers
    const handleLogin = (role: UserRole) => {
        setUserRole(role);
        setIsAuthenticated(true);
    }
    
    const handleLogout = () => {
        if (window.confirm('¿Desea cerrar sesión para cambiar de usuario?')) {
            setIsAuthenticated(false);
            setCurrentView('dashboard');
        }
    }

    const handleAddUser = (newUser: AppUser) => {
        setUsers([...users, newUser]);
    }
    const handleEditUser = (updatedUser: AppUser) => {
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    }
    const handleDeleteUser = (id: string) => {
        setUsers(users.filter(u => u.id !== id));
    }

    const handleAddItem = (item: Omit<Item, 'id'>) => {
        const newItem: Item = { ...item, id: `item-${Date.now()}` };
        setItems(prev => [...prev, newItem]);
    };

    const handleEditItem = (updatedItem: Item) => {
        setItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
        setItemToEdit(null);
    };

    const handleDeleteItem = (itemId: string) => {
        if (window.confirm('¿Está seguro de que desea eliminar este artículo?')) {
            setItems(prev => prev.filter(item => item.id !== itemId));
        }
    };
    
    const openEditItemModal = (item: Item) => {
        setItemToEdit(item);
        setEditModalOpen(true);
    };

    const openItemHistory = (item: Item) => {
        setItemForHistory(item);
        setHistoryModalOpen(true);
    };

    const handleLogMovement = (movement: Omit<Movement, 'id' | 'timestamp'>) => {
        const newMovement: Movement = { 
            ...movement, 
            id: `move-${Date.now()}`, 
            timestamp: new Date(),
            isReturned: false 
        };
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

    const handleReturnLoan = (movementId: string) => {
        const movement = movements.find(m => m.id === movementId);
        if (!movement || movement.isReturned) return;

        const itemName = items.find(i => i.id === movement.itemId)?.name || 'artículo';
        if (window.confirm(`¿Confirmar devolución de: ${itemName}?`)) {
            setMovements(prev => prev.map(m => m.id === movementId ? { ...m, isReturned: true } : m));
            const item = items.find(i => i.id === movement.itemId);
            if (item) {
                handleEditItem({ ...item, quantity: item.quantity + movement.quantity });
            }
        }
    };

    const handleAddPersonnel = (person: Omit<Personnel, 'id'>) => {
        const newPerson: Personnel = { ...person, id: `person-${Date.now()}` };
        setPersonnel(prev => [...prev, newPerson]);
    };

    const handleEditPersonnel = (updatedPerson: Personnel) => {
        setPersonnel(prev => prev.map(p => p.id === updatedPerson.id ? updatedPerson : p));
    };

    const handleDeletePersonnel = (id: string) => {
        if (window.confirm('¿Eliminar a esta persona del sistema?')) {
            setPersonnel(prev => prev.filter(p => p.id !== id));
        }
    };

    const handleAddProject = (project: Omit<Project, 'id'>) => {
        const newProject: Project = { ...project, id: `proj-${Date.now()}` };
        setProjects(prev => [...prev, newProject]);
    };

    const handleAddPurchaseOrder = (order: Omit<PurchaseOrder, 'id'>) => {
        const newOrder: PurchaseOrder = { ...order, id: `po-${Date.now()}` };
        setPurchaseOrders(prev => [newOrder, ...prev]);
    };

    const handleUpdatePOStatus = (orderId: string, status: PurchaseOrderStatus) => {
        setPurchaseOrders(prev => prev.map(order => {
            if (order.id === orderId) {
                const updatedOrder = { ...order, status };
                if (status === PurchaseOrderStatus.RECEIVED) {
                    updatedOrder.receivedDate = new Date();
                    updatedOrder.items.forEach(orderItem => {
                        handleLogMovement({
                            itemId: orderItem.itemId,
                            type: MovementType.PURCHASE,
                            quantity: orderItem.quantity,
                            notes: `Recibido de orden de compra #${order.id.split('-')[1]}`
                        });
                    });
                }
                return updatedOrder;
            }
            return order;
        }));
    };

    const handleExportData = () => {
        const data = { 
            items, 
            movements, 
            personnel, 
            purchaseOrders, 
            projects, 
            users, 
            version: "2.0",
            exportDate: new Date().toISOString() 
        };
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `backup_bodega_cop_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = e.target?.result as string;
                const data = JSON.parse(json);
                
                // Validación estricta para asegurar que el backup sea compatible
                if (data.items && data.movements && data.personnel && data.projects) {
                    if (window.confirm('¡ATENCIÓN! Se reemplazarán todos los datos por el respaldo. ¿Confirmar restauración?')) {
                        // Limpiar y guardar
                        localStorage.clear();
                        localStorage.setItem('inventory_items', JSON.stringify(data.items));
                        localStorage.setItem('inventory_movements', JSON.stringify(data.movements));
                        localStorage.setItem('inventory_personnel', JSON.stringify(data.personnel));
                        localStorage.setItem('inventory_projects', JSON.stringify(data.projects));
                        if (data.purchaseOrders) localStorage.setItem('inventory_purchase_orders', JSON.stringify(data.purchaseOrders));
                        if (data.users) localStorage.setItem('inventory_users', JSON.stringify(data.users));
                        
                        alert('Restauración completada. El sistema se reiniciará para aplicar los cambios.');
                        window.location.reload();
                    }
                } else {
                    alert('Error: El archivo de backup no es válido o está incompleto.');
                }
            } catch (error) {
                console.error("Error importing data", error);
                alert('Error al leer el archivo. Asegúrese de que sea un JSON válido.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const handleResetData = () => {
        const password = prompt("ADVERTENCIA: Se borrará TODO.\nIngrese la CLAVE MAESTRA para confirmar:");
        if (password === '00') {
            if (window.confirm('¿Está absolutamente seguro de borrar la base de datos?')) {
                localStorage.clear();
                window.location.reload();
            }
        } else if (password !== null) {
            alert("Clave incorrecta.");
        }
    };
    
    const selectView = (view: View) => {
        setCurrentView(view);
        setSelectedSubCategory(null);
        setSelectedInventoryType(null);
        if (window.innerWidth < 768) setSidebarOpen(false);
    }
    
    const selectInventoryTypeFilter = (type: InventoryType) => {
        setCurrentView('inventory');
        setSelectedInventoryType(type);
        setSelectedSubCategory(null);
        if (window.innerWidth < 768) setSidebarOpen(false);
    }

    const selectInventorySubCategory = (subCategory: string | null) => {
        setCurrentView('inventory');
        setSelectedSubCategory(subCategory);
        if (subCategory === null) setSelectedInventoryType(null);
        if (window.innerWidth < 768) setSidebarOpen(false);
    }

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
                        <NavItem icon={MovementsIcon} label="Kardex General" onClick={() => selectView('movements')} isActive={currentView === 'movements'} />
                        
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
                <Header toggleSidebar={() => setSidebarOpen(!isSidebarOpen)} userRole={userRole} setUserRole={setUserRole} onExportData={handleExportData} onImportData={handleImportData} onResetData={handleResetData} onOpenUserManagement={() => setUserManagementOpen(true)} onLogout={handleLogout} />
                <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-gray-50">
                    <div className="max-w-7xl mx-auto">
                        {currentView === 'dashboard' && <Dashboard items={items} movements={movements} />}
                        {currentView === 'inventory' && <InventoryView items={filteredItems} openAddItemModal={() => setAddItemModalOpen(true)} onEditItem={openEditItemModal} onDeleteItem={handleDeleteItem} onItemHistory={openItemHistory} userRole={userRole} category={selectedSubCategory || selectedInventoryType || 'Todos'} onGoBack={() => selectView('dashboard')} />}
                        {currentView === 'movements' && <MovementsView movements={movements} items={items} personnel={personnel} openLogMovementModal={() => setLogMovementModalOpen(true)} onReturnLoan={handleReturnLoan} onGoBack={() => selectView('dashboard')} />}
                        {currentView === 'purchaseOrders' && <PurchaseOrdersView purchaseOrders={purchaseOrders} items={items} openAddPurchaseOrderModal={() => setAddPOModalOpen(true)} onUpdateStatus={handleUpdatePOStatus} userRole={userRole} onGoBack={() => selectView('dashboard')} />}
                        {currentView === 'personnel' && <PersonnelView personnel={personnel} openAddPersonnelModal={() => setAddPersonnelModalOpen(true)} onGoBack={() => selectView('dashboard')} onEditPersonnel={handleEditPersonnel} onDeletePersonnel={handleDeletePersonnel} userRole={userRole} />}
                        {currentView === 'projects' && <ProjectsView projects={projects} movements={movements} items={items} personnel={personnel} onAddProject={handleAddProject} onGoBack={() => selectView('dashboard')} userRole={userRole} />}
                        {currentView === 'loans' && <LoansView movements={movements} items={items} personnel={personnel} onReturnItem={handleReturnLoan} onGoBack={() => selectView('dashboard')} />}
                    </div>
                </main>
            </div>

            <AddItemModal isOpen={isAddItemModalOpen} onClose={() => setAddItemModalOpen(false)} onAddItem={handleAddItem} userRole={userRole} />
            <EditItemModal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} onEditItem={handleEditItem} itemToEdit={itemToEdit} />
            <LogMovementModal isOpen={isLogMovementModalOpen} onClose={() => setLogMovementModalOpen(false)} onLogMovement={handleLogMovement} items={items} personnel={personnel} projects={projects} userRole={userRole} filterInventoryType={selectedInventoryType || undefined} />
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

const NavHeader: React.FC<{label: string}> = ({label}) => (
    <h3 className="px-5 pt-6 pb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</h3>
);

export default App;
