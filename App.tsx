
import React, { useState, useEffect } from 'react';
import { AddItemModal } from './components/AddItemModal';
import { EditItemModal } from './components/EditItemModal';
import { Dashboard } from './components/Dashboard';
import { Header } from './components/Header';
import { LogMovementModal } from './components/LogMovementModal';
import { AddPersonnelModal } from './components/AddPersonnelModal';
import { PersonnelView } from './components/PersonnelView';
import { KardexHub } from './components/KardexHub';
import { ItemHistoryModal } from './components/ItemHistoryModal';
import { UserManagementModal } from './components/UserManagementModal';
import CopilotView from './components/CopilotView';
import { FloatingChat } from './components/FloatingChat';
import { OnboardingModal } from './components/OnboardingModal';
import { HelpView } from './components/HelpView';
import { TraceabilityView } from './components/TraceabilityView';
import { WhatsAppView } from './components/WhatsAppView';
import { PickupView } from './components/PickupView';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { PinConfirmModal } from './components/PinConfirmModal';
import { SettingsModal, AppConfig, DEFAULT_CONFIG } from './components/SettingsModal';
import { requestNotificationPermission, checkAndNotifyPickup } from './services/notificationService';

import { mockItems, mockMovements, mockPersonnel, mockPurchaseOrders, mockProjects, mockUsers } from './mockData';
import { realUsers as seedUsers } from './realData';
import { Item, Movement, MovementType, Personnel, PurchaseOrder, UserRole, InventoryType, Project, AppUser, PurchaseOrderStatus, AuditLog, BehaviorLog } from './types';
import { LoginView } from './components/LoginView';
import { LandingPage } from './components/LandingPage';
import { InvoiceReaderModal } from './components/InvoiceReaderModal';
import { saveToLocalStorage, loadFromLocalStorage, exportToFile, importFromFile } from './storage';
import * as db from './services/supabaseService';

// Icons
import { DashboardIcon } from './components/icons/DashboardIcon';
import { MovementsIcon } from './components/icons/MovementsIcon';
import { PersonnelIcon } from './components/icons/PersonnelIcon';
import { WhatsAppIcon } from './components/icons/WhatsAppIcon';

type View = 'dashboard' | 'kardex' | 'personnel' | 'copilot' | 'help' | 'whatsapp' | 'pickup' | 'traceability';
type KardexTab = 'movements' | 'loans' | 'inventory' | 'projects';

const SESSION_KEY = 'bodega_session';
const ONBOARDING_KEY = 'bodega_onboarding_v1';

// Migra datos de usuarios viejos: toma name/role del seed pero preserva credenciales.
// Busca por ID primero; si no coincide, busca por role (para compatibilidad con datos legacy).
const migrateUsers = (stored: AppUser[]): AppUser[] => {
    const usedIds = new Set<string>();
    return seedUsers.map(seed => {
        let found = stored.find(u => u.id === seed.id);
        if (!found) found = stored.find(u => u.role === seed.role && !usedIds.has(u.id));
        if (found) {
            usedIds.add(found.id);
            return { ...seed, username: found.username, password: found.password, setupComplete: found.setupComplete || (!!found.username && !!found.password) };
        }
        return seed;
    });
};

