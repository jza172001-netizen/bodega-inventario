
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
import { describirCambios, describirEstado } from './utils/cambios';
import { nombreReal } from './utils/nombres';
import { PapeleraView } from './components/PapeleraView';
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
import { planearLote } from './core/despacho';

// Icons
import { DashboardIcon } from './components/icons/DashboardIcon';
import { MovementsIcon } from './components/icons/MovementsIcon';
import { PersonnelIcon } from './components/icons/PersonnelIcon';
import { WhatsAppIcon } from './components/icons/WhatsAppIcon';

type View = 'dashboard' | 'kardex' | 'personnel' | 'copilot' | 'help' | 'whatsapp' | 'pickup' | 'traceability' | 'familias' | 'pedidos' | 'papelera';
type KardexTab = 'movements' | 'loans' | 'inventory' | 'projects';

/**
 * Las devoluciones que abren un arreglo. `worn` no entra: una herramienta
 * desgastada sigue sirviendo y llenar la lista de dañadas con desgaste normal
 * la vuelve ruido — y una lista que es ruido no se mira.
 */
const CONDICIONES_QUE_DAÑAN = new Set<string>(['damaged', 'incomplete', 'needs_maintenance']);

const SESSION_KEY = 'bodega_session';
const ONBOARDING_KEY = 'bodega_onboarding_v1';

// La lista almacenada (Supabase o localStorage) es la fuente de verdad del login.
// El seed solo aplica cuando no hay ningún usuario (instalación nueva sin conexión).
// Antes esta función colapsaba cualquier lista sobre los 3 seedUsers: los usuarios
// creados en la BD nunca aparecían y sus credenciales quedaban bajo otra tarjeta (B-2).
/**
 * Los campos que la bitácora vigila de un ítem y de una persona, con el nombre
 * que tienen en la pantalla.
 *
 * Lo que no está acá no se compara: el sello de `updatedAt` cambia en cada
 * guardado y reportarlo llenaría la bitácora de ruido, que es justo lo que se
 * está tratando de quitar.
 */
const ETIQUETAS_ITEM: import('./utils/cambios').Etiquetas<Item> = {
    name: 'nombre',
    quantity: 'cantidad',
    unit: 'unidad',
    minStock: 'mínimo',
    price: 'precio',
    inventoryType: 'tipo',
    category: 'categoría',
    familia: 'familia',
    color: 'color',
    brand: 'marca',
};

