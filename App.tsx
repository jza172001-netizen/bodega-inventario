
import React, { useState, useEffect } from 'react';
import { AddItemModal } from './components/AddItemModal';
import { OrderListView } from './components/OrderListView';
import { ReviewFamiliesView } from './components/ReviewFamiliesView';
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
import { Item, Movement, MovementType, Personnel, PurchaseOrder, UserRole, InventoryType, Project, AppUser, PurchaseOrderStatus, AuditLog, BehaviorLog, RechazoStock, LoteResultado, OrderNote } from './types';
import { LoginView } from './components/LoginView';
import { LandingPage } from './components/LandingPage';
import { InvoiceReaderModal } from './components/InvoiceReaderModal';
import { MultiUserConfirmModal } from './components/MultiUserConfirmModal';
import { saveToLocalStorage, loadFromLocalStorage, loadInitialData, exportToFile, importFromFile } from './storage';
import * as db from './services/supabaseService';
import { supabase } from './lib/supabase';
import { ConfirmDialog } from './components/ConfirmDialog';
import { sha256Hex } from './utils/hash';

// Icons
import { DashboardIcon } from './components/icons/DashboardIcon';
import { MovementsIcon } from './components/icons/MovementsIcon';
import { PersonnelIcon } from './components/icons/PersonnelIcon';
import { WhatsAppIcon } from './components/icons/WhatsAppIcon';

type View = 'dashboard' | 'kardex' | 'personnel' | 'copilot' | 'help' | 'whatsapp' | 'pickup' | 'traceability' | 'familias' | 'pedidos';
type KardexTab = 'movements' | 'loans' | 'inventory' | 'projects';

const SESSION_KEY = 'bodega_session';
const ONBOARDING_KEY = 'bodega_onboarding_v1';

// La lista almacenada (Supabase o localStorage) es la fuente de verdad del login.
// El seed solo aplica cuando no hay ningún usuario (instalación nueva sin conexión).
// Antes esta función colapsaba cualquier lista sobre los 3 seedUsers: los usuarios
// creados en la BD nunca aparecían y sus credenciales quedaban bajo otra tarjeta (B-2).
const migrateUsers = (stored: AppUser[]): AppUser[] => {
    if (stored.length === 0) return seedUsers;
    return stored.map(u => ({ ...u, setupComplete: u.setupComplete || !!u.username }));
};