const App: React.FC = () => {
    const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem(SESSION_KEY));
    const [userRole, setUserRole] = useState<UserRole>(() => {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}').role ?? UserRole.OWNER; } catch { return UserRole.OWNER; }
    });
    // Carga inicial síncrona desde localStorage, con fallback a mockData
    const NAME_FIX: Record<string, string> = { Julio: 'Juli', julio: 'Juli', Administrador: 'Juli', administrador: 'Juli' };
    const [users, setUsers] = useState<AppUser[]>(() => {
        const s = loadFromLocalStorage();
        return migrateUsers(s?.users ?? mockUsers).map(u => NAME_FIX[u.name] ? { ...u, name: NAME_FIX[u.name] } : u);
    });

    const [userName, setUserName] = useState<string>(() => {
        try {
            const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
            if (!session.name) return '';
            if (session.role === UserRole.VISITOR) return 'Visitante';
            // Si el nombre guardado coincide exactamente con un seed, usarlo
            if (seedUsers.some(u => u.name === session.name)) return session.name;
            // Nombre desactualizado (ej: 'Julio' → 'Juli', 'Administrador' → 'Juli')
            // Para OWNER siempre hay un único seed; para EMPLOYEE buscamos por rol
            const seed = seedUsers.find(u => u.role === session.role);
            return seed?.name ?? session.name;
        } catch { return ''; }
    });
    const SEED_ID = /^(ht|et|ppe|su)-/;
    const [items, setItems] = useState<Item[]>(() => { const s = loadFromLocalStorage(); return (s?.items ?? []).filter(i => !SEED_ID.test(i.id)); });
    const [movements, setMovements] = useState<Movement[]>(() => { const s = loadFromLocalStorage(); return (s?.movements ?? []).filter(m => !SEED_ID.test(m.itemId ?? '')); });
    const [personnel, setPersonnel] = useState<Personnel[]>(() => {
        const s = loadFromLocalStorage();
        const ls = s?.personnel;
        if (ls?.length) {
            const valid = ls.filter(p => p.name?.trim().length >= 4);
            if (valid.length > 0) return valid;
        }
        return mockPersonnel;
    });
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => { const s = loadFromLocalStorage(); return s?.purchaseOrders ?? []; });
    const [projects, setProjects] = useState<Project[]>(() => { const s = loadFromLocalStorage(); return s?.projects ?? mockProjects; });
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
        const s = loadFromLocalStorage();
        const logs = s?.auditLogs ?? [];
        const fix: Record<string, string> = { Administrador: 'Juli', administrador: 'Juli', Julio: 'Juli', julio: 'Juli' };
        return logs.map(l => fix[l.actor] ? { ...l, actor: fix[l.actor] } : l);
    });
    const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>(() => {
        const s = loadFromLocalStorage();
        const logs = s?.behaviorLogs ?? [];
        const fix: Record<string, string> = { Julio: 'Juli', julio: 'Juli', Administrador: 'Juli', administrador: 'Juli' };
        return logs.map(l => fix[l.actor] ? { ...l, actor: fix[l.actor] } : l);
    });

    const addAuditLog = (action: string, description: string, actorOverride?: string) => {
        const entry: AuditLog = {
            id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: new Date(),
            action,
            actor: actorOverride ?? userName,
            description,
        };
        setAuditLogs(prev => [entry, ...prev]);
    };

    const addBehaviorLog = (action: string, detail: string) => {
        const entry: BehaviorLog = {
            id: `beh-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: new Date(),
            actor: userName,
            action,
            detail,
        };
        setBehaviorLogs(prev => [entry, ...prev]);
    };

    const handleLoginSuccess = (role: UserRole, name: string) => {
        const nameFix: Record<string, string> = { Julio: 'Juli', julio: 'Juli', Administrador: 'Juli', administrador: 'Juli' };
        const fixedName = nameFix[name] ?? name;
        setUserRole(role);
        setUserName(fixedName);
        setLoggedIn(true);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ role, name: fixedName }));
        addAuditLog('USER_LOGIN', `Ingresó a la app: ${fixedName} (${role})`, fixedName);
        setBehaviorLogs(prev => [{
            id: `beh-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: new Date(),
            actor: fixedName,
            action: 'SESSION_LOGIN',
            detail: `Inició sesión`,
        }, ...prev]);
    };

    const handleFirstSetup = (userId: string, username: string, password: string) => {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, username, password, setupComplete: true } : u));
        const user = users.find(u => u.id === userId);
        if (user) {
            db.updateUser({ ...user, username, password, setupComplete: true }).catch(() => setSyncStatus('error'));
            handleLoginSuccess(user.role, user.name);
        }
    };

    const handleLogout = () => {
        setBehaviorLogs(prev => [{
            id: `beh-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: new Date(),
            actor: userName,
            action: 'SESSION_LOGOUT',
            detail: `Cerró sesión`,
        }, ...prev]);
        localStorage.removeItem(SESSION_KEY);
        setLoggedIn(false);
    };

    // Auto-save a localStorage en cada cambio
    useEffect(() => { saveToLocalStorage({ items, movements, personnel, purchaseOrders, projects, users, auditLogs, behaviorLogs }); }, [items, movements, personnel, purchaseOrders, projects, users, auditLogs, behaviorLogs]);

    // Notificar herramientas pendientes de recoger cada vez que se abre la app
    useEffect(() => {
        checkAndNotifyPickup(movements, items);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync desde Supabase al montar — migra localStorage → Supabase y hace merge
    useEffect(() => {
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const local = loadFromLocalStorage();
        const localItems      = (local?.items      ?? []).filter((i: Item)     => !SEED_ID.test(i.id));
        const localMovements  = (local?.movements  ?? []).filter((m: Movement) => !SEED_ID.test(m.itemId ?? ''));
        const localProjects   =  local?.projects   ?? [];
        const localPersonnel  = (local?.personnel  ?? []).filter(p => p.name?.trim().length >= 4);
        const localPOs        =  local?.purchaseOrders ?? [];

        db.fetchUsers().then(data => { if (data.length > 0 && local === null) setUsers(migrateUsers(data)); }).catch(() => {});

        Promise.all([
            db.fetchItems().catch((): Item[] => []),
            db.fetchMovements().catch((): Movement[] => []),
            db.fetchProjects().catch((): Project[] => []),
            db.fetchPersonnel().catch((): Personnel[] => []),
            db.fetchPurchaseOrders().catch((): PurchaseOrder[] => []),
        ]).then(([supaItems, supaMovements, supaProjectsRaw, supaPersonnelRaw, supaPOs]) => {
            // Deduplicar personal y proyectos de Supabase por nombre (defensa contra duplicados en DB)
            const seenPNames = new Set<string>();
            const supaPersonnel = supaPersonnelRaw.filter(p => {
                const key = p.name.trim().toLowerCase();
                if (seenPNames.has(key)) return false;
                seenPNames.add(key);
                return true;
            });
            const seenProjNames = new Set<string>();
            const supaProjects = supaProjectsRaw.filter(p => {
                const key = p.name.trim().toLowerCase();
                if (seenProjNames.has(key)) return false;
                seenProjNames.add(key);
                return true;
            });

            const supaItemIds = new Set(supaItems.map(i => i.id));
            const supaMovIds  = new Set(supaMovements.map(m => m.id));
            const supaProjIds = new Set(supaProjects.map(p => p.id));
            const supaPerIds  = new Set(supaPersonnel.map(p => p.id));
            const supaPOIds   = new Set(supaPOs.map(o => o.id));

            // Reasignar UUIDs a entidades con IDs temporales (per-XXX, i-XXX, mov-XXX, p-XXX, po-XXX)
            const itemRemap = new Map<string, string>();
            const projRemap = new Map<string, string>();
            const perRemap  = new Map<string, string>();
            const movRemap  = new Map<string, string>();

            const normItems = localItems.map(item => {
                if (supaItemIds.has(item.id) || UUID_RE.test(item.id)) return item;
                const id = crypto.randomUUID();
                itemRemap.set(item.id, id);
                return { ...item, id };
            });

            const normProjects = localProjects.map(p => {
                if (supaProjIds.has(p.id) || UUID_RE.test(p.id)) return p;
                // Si Supabase ya tiene el mismo proyecto por nombre, usar su ID (evita duplicados)
                const supaMatch = supaProjects.find(sp => sp.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                if (supaMatch) {
                    projRemap.set(p.id, supaMatch.id);
                    return supaMatch;
                }
                const id = crypto.randomUUID();
                projRemap.set(p.id, id);
                return { ...p, id };
            });

            const normPersonnel = localPersonnel.map(p => {
                if (supaPerIds.has(p.id) || UUID_RE.test(p.id)) return p;
                // Si Supabase ya tiene la misma persona por nombre, usar su ID (evita duplicados)
                const supaMatch = supaPersonnel.find(sp => sp.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                if (supaMatch) {
                    perRemap.set(p.id, supaMatch.id);
                    return supaMatch;
                }
                const id = crypto.randomUUID();
                perRemap.set(p.id, id);
                return { ...p, id };
            });

            const normPOs = localPOs.map(o => {
                if (supaPOIds.has(o.id) || UUID_RE.test(o.id)) return o;
                return { ...o, id: crypto.randomUUID() };
            });

            // Aplicar remaps de items/projects/personnel a los movimientos, luego normalizar sus IDs
            const normMovements = localMovements.map(m => {
                const itemId      = m.itemId      ? (itemRemap.get(m.itemId)      ?? m.itemId)      : m.itemId;
                const projectId   = m.projectId   ? (projRemap.get(m.projectId)   ?? m.projectId)   : m.projectId;
                const personnelId = m.personnelId ? (perRemap.get(m.personnelId)  ?? m.personnelId) : m.personnelId;
                const base = { ...m, itemId, projectId, personnelId };
                if (supaMovIds.has(base.id) || UUID_RE.test(base.id)) return base;
                const id = crypto.randomUUID();
                movRemap.set(m.id, id);
                return { ...base, id };
            });

            // Merge: Supabase gana para IDs coincidentes, añadir los que solo están en local
            const mergedItems     = [...supaItems,     ...normItems.filter(i     => !supaItemIds.has(i.id))];
            const mergedMovements = [...supaMovements, ...normMovements.filter(m => !supaMovIds.has(m.id))];
            const mergedProjects  = [...supaProjects,  ...normProjects.filter(p  => !supaProjIds.has(p.id))];
            const mergedPersonnel = [...supaPersonnel, ...normPersonnel.filter(p => !supaPerIds.has(p.id))];
            const mergedPOs       = [...supaPOs,       ...normPOs.filter(o       => !supaPOIds.has(o.id))];

            // Actualizar estado solo si hubo cambios reales
            if (supaItems.length > 0 || itemRemap.size > 0)        setItems(mergedItems);
            if (supaMovements.length > 0 || movRemap.size > 0)     setMovements(mergedMovements);
            if (supaProjects.length > 0 || projRemap.size > 0)     setProjects(mergedProjects);
            if (supaPersonnel.length > 0 || perRemap.size > 0)     setPersonnel(mergedPersonnel);
            if (supaPOs.length > 0 || normPOs.some(o => !supaPOIds.has(o.id))) setPurchaseOrders(mergedPOs);

            // Subir diferencias a Supabase en segundo plano (bulk upsert — idempotente)
            const itemsToSync = mergedItems.filter(i     => !supaItemIds.has(i.id));
            const movsToSync  = mergedMovements.filter(m => !supaMovIds.has(m.id));
            const projsToSync = mergedProjects.filter(p  => !supaProjIds.has(p.id));
            const perToSync   = mergedPersonnel.filter(p => !supaPerIds.has(p.id));
            const posToSync   = mergedPOs.filter(o       => !supaPOIds.has(o.id));

            if (itemsToSync.length > 0) db.bulkUpsertItems(itemsToSync).catch(() => {});
            if (movsToSync.length  > 0) db.bulkUpsertMovements(movsToSync).catch(() => {});
            if (projsToSync.length > 0) db.bulkUpsertProjects(projsToSync).catch(() => {});
            if (perToSync.length   > 0) db.bulkUpsertPersonnel(perToSync).catch(() => {});
            if (posToSync.length   > 0) db.bulkUpsertPurchaseOrders(posToSync).catch(() => {});
        });
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
            .catch(() => {
                setSyncStatus('error');
                syncTimer.current = setTimeout(() => setSyncStatus('idle'), 8000);
            });
    };

    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [kardexTab, setKardexTab] = useState<KardexTab>('movements');
    const EMPLOYEE_VIEWS: View[] = ['dashboard', 'kardex', 'personnel', 'help', 'whatsapp', 'pickup'];
    const VISITOR_VIEWS: View[] = ['dashboard', 'kardex', 'whatsapp'];
    const effectiveView: View = (userRole === UserRole.VISITOR && !VISITOR_VIEWS.includes(currentView))
        ? 'dashboard'
        : (userRole === UserRole.EMPLOYEE && !EMPLOYEE_VIEWS.includes(currentView))
            ? 'dashboard'
            : currentView;
    const pendingPickupCount = movements.filter(m => m.isLoan && !m.isReturned && m.pendingPickup).length;
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    const CONFIG_KEY = 'bodega_config';
    const [appConfig, setAppConfig] = useState<AppConfig>(() => {
        try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') }; } catch { return DEFAULT_CONFIG; }
    });
    const handleConfigChange = (cfg: AppConfig) => {
        setAppConfig(cfg);
        localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    };

    const [isInvoiceReaderOpen, setInvoiceReaderOpen] = useState(false);
    const [isSearchOpen, setSearchOpen] = useState(false);
    const [isSettingsOpen, setSettingsOpen] = useState(false);
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
        if (data.users) setUsers(migrateUsers(data.users));
    }, (msg) => alert(msg));

    const handleOnboardingFinish = () => {
        localStorage.setItem(ONBOARDING_KEY, 'done');
        setShowOnboarding(false);
    };

    const handleResetAllData = () => {
        requirePin(
            () => {
                setItems([]);
                setMovements([]);
                setPersonnel([]);
                setPurchaseOrders([]);
                setProjects([]);
                addAuditLog('ITEM_DELETED', 'Se borró toda la bodega (reset completo)');
                // También borra de Supabase (fire and forget)
                Promise.all([
                    db.deleteAllMovements(),
                    db.deleteAllItems(),
                    db.deleteAllPersonnel(),
                    db.deleteAllProjects(),
                    db.deleteAllPurchaseOrders(),
                ]).catch(e => console.error('Error limpiando Supabase:', e));
                alert('Bodega limpia. Ahora puedes empezar a registrar tus propios materiales.');
            },
            'Borrar toda la bodega',
            'Se eliminarán TODOS los productos, trabajadores y movimientos. Irreversible.',
        );
    };

    const handleResetMaterials = () => {
        requirePin(
            () => {
                setItems([]);
                setMovements([]);
                setPurchaseOrders([]);
                addAuditLog('ITEM_DELETED', 'Restableció materiales (ítems, movimientos, OC). Personal conservado.');
                Promise.all([
                    db.deleteAllMovements(),
                    db.deleteAllItems(),
                    db.deleteAllPurchaseOrders(),
                ]).catch(e => console.error('Error limpiando materiales:', e));
                alert('Materiales limpiados. El personal se conserva.');
            },
            'Restablecer solo materiales',
            'Se eliminarán ítems, movimientos y órdenes de compra. El personal permanece.',
        );
    };

    const NAV_LABELS: Record<View, string> = {
        dashboard: 'Resumen',
        kardex: 'Kardex',
        personnel: 'Personal',
        copilot: 'Copiloto IA',
        help: 'Ayuda',
        whatsapp: 'WhatsApp',
        pickup: 'A Recoger',
        traceability: 'Trazabilidad',
    };

    const selectView = (view: View, tab?: KardexTab) => {
        setCurrentView(view);
        if (tab) setKardexTab(tab);
        if (window.innerWidth < 768) setSidebarOpen(false);
        addBehaviorLog('NAV', `Abrió ${NAV_LABELS[view] ?? view}${tab ? ` → ${tab}` : ''}`);
    };

    // ── Handlers síncronos + sync Supabase en background ──

    const handleImportItems = (newItems: Array<Omit<Item, 'id'>>, inventoryType?: InventoryType) => {
        const created = newItems.map(i => ({
            ...i,
            id: crypto.randomUUID(),
            inventoryType: inventoryType ?? i.inventoryType,
        }));
        setItems(prev => [...prev, ...created]);
        created.forEach(({ id, ...rest }) => withSync(db.addItem(rest, id)));
    };

    const handleAddItem = (i: Omit<Item, 'id'>) => {
        const id = crypto.randomUUID();
        const newItem = { ...i, id };
        setItems(prev => [...prev, newItem]);
        withSync(db.addItem(i, id));
        addAuditLog('ITEM_CREATED', `Se agregó "${i.name}" al inventario`);
    };

    const handleAddItemSync = (i: Omit<Item, 'id'>): Item => {
        const id = crypto.randomUUID();
        const newItem = { ...i, id };
        setItems(prev => [...prev, newItem]);
        withSync(db.addItem(i, id));
        addAuditLog('ITEM_CREATED', `Se agregó "${i.name}" al inventario`);
        return newItem;
    };

    const handleEditItem = (updated: Item) => {
        const prev = items.find(i => i.id === updated.id);
        setItems(p => p.map(i => i.id === updated.id ? updated : i));
        withSync(db.updateItem(updated));
        if (prev?.name !== updated.name) {
            addAuditLog('ITEM_EDITED', `Se editó "${prev?.name ?? updated.name}" → nombre cambiado a "${updated.name}"`);
        } else {
            addAuditLog('ITEM_EDITED', `Se editó "${updated.name}"`);
        }
    };

    const handleDeleteItem = (id: string) => {
        const item = items.find(i => i.id === id);
        const hasMovements = movements.some(m => m.itemId === id);
        const detail = hasMovements ? 'Tiene movimientos registrados. Los registros históricos quedarán sin referencia.' : undefined;
        requirePin(
            () => {
                setItems(prev => prev.filter(i => i.id !== id));
                withSync(db.deleteItem(id));
                addAuditLog('ITEM_DELETED', `Se eliminó "${item?.name ?? id}" del inventario`);
            },
            `Eliminar "${item?.name ?? 'ítem'}"`,
            detail,
        );
    };

    const handleLogMovement = (m: Omit<Movement, 'id'>) => {
        const ts = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp ?? Date.now());
        const id = crypto.randomUUID();
        const newMov = { ...m, id, timestamp: ts };
        setMovements(prev => [newMov, ...prev]);
        setItems(prev => prev.map(item => {
            if (item.id === m.itemId) {
                let newQty = item.quantity;
                if (m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE) newQty -= m.quantity;
                else newQty += m.quantity;
                db.updateItemQuantity(item.id, newQty).catch(() => setSyncStatus('error'));
                return { ...item, quantity: newQty };
            }
            return item;
        }));
        withSync(db.addMovement({ ...m, timestamp: ts }, id));
        const itemName   = items.find(i => i.id === m.itemId)?.name ?? 'herramienta';
        const personName = m.personnelId ? personnel.find(p => p.id === m.personnelId)?.name : undefined;
        if (m.isLoan) {
            addAuditLog('LOAN_CREATED', `Préstamo: "${itemName}"${personName ? ` → ${personName}` : ''}`);
        } else if (m.type === MovementType.CHECK_OUT) {
            addAuditLog('ITEM_EDITED', `📤 Salida: "${itemName}" ×${m.quantity}${personName ? ` — ${personName}` : ''}`);
        } else if (m.type === MovementType.CHECK_IN) {
            addAuditLog('ITEM_CREATED', `📥 Entrada: "${itemName}" ×${m.quantity}${personName ? ` — ${personName}` : ''}`);
        }
    };

    const handleDeleteMovement = (id: string) => {
        const mov = movements.find(m => m.id === id);
        const itemName = mov ? items.find(i => i.id === mov.itemId)?.name ?? mov.itemId : id;
        requirePin(
            () => {
                setMovements(prev => prev.filter(m => m.id !== id));
                withSync(db.deleteMovement(id));
                addAuditLog('MOVEMENT_DELETED', `Se eliminó registro de movimiento: "${itemName}"`);
            },
            `Eliminar registro de "${itemName}"`,
            'Esta acción no se puede deshacer.',
        );
    };

    const handleReturnItem = (id: string, condition?: string, notes?: string) => {
        const mov = movements.find(m => m.id === id);
        const itemName = mov ? items.find(i => i.id === mov.itemId)?.name ?? 'herramienta' : 'herramienta';
        const personName = mov?.personnelId ? personnel.find(p => p.id === mov.personnelId)?.name : undefined;
        setMovements(prev => prev.map(m => m.id === id ? { ...m, isReturned: true, returnCondition: condition as import('./types').ReturnCondition | undefined, returnNotes: notes } : m));
        withSync(db.markMovementReturned(id, condition as import('./types').ReturnCondition | undefined, notes));
        addAuditLog('LOAN_RETURNED', `Devuelta: "${itemName}"${personName ? ` de ${personName}` : ''}${condition ? ` — estado: ${condition}` : ''}`);
    };

    const handleMarkPendingPickup = (id: string, pending: boolean) => {
        const mov = movements.find(m => m.id === id);
        const itemName = mov ? items.find(i => i.id === mov.itemId)?.name ?? 'herramienta' : 'herramienta';
        const personName = mov?.personnelId ? personnel.find(p => p.id === mov.personnelId)?.name : undefined;
        setMovements(prev => prev.map(m => m.id === id ? { ...m, pendingPickup: pending } : m));
        withSync(db.markMovementPendingPickup(id, pending));
        if (pending) {
            addAuditLog('PICKUP_MARKED', `Marcado a recoger: "${itemName}"${personName ? ` de ${personName}` : ''}`);
        } else {
            addAuditLog('PICKUP_CANCELLED', `Cancelada recogida: "${itemName}"${personName ? ` de ${personName}` : ''}`);
        }
    };

    const handleAssignProjectToLoan = (movementId: string, projectId: string) => {
        setMovements(prev => prev.map(m => m.id === movementId ? { ...m, projectId } : m));
        withSync(db.updateMovementProject(movementId, projectId));
    };

    const handleTransferLoan = (movementId: string, newPersonnelId: string) => {
        const original = movements.find(m => m.id === movementId);
        if (!original) return;

        const fromName = personnel.find(p => p.id === original.personnelId)?.name ?? 'trabajador anterior';
        const toName   = personnel.find(p => p.id === newPersonnelId)?.name ?? 'trabajador destino';
        const itemName = items.find(i => i.id === original.itemId)?.name ?? 'herramienta';

        if (!window.confirm(`¿Traspasar "${itemName}" de ${fromName} a ${toName}?`)) return;

        // Cierra el préstamo original sin tocar el stock (la herramienta no regresó a bodega)
        setMovements(prev => prev.map(m => m.id === movementId ? { ...m, isReturned: true, pendingPickup: false } : m));
        withSync(db.markMovementReturned(movementId));

        // Crea nuevo préstamo al trabajador destino, sin ajustar cantidad de inventario
        const newMovId = crypto.randomUUID();
        const newMov: Movement = {
            ...original,
            id: newMovId,
            timestamp: new Date(),
            personnelId: newPersonnelId,
            isReturned: false,
            pendingPickup: false,
            notes: `Traspaso desde ${fromName}`,
        };
        setMovements(prev => [newMov, ...prev]);
        withSync(db.addMovement(newMov, newMovId));
        addAuditLog('LOAN_TRANSFERRED', `Traspaso: "${itemName}" de ${fromName} → ${toName}`);
    };

    const handleAddPersonnel = (p: Omit<Personnel, 'id'>) => {
        const id = crypto.randomUUID();
        const newP = { ...p, id };
        setPersonnel(prev => [...prev, newP]);
        withSync(db.addPersonnel(p, id));
        addAuditLog('PERSONNEL_CREATED', `Se agregó trabajador: "${p.name}"`);
    };

    const handleAddPersonnelSync = (p: Omit<Personnel, 'id'>): Personnel => {
        const id = crypto.randomUUID();
        const newP = { ...p, id };
        setPersonnel(prev => [...prev, newP]);
        withSync(db.addPersonnel(p, id));
        addAuditLog('PERSONNEL_CREATED', `Se agregó trabajador: "${p.name}"`);
        return newP;
    };

    const handleEditPersonnel = (p: Personnel) => {
        const prev = personnel.find(pers => pers.id === p.id);
        setPersonnel(ps => ps.map(pers => pers.id === p.id ? p : pers));
        withSync(db.updatePersonnel(p));
        if (prev?.name !== p.name) {
            addAuditLog('PERSONNEL_EDITED', `Se cambió nombre de trabajador: "${prev?.name}" → "${p.name}"`);
        } else {
            addAuditLog('PERSONNEL_EDITED', `Se editó trabajador: "${p.name}"`);
        }
    };

    const handleDeletePersonnel = (id: string) => {
        const person = personnel.find(p => p.id === id);
        const hasMovements = movements.some(m => m.personnelId === id);
        const detail = hasMovements ? 'Tiene movimientos registrados. Se perderá la referencia en el historial.' : undefined;
        requirePin(
            () => {
                setPersonnel(prev => prev.filter(p => p.id !== id));
                withSync(db.deletePersonnel(id));
                addAuditLog('PERSONNEL_DELETED', `Se eliminó trabajador: "${person?.name ?? id}"`);
            },
            `Eliminar trabajador "${person?.name ?? 'trabajador'}"`,
            detail,
        );
    };

    const handleAddProject = (p: Omit<Project, 'id'>) => {
        const id = crypto.randomUUID();
        const newP = { ...p, id };
        setProjects(prev => [...prev, newP]);
        withSync(db.addProject(p, id));
        addAuditLog('PROJECT_CREATED', `Se creó proyecto: "${p.name}"`);
    };

    const handleAddProjectSync = (p: Omit<Project, 'id'>): Project => {
        const id = crypto.randomUUID();
        const newP = { ...p, id };
        setProjects(prev => [...prev, newP]);
        withSync(db.addProject(p, id));
        addAuditLog('PROJECT_CREATED', `Se creó proyecto: "${p.name}"`);
        return newP;
    };

    const handleCreateProjectByName = (name: string): Project => handleAddProjectSync({ name, status: 'active' });

    const handleDeleteProject = (id: string) => {
        const project = projects.find(p => p.id === id);
        requirePin(
            () => {
                setProjects(prev => prev.filter(p => p.id !== id));
                withSync(db.deleteProject(id));
                addAuditLog('PROJECT_DELETED', `Se eliminó proyecto: "${project?.name ?? id}"`);
            },
            `Eliminar proyecto "${project?.name ?? 'proyecto'}"`,
        );
    };

    const handleAddPurchaseOrder = (o: Omit<PurchaseOrder, 'id'>) => {
        const id = crypto.randomUUID();
        const newO = { ...o, id };
        setPurchaseOrders(prev => [newO, ...prev]);
        withSync(db.addPurchaseOrder(o).then(created => setPurchaseOrders(prev => prev.map(x => x.id === id ? created : x))));
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
        addAuditLog('USER_CREATED', `Se creó usuario: "${u.username}" (${u.role})`);
    };

    const handleEditUser = (u: AppUser) => {
        const seed = seedUsers.find(s => s.id === u.id);
        const normalized = seed ? { ...u, name: seed.name } : u;
        setUsers(prev => prev.map(user => user.id === u.id ? normalized : user));
        withSync(db.updateUser(normalized));
        addAuditLog('PERSONNEL_EDITED', `Se editó usuario: "${u.username}"`);
    };

    const handleDeleteUser = (id: string) => {
        const user = users.find(u => u.id === id);
        requirePin(
            () => {
                setUsers(prev => prev.filter(u => u.id !== id));
                db.deleteUser(id).catch(() => setSyncStatus('error'));
                addAuditLog('USER_DELETED', `Se eliminó usuario: "${user?.username ?? id}"`);
            },
            `Eliminar usuario "${user?.username ?? 'usuario'}"`,
        );
    };

    const handleClearAuditLogs = () => {
        requirePin(
            () => setAuditLogs([]),
            'Limpiar bitácora',
            'Se borrarán todos los registros de auditoría.',
        );
    };

    // ── PIN de autorización para acciones destructivas ──
    const [pinAction, setPinAction] = useState<null | { fn: () => void; title?: string; message?: string }>(null);
    const requirePin = (fn: () => void, title?: string, message?: string) => {
        setPinAction({ fn, title, message });
    };

    if (!loggedIn) return <LoginView users={users} onLoginSuccess={handleLoginSuccess} onFirstSetup={handleFirstSetup} />;

    return (
        <div translate="no" className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            {/* Backdrop mobile: cierra el sidebar al tocar fuera */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-20 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside className={`bg-white border-r border-gray-200 shadow-xl transition-all duration-300 ease-in-out fixed md:relative inset-y-0 left-0 z-30 transform md:transform-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'} flex flex-col`}>
                <div className="h-16 flex-shrink-0 flex items-center px-5 border-b bg-blue-700">
                    <img
                        src="/montecielo-logo.png"
                        alt="Grupo Montecielo"
                        className="h-8 w-auto object-contain rounded-md"
                    />
                </div>

                <div className="flex-1 overflow-y-auto py-4">
                    <nav className="px-2 space-y-1">
                        <NavItem icon={DashboardIcon} label="Resumen" onClick={() => selectView('dashboard')} isActive={effectiveView === 'dashboard'} />
                        <NavItem icon={MovementsIcon} label="Kardex" onClick={() => selectView('kardex')} isActive={effectiveView === 'kardex'} />
                        <NavItem icon={WhatsAppIcon} label="WhatsApp" onClick={() => selectView('whatsapp')} isActive={effectiveView === 'whatsapp'} />
                        {userRole !== UserRole.VISITOR && (
                            <>
                                <NavItem icon={PersonnelIcon} label="Personal" onClick={() => selectView('personnel')} isActive={effectiveView === 'personnel'} />
                                <NavItem icon={PickupNavIcon} label="A Recoger" onClick={() => selectView('pickup')} isActive={effectiveView === 'pickup'} badge={pendingPickupCount} />
                            </>
                        )}
                        <NavItem
                            icon={({ className }: { className?: string }) => (
                                <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
                                </svg>
                            )}
                            label="Trazabilidad"
                            onClick={() => selectView('traceability')}
                            isActive={effectiveView === 'traceability'}
                        />
                    </nav>
                </div>

                {/* Help & tutorial footer */}
                <div className="flex-shrink-0 px-2 py-3 border-t border-gray-100 space-y-1">
                    <NavItem icon={QuestionMarkIcon} label="Ayuda ❓" onClick={() => selectView('help')} isActive={currentView === 'help'} />
                    <button
                        onClick={() => { addBehaviorLog('BUTTON', 'Abrió: Configuración'); setSettingsOpen(true); }}
                        className="w-full flex items-center text-left px-4 py-2.5 text-xs font-semibold rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"
                    >
                        <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        Configuración
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center text-left px-4 py-2.5 text-xs font-semibold rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all"
                    >
                        <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                        </svg>
                        Cerrar sesión
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Header
                    toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
                    userRole={userRole}
                    userName={userName}
                    onStartNewBusiness={handleResetAllData}
                    onOpenUserManagement={() => { addBehaviorLog('BUTTON', 'Abrió: Gestión de usuarios'); setUserManagementOpen(true); }}
                    onLogout={handleLogout}
                    onExportData={handleExportData}
                    onImportData={handleImportData}
                    onResetData={handleResetAllData}
                    setUserRole={() => {}}
                    syncStatus={syncStatus}
                    onOpenSearch={() => { setSearchOpen(true); addBehaviorLog('BUTTON', 'Abrió búsqueda global'); }}
                />
                <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-gray-50">
                    <div className="max-w-7xl mx-auto">
                        {effectiveView === 'dashboard' && (
                            <Dashboard
                                items={items}
                                movements={movements}
                                personnel={personnel}
                                purchaseOrders={purchaseOrders}
                                onNavigate={(v, tab) => selectView(v as View, tab as KardexTab | undefined)}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
                        {effectiveView === 'kardex' && (
                            <KardexHub
                                items={items}
                                movements={movements}
                                personnel={personnel}
                                projects={projects}
                                auditLogs={auditLogs}
                                behaviorLogs={behaviorLogs}
                                users={users}
                                userRole={userRole}
                                initialTab={kardexTab}
                                onGoBack={() => selectView('dashboard')}
                                openLogMovementModal={() => { setLogMovementModalOpen(true); addBehaviorLog('BUTTON', 'Abrió modal Registrar movimiento'); }}
                                onDeleteMovement={handleDeleteMovement}
                                onReturnLoan={handleReturnItem}
                                onReturnItem={handleReturnItem}
                                onMarkPendingPickup={handleMarkPendingPickup}
                                openAddItemModal={() => { setAddItemModalOpen(true); addBehaviorLog('BUTTON', 'Abrió modal Agregar ítem'); }}
                                onEditItem={(i) => { setItemToEdit(i); setEditModalOpen(true); addBehaviorLog('BUTTON', `Editó ítem: ${i.name}`); }}
                                onDeleteItem={handleDeleteItem}
                                onItemHistory={(i) => { setItemForHistory(i); setHistoryModalOpen(true); addBehaviorLog('BUTTON', `Ver historial: ${i.name}`); }}
                                onOpenInvoiceReader={() => { setInvoiceReaderOpen(true); addBehaviorLog('BUTTON', 'Abrió Leer factura'); }}
                                onAddProject={handleAddProject}
                                onDeleteProject={handleDeleteProject}
                                showEconomicValues={appConfig.showEconomicValues}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
                        {effectiveView === 'personnel' && (
                            <PersonnelView
                                personnel={personnel}
                                movements={movements}
                                items={items}
                                projects={projects}
                                openAddPersonnelModal={() => setAddPersonnelModalOpen(true)}
                                onGoBack={() => selectView('dashboard')}
                                onEditPersonnel={handleEditPersonnel}
                                onDeletePersonnel={handleDeletePersonnel}
                                onReturnLoan={handleReturnItem}
                                onMarkPendingPickup={handleMarkPendingPickup}
                                onAssignProject={handleAssignProjectToLoan}
                                onCreateProject={handleCreateProjectByName}
                                onTransferLoan={handleTransferLoan}
                                userRole={userRole}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
                        {effectiveView === 'copilot' && (
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
                                onEditItem={handleEditItem}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
                        {effectiveView === 'help' && <HelpView />}
                        {effectiveView === 'traceability' && (
                            <TraceabilityView
                                movements={movements}
                                items={items}
                                personnel={personnel}
                                projects={projects}
                                auditLogs={auditLogs}
                                behaviorLogs={behaviorLogs}
                                users={users}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
                        {effectiveView === 'whatsapp' && (
                            <WhatsAppView movements={movements} items={items} personnel={personnel} readOnly={userRole === UserRole.VISITOR} onBehaviorLog={addBehaviorLog} />
                        )}
                        {effectiveView === 'pickup' && (
                            <PickupView
                                movements={movements}
                                items={items}
                                personnel={personnel}
                                projects={projects}
                                onMarkPendingPickup={handleMarkPendingPickup}
                                onReturnItem={handleReturnItem}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
                    </div>
                </main>
            </div>

            <AddItemModal isOpen={isAddItemModalOpen} onClose={() => setAddItemModalOpen(false)} onAddItem={handleAddItem} userRole={userRole} />
            <EditItemModal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} onEditItem={handleEditItem} itemToEdit={itemToEdit} />
            <LogMovementModal isOpen={isLogMovementModalOpen} onClose={() => setLogMovementModalOpen(false)} onLogMovement={handleLogMovement} items={items} movements={movements} personnel={personnel} projects={projects} userRole={userRole} />
            <AddPersonnelModal isOpen={isAddPersonnelModalOpen} onClose={() => setAddPersonnelModalOpen(false)} onAddPersonnel={handleAddPersonnel} />
            <ItemHistoryModal isOpen={isHistoryModalOpen} onClose={() => setHistoryModalOpen(false)} item={itemForHistory} movements={movements} personnel={personnel} projects={projects} onReturnItem={handleReturnItem} onTransferLoan={handleTransferLoan} onAssignProject={handleAssignProjectToLoan} />
            <UserManagementModal isOpen={isUserManagementOpen} onClose={() => setUserManagementOpen(false)} users={users} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} onEditUser={handleEditUser} />
            <InvoiceReaderModal isOpen={isInvoiceReaderOpen} onClose={() => setInvoiceReaderOpen(false)} onImport={(rows, invType) => handleImportItems(rows, invType)} />
            {isSettingsOpen && (
                <SettingsModal
                    config={appConfig}
                    onChange={handleConfigChange}
                    onClose={() => setSettingsOpen(false)}
                    userRole={userRole}
                    onResetAllData={handleResetAllData}
                    onResetMaterials={handleResetMaterials}
                />
            )}
            {isSearchOpen && (
                <GlobalSearchModal
                    items={items}
                    movements={movements}
                    personnel={personnel}
                    onClose={() => setSearchOpen(false)}
                    onNavigate={(v, tab) => { selectView(v as View, tab as KardexTab | undefined); setSearchOpen(false); }}
                    onBehaviorLog={addBehaviorLog}
                />
            )}
            {showOnboarding && <OnboardingModal onFinish={handleOnboardingFinish} />}
            {pinAction && (
                <PinConfirmModal
                    title={pinAction.title}
                    message={pinAction.message}
                    onConfirm={pinAction.fn}
                    onClose={() => setPinAction(null)}
                />
            )}
            {(userRole === UserRole.OWNER || userRole === UserRole.EMPLOYEE) && (
                <FloatingChat
                    items={items}
                    movements={movements}
                    personnel={personnel}
                    purchaseOrders={purchaseOrders}
                    projects={projects}
                    onLogMovements={batch => batch.forEach(m => handleLogMovement(m))}
                    onCreateItem={handleAddItemSync}
                    onCreateProject={handleAddProjectSync}
                    onCreatePersonnel={handleAddPersonnelSync}
                    onBehaviorLog={addBehaviorLog}
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

const PickupNavIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const NavItem: React.FC<{ icon: React.ElementType, label: string, onClick: () => void, isActive: boolean, badge?: number }> = ({ icon: Icon, label, onClick, isActive, badge }) => (
    <button onClick={onClick} className={`w-full flex items-center text-left px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
        <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-gray-400'}`} />
        <span className="flex-1">{label}</span>
        {badge != null && badge > 0 && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white text-blue-600' : 'bg-orange-500 text-white'}`}>
                {badge}
            </span>
        )}
    </button>
);

const NavHeader: React.FC<{ label: string }> = ({ label }) => (
    <h3 className="px-5 pt-6 pb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</h3>
);

export default App;