const ETIQUETAS_PERSONA: import('./utils/cambios').Etiquetas<Personnel> = {
    name: 'nombre',
    phone: 'teléfono',
    isTeamLeader: 'es oficial',
    // `teamLeaderId` NO va: es un id, y en la bitácora saldría como un
    // amasijo de letras. Los cambios de cuadrilla ya se anotan con nombres
    // propios en `soltarCuadrillaDe`.
};

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
    const [users, setUsers] = useState<AppUser[]>(() => {
        const s = loadInitialData();
        return migrateUsers(s?.users ?? mockUsers).map(u => ({ ...u, name: nombreReal(u.name) }));
    });

    const [userName, setUserName] = useState<string>(() => {
        try {
            const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
            if (!session.name) return '';
            if (session.role === UserRole.VISITOR) return 'Visitante';
            const bueno = nombreReal(session.name);
            // Y se deja escrito corregido, para que el nombre viejo no siga
            // saliendo del teléfono cada vez que se abre la app. Antes se
            // corregía en memoria y el localStorage seguía diciendo "Julio".
            if (bueno !== session.name) {
                localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, name: bueno }));
            }
            return bueno;
        } catch { return ''; }
    });
    const [items, setItems] = useState<Item[]>(() => { const s = loadInitialData(); return s?.items ?? []; });
    /**
     * El inventario como está AHORA, contando lo que se acaba de crear en este
     * mismo momento.
     *
     * `setItems` no cambia `items` hasta el render siguiente. Así que un ítem
     * creado y despachado de una sola vez —que es exactamente lo que hace el
     * asistente de Despacho— todavía no existía cuando su propio movimiento lo
     * iba a buscar. Y sin ítem, `handleLogMovement` se saltaba las dos cosas
     * que importan: no validaba el stock y no lo descontaba. El movimiento
     * quedaba en el Kardex y la cantidad del ítem se quedaba quieta.
     *
     * De ahí salieron los cuatro descuadres del 5 y 6 de septiembre, y de ahí
     * salió que "clavos 2 acero" pudiera despacharse teniendo 0 libras.
     */
    const itemsRef = React.useRef<Item[]>(items);
    useEffect(() => { itemsRef.current = items; }, [items]);
    /** El ítem vigente, mirando primero lo recién creado. */
    const itemActual = (id?: string): Item | undefined =>
        id ? (itemsRef.current.find(i => i.id === id) ?? items.find(i => i.id === id)) : undefined;
    /** Deja el espejo al día sin esperar al próximo render. */
    const anotarEnEspejo = (item: Item) => { itemsRef.current = [...itemsRef.current, item]; };
    const ajustarEspejo = (id: string, quantity: number) => {
        itemsRef.current = itemsRef.current.map(i => i.id === id ? { ...i, quantity } : i);
    };
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
        return logs.map(l => ({ ...l, actor: nombreReal(l.actor) }));
    });
    const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>(() => {
        const s = loadInitialData();
        const logs = s?.behaviorLogs ?? [];
        return logs.map(l => ({ ...l, actor: nombreReal(l.actor) }));
    });

    /** Quién manda algo a la papelera. Misma regla que el actor de la bitácora:
     *  nunca en blanco, porque un borrado sin dueño no se puede auditar. */
    const quienBorra = (): string => userName?.trim() || 'sin identificar';

    /**
     * De dónde salió lo que se está registrando.
     *
     * El chat necesita mostrar SU historial —lo que se hizo desde ahí— y que se
     * vea en cualquier celular. La bitácora ya se sincroniza entre teléfonos, así
     * que no hace falta una tabla nueva: falta saber cuáles renglones vinieron
     * del chat.
     *
     * Es un interruptor y no un parámetro a propósito. Una sola acción del chat
     * dispara varias anotaciones en cascada —crear un ítem registra además su
     * carga inicial, despachar toca stock y préstamo—, y pasarle el origen a
     * quince funciones significaría cambiarles la firma a todas y acordarse de
     * cada una para siempre. Con el interruptor, TODO lo que se anote mientras
     * el chat está actuando queda marcado, cascada incluida.
     *
     * Va en un `ref` y no en estado porque tiene que valer YA, en la misma
     * vuelta: un `useState` no cambia hasta el render siguiente, que es
     * exactamente el error que costó plata con el stock en la tanda del 6.
     */
    const origenAccion = React.useRef<string | null>(null);

    /**
     * El número que amarra todo lo que salió del MISMO toque.
     *
     * Una sola salida por el chat deja varios renglones —el movimiento, el
     * stock, a veces la creación del ítem y su carga inicial—, y para el
     * bodeguero eso fue UNA cosa: "le despaché tres vainas a Jhon jader". Sin
     * este número, el historial del chat serían tres renglones sueltos en vez de
     * un chulito que se abre.
     *
     * Vive hasta el final del toque y no más: se genera en la primera llamada y
     * se suelta con un `setTimeout(0)`, que corre cuando el navegador terminó de
     * atender ese clic. Todo lo que pase dentro del mismo clic es síncrono, así
     * que comparte el número; el clic siguiente empieza uno nuevo.
     */
    const operacionActual = React.useRef<string | null>(null);

    const desdeElChat = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A): R => {
        origenAccion.current = 'chat';
        if (!operacionActual.current) {
            operacionActual.current = crypto.randomUUID();
            setTimeout(() => { operacionActual.current = null; }, 0);
        }
        try {
            return fn(...a);
        } finally {
            // En un `finally` para que un error a mitad no deje el interruptor
            // encendido marcando como «del chat» todo lo que venga después.
            origenAccion.current = null;
        }
    };

    /**
     * La frase que el bodeguero YA vio en el chat, guardada tal cual.
     *
     * Se guarda la redacción de la pantalla y no una reconstruida después: si el
     * chat dijo "✅ 3 salidas registradas para Jhon jader · LODGES", eso es lo
     * que tiene que decir el historial. Deducirlo leyendo las descripciones con
     * expresiones regulares sería inventar una segunda versión de algo que ya
     * está escrito.
     */
    const handleResumenChat = (texto: string) => addAuditLog('CHAT_RESUMEN', texto);

    const addAuditLog = (action: string, description: string, actorOverride?: string) => {
        const entry: AuditLog = {
            id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: new Date(),
            action,
            /**
             * Nunca vacío.
             *
             * El 6 de septiembre a las 12:32 quedó un `SYNC_LIMPIEZA` que quitó
             * 15 movimientos de un dispositivo, con el actor en blanco: la
             * bitácora registró la operación y no dijo quién fue. Pasa cuando
             * algo escribe antes de que la sesión haya cargado el nombre.
             *
             * Una bitácora que dice "no sé quién" es más honesta que una que
             * deja el renglón mudo, y la regla de la casa es que TODA operación
             * sobre datos deja rastro — rastro con nombre.
             */
            actor: (actorOverride ?? userName)?.trim() || 'sin identificar',
            description,
            ...(origenAccion.current ? { origen: origenAccion.current } : {}),
            ...(operacionActual.current ? { operacionId: operacionActual.current } : {}),
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
        const fixedName = nombreReal(name);
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
        db.setUserCredentials(updated).catch(e => { console.error('[Supabase] user:', e); setSyncStatus('error'); });
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

    /**
     * Guardado en localStorage, agrupado.
     *
     * Antes esto corría en CADA cambio de estado, y `behaviorLogs` crece con
     * cada toque —cada navegación, cada filtro, cada botón, cada scroll—. O sea
     * que cada toque disparaba un `JSON.stringify` de todo el dato (78 ítems,
     * 108 movimientos, 491 registros de bitácora, 1.701 de comportamiento) más
     * un `localStorage.setItem`, que es SÍNCRONO y bloquea la pantalla mientras
     * escribe.
     *
     * En Chrome eso pasa desapercibido. En el navegador de Huawei, con un motor
     * más lento, se siente: es la lentitud que reportó Juli, que aparecía en un
     * navegador y en el otro no.
     *
     * Ahora los cambios de medio segundo se juntan en una sola escritura, y al
     * cerrar la pestaña se guarda lo que quede pendiente para no perder nada.
     */
    const guardadoPendiente = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        const datos = { items, movements, personnel, purchaseOrders, projects, users, auditLogs, behaviorLogs };
        if (guardadoPendiente.current) clearTimeout(guardadoPendiente.current);
        guardadoPendiente.current = setTimeout(() => saveToLocalStorage(datos), 500);
        const alSalir = () => { if (guardadoPendiente.current) clearTimeout(guardadoPendiente.current); saveToLocalStorage(datos); };
        window.addEventListener('pagehide', alSalir);
        return () => window.removeEventListener('pagehide', alSalir);
    }, [items, movements, personnel, purchaseOrders, projects, users, auditLogs, behaviorLogs]);

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
              setUsers(prev => {
                  const deLaNube = migrateUsers(data).map(u => {
                      const known = prev.find(p => p.id === u.id)
                          ?? prev.find(p => p.username && p.username === u.username);
                      return known?.passwordHash ? { ...u, passwordHash: known.passwordHash } : u;
                  });
                  /**
                   * Lo que está en el teléfono y NO en la nube se sube, no se borra.
                   *
                   * Antes esta línea reemplazaba la lista local por la remota, a
                   * secas. Si un acceso se creó acá y su inserción falló —que es lo
                   * que pasaba con dos accesos sin configurar, por el UNIQUE del
                   * nombre de usuario— la siguiente sincronización lo hacía
                   * desaparecer sin dejar rastro. Así se perdieron Santiago y
                   * Camilo.
                   */
                  // Para los accesos, la nube manda. Punto.
                  //
                  // Acá había una red que conservaba los accesos que estaban en el
                  // teléfono y no en la nube, y los reintentaba subir. La escribí
                  // para arreglar los accesos que "se perdían", cuando la causa real
                  // era otra: `addUser` pedía la fila de vuelta y la seguridad de la
                  // tabla revertía el insert entero. Eso ya está arreglado.
                  //
                  // Con la causa resuelta, la red solo servía para revivir muertos: a
                  // Juli le quedaron en la pantalla de entrada un "CAMILO", una "Kate"
                  // repetida y un "Julio" que en la base no existen, y no había forma
                  // de borrarlos — los borraba y la siguiente sincronización se los
                  // devolvía.
                  //
                  // Ahora un acceso existe si está en la nube. Al crearlo sube de una;
                  // si no subió, no existe, y eso es más honesto que fingir que sí. El
                  // costo: un acceso creado sin señal no queda; se vuelve a crear con
                  // señal y ya.
                  return deLaNube.map(u => ({ ...u, name: nombreReal(u.name) }));
              });
          }).catch(e => console.error('[Supabase] users:', e));

          Promise.all([
              db.fetchItems().catch((): Item[] => []),
              db.fetchMovements().catch((): Movement[] => []),
              db.fetchProjects().catch((): Project[] => []),
              db.fetchPersonnel().catch((): Personnel[] => []),
              db.fetchPurchaseOrders().catch((): PurchaseOrder[] => []),
              db.fetchAuditLogs().then(ls => ls.map(l => ({ ...l, actor: nombreReal(l.actor) }))).catch((): AuditLog[] => []),
              db.fetchBehaviorLogs().then(ls => ls.map(l => ({ ...l, actor: nombreReal(l.actor) }))).catch((): BehaviorLog[] => []),
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

    /**
     * Lo que llegó de un pedido, entrando al inventario.
     *
     * Es el otro lado de la trazabilidad. Hasta hoy la app sabía contar lo que
     * SALE; lo que entra había que cargarlo aparte y de golpe. Con esto se va
     * completando pedido a pedido: llega el material, se dice cuánto llegó de
     * verdad —que casi nunca es lo que se pidió— y eso queda como una Entrada
     * en el Kardex, con su rastro en la bitácora.
     *
     * Si el ítem no existe todavía se crea en cero y la entrada le pone las
     * unidades: así el Kardex nace cuadrado desde el primer movimiento, que es
     * justo lo que les faltó a "clavos 2 acero" y "clavos hierro 2".
     */
    const handleRecibirOrderNote = (n: OrderNote, cantidad: number, itemId?: string, nombreNuevo?: string, tipoNuevo?: InventoryType) => {
        if (!cantidad || cantidad <= 0) return;
        let destino = itemId ? itemActual(itemId) : undefined;
        if (!destino) {
            destino = handleAddItemSync({
                name: (nombreNuevo ?? n.texto).trim(),
                // El tipo lo decide quien está mirando la mercancía, no el
                // código. Estaba quemado como consumible, y por eso una pulidora
                // comprada entraba como material de consumo: `isAsset` decía que
                // no era herramienta, así que nunca se podía prestar ni reclamar,
                // y en las cuentas pesaba como gasto. Callado, porque la cantidad
                // sí quedaba bien.
                category: tipoNuevo && tipoNuevo !== InventoryType.SINGLE_USE ? 'Herramientas' : 'Materiales',
                subCategory: '',
                inventoryType: tipoNuevo ?? InventoryType.SINGLE_USE,
                quantity: 0,
                minStock: 0,
                unit: n.unidad?.trim() || 'unidades',
                familia: n.familia?.trim() || undefined,
            });
        }
        const entro = handleLogMovement({
            itemId: destino.id,
            type: MovementType.CHECK_IN,
            quantity: cantidad,
            timestamp: new Date(),
            isLoan: false,
            isReturned: false,
            notes: `Llegó del pedido: "${n.texto}"${n.cantidad != null ? ` (se habían pedido ${n.cantidad} ${n.unidad ?? ''})`.trimEnd() + '' : ''}`,
        });
        if (!entro) return;
        const upd: OrderNote = {
            ...n, recibido: true, recibidoQty: cantidad, itemId: destino.id,
            recibidoAt: new Date(), updatedAt: new Date(),
        };
        setOrderNotes(prev => prev.map(x => x.id === n.id ? upd : x));
        withSync(db.updateOrderNote(upd));
        addAuditLog('ORDER_NOTE_RECEIVED',
            `📥 Llegó del pedido "${n.texto}": ${cantidad} ${destino.unit} de "${destino.name}"` +
            (n.cantidad != null && n.cantidad !== cantidad ? ` — se habían pedido ${n.cantidad}` : ''));
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
        withSync(db.deleteOrderNote(n.id, quienBorra()));
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
    const EMPLOYEE_VIEWS: View[] = ['dashboard', 'kardex', 'personnel', 'help', 'whatsapp', 'pickup', 'traceability', 'copilot', 'familias', 'pedidos', 'papelera'];
    const VISITOR_VIEWS: View[] = ['dashboard', 'kardex', 'whatsapp', 'traceability', 'papelera'];
    const effectiveView: View = (userRole === UserRole.VISITOR && !VISITOR_VIEWS.includes(currentView))
        ? 'dashboard'
        : (userRole === UserRole.EMPLOYEE && !EMPLOYEE_VIEWS.includes(currentView))
            ? 'dashboard'
            : currentView;
    // Acá se contaban las agrupaciones por confirmar, para el número de "Agrupar
    // ítems". Ese botón salió de la barra, así que el conteo —que recorría todos
    // los ítems en cada render— ya no alimenta nada.

    const pendingPickupCount = movements.filter(m => m.isLoan && !m.isReturned && m.pendingPickup).length;
    /** Las tres pantallas que salen por WhatsApp, juntas bajo un solo renglón. */
    const GRUPO_WHATSAPP: View[] = ['whatsapp', 'pickup', 'pedidos'];
    const [whatsappAbierto, setWhatsappAbierto] = useState(false);
    // Si se entra a una de las tres desde otro lado (un enlace del Resumen, por
    // ejemplo), el cajón se abre solo: si no, la barra no muestra dónde está uno.
    useEffect(() => {
        if (GRUPO_WHATSAPP.includes(effectiveView)) setWhatsappAbierto(true);
    }, [effectiveView]); // eslint-disable-line react-hooks/exhaustive-deps
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

    /**
     * Acá vivían `handleResetAllData` y `handleResetMaterials`: los dos botones
     * de la «Zona de peligro» que borraban la bodega entera.
     *
     * No dejaban lápida —eran un DELETE de verdad contra Supabase, sin vuelta
     * atrás— y `requireResetAuth` dejaba pasar al dueño sin clave ninguna: los
     * tres toques de confirmación caían todos en el MISMO botón, así que tres
     * toques seguidos en el mismo punto de la pantalla y no quedaba nada. El
     * bodeguero también los veía.
     *
     * Verificado contra producción: nunca se dispararon, así que no hubo daño.
     * Esto es cerrar la puerta antes de entregarle la app a alguien más.
     *
     * Empezar de cero, si algún día hace falta de verdad, se hace por fuera y
     * deja su renglón en la trazabilidad como toda operación sobre los datos.
     */

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
        papelera: 'Papelera',
        pedidos: 'Lista de pedidos',
    };

    const selectView = (view: View, tab?: KardexTab) => {
        setCurrentView(view);
        if (tab) setKardexTab(tab);
        if (window.innerWidth < 768) setSidebarOpen(false);
        /**
         * Moverse por la app ya no deja renglón.
         *
         * Esta línea, más los avisos de «llegó al fondo» de las listas, eran el
         * 53% del registro de comportamiento en producción: 950 renglones de
         * 1.786 que solo dicen que alguien cambió de pantalla. Cada uno costaba
         * una escritura completa al almacenamiento del teléfono.
         *
         * Lo que se sigue anotando es lo que responde algo: qué filtró, qué
         * ficha abrió, qué botón tocó, y por supuesto todo lo que TOCA los datos
         * —eso va a la bitácora, que es otra cosa y no se recorta.
         */
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
        // La carga inicial es mercancía ENTRANDO a la bodega, y hasta hoy no
        // dejaba renglón en la bitácora: el 5 de septiembre se crearon 17 ítems
        // y hubo cero entradas registradas. El movimiento sí quedaba; la
        // trazabilidad, no. Ahora se cuenta como lo que es.
        addAuditLog('STOCK_IN', `📥 Carga inicial: "${item.name}" ×${item.quantity} ${item.unit}`);
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
    const handleAddItem = (i: Omit<Item, 'id'>) => {
        const id = crypto.randomUUID();
        const newItem = { ...i, id };
        setItems(prev => [...prev, newItem]);
        anotarEnEspejo(newItem);
        withSync(db.addItem(i, id));
        registrarApertura(newItem);
        addAuditLog('ITEM_CREATED', `Se agregó "${i.name}" al inventario`);
    };

    const handleAddItemSync = (i: Omit<Item, 'id'>): Item => {
        const id = crypto.randomUUID();
        const newItem = { ...i, id };
        setItems(prev => [...prev, newItem]);
        anotarEnEspejo(newItem);
        withSync(db.addItem(i, id));
        registrarApertura(newItem);
        addAuditLog('ITEM_CREATED', `Se agregó "${i.name}" al inventario`);
        return newItem;
    };

    /**
     * Deshace los ítems que el asistente creó y que el bodeguero canceló.
     *
     * El asistente crea el ítem en el paso 4 —necesita su id para poder
     * seleccionarlo—, no al confirmar. Si se cancela a mitad, el ítem ya nació.
     * Acá se devuelve el estado: se borran los que NO alcanzaron a tener
     * movimientos, con su lápida para que el otro celular no los resucite.
     *
     * Los que sí tienen movimientos no se tocan: ahí ya pasó algo de verdad y
     * borrarlos dejaría el Kardex apuntando al vacío.
     */
    const handleDescartarItems = (ids: string[]) => {
        /**
         * El asiento de apertura no cuenta como "ya pasó algo".
         *
         * Crear un ítem registra su carga inicial —una Entrada— en el mismo
         * acto. Así que TODO ítem recién creado nace con un movimiento, y la
         * regla de "no borro lo que tiene movimientos" los protegía a todos:
         * cancelar no descartaba nada. Se probó en el navegador y el ítem
         * quedaba igual.
         *
         * Lo que sí cuenta es cualquier otro movimiento: una salida, una
         * merma. Ahí el ítem ya se usó y borrarlo dejaría el Kardex apuntando
         * al vacío.
         */
        const esApertura = (m: Movement) =>
            m.type === MovementType.CHECK_IN && (m.notes ?? '').startsWith('Carga inicial:');
        const conMovimiento = new Set(
            movements.filter(m => ids.includes(m.itemId) && !esApertura(m)).map(m => m.itemId));
        const aBorrar = ids.filter(id => !conMovimiento.has(id));
        if (aBorrar.length === 0) return;
        const nombres = aBorrar.map(id => itemActual(id)?.name).filter(Boolean);
        setItems(prev => prev.filter(i => !aBorrar.includes(i.id)));
        itemsRef.current = itemsRef.current.filter(i => !aBorrar.includes(i.id));
        // Y se va también su carga inicial: si el ítem no existe, esa Entrada
        // queda apuntando a la nada y el cotejo la reporta para siempre.
        const aperturas = movements.filter(m => aBorrar.includes(m.itemId) && esApertura(m));
        if (aperturas.length > 0) {
            const idsMov = new Set(aperturas.map(m => m.id));
            setMovements(prev => prev.filter(m => !idsMov.has(m.id)));
            for (const m of aperturas) withSync(db.deleteMovement(m.id));
        }
        for (const id of aBorrar) withSync(db.deleteItem(id, quienBorra()));
        addAuditLog('ITEM_DELETED',
            `Se descartó lo que el asistente había creado y no se confirmó: ${nombres.join(', ')}`);
    };

    /**
     * Devolver algo de la papelera.
     *
     * Levantar la lápida en la base no alcanza: hay que rehacer también el
     * efecto que ese dato tenía. Con un movimiento eso es el stock — borrarlo
     * lo revirtió (`handleDeleteMovement`), así que devolverlo tiene que
     * volver a aplicarlo, o el Kardex queda contando una salida que ya no
     * existe. Un préstamo ya devuelto no se toca: salió y volvió, su efecto
     * neto siempre fue cero.
     *
     * Lo demás se recarga de la nube en vez de reconstruirlo a mano: la fila
     * que vuelve trae todos sus campos, y armarla acá sería una segunda
     * versión de la verdad.
     */
    const handleRestaurado = (f: import('./services/supabaseService').EnLaPapelera) => {
        if (f.tabla === 'movements' && f.movItemId && f.movCantidad != null && !f.movNetoCero) {
            const item = itemActual(f.movItemId);
            if (item) {
                const qty = Math.max(0, f.movEsSalida
                    ? item.quantity - f.movCantidad
                    : item.quantity + f.movCantidad);
                setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: qty } : i));
                ajustarEspejo(item.id, qty);
                withSync(db.updateItemQuantity(item.id, qty));
            }
        }
        const recargas: Record<string, () => void> = {
            items:           () => { db.fetchItems().then(setItems).catch(() => {}); },
            movements:       () => { db.fetchMovements().then(setMovements).catch(() => {}); },
            personnel:       () => { db.fetchPersonnel().then(setPersonnel).catch(() => {}); },
            projects:        () => { db.fetchProjects().then(setProjects).catch(() => {}); },
            purchase_orders: () => { db.fetchPurchaseOrders().then(setPurchaseOrders).catch(() => {}); },
            app_users:       () => { db.fetchUsers().then(u => setUsers(migrateUsers(u))).catch(() => {}); },
            order_list:      () => { db.fetchOrderList().then(setOrderNotes).catch(() => {}); },
        };
        recargas[f.tabla]?.();
        // Un movimiento que vuelve cambia el stock del ítem: hay que refrescar los dos.
        if (f.tabla === 'movements') recargas.items();
    };

    const handleEditItem = (entrante: Item) => {
        const prev = items.find(i => i.id === entrante.id);
        // El sello es lo que hace que esta corrección le gane al dato viejo de la
        // nube cuando la app vuelva a sincronizar. Sin él, se borraba sola.
        const updated: Item = { ...entrante, updatedAt: new Date() };
        setItems(p => p.map(i => i.id === updated.id ? updated : i));
        withSync(db.updateItem(updated));
        // Qué cambió, no solo que cambió. Antes acá decía `Se editó "X"` y punto:
        // si alguien bajaba una cantidad de 3 a 1, la bitácora no lo sabía.
        const queCambio = describirCambios(prev, updated, ETIQUETAS_ITEM);
        if (prev?.name !== updated.name) {
            // Acción propia, no un ITEM_EDITED cualquiera: el cotejo compara por
            // NOMBRE porque la bitácora no guarda ids, así que al renombrar algo se
            // rompía el hilo con su creación y el ítem salía "sin registro de
            // creación" para siempre. Con esto el hilo se puede seguir.
            const resto = describirCambios(prev, updated, { ...ETIQUETAS_ITEM, name: undefined });
            addAuditLog('ITEM_RENAMED',
                `Se renombró "${prev?.name ?? ''}" → "${updated.name}"${resto ? ` · ${resto}` : ''}`);
        } else {
            addAuditLog('ITEM_EDITED',
                queCambio ? `Se editó "${updated.name}": ${queCambio}` : `Se abrió y guardó "${updated.name}" sin cambiarle nada`);
        }
    };

    const handleDeleteItem = (id: string) => {
        const item = items.find(i => i.id === id);
        const hasMovements = movements.some(m => m.itemId === id);
        const detail = hasMovements ? 'Tiene movimientos registrados. Los registros históricos quedarán sin referencia.' : undefined;
        requirePin(
            () => {
                setItems(prev => prev.filter(i => i.id !== id));
                withSync(db.deleteItem(id, quienBorra()));
                // Qué TENÍA lo que se borró. `Se eliminó "Pala"` no dice si tenía
                // 1 o tenía 40, y eso es justo lo que hace falta para decidir si
                // devolverlo de la papelera.
                const traiaPuesto = item ? describirEstado(item, ETIQUETAS_ITEM) : '';
                addAuditLog('ITEM_DELETED',
                    `Se mandó a la papelera "${item?.name ?? id}"${traiaPuesto ? ` — ${traiaPuesto}` : ''}`);
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
        // Se valida contra el ESPEJO, no contra `items` del render: si el lote
        // incluye un ítem creado hace un instante, en `items` todavía no está y
        // su salida entraba sin validar.
        const plan = planearLote(batch, itemsRef.current);

        for (const { movimiento, nuevaCantidad, item } of plan.aplicar) {
            const id = crypto.randomUUID();
            const ts = movimiento.timestamp instanceof Date ? movimiento.timestamp : new Date(movimiento.timestamp ?? Date.now());
            setMovements(prev => [{ ...movimiento, id, timestamp: ts }, ...prev]);
            setItems(prev => prev.map(x => (x.id === item.id ? { ...x, quantity: nuevaCantidad } : x)));
            ajustarEspejo(item.id, nuevaCantidad);
            // Una sola transacción en el servidor: movimiento + stock, a prueba
            // de carreras entre dos teléfonos.
            withSync(db.logMovementWithStock({ ...movimiento, timestamp: ts }, id, nuevaCantidad));

            const personName = movimiento.personnelId ? personnel.find(p => p.id === movimiento.personnelId)?.name : undefined;
            const conQuien = personName ? ` — ${personName}` : '';
            if (movimiento.isLoan) {
                addAuditLog('LOAN_CREATED', `Préstamo: "${item.name}"${personName ? ` → ${personName}` : ''}`);
            } else if (movimiento.type === MovementType.CHECK_OUT) {
                // Antes esto se guardaba como ITEM_EDITED y la entrada como ITEM_CREATED:
                // la descripción decía la verdad pero la acción no, así que en
                // Trazabilidad un despacho aparecía archivado como "se editó un
                // artículo" y las creaciones venían infladas con las entradas.
                addAuditLog('STOCK_OUT', `📤 Salida: "${item.name}" ×${movimiento.quantity}${conQuien}`);
            } else if (movimiento.type === MovementType.CHECK_IN) {
                addAuditLog('STOCK_IN', `📥 Entrada: "${item.name}" ×${movimiento.quantity}${conQuien}`);
            }
        }

        // Sin ítem no hay stock que mover, pero el movimiento no se pierde: el
        // historial es lo único que no se puede reconstruir después.
        for (const m of plan.huerfanos) {
            const id = crypto.randomUUID();
            const ts = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp ?? Date.now());
            console.warn('[stock] Movimiento sin ítem en el inventario:', m.itemId);
            setMovements(prev => [{ ...m, id, timestamp: ts }, ...prev]);
            withSync(db.addMovement({ ...m, timestamp: ts }, id));
        }

        return {
            ok: plan.aplicar.length + plan.huerfanos.length,
            total: plan.aplicar.length + plan.huerfanos.length + plan.rechazos.length,
            rechazos: plan.rechazos,
        };
    };

    /**
     * Una línea suelta. Es `handleLogMovements` con un solo renglón.
     *
     * Antes era su propia función con su propia aritmética, y por eso el
     * formulario directo NO expandía accesorios mientras el chat SÍ: la misma
     * salida de una pulidora dejaba cinco discos por un lado y cuatro por el
     * otro. Ahora las dos puertas pasan por el mismo núcleo y no pueden
     * diverger.
     *
     * Devuelve true si quedó registrado. Quien lo llama debe reportar lo que de
     * verdad pasó: el chatbot decía "✅ registrado" incluso cuando la validación
     * había rechazado la salida.
     */
    const handleLogMovement = (m: Omit<Movement, 'id'>): boolean => {
        const r = handleLogMovements([m]);
        const rechazo = r.rechazos[0];
        if (rechazo) {
            alert(`Stock insuficiente de "${rechazo.nombre}": hay ${rechazo.hay} ${rechazo.unidad} y se intentó sacar ${rechazo.pedido}. El movimiento NO se registró.`);
            return false;
        }
        return r.ok > 0;
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
                    ajustarEspejo(item.id, qty);
                }
                setMovements(prev => prev.filter(m => m.id !== id));
                withSync(db.deleteMovementWithRevert(id, item?.id, newQty, quienBorra()));
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
            ajustarEspejo(item.id, qty);
        }
        withSync(db.returnLoanAndRestoreStock(
            id,
            condition as import('./types').ReturnCondition | undefined,
            notes,
            item?.id,
            restoredQty,
        ));
        addAuditLog('LOAN_RETURNED', `Devuelta: "${itemName}"${personName ? ` de ${personName}` : ''}${condition ? ` — estado: ${condition}` : ''}`);

        // Si volvió mal, arranca el ciclo de reparación. Antes el estado se
        // guardaba en el movimiento y ahí se quedaba: nadie volvía a acordarse
        // de mandarla a arreglar ni de reclamarla después.
        if (item && CONDICIONES_QUE_DAÑAN.has(condition ?? '') && item.reparacion?.estado !== 'enviada') {
            const conReparacion: Item = {
                ...item,
                reparacion: { estado: 'dañada', desde: new Date(), nota: notes || undefined, porQuien: userName || undefined },
                updatedAt: new Date(),
            };
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, reparacion: conReparacion.reparacion, updatedAt: conReparacion.updatedAt } : i));
            itemsRef.current = itemsRef.current.map(i => i.id === item.id ? { ...i, reparacion: conReparacion.reparacion } : i);
            withSync(db.updateItem(conReparacion));
            addAuditLog('REPAIR_OPENED', `🔧 Quedó dañada: "${itemName}"${notes ? ` — ${notes}` : ''}`);
        }
    };

    /**
     * Los tres pasos del arreglo, cada uno confirmado por una persona.
     *
     * La app no adelanta ninguno sola: solo el bodeguero sabe si la herramienta
     * de verdad salió para el taller y si de verdad volvió sirviendo.
     */
    const handleRepararPaso = (itemId: string, paso: 'enviada' | 'arreglada') => {
        const item = itemActual(itemId);
        if (!item?.reparacion) return;
        const ahora = new Date();
        const reparacion = paso === 'enviada'
            ? { ...item.reparacion, estado: 'enviada' as const, enviadaEl: ahora, porQuien: userName || undefined }
            : undefined;   // arreglada y de vuelta: sale de la lista de dañadas
        const actualizado: Item = { ...item, reparacion, updatedAt: ahora };
        setItems(prev => prev.map(i => i.id === itemId ? actualizado : i));
        itemsRef.current = itemsRef.current.map(i => i.id === itemId ? actualizado : i);
        withSync(db.updateItem(actualizado));
        addAuditLog(paso === 'enviada' ? 'REPAIR_SENT' : 'REPAIR_DONE',
            paso === 'enviada'
                ? `🔧 Se mandó a arreglar: "${item.name}"`
                : `✅ Volvió arreglada: "${item.name}"`);
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

    /**
     * Saca a todos de la cuadrilla de alguien que ya no es oficial.
     *
     * `teamLeaderId` apunta al oficial. Si al oficial le quitan la marca —o lo
     * borran—, sus trabajadores siguen apuntándole: en Personal desaparecen
     * (esa lista solo se dibuja cuando el de arriba es oficial), pero el dato
     * queda ahí, y el cotejo los reporta como que «figuran en la cuadrilla de
     * X». Quedan colgando de un oficial que no existe.
     *
     * Devuelve cuántos se soltaron, para dejarlo dicho en la bitácora.
     */
    const soltarCuadrillaDe = (lider: Personnel, motivo: string): number => {
        const suyos = personnel.filter(x => x.teamLeaderId === lider.id);
        if (suyos.length === 0) return 0;
        const sueltos = suyos.map(x => ({ ...x, teamLeaderId: undefined, updatedAt: new Date() }));
        setPersonnel(ps => ps.map(x => sueltos.find(y => y.id === x.id) ?? x));
        for (const x of sueltos) withSync(db.updatePersonnel(x));
        addAuditLog('PERSONNEL_EDITED',
            `"${lider.name}" ${motivo}: salieron de su cuadrilla ${sueltos.map(x => `"${x.name}"`).join(', ')}`);
        return sueltos.length;
    };

    const handleEditPersonnel = (entrante: Personnel) => {
        const prev = personnel.find(pers => pers.id === entrante.id);
        const p: Personnel = { ...entrante, updatedAt: new Date() };
        setPersonnel(ps => ps.map(pers => pers.id === p.id ? p : pers));
        withSync(db.updatePersonnel(p));
        const queCambio = describirCambios(prev, p, ETIQUETAS_PERSONA);
        if (prev?.name !== p.name) {
            const resto = describirCambios(prev, p, { ...ETIQUETAS_PERSONA, name: undefined });
            addAuditLog('PERSONNEL_EDITED',
                `Se cambió nombre de trabajador: "${prev?.name}" → "${p.name}"${resto ? ` · ${resto}` : ''}`);
        } else {
            addAuditLog('PERSONNEL_EDITED',
                queCambio ? `Se editó a "${p.name}": ${queCambio}` : `Se abrió y guardó a "${p.name}" sin cambiarle nada`);
        }
        // Dejó de ser oficial: su gente no puede quedar en la cuadrilla de nadie.
        if (prev?.isTeamLeader && !p.isTeamLeader) soltarCuadrillaDe(p, 'dejó de ser oficial');
    };

    const handleDeletePersonnel = (id: string) => {
        const person = personnel.find(p => p.id === id);
        const hasMovements = movements.some(m => m.personnelId === id);
        const detail = hasMovements ? 'Tiene movimientos registrados. Se perderá la referencia en el historial.' : undefined;
        requirePin(
            () => {
                // Mismo puntero colgando: si el borrado era oficial, su gente
                // queda apuntando a alguien que ya no está en ninguna lista.
                if (person) soltarCuadrillaDe(person, 'fue eliminado');
                setPersonnel(prev => prev.filter(p => p.id !== id));
                withSync(db.deletePersonnel(id, quienBorra()));
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
                withSync(db.deleteProject(id, quienBorra()));
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
        withSync(db.deletePurchaseOrder(id, quienBorra()));
        addAuditLog('PO_DELETED', `Eliminó orden de compra de "${orden?.supplier ?? id}"`);
    };

    const handleAddUser = (u: AppUser) => {
        setUsers(prev => [...prev, u]);
        withSync(db.addUser(u));
        // Por el nombre, no por el usuario: ahora el acceso nace sin usuario —lo
        // elige la propia persona al entrar— y la bitácora decía `""`.
        addAuditLog('USER_CREATED', `Se creó acceso para "${u.name}" (${u.role}) — pendiente de que ponga su contraseña`);
    };

    const handleEditUser = (u: AppUser) => {
        // Se toma el anterior ANTES de reemplazarlo: después de `setUsers` ya no
        // hay contra qué comparar.
        const previo = users.find(x => x.id === u.id);
        const seed = seedUsers.find(s => s.id === u.id);
        const normalized = seed ? { ...u, name: seed.name } : u;
        setUsers(prev => prev.map(user => user.id === u.id ? normalized : user));
        // Perfil, no credenciales: editar el nombre o el rol no puede borrarle
        // la contraseña a nadie.
        withSync(db.updateUserProfile(normalized));
        // Se compara contra lo que de verdad se guardó, no contra lo que entró.
        const queCambio = describirCambios(previo, normalized, { name: 'nombre', role: 'rol', username: 'usuario' });
        addAuditLog('PERSONNEL_EDITED',
            queCambio ? `Se editó el acceso de "${normalized.name}": ${queCambio}` : `Se guardó el acceso de "${normalized.name}" sin cambios`);
    };

    const handleDeleteUser = (id: string) => {
        const user = users.find(u => u.id === id);
        requirePin(
            () => {
                setUsers(prev => prev.filter(u => u.id !== id));
                db.deleteUser(id, quienBorra()).catch(() => setSyncStatus('error'));
                addAuditLog('USER_DELETED', `Se eliminó usuario: "${user?.username ?? id}"`);
            },
            `Eliminar usuario "${user?.username ?? 'usuario'}"`,
        );
    };

    /**
     * Acá vivía `handleClearAuditLogs`, que vaciaba la bitácora.
     *
     * No lo llamaba nadie —quedó de una pantalla que ya no existe— y solo tocaba
     * la memoria del teléfono, nunca Supabase, así que ni siquiera borraba de
     * verdad. Se va igual: una función que borra la trazabilidad y está ahí
     * suelta es una bomba esperando a que alguien le conecte un botón. La
     * bitácora es lo único que responde «quién hizo esto», y eso no se limpia.
     */

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
                        {/* WhatsApp deja de ser un renglón y pasa a ser el cajón de las
                            tres cosas que salen por WhatsApp: los recordatorios de
                            herramientas, A Recoger y la Lista de pedidos. Eran tres
                            renglones sueltos apuntando todos al mismo lado.

                            Así la barra queda en cuatro entradas —Resumen, Kardex,
                            WhatsApp y Personal— sin esconder nada detrás de un "más
                            funciones" que hay que aprenderse. */}
                        <NavItem
                            icon={WhatsAppIcon}
                            label="WhatsApp"
                            onClick={() => setWhatsappAbierto(a => !a)}
                            isActive={GRUPO_WHATSAPP.includes(effectiveView)}
                            badge={whatsappAbierto ? undefined : pendingPickupCount}
                            chevron={whatsappAbierto ? 'abierto' : 'cerrado'}
                        />
                        {whatsappAbierto && (
                            <div className="pl-4 space-y-1">
                                <SubNavItem label="Recordatorios" onClick={() => selectView('whatsapp')} isActive={effectiveView === 'whatsapp'} />
                                {userRole !== UserRole.VISITOR && (
                                    <>
                                        <SubNavItem label="A Recoger" onClick={() => selectView('pickup')} isActive={effectiveView === 'pickup'} badge={pendingPickupCount} />
                                        {/* Sin número: cuatro cosas anotadas para comprar no son
                                            una alarma, son una libreta. El aviso naranja es el
                                            mismo de "A Recoger", donde sí hay algo esperando. */}
                                        <SubNavItem label="Lista de pedidos" onClick={() => selectView('pedidos')} isActive={effectiveView === 'pedidos'} />
                                    </>
                                )}
                            </div>
                        )}
                        {userRole !== UserRole.VISITOR && (
                            <NavItem icon={PersonnelIcon} label="Personal" onClick={() => selectView('personnel')} isActive={effectiveView === 'personnel'} />
                        )}
                        {/* "Agrupar ítems" sale de la barra: de 77 ítems, 25 nunca
                            tuvieron familia confirmada y la separación no se usó ni
                            una vez — el árbol la deduce del nombre igual de bien, y
                            para un ítem suelto está el campo Familia al editarlo.
                            La pantalla NO se borra: la vista 'familias' y
                            ReviewFamiliesView siguen enteros, con su autocorrección.
                            Volver a enlazarla es poner acá el NavItem otra vez. */}
                    </nav>
                </div>

                {/* Ayuda salió de acá: ahora vive dentro del asistente, en el «?» de
                    su encabezado. La vista sigue existiendo, solo no ocupa un renglón
                    de la barra. */}
                <div className="flex-shrink-0 px-2 py-3 border-t border-papel-borde space-y-1">
                    {/* Trazabilidad baja al pie, con Configuración y Cerrar sesión:
                        no es una pantalla de trabajo diario, es a dónde se va uno a
                        mirar qué pasó. */}
                    <button
                        onClick={() => selectView('traceability')}
                        className={`w-full flex items-center text-left px-4 py-2.5 text-xs font-semibold rounded-xl transition-all ${
                            effectiveView === 'traceability'
                                ? 'bg-marca text-tinta'
                                : 'text-tinta-tenue hover:bg-papel-hondo hover:text-tinta-suave'}`}
                    >
                        <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
                        </svg>
                        Trazabilidad
                    </button>
                    {/* La papelera va al pie, con Trazabilidad: las dos son para ir a
                        mirar qué pasó, no para el trabajo del día. */}
                    <button
                        onClick={() => selectView('papelera')}
                        className={`w-full flex items-center text-left px-4 py-2.5 text-xs font-semibold rounded-xl transition-all ${
                            effectiveView === 'papelera'
                                ? 'bg-marca text-tinta'
                                : 'text-tinta-tenue hover:bg-papel-hondo hover:text-tinta-suave'}`}
                    >
                        <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        Papelera
                    </button>
                    <button
                        onClick={() => { addBehaviorLog('BUTTON', 'Abrió: Configuración'); setSettingsOpen(true); }}
                        className="w-full flex items-center text-left px-4 py-2.5 text-xs font-semibold rounded-xl text-tinta-tenue hover:bg-papel-hondo hover:text-tinta-suave transition-all"
                    >
                        <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        Configuración
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center text-left px-4 py-2.5 text-xs font-semibold rounded-xl text-tinta-tenue hover:bg-alerta-suave hover:text-alerta transition-all"
                    >
                        <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
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
                                auditLogs={auditLogs}
                                onNavigate={(v, tab) => selectView(v as View, tab as KardexTab | undefined)}
                                onBehaviorLog={addBehaviorLog}
                                onAuditLog={addAuditLog}
                                userRole={userRole}
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
                                onRepararPaso={userRole !== UserRole.VISITOR ? handleRepararPaso : undefined}
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
                                onAssignProject={handleAssignProjectToLoan}
                                onCreateProject={handleCreateProjectByName}
                                onTransferLoan={handleTransferLoan}
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
                                onRecibirNote={userRole !== UserRole.VISITOR ? handleRecibirOrderNote : undefined}
                                onBehaviorLog={addBehaviorLog}
                            />
                        )}
                        {effectiveView === 'traceability' && (
                            <TraceabilityView
                                onAuditLog={addAuditLog}
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
                        {effectiveView === 'papelera' && (
                            <PapeleraView
                                userRole={userRole}
                                onRestaurado={handleRestaurado}
                                onAuditLog={addAuditLog}
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
            <ItemHistoryModal isOpen={isHistoryModalOpen} onClose={() => setHistoryModalOpen(false)} item={itemForHistory} movements={movements} personnel={personnel} projects={projects} onReturnItem={handleReturnItem} onTransferLoan={handleTransferLoan} onAssignProject={handleAssignProjectToLoan} onMarkPendingPickup={handleMarkPendingPickup} userRole={userRole} />
            <UserManagementModal isOpen={isUserManagementOpen} onClose={() => setUserManagementOpen(false)} users={users} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} onEditUser={handleEditUser} />
            <InvoiceReaderModal isOpen={isInvoiceReaderOpen} onClose={() => setInvoiceReaderOpen(false)} onImport={(rows, invType) => handleImportItems(rows, invType)} />
            {isSettingsOpen && (
                <SettingsModal
                    config={appConfig}
                    onChange={handleConfigChange}
                    onClose={() => setSettingsOpen(false)}
                    userRole={userRole}
                    onOpenUserManagement={() => { addBehaviorLog('BUTTON', 'Abrió: Accesos a la app'); setSettingsOpen(false); setUserManagementOpen(true); }}
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
                /* Los handlers van envueltos para que todo lo que dispare el chat
                   quede marcado como suyo en la bitácora, cascada incluida —es lo
                   que le permite mostrar su propio historial. Ver `desdeElChat`. */
                <FloatingChat
                    onEditItem={desdeElChat(handleEditItem)}
                    items={items}
                    movements={movements}
                    personnel={personnel}
                    purchaseOrders={purchaseOrders}
                    projects={projects}
                    onLogMovements={desdeElChat(handleLogMovements)}
                    onCreateItem={desdeElChat(handleAddItemSync)}
                    onCreateProject={desdeElChat(handleAddProjectSync)}
                    onCreatePersonnel={desdeElChat(handleAddPersonnelSync)}
                    onBehaviorLog={addBehaviorLog}
                    auditLogs={auditLogs}
                    onDescartarItems={desdeElChat(handleDescartarItems)}
                    onResumenChat={desdeElChat(handleResumenChat)}
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

const NavItem: React.FC<{ icon: React.ElementType, label: string, onClick: () => void, isActive: boolean, badge?: number, chevron?: 'abierto' | 'cerrado' }> = ({ icon: Icon, label, onClick, isActive, badge, chevron }) => (
    <button onClick={onClick} className={`w-full flex items-center text-left px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 ${isActive ? 'bg-marca text-tinta shadow-lg' : 'text-tinta-suave hover:bg-papel-hondo hover:text-tinta'}`}>
        <Icon className={`w-5 h-5 mr-3 flex-shrink-0 ${isActive ? 'text-tinta' : 'text-tinta-tenue'}`} />
        {/* `truncate` y `min-w-0`: sin eso la palabra se estiraba por debajo del
            número y los dos quedaban montados. */}
        <span className="flex-1 min-w-0 truncate text-left">{label}</span>
        {badge != null && badge > 0 && (
            <span className={`ml-2 flex-shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-papel text-marca-oscuro' : 'bg-atencion text-papel'}`}>
                {badge}
            </span>
        )}
        {chevron && (
            <svg className={`w-4 h-4 ml-1.5 flex-shrink-0 transition-transform ${chevron === 'abierto' ? 'rotate-180' : ''} ${isActive ? 'text-tinta' : 'text-tinta-tenue'}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
        )}
    </button>
);

/** Un renglón de adentro del cajón de WhatsApp. Sin icono: la sangría y el
 *  punto ya dicen que cuelga del de arriba, y un emoji más solo hace ruido. */
const SubNavItem: React.FC<{ label: string, onClick: () => void, isActive: boolean, badge?: number }> = ({ label, onClick, isActive, badge }) => (
    <button onClick={onClick} className={`w-full flex items-center text-left pl-4 pr-3 py-2 text-xs font-bold rounded-lg transition-all ${isActive ? 'bg-marca-suave text-marca-oscuro' : 'text-tinta-tenue hover:bg-papel-hondo hover:text-tinta-suave'}`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-3 flex-shrink-0 ${isActive ? 'bg-marca-oscuro' : 'bg-papel-borde'}`} />
        <span className="flex-1">{label}</span>
        {/* El número va blanco sobre el fondo fuerte. En tinta tenue quedaba
            oscuro sobre oscuro: se veía la pastilla y no se leía el número. */}
        {badge != null && badge > 0 && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-atencion text-papel">{badge}</span>
        )}
    </button>
);

const NavHeader: React.FC<{ label: string }> = ({ label }) => (
    <h3 className="px-5 pt-6 pb-2 text-[10px] font-black text-tinta-tenue uppercase tracking-widest">{label}</h3>
);

export default App;