const App: React.FC = () => {
    const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem(SESSION_KEY));
    const [userRole, setUserRole] = useState<UserRole>(() => {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}').role ?? UserRole.OWNER; } catch { return UserRole.OWNER; }
    });
    // Carga inicial síncrona desde localStorage, con fallback a mockData
    const NAME_FIX: Record<string, string> = { Julio: 'Juli', julio: 'Juli', Administrador: 'Juli', administrador: 'Juli' };
    const [users, setUsers] = useState<AppUser[]>(() => {
        const s = loadInitialData();
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
    const [items, setItems] = useState<Item[]>(() => { const s = loadInitialData(); return s?.items ?? []; });
    const [movements, setMovements] = useState<Movement[]>(() => { const s = loadInitialData(); return s?.movements ?? []; });
    const [personnel, setPersonnel] = useState<Personnel[]>(() => {
        const s = loadInitialData();
        const ls = s?.personnel;
        if (ls?.length) {
            const valid = ls.filter(p => p.name?.trim().length >= 4);
            if (valid.length > 0) return valid;
        }
        return mockPersonnel;
    });
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => { const s = loadInitialData(); return s?.purchaseOrders ?? []; });
    const [projects, setProjects] = useState<Project[]>(() => { const s = loadInitialData(); return s?.projects ?? mockProjects; });
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
        const s = loadInitialData();
        const logs = s?.auditLogs ?? [];
        const fix: Record<string, string> = { Administrador: 'Juli', administrador: 'Juli', Julio: 'Juli', julio: 'Juli' };
        return logs.map(l => fix[l.actor] ? { ...l, actor: fix[l.actor] } : l);
    });
    const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>(() => {
        const s = loadInitialData();
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
        db.addAuditLog(entry).catch(e => console.error('[Supabase] auditLog:', e));
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
        db.addBehaviorLog(entry).catch(e => console.error('[Supabase] behaviorLog:', e));
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
        const user = users.find(u => u.id === userId);
        if (!user) return;
        const updated = { ...user, username, password, setupComplete: true };
        setUsers(prev => prev.map(u => u.id === userId ? updated : u));
        // Hash para login offline (localStorage nunca guarda la contraseña en claro)
        sha256Hex(password).then(hash =>
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, passwordHash: hash } : u))
        );
        db.updateUser(updated).catch(e => { console.error('[Supabase] user:', e); setSyncStatus('error'); });
        addAuditLog('USER_SETUP', `Configuró sus credenciales por primera vez: "${username}"`, user.name);
        handleLoginSuccess(user.role, user.name);
    };

    // Tras un login online exitoso, guarda el hash para habilitar el respaldo offline
    const handleCredentialVerified = (userId: string, passwordHash: string) => {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, passwordHash } : u));
    };

    const handleLogout = () => {
        // El ingreso queda en la bitácora de auditoría; la salida también debe
        // quedar, si no la sesión no tiene cierre y no se sabe hasta cuándo
        // alguien estuvo adentro.
        addAuditLog('USER_LOGOUT', `Cerró sesión: ${userName}`);
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
    /** Dos sincronizaciones corriendo a la vez se pisan entre ellas. */
    const sincronizando = React.useRef(false);

    useEffect(() => {
        const sincronizar = () => {
            if (sincronizando.current) return;
            sincronizando.current = true;
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const local = loadFromLocalStorage();
          let localItems       = local?.items      ?? [];
          let localMovements   = local?.movements  ?? [];
          let localProjects  = local?.projects   ?? [];
          let localPersonnel = (local?.personnel ?? []).filter(p => p.name?.trim().length >= 4);
          let localPOs       = local?.purchaseOrders ?? [];
          const localAuditLogs = local?.auditLogs  ?? [];
          const localBehaviorLogs = local?.behaviorLogs ?? [];

          // Los usuarios de Supabase siempre reemplazan la lista local (fuente de verdad
          // del login), preservando el passwordHash guardado en este dispositivo para que
          // el respaldo offline siga funcionando.
          db.fetchUsers().then(data => {
              if (data.length === 0) return;
              setUsers(prev => migrateUsers(data).map(u => {
                  const known = prev.find(p => p.id === u.id)
                      ?? prev.find(p => p.username && p.username === u.username);
                  return known?.passwordHash ? { ...u, passwordHash: known.passwordHash } : u;
              }));
          }).catch(e => console.error('[Supabase] users:', e));

          Promise.all([
              db.fetchItems().catch((): Item[] => []),
              db.fetchMovements().catch((): Movement[] => []),
              db.fetchProjects().catch((): Project[] => []),
              db.fetchPersonnel().catch((): Personnel[] => []),
              db.fetchPurchaseOrders().catch((): PurchaseOrder[] => []),
              db.fetchAuditLogs().catch((): AuditLog[] => []),
              db.fetchBehaviorLogs().catch((): BehaviorLog[] => []),
              db.fetchBorrados().catch(() => ({ personnel: [] as string[], projects: [] as string[], purchaseOrders: [] as string[], movements: [] as string[], items: [] as string[] })),
          ]).then(([supaItems, supaMovements, supaProjectsRaw, supaPersonnelRaw, supaPOs, supaAuditLogs, supaBehaviorLogs, borrados]) => {
              // Lo que tiene lápida se saca de lo local ANTES de mezclar. Sin esto,
              // el teléfono que todavía guarda la fila la vuelve a subir y el
              // borrado se deshace solo — que es como volvieron 19 ítems el 18 de
              // agosto y 4 trabajadores el 9 de junio, todos en el mismo minuto.
              const conLapida = {
                  personnel: new Set(borrados.personnel),
                  projects: new Set(borrados.projects),
                  purchaseOrders: new Set(borrados.purchaseOrders),
                  movements: new Set(borrados.movements),
                  items: new Set(borrados.items),
              };
              const resucitados: string[] = [];
              localPersonnel = localPersonnel.filter(p => {
                  if (!conLapida.personnel.has(p.id)) return true;
                  resucitados.push(`trabajador "${p.name}"`);
                  return false;
              });
              localProjects = localProjects.filter(p => {
                  if (!conLapida.projects.has(p.id)) return true;
                  resucitados.push(`proyecto "${p.name}"`);
                  return false;
              });
              localPOs = localPOs.filter(o => !conLapida.purchaseOrders.has(o.id));
              // Movimientos e ítems no tenían lápida, y por eso borrarlos no servía
              // de nada: los 15 movimientos de prueba del 17 y 24 de agosto y del 4
              // de septiembre se borraron el 5 y volvieron completos desde el otro
              // celular, que todavía los tenía guardados.
              localMovements = localMovements.filter(m => {
                  if (!conLapida.movements.has(m.id)) return true;
                  resucitados.push(`movimiento del ${new Date(m.timestamp).toLocaleDateString('es-CO')}`);
                  return false;
              });
              localItems = localItems.filter(i => {
                  if (!conLapida.items.has(i.id)) return true;
                  resucitados.push(`ítem "${i.name}"`);
                  return false;
              });

              // Y queda constancia: lo del 18 de agosto no figura en ninguna parte,
              // que es por qué tardó dos meses en verse.
              if (resucitados.length > 0) {
                  addAuditLog('SYNC_LIMPIEZA',
                      `Se quitó de este dispositivo lo que ya estaba borrado: ${resucitados.join(', ')}`);
              }
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
                  // Si ya tiene UUID válido (en Supabase o propio) → conservar tal cual
                  if (supaItemIds.has(item.id) || UUID_RE.test(item.id)) return item;
                  // ID temporal heredado (et-xxx, ht-xxx) → asignar UUID nuevo
                  const id = crypto.randomUUID();
                  itemRemap.set(item.id, id);
                  return { ...item, id };
              });

              const normProjects = localProjects.map(p => {
                  // Nombre primero: si Supabase ya tiene este proyecto por nombre, usar su ID
                  const supaMatch = supaProjects.find(sp => sp.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                  if (supaMatch) {
                      if (p.id !== supaMatch.id) projRemap.set(p.id, supaMatch.id);
                      return supaMatch;
                  }
                  if (supaProjIds.has(p.id) || UUID_RE.test(p.id)) return p;
                  const id = crypto.randomUUID();
                  projRemap.set(p.id, id);
                  return { ...p, id };
              });

              const normPersonnel = localPersonnel.map(p => {
                  // Nombre primero: si Supabase ya tiene esta persona por nombre, usar su ID
                  const supaMatch = supaPersonnel.find(sp => sp.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                  if (supaMatch) {
                      if (p.id !== supaMatch.id) perRemap.set(p.id, supaMatch.id);
                      return supaMatch;
                  }
                  if (supaPerIds.has(p.id) || UUID_RE.test(p.id)) return p;
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

              // localStorage es fuente de verdad para existencia.
              // Si está completamente vacío (primera instalación / localStorage borrado) → Supabase gana.
              // Si tiene datos → localStorage gana: lo que no está en local fue eliminado por el usuario.
              const localIsEmpty =
                  localItems.length === 0 &&
                  localPersonnel.length === 0 &&
                  localProjects.length === 0;

              // Existencia y contenido son dos preguntas distintas, y confundirlas era
              // la falla: la app resolvía "¿quién gana?" eligiendo un bando fijo, y
              // elegía bandos OPUESTOS para ítems y para movimientos. Con los ítems
              // ganaba siempre la nube, así que una corrección hecha en el teléfono se
              // borraba sola al siguiente arranque. Con los movimientos ganaba siempre
              // el teléfono, así que un "a recoger" marcado en el otro nunca llegaba.
              //
              // Existencia se sigue resolviendo como antes (cada entidad tiene su
              // criterio, y hay que respetar los borrados). El contenido de una fila que
              // está en los dos lados ahora lo decide la fecha: gana la más reciente.
              const masReciente = <T extends { id: string; updatedAt?: Date }>(a: T, b?: T): T => {
                  if (!b) return a;
                  const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                  const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                  return tb > ta ? b : a;
              };

              // Ítems: cuando Supabase está disponible es fuente de verdad para existencia.
              // Esto evita que ítems eliminados en Supabase "resuciten" desde localStorage.
              // Solo se agregan ítems locales con ID temporal (creados offline, nunca sincronizados).
              // Si Supabase no responde (supaItems vacío por error), se conserva todo lo local.
              const normItemIds = new Set(normItems.map(i => i.id));
              const localItemById = new Map(normItems.map(i => [i.id, i]));
              const supaItemById  = new Map(supaItems.map(i => [i.id, i]));
              const localNameTypeKeys = new Set(
                  normItems.map(i => `${i.name.trim().toLowerCase()}::${i.inventoryType}`)
              );
              const mergedItems: Item[] = localIsEmpty
                  ? supaItems
                  : supaItems.length > 0
                      ? [
                          // La nube manda sobre QUÉ ítems existen; la fecha manda sobre
                          // CÓMO está cada uno. Así un ítem borrado sigue borrado y una
                          // corrección recién hecha acá deja de perderse.
                          ...supaItems.map(i => masReciente(i, localItemById.get(i.id))),
                          ...normItems.filter(i => !UUID_RE.test(i.id) && !supaItemIds.has(i.id)),
                      ]
                      : [
                          ...normItems,
                          ...supaItems.filter(i =>
                              !normItemIds.has(i.id) &&
                              !localNameTypeKeys.has(`${i.name.trim().toLowerCase()}::${i.inventoryType}`)
                          ),
                      ];

              // Movimientos: merge aditivo (ninguno de los dos lados borra al otro en el
              // arranque), pero el contenido de los compartidos lo decide la fecha. Un
              // movimiento no es inmutable: se marca a recoger, se devuelve, se traspasa.
              const normMovIds = new Set(normMovements.map(m => m.id));
              const supaMovById = new Map(supaMovements.map(m => [m.id, m]));
              const mergedMovements: Movement[] = localIsEmpty
                  ? supaMovements
                  : [
                      ...normMovements.map(m => masReciente(m, supaMovById.get(m.id))),
                      ...supaMovements.filter(m => !normMovIds.has(m.id)),
                  ];

              // Proyectos, personal y OC: merge aditivo. Supabase es la fuente compartida
              // entre dispositivos — un localStorage desactualizado NO debe borrar nada.
              // Las eliminaciones solo ocurren por acción explícita del usuario (handlers).
              const mergeById = <T extends { id: string }>(local: T[], remote: T[]): T[] => {
                  const localIds = new Set(local.map(x => x.id));
                  return [...local, ...remote.filter(x => !localIds.has(x.id))];
              };
              const supaPerById = new Map(supaPersonnel.map(p => [p.id, p]));
              const mergedProjects:  Project[]       = localIsEmpty ? supaProjects  : mergeById(normProjects, supaProjects);
              const mergedPersonnel: Personnel[]     = localIsEmpty
                  ? supaPersonnel
                  : mergeById(normPersonnel.map(p => masReciente(p, supaPerById.get(p.id))), supaPersonnel);
              const mergedPOs:       PurchaseOrder[] = localIsEmpty ? supaPOs       : mergeById(normPOs, supaPOs);

              // Audit logs: unir local + Supabase (acumulativo — nunca se borra)
              const supaAuditIds = new Set(supaAuditLogs.map(a => a.id));
              const mergedAuditLogs: AuditLog[] = [
                  ...localAuditLogs,
                  ...supaAuditLogs.filter(a => !localAuditLogs.some(l => l.id === a.id)),
              ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

              // Behavior logs: mismo criterio acumulativo que la bitácora
              const supaBehaviorIds = new Set(supaBehaviorLogs.map(b => b.id));
              const mergedBehaviorLogs: BehaviorLog[] = [
                  ...localBehaviorLogs,
                  ...supaBehaviorLogs.filter(b => !localBehaviorLogs.some(l => l.id === b.id)),
              ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

              // Actualizar estado: siempre que haya datos o remapeos
              if (mergedItems.length > 0     || itemRemap.size > 0)  setItems(mergedItems);
              if (mergedMovements.length > 0 || movRemap.size > 0)   setMovements(mergedMovements);
              if (mergedProjects.length > 0  || projRemap.size > 0)  setProjects(mergedProjects);
              if (mergedPersonnel.length > 0 || perRemap.size > 0)   setPersonnel(mergedPersonnel);
              if (mergedPOs.length > 0)                              setPurchaseOrders(mergedPOs);
              if (mergedAuditLogs.length > 0)                        setAuditLogs(mergedAuditLogs);
              if (mergedBehaviorLogs.length > 0)                     setBehaviorLogs(mergedBehaviorLogs);

              // Subir diferencias a Supabase en segundo plano (bulk upsert — idempotente)
              const itemsToSync  = mergedItems.filter(i     => !supaItemIds.has(i.id));
              const movsToSync   = mergedMovements.filter(m => !supaMovIds.has(m.id));
              const projsToSync  = mergedProjects.filter(p  => !supaProjIds.has(p.id));
              const perToSync    = mergedPersonnel.filter(p => !supaPerIds.has(p.id));
              const posToSync    = mergedPOs.filter(o       => !supaPOIds.has(o.id));
              const auditToSync  = localAuditLogs.filter(a  => !supaAuditIds.has(a.id));
              const behaviorToSync = localBehaviorLogs.filter(b => !supaBehaviorIds.has(b.id));

              if (itemsToSync.length  > 0) db.bulkUpsertItems(itemsToSync).catch(e => console.error('[Supabase] items:', e));
              if (movsToSync.length   > 0) db.bulkUpsertMovements(movsToSync).catch(e => console.error('[Supabase] movements:', e));
              if (projsToSync.length  > 0) db.bulkUpsertProjects(projsToSync).catch(e => console.error('[Supabase] projects:', e));
              if (perToSync.length    > 0) db.bulkUpsertPersonnel(perToSync).catch(e => console.error('[Supabase] personnel:', e));
              if (posToSync.length    > 0) db.bulkUpsertPurchaseOrders(posToSync).catch(e => console.error('[Supabase] POs:', e));
              if (auditToSync.length  > 0) db.bulkUpsertAuditLogs(auditToSync).catch(e => console.error('[Supabase] auditLogs:', e));
              if (behaviorToSync.length > 0) db.bulkUpsertBehaviorLogs(behaviorToSync).catch(e => console.error('[Supabase] behaviorLogs:', e));
          }).finally(() => { sincronizando.current = false; });
        };

        sincronizar();

        // Antes esto corría UNA sola vez, al abrir la app. Con dos teléfonos en la
        // bodega eso quiere decir que lo que uno marca el otro no lo ve hasta cerrar
        // y volver a abrir — y nadie cierra la app en mitad de un despacho. Ahora se
        // vuelve a mirar al volver a la pestaña y al recuperar la señal.
        const alVolver = () => { if (document.visibilityState === 'visible') sincronizar(); };
        document.addEventListener('visibilitychange', alVolver);
        window.addEventListener('online', sincronizar);

        // Y en vivo: Supabase avisa cuando algo cambia y se dispara la MISMA
        // sincronización. El tiempo real es solo el aviso — quién gana lo sigue
        // decidiendo el merge de siempre. Meter una segunda vía de datos, que
        // aplicara el cambio directo al estado, sería otra forma de que los dos
        // teléfonos terminen distintos, que es justo lo que se acaba de arreglar.
        //
        // Con espera: al marcar una devolución caen varios eventos seguidos
        // (movimiento + stock del ítem) y no vale la pena bajar todo por cada uno.
        let esperando: ReturnType<typeof setTimeout> | null = null;
        const avisoDeCambio = () => {
            if (esperando) clearTimeout(esperando);
            esperando = setTimeout(() => { esperando = null; sincronizar(); }, 500);
        };
        const canal = supabase
            .channel('bodega-en-vivo')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, avisoDeCambio)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, avisoDeCambio)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'personnel' }, avisoDeCambio)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, avisoDeCambio)
            .subscribe();

        return () => {
            document.removeEventListener('visibilitychange', alVolver);
            window.removeEventListener('online', sincronizar);
            if (esperando) clearTimeout(esperando);
            supabase.removeChannel(canal);
        };
    }, []);

    /**
     * La lista de pedidos vive aparte del inventario a propósito: es una libreta.
     * Se carga sola de Supabase y no participa del merge de arranque, porque no
     * tiene copia local que pueda contradecirla.
     */
    const [orderNotes, setOrderNotes] = useState<OrderNote[]>([]);
    useEffect(() => {
        const traer = () => db.fetchOrderList().then(setOrderNotes).catch(e => console.error('[Supabase] pedidos:', e));
        traer();
        // También en vivo: si el otro teléfono anota algo para comprar, aparece acá.
        const canal = supabase
            .channel('pedidos-en-vivo')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_list' }, () => { traer(); })
            .subscribe();
        return () => { supabase.removeChannel(canal); };
    }, []);

    const handleAddOrderNote = (texto: string, cantidad?: number, unidad?: string, familia?: string) => {
        const nota: OrderNote = { id: crypto.randomUUID(), texto, cantidad, unidad, familia, comprado: false, createdAt: new Date(), updatedAt: new Date() };
        setOrderNotes(prev => [nota, ...prev]);
        const { id, ...resto } = nota;
        withSync(db.addOrderNote(resto, id));
        addAuditLog('ORDER_NOTE_ADDED', `Anotó para comprar: "${texto}"${cantidad ? ` ×${cantidad}` : ''}`);
    };

    const handleToggleOrderNote = (n: OrderNote) => {
        const upd = { ...n, comprado: !n.comprado, updatedAt: new Date() };
        setOrderNotes(prev => prev.map(x => x.id === n.id ? upd : x));
        withSync(db.updateOrderNote(upd));
        addAuditLog(upd.comprado ? 'ORDER_NOTE_BOUGHT' : 'ORDER_NOTE_REOPENED', `"${n.texto}" — ${upd.comprado ? 'comprado' : 'vuelve a pendiente'}`);
    };

    /**
     * Cambiarle el texto, la cantidad o la unidad a algo ya anotado.
     *
     * No existía: la lista solo dejaba marcar como comprado o borrar. Si se
     * anotaban 3 bultos y hacían falta 5, tocaba borrar el renglón y volver a
     * escribirlo entero — en una libreta uno tacha el 3 y pone 5.
     */
    const handleUpdateOrderNote = (n: OrderNote, cambios: Partial<OrderNote>) => {
        const upd = { ...n, ...cambios, updatedAt: new Date() };
        setOrderNotes(prev => prev.map(x => x.id === n.id ? upd : x));
        withSync(db.updateOrderNote(upd));
        const antes = `${n.texto}${n.cantidad != null ? ` (${n.cantidad} ${n.unidad ?? ''})`.trimEnd() + ')' : ''}`;
        const ahora = `${upd.texto}${upd.cantidad != null ? ` (${upd.cantidad} ${upd.unidad ?? ''})`.trimEnd() + ')' : ''}`;
        addAuditLog('ORDER_NOTE_EDITED', `Cambió en la lista de pedidos: ${antes} → ${ahora}`);
    };

    const handleDeleteOrderNote = (n: OrderNote) => {
        setOrderNotes(prev => prev.filter(x => x.id !== n.id));
        withSync(db.deleteOrderNote(n.id));
        addAuditLog('ORDER_NOTE_DELETED', `Quitó de la lista de pedidos: "${n.texto}"`);
    };

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
    const EMPLOYEE_VIEWS: View[] = ['dashboard', 'kardex', 'personnel', 'help', 'whatsapp', 'pickup', 'traceability', 'copilot', 'familias', 'pedidos'];
    const VISITOR_VIEWS: View[] = ['dashboard', 'kardex', 'whatsapp', 'traceability'];
    const effectiveView: View = (userRole === UserRole.VISITOR && !VISITOR_VIEWS.includes(currentView))
        ? 'dashboard'
        : (userRole === UserRole.EMPLOYEE && !EMPLOYEE_VIEWS.includes(currentView))
            ? 'dashboard'
            : currentView;
    // Acá se contaban las agrupaciones por confirmar, para el número de "Agrupar
    // ítems". Ese botón salió de la barra, así que el conteo —que recorría todos
    // los ítems en cada render— ya no alimenta nada.

    const pendingPickupCount = movements.filter(m => m.isLoan && !m.isReturned && m.pendingPickup).length;
    const [isSidebarOpen, setSidebarOpen] = useState(true);

    const CONFIG_KEY = 'bodega_config';
    const [appConfig, setAppConfig] = useState<AppConfig>(() => {
        try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') }; } catch { return DEFAULT_CONFIG; }
    });
    const handleConfigChange = (cfg: AppConfig) => {
        setAppConfig(cfg);
        localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
        addAuditLog('CONFIG_CHANGED', 'Cambió la configuración de la app');
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

    // Sacar o meter un respaldo mueve TODA la bodega de una vez: es la acción de
    // mayor alcance de la app y era la única sin registro.
    const handleExportData = () => {
        exportToFile({ items, movements, personnel, purchaseOrders, projects, users });
        addAuditLog('DATA_EXPORTED', `Descargó respaldo completo (${items.length} ítems, ${movements.length} movimientos, ${personnel.length} personas)`);
    };
    const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => importFromFile(e, (data) => {
        addAuditLog('DATA_IMPORTED', `Importó respaldo y reemplazó los datos (${(data.items || []).length} ítems, ${(data.movements || []).length} movimientos)`);
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

    // El dueño ejecuta los reset directamente: la escalera de 3 toques del modal de
    // Configuración ya es la confirmación. Los empleados sí requieren que todos los
    // usuarios con cuenta confirmen con su contraseña.
    const requireResetAuth = (fn: () => void, title: string, message: string) => {
        if (userRole === UserRole.OWNER) fn();
        else requireMultiUser(fn, title, message);
    };

    const handleResetAllData = () => {
        requireResetAuth(
            () => {
                setItems([]);
                setMovements([]);
                setPersonnel([]);
                setPurchaseOrders([]);
                setProjects([]);
                addAuditLog('ITEM_DELETED', 'Se borró toda la bodega (reset completo)');
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
        requireResetAuth(
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
        familias: 'Agrupar ítems',
        traceability: 'Trazabilidad',
        pedidos: 'Lista de pedidos',
    };

    const selectView = (view: View, tab?: KardexTab) => {
        setCurrentView(view);
        if (tab) setKardexTab(tab);
        if (window.innerWidth < 768) setSidebarOpen(false);
        addBehaviorLog('NAV', `Abrió ${NAV_LABELS[view] ?? view}${tab ? ` → ${tab}` : ''}`);
    };

    // ── Handlers síncronos + sync Supabase en background ──

    // Asiento de apertura: deja constancia en el Kardex de con cuánto entró un ítem
    // y quién lo cargó. Antes el stock inicial aparecía de la nada, sin quién ni cuándo.
    // Usa addMovement directo (NO el RPC de stock): el ítem ya se creó con su cantidad,
    // volver a sumarla duplicaría el inventario.
    const registrarApertura = (item: Item) => {
        if (!item.quantity || item.quantity <= 0) return;
        const movId = crypto.randomUUID();
        const apertura: Movement = {
            id: movId,
            itemId: item.id,
            type: MovementType.CHECK_IN,
            quantity: item.quantity,
            timestamp: new Date(),
            notes: `Carga inicial: ${item.quantity} ${item.unit} registrados por ${userName || 'la bodega'}`,
            isLoan: false,
            isReturned: false,
        };
        setMovements(prev => [apertura, ...prev]);
        db.addMovement(apertura, movId).catch(e => console.error('[Supabase] apertura:', e));
    };

    const handleImportItems = (newItems: Array<Omit<Item, 'id'>>, inventoryType?: InventoryType) => {
        const created = newItems.map(i => ({
            ...i,
            id: crypto.randomUUID(),
            inventoryType: inventoryType ?? i.inventoryType,
        }));
        setItems(prev => [...prev, ...created]);
        created.forEach(({ id, ...rest }) => withSync(db.addItem(rest, id)));
        created.forEach(registrarApertura);
        addAuditLog('ITEM_CREATED', `Carga masiva: ${created.length} ítem(s) agregados de una vez${created.length <= 5 ? ` — ${created.map(i => i.name).join(', ')}` : ''}`);
    };

    /**
     * Un disco no se despacha aparte: sale pegado a la pulidora. Acá el lote de
     * salida se expande con los accesorios CONSUMIBLES de cada herramienta, para
     * que descuenten stock y queden en el Kardex como el gasto que son.
     *
     * Se hace en un solo lugar y no en cada pantalla: así lo respetan por igual
     * el chatbot, el asistente de despacho y el formulario directo.
     *
     * Los accesorios retornables (maleta, llave) NO entran acá: esos vuelven con
     * la herramienta y se revisan en la devolución, no son un movimiento.
     */
    const expandirAccesorios = (batch: Omit<Movement, 'id'>[]): Omit<Movement, 'id'>[] => {
        const extra: Omit<Movement, 'id'>[] = [];
        for (const m of batch) {
            if (m.type !== MovementType.CHECK_OUT) continue;
            const herramienta = items.find(i => i.id === m.itemId);
            for (const acc of herramienta?.accessories ?? []) {
                if (!acc.itemId) continue;                    // retornable: no es movimiento
                const porUnidad = acc.cantidad ?? 1;
                extra.push({
                    ...m,
                    itemId: acc.itemId,
                    quantity: porUnidad * m.quantity,          // 2 pulidoras → 2 juegos de discos
                    isLoan: false,                             // se gasta, no se presta
                    notes: `Sale con ${herramienta?.name ?? 'la herramienta'}`,
                });
            }
        }
        return [...batch, ...extra];
    };

    const handleAddItem = (i: Omit<Item, 'id'>) => {
        const id = crypto.randomUUID();
        const newItem = { ...i, id };
        setItems(prev => [...prev, newItem]);
        withSync(db.addItem(i, id));
        registrarApertura(newItem);
        addAuditLog('ITEM_CREATED', `Se agregó "${i.name}" al inventario`);
    };

    const handleAddItemSync = (i: Omit<Item, 'id'>): Item => {
        const id = crypto.randomUUID();
        const newItem = { ...i, id };
        setItems(prev => [...prev, newItem]);
        withSync(db.addItem(i, id));
        registrarApertura(newItem);
        addAuditLog('ITEM_CREATED', `Se agregó "${i.name}" al inventario`);
        return newItem;
    };

    const handleEditItem = (entrante: Item) => {
        const prev = items.find(i => i.id === entrante.id);
        // El sello es lo que hace que esta corrección le gane al dato viejo de la
        // nube cuando la app vuelva a sincronizar. Sin él, se borraba sola.
        const updated: Item = { ...entrante, updatedAt: new Date() };
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

    /** Devuelve true si el movimiento quedó registrado. Quien lo llama debe
     *  reportar lo que de verdad pasó: el chatbot decía "✅ registrado" incluso
     *  cuando esta validación había rechazado la salida. */
    /**
     * Un lote de movimientos, validado contra el stock que va QUEDANDO.
     *
     * `handleLogMovement` mira `items` del render, que no cambia hasta el
     * siguiente: dos salidas del mismo ítem en un mismo lote se comparaban las
     * dos contra el stock original y se podía sacar de más. Acá el stock se
     * lleva en un mapa que sí baja movimiento a movimiento.
     *
     * Y lo que se rechaza vuelve DICHO: qué ítem, cuánto hay y cuánto se pidió.
     * Sin eso el chat solo podía repetir "falta de stock", que es exactamente
     * el callejón sin salida que hacía devolverse hasta el primer paso.
     */
    const handleLogMovements = (batch: Omit<Movement, 'id'>[]): LoteResultado => {
        const expandido = expandirAccesorios(batch);
        const restante = new Map(items.map(i => [i.id, i.quantity]));
        const rechazos: RechazoStock[] = [];
        let ok = 0;
        for (const m of expandido) {
            const it = items.find(i => i.id === m.itemId);
            const esSalida = m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE;
            const hay = restante.get(m.itemId) ?? 0;
            if (it && esSalida && m.quantity > hay) {
                rechazos.push({ itemId: it.id, nombre: it.name, unidad: it.unit, hay, pedido: m.quantity, movimiento: m });
                continue;
            }
            if (handleLogMovement(m, hay)) {
                ok++;
                if (it) restante.set(m.itemId, esSalida ? hay - m.quantity : hay + m.quantity);
            }
        }
        return { ok, total: expandido.length, rechazos };
    };

    const handleLogMovement = (m: Omit<Movement, 'id'>, stockDisponible?: number): boolean => {
        const ts = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp ?? Date.now());
        const currentItem = items.find(i => i.id === m.itemId);
        const isWithdrawal = m.type === MovementType.CHECK_OUT || m.type === MovementType.WASTE;
        // El stock contra el que se valida es el que va quedando en el lote, no el
        // del render — que es el mismo para todas las líneas.
        const hay = stockDisponible ?? currentItem?.quantity ?? 0;
        // Validación central de stock: el kardex debe cuadrar siempre con el inventario.
        // Sin esto, una salida mayor al stock registraría más de lo que descuenta.
        if (currentItem && isWithdrawal && m.quantity > hay) {
            alert(`Stock insuficiente de "${currentItem.name}": hay ${hay} ${currentItem.unit} y se intentó sacar ${m.quantity}. El movimiento NO se registró.`);
            return false;
        }
        const id = crypto.randomUUID();
        const newMov = { ...m, id, timestamp: ts };
        setMovements(prev => [newMov, ...prev]);
        if (currentItem) {
            const newQty = Math.max(0, isWithdrawal ? hay - m.quantity : hay + m.quantity);
            setItems(prev => prev.map(item =>
                item.id === m.itemId ? { ...item, quantity: newQty } : item
            ));
            // Una sola transacción en el servidor: movimiento + stock, a prueba de race conditions
            withSync(db.logMovementWithStock({ ...m, timestamp: ts }, id, newQty));
        } else {
            withSync(db.addMovement({ ...m, timestamp: ts }, id));
        }
        const itemName   = items.find(i => i.id === m.itemId)?.name ?? 'herramienta';
        const personName = m.personnelId ? personnel.find(p => p.id === m.personnelId)?.name : undefined;
        if (m.isLoan) {
            addAuditLog('LOAN_CREATED', `Préstamo: "${itemName}"${personName ? ` → ${personName}` : ''}`);
        } else if (m.type === MovementType.CHECK_OUT) {
            // Antes esto se guardaba como ITEM_EDITED y la entrada como ITEM_CREATED:
            // la descripción decía la verdad pero la acción no, así que en
            // Trazabilidad un despacho aparecía archivado como "se editó un
            // artículo" y las creaciones venían infladas con las entradas.
            addAuditLog('STOCK_OUT', `📤 Salida: "${itemName}" ×${m.quantity}${personName ? ` — ${personName}` : ''}`);
        } else if (m.type === MovementType.CHECK_IN) {
            addAuditLog('STOCK_IN', `📥 Entrada: "${itemName}" ×${m.quantity}${personName ? ` — ${personName}` : ''}`);
        }
        return true;
    };

    const handleDeleteMovement = (id: string) => {
        const mov = movements.find(m => m.id === id);
        const itemName = mov ? items.find(i => i.id === mov.itemId)?.name ?? mov.itemId : id;
        requirePin(
            () => {
                // Revertir el efecto del movimiento sobre el stock antes de borrarlo:
                // borrar una salida devuelve unidades; borrar una entrada las quita.
                // Excepción: un préstamo ya devuelto tiene efecto neto cero (salió y
                // volvió), así que revertirlo sumaría una segunda vez e inflaría el stock.
                const item = mov ? items.find(i => i.id === mov.itemId) : undefined;
                let newQty: number | undefined;
                const netZero = !!mov?.isLoan && !!mov?.isReturned;
                if (mov && item && !netZero) {
                    const wasWithdrawal = mov.type === MovementType.CHECK_OUT || mov.type === MovementType.WASTE;
                    newQty = Math.max(0, wasWithdrawal ? item.quantity + mov.quantity : item.quantity - mov.quantity);
                    const qty = newQty;
                    setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: qty } : i));
                }
                setMovements(prev => prev.filter(m => m.id !== id));
                withSync(db.deleteMovementWithRevert(id, item?.id, newQty));
                addAuditLog('MOVEMENT_DELETED', `Se eliminó registro de movimiento: "${itemName}" (stock revertido)`);
            },
            `Eliminar registro de "${itemName}"`,
            'Se revertirá su efecto en el stock. Esta acción no se puede deshacer.',
        );
    };

    const handleReturnItem = (id: string, condition?: string, notes?: string) => {
        const mov = movements.find(m => m.id === id);
        // Guarda contra doble devolución: si ya estaba devuelta, no se repone stock otra vez
        if (mov?.isReturned) return;
        const item = mov ? items.find(i => i.id === mov.itemId) : undefined;
        const itemName = item?.name ?? 'herramienta';
        const personName = mov?.personnelId ? personnel.find(p => p.id === mov.personnelId)?.name : undefined;

        setMovements(prev => prev.map(m => m.id === id
            ? { ...m, isReturned: true, pendingPickup: false, returnCondition: condition as import('./types').ReturnCondition | undefined, returnNotes: notes, returnedAt: new Date(), updatedAt: new Date() }
            : m));

        // La herramienta vuelve a la bodega: hay que reponer la unidad al inventario.
        // Sin esto el stock quedaba descontado para siempre (causa del "AGOTADO" falso).
        let restoredQty: number | undefined;
        if (mov && item && mov.type === MovementType.CHECK_OUT) {
            restoredQty = item.quantity + mov.quantity;
            const qty = restoredQty;
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: qty } : i));
        }
        withSync(db.returnLoanAndRestoreStock(
            id,
            condition as import('./types').ReturnCondition | undefined,
            notes,
            item?.id,
            restoredQty,
        ));
        addAuditLog('LOAN_RETURNED', `Devuelta: "${itemName}"${personName ? ` de ${personName}` : ''}${condition ? ` — estado: ${condition}` : ''}`);
    };

    const handleMarkPendingPickup = (id: string, pending: boolean) => {
        const mov = movements.find(m => m.id === id);
        const itemName = mov ? items.find(i => i.id === mov.itemId)?.name ?? 'herramienta' : 'herramienta';
        const personName = mov?.personnelId ? personnel.find(p => p.id === mov.personnelId)?.name : undefined;
        setMovements(prev => prev.map(m => m.id === id ? { ...m, pendingPickup: pending, updatedAt: new Date() } : m));
        withSync(db.markMovementPendingPickup(id, pending));
        if (pending) {
            addAuditLog('PICKUP_MARKED', `Marcado a recoger: "${itemName}"${personName ? ` de ${personName}` : ''}`);
        } else {
            addAuditLog('PICKUP_CANCELLED', `Cancelada recogida: "${itemName}"${personName ? ` de ${personName}` : ''}`);
        }
    };

    const handleAssignProjectToLoan = (movementId: string, projectId: string) => {
        const mov = movements.find(m => m.id === movementId);
        const itemName = mov ? items.find(i => i.id === mov.itemId)?.name ?? 'ítem' : 'ítem';
        const projName = projects.find(p => p.id === projectId)?.name ?? projectId;
        setMovements(prev => prev.map(m => m.id === movementId ? { ...m, projectId, updatedAt: new Date() } : m));
        withSync(db.updateMovementProject(movementId, projectId));
        addAuditLog('LOAN_PROJECT_ASSIGNED', `Asignó "${itemName}" al proyecto "${projName}"`);
    };

    const handleTransferLoan = (movementId: string, newPersonnelId: string) => {
        const original = movements.find(m => m.id === movementId);
        if (!original) return;

        const fromName = personnel.find(p => p.id === original.personnelId)?.name ?? 'trabajador anterior';
        const toName   = personnel.find(p => p.id === newPersonnelId)?.name ?? 'trabajador destino';
        const itemName = items.find(i => i.id === original.itemId)?.name ?? 'herramienta';

        requireConfirm(`¿Traspasar "${itemName}" de ${fromName} a ${toName}?`, () => {
            // Cierra el préstamo original sin tocar el stock (la herramienta no regresó a bodega)
            setMovements(prev => prev.map(m => m.id === movementId ? { ...m, isReturned: true, pendingPickup: false, updatedAt: new Date() } : m));
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
        });
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

    const handleEditPersonnel = (entrante: Personnel) => {
        const prev = personnel.find(pers => pers.id === entrante.id);
        const p: Personnel = { ...entrante, updatedAt: new Date() };
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
        withSync(db.addPurchaseOrder(o, id).then(created => setPurchaseOrders(prev => prev.map(x => x.id === id ? created : x))));
        addAuditLog('PO_CREATED', `Creó orden de compra a "${o.supplier}" (${o.items.length} ítem(s))`);
    };

    const handleUpdatePOStatus = (id: string, status: PurchaseOrderStatus) => {
        const orden = purchaseOrders.find(o => o.id === id);
        addAuditLog('PO_STATUS_CHANGED', `Orden de "${orden?.supplier ?? id}": ${orden?.status ?? '?'} → ${status}`);
        setPurchaseOrders(prev => prev.map(o => o.id === id
            ? { ...o, status, ...(status === PurchaseOrderStatus.RECEIVED ? { receivedDate: new Date() } : {}) }
            : o
        ));
        withSync(db.updatePurchaseOrderStatus(id, status));
    };

    const handleDeletePO = (id: string) => {
        const orden = purchaseOrders.find(o => o.id === id);
        setPurchaseOrders(prev => prev.filter(o => o.id !== id));
        withSync(db.deletePurchaseOrder(id));
        addAuditLog('PO_DELETED', `Eliminó orden de compra de "${orden?.supplier ?? id}"`);
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
            () => {
                // Se deja una entrada que sobrevive al borrado: si no, quien limpia
                // la bitácora borra también la prueba de que la limpió, y el
                // registro deja de servir como registro.
                const cuantos = auditLogs.length;
                setAuditLogs([{
                    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    timestamp: new Date(),
                    action: 'AUDIT_CLEARED',
                    actor: userName,
                    description: `Limpió la bitácora de auditoría (${cuantos} registro(s) eliminados)`,
                }]);
            },
            'Limpiar bitácora',
            'Se borrarán todos los registros de auditoría. Quedará constancia de esta limpieza.',
        );
    };

    // ── PIN de autorización para acciones destructivas ──
    const [pinAction, setPinAction] = useState<null | { fn: () => void; title?: string; message?: string }>(null);
    const [multiAction, setMultiAction] = useState<null | { fn: () => void; title: string; message: string }>(null);
    const [confirmAction, setConfirmAction] = useState<null | { fn: () => void; message: string }>(null);
    const requireMultiUser = (fn: () => void, title: string, message: string) => setMultiAction({ fn, title, message });
    const requirePin = (fn: () => void, title?: string, message?: string) => {
        setPinAction({ fn, title, message });
    };
    const requireConfirm = (message: string, fn: () => void) => setConfirmAction({ fn, message });

    if (!loggedIn) return <LoginView users={users} onLoginSuccess={handleLoginSuccess} onFirstSetup={handleFirstSetup} onCredentialVerified={handleCredentialVerified} />;

    return (
        <div translate="no" className="flex h-screen bg-papel-hondo overflow-hidden font-sans">
            {/* Backdrop mobile: cierra el sidebar al tocar fuera */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-20 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside className={`bg-papel border-r border-papel-borde shadow-xl transition-all duration-300 ease-in-out fixed md:relative inset-y-0 left-0 z-30 transform md:transform-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'} flex flex-col`}>
                <div className="h-16 flex-shrink-0 flex items-center px-5 border-b bg-marca-fuerte">
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
                                {/* Sin número: cuatro cosas anotadas para comprar no son
                                    una alarma, son una libreta. El aviso naranja es el
                                    mismo de "A Recoger", donde sí hay algo esperando. */}
                                <NavItem
                                    icon={({ className }: { className?: string }) => <span className={className}>🧾</span>}
                                    label="Lista de pedidos"
                                    onClick={() => selectView('pedidos')}
                                    isActive={effectiveView === 'pedidos'}
                                />
                                {/* "Agrupar ítems" sale de la barra: de 77 ítems, 25 nunca
                                    tuvieron familia confirmada y la separación no se usó ni
                                    una vez — el árbol la deduce del nombre igual de bien, y
                                    para un ítem suelto está el campo Familia al editarlo.
                                    La pantalla NO se borra: la vista 'familias' y
                                    ReviewFamiliesView siguen enteros, con su autocorrección.
                                    Volver a enlazarla es poner acá el NavItem otra vez. */}
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
                <div className="flex-shrink-0 px-2 py-3 border-t border-papel-borde space-y-1">
                    <NavItem icon={QuestionMarkIcon} label="Ayuda ❓" onClick={() => selectView('help')} isActive={currentView === 'help'} />
                    <button
                        onClick={() => { addBehaviorLog('BUTTON', 'Abrió: Configuración'); setSettingsOpen(true); }}
                        className="w-full flex items-center text-left px-4 py-2.5 text-xs font-semibold rounded-xl text-tinta-tenue hover:bg-papel-hondo hover:text-tinta-suave transition-all"
                    >
                        <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        Configuración
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center text-left px-4 py-2.5 text-xs font-semibold rounded-xl text-tinta-tenue hover:bg-alerta-suave hover:text-alerta transition-all"
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
                    onOpenUserManagement={() => { addBehaviorLog('BUTTON', 'Abrió: Gestión de usuarios'); setUserManagementOpen(true); }}
                    onLogout={handleLogout}
                    setUserRole={() => {}}
                    syncStatus={syncStatus}
                    onOpenSearch={() => { setSearchOpen(true); addBehaviorLog('BUTTON', 'Abrió búsqueda global'); }}
                />
                {/* En el celular, 16px de margen por lado son 32px que no se ven
                    y un renglón menos de contenido. */}
                <main className="flex-1 p-2 md:p-6 overflow-y-auto bg-papel-hondo">
                    <div className="max-w-7xl mx-auto">
                        {effectiveView === 'dashboard' && (
                            <Dashboard
                                items={items}
                                movements={movements}
                                personnel={personnel}
                                purchaseOrders={purchaseOrders}
                                onNavigate={(v, tab) => selectView(v as View, tab as KardexTab | undefined)}
                                onBehaviorLog={addBehaviorLog}
                                onAuditLog={addAuditLog}
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
                                // `onEditItem` en Kardex ABRE el modal; para guardar de una
                                // (enganchar un accesorio desde la lista) hace falta el que
                                // escribe de verdad.
                                onSaveItem={handleEditItem}
                                onCreateItem={handleAddItemSync}
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
                                onLogMovements={handleLogMovements}
                                onCreateItem={handleAddItemSync}
                                onCreateProject={handleAddProjectSync}
                                onCreatePersonnel={handleAddPersonnelSync}
                                onEditItem={handleEditItem}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
                        {effectiveView === 'familias' && (
                            <ReviewFamiliesView
                                items={items}
                                onEditItem={handleEditItem}
                                onGoBack={() => selectView('kardex')}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
                        {effectiveView === 'help' && <HelpView />}
                        {effectiveView === 'pedidos' && (
                            <OrderListView
                                notes={orderNotes}
                                items={items}
                                movements={movements}
                                personnel={personnel}
                                onAddNote={handleAddOrderNote}
                                onToggleNote={handleToggleOrderNote}
                                onUpdateNote={handleUpdateOrderNote}
                                onDeleteNote={handleDeleteOrderNote}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
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
                            <WhatsAppView movements={movements} items={items} personnel={personnel} readOnly={userRole === UserRole.VISITOR} onBehaviorLog={addBehaviorLog} onAuditLog={addAuditLog} />
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
                                onAuditLog={addAuditLog}
                            />
                        )}
                    </div>
                </main>
            </div>

            <AddItemModal isOpen={isAddItemModalOpen} onClose={() => setAddItemModalOpen(false)} onAddItem={handleAddItem} userRole={userRole} items={items} />
            <EditItemModal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} onEditItem={handleEditItem} itemToEdit={itemToEdit} items={items} />
            <LogMovementModal isOpen={isLogMovementModalOpen} onClose={() => setLogMovementModalOpen(false)} onLogMovement={handleLogMovement} items={items} movements={movements} personnel={personnel} projects={projects} userRole={userRole} onCreateItem={handleAddItemSync} />
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
                    users={users}
                    onConfirm={pinAction.fn}
                    onClose={() => setPinAction(null)}
                />
            )}
            {confirmAction && (
                <ConfirmDialog
                    message={confirmAction.message}
                    onConfirm={confirmAction.fn}
                    onClose={() => setConfirmAction(null)}
                />
            )}
            {multiAction && (
                <MultiUserConfirmModal
                    title={multiAction.title}
                    message={multiAction.message}
                    users={users}
                    onConfirm={multiAction.fn}
                    onClose={() => setMultiAction(null)}
                />
            )}
            {(userRole === UserRole.OWNER || userRole === UserRole.EMPLOYEE) && (
                <FloatingChat
                    onEditItem={handleEditItem}
                    items={items}
                    movements={movements}
                    personnel={personnel}
                    purchaseOrders={purchaseOrders}
                    projects={projects}
                    onLogMovements={handleLogMovements}
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
    <button onClick={onClick} className={`w-full flex items-center text-left px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${isActive ? 'bg-marca text-tinta shadow-lg' : 'text-tinta-tenue hover:bg-papel-hondo hover:text-tinta'}`}>
        <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-tinta' : 'text-tinta-tenue'}`} />
        <span className="flex-1">{label}</span>
        {badge != null && badge > 0 && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-papel text-marca-oscuro' : 'bg-atencion text-papel'}`}>
                {badge}
            </span>
        )}
    </button>
);

const NavHeader: React.FC<{ label: string }> = ({ label }) => (
    <h3 className="px-5 pt-6 pb-2 text-[10px] font-black text-tinta-tenue uppercase tracking-widest">{label}</h3>
);

export default App;
