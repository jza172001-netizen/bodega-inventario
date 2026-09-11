/**
 * supabaseService.ts
 * Todas las operaciones CRUD contra Supabase.
 * Convierte snake_case (DB) ↔ camelCase (TypeScript).
 */

import { supabase } from '../lib/supabase';
import {
    Item, Movement, Personnel, Project, PurchaseOrder,
    PurchaseOrderItem, AppUser, AuditLog, BehaviorLog, InventoryType, MovementType,
    PurchaseOrderStatus, UserRole, ReturnCondition, OrderNote,
} from '../types';

// ─── HELPERS DE MAPEO ────────────────────────────────────────────────────────

/**
 * La marca de "cuándo se tocó esto por última vez". Es lo único que permite
 * decidir quién gana cuando el teléfono y la nube traen la misma fila distinta:
 * sin ella había que elegir a ciegas un bando, y la app elegía uno distinto
 * para ítems (ganaba la nube, borrando correcciones) que para movimientos
 * (ganaba el teléfono, perdiendo lo marcado en el otro).
 *
 * Se manda explícita en vez de dejársela al trigger de Postgres porque una
 * escritura hecha sin conexión se sincroniza después, y debe conservar la hora
 * en que el bodeguero la hizo — no la hora en que por fin subió.
 */
const sello = (d?: Date): string =>
    (d instanceof Date ? d : new Date()).toISOString();

function dbToItem(row: Record<string, unknown>): Item {
    return {
        id: row.id as string,
        name: row.name as string,
        category: row.category as string,
        subCategory: row.sub_category as string,
        inventoryType: row.inventory_type as InventoryType,
        quantity: Number(row.quantity),
        minStock: Number(row.min_stock),
        price: Number(row.price),
        unit: row.unit as string,
        color: row.color as string | undefined,
        brand: row.brand as string | undefined,
        requiresReturnNote: row.requires_return_note as boolean | undefined,
        accessories: Array.isArray(row.accessories) ? (row.accessories as import('../types').Accessory[]) : [],
        familia: (row.familia as string | null) ?? undefined,
        reparacion: row.reparacion ? deDbReparacion(row.reparacion as Record<string, unknown>) : undefined,
        updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
    };
}

/** El jsonb de reparación viene con las fechas en texto: hay que revivirlas o
 *  `daysSince` recibe una cadena y devuelve NaN. */
function deDbReparacion(raw: Record<string, unknown>): import('../types').EstadoReparacion {
    return {
        estado: raw.estado as 'dañada' | 'enviada' | 'arreglada',
        desde: new Date(raw.desde as string),
        enviadaEl: raw.enviadaEl ? new Date(raw.enviadaEl as string) : undefined,
        devueltaEl: raw.devueltaEl ? new Date(raw.devueltaEl as string) : undefined,
        nota: (raw.nota as string | null) ?? undefined,
        porQuien: (raw.porQuien as string | null) ?? undefined,
    };
}

function itemToDb(item: Omit<Item, 'id'>): Record<string, unknown> {
    return {
        name: item.name,
        category: item.category,
        sub_category: item.subCategory,
        inventory_type: item.inventoryType,
        quantity: item.quantity,
        min_stock: item.minStock,
        price: item.price,
        unit: item.unit,
        color: item.color ?? null,
        brand: item.brand ?? null,
        requires_return_note: item.requiresReturnNote ?? false,
        accessories: item.accessories ?? [],
        familia: item.familia ?? null,
        reparacion: item.reparacion ?? null,
        updated_at: sello(item.updatedAt),
    };
}

function dbToMovement(row: Record<string, unknown>): Movement {
    return {
        id: row.id as string,
        itemId: row.item_id as string,
        type: row.type as MovementType,
        quantity: Number(row.quantity),
        timestamp: new Date(row.timestamp as string),
        personnelId: row.personnel_id as string | undefined,
        notes: row.notes as string | undefined,
        projectId: row.project_id as string | undefined,
        isLoan: row.is_loan as boolean,
        isReturned: row.is_returned as boolean,
        pendingPickup: row.pending_pickup as boolean | undefined,
        returnCondition: row.return_condition as ReturnCondition | undefined,
        returnNotes: row.return_notes as string | undefined,
        returnedAt: row.returned_at ? new Date(row.returned_at as string) : undefined,
        updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
    };
}

function movementToDb(m: Omit<Movement, 'id'>): Record<string, unknown> {
    return {
        item_id: m.itemId,
        type: m.type,
        quantity: m.quantity,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
        personnel_id: m.personnelId ?? null,
        notes: m.notes ?? null,
        project_id: m.projectId ?? null,
        is_loan: m.isLoan ?? false,
        is_returned: m.isReturned ?? false,
        pending_pickup: m.pendingPickup ?? false,
        return_condition: m.returnCondition ?? null,
        return_notes: m.returnNotes ?? null,
        returned_at: m.returnedAt instanceof Date ? m.returnedAt.toISOString() : (m.returnedAt ?? null),
        updated_at: sello(m.updatedAt),
    };
}

function dbToPurchaseOrder(
    row: Record<string, unknown>,
    poiRows: Record<string, unknown>[]
): PurchaseOrder {
    return {
        id: row.id as string,
        supplier: row.supplier as string,
        status: row.status as PurchaseOrderStatus,
        orderDate: new Date(row.order_date as string),
        expectedDeliveryDate: row.expected_delivery_date
            ? new Date(row.expected_delivery_date as string)
            : undefined,
        receivedDate: row.received_date
            ? new Date(row.received_date as string)
            : undefined,
        notes: row.notes as string | undefined,
        items: poiRows.map(r => ({
            itemId: r.item_id as string,
            quantity: Number(r.quantity),
            price: Number(r.price),
        } as PurchaseOrderItem)),
    };
}

function dbToUser(row: Record<string, unknown>): AppUser {
    return {
        id: row.id as string,
        // La base guarda NULL cuando la persona todavía no ha elegido su
        // nombre de usuario. Adentro de la app se maneja como cadena vacía.
        username: (row.username as string | null) ?? '',
        password: (row.password as string | null) ?? '',
        role: row.role as UserRole,
        name: row.name as string,
        setupComplete: !!row.setup_complete,
        passwordHash: (row.password_hash as string | null) ?? undefined,
    };
}

/**
 * La fila tal como va a la base.
 *
 * El nombre de usuario vacío se manda como NULL, no como ''. La tabla tiene
 * UNIQUE (username): con cadena vacía, el segundo acceso sin configurar choca
 * contra el primero y la inserción falla. Con NULL no, porque Postgres deja
 * repetir nulos bajo una restricción única.
 *
 * Eso fue exactamente lo que hizo desaparecer los accesos de Santiago y de
 * Camilo: el primero entró y el segundo se perdió sin decir nada.
 */
function userToDb(u: AppUser): Record<string, unknown> {
    return {
        username: u.username?.trim() || null,
        password: u.password ?? '',
        role: u.role,
        name: u.name,
        setup_complete: u.setupComplete ?? false,
        password_hash: u.passwordHash ?? null,
    };
}

// ─── ITEMS ───────────────────────────────────────────────────────────────────

export async function fetchItems(): Promise<Item[]> {
    const { data, error } = await supabase.from('items').select('*').is('deleted_at', null).order('created_at');
    if (error) throw error;
    return (data ?? []).map(r => dbToItem(r as Record<string, unknown>));
}

export async function addItem(item: Omit<Item, 'id'>, id?: string): Promise<Item> {
    const payload = id ? { id, ...itemToDb(item) } : itemToDb(item);
    const { data, error } = await supabase
        .from('items')
        .insert(payload)
        .select()
        .single();
    if (error) throw error;
    return dbToItem(data as Record<string, unknown>);
}

export async function updateItem(item: Item): Promise<void> {
    const { error } = await supabase
        .from('items')
        .update(itemToDb(item))
        .eq('id', item.id);
    if (error) throw error;
}

/**
 * Borrar es poner una lápida, no quitar la fila.
 *
 * Quitándola, el celular que todavía la tiene en su memoria la vuelve a subir
 * en la siguiente sincronización y el borrado se deshace solo: la mezcla une
 * por id y gana el lado que TIENE la fila. Con la lápida, el otro lado se
 * entera de que eso se borró.
 */
export async function deleteItem(id: string, quien?: string): Promise<void> {
    const { error } = await supabase.from('items')
        .update({ deleted_at: new Date().toISOString(), deleted_by: quien ?? null }).eq('id', id);
    if (error) throw error;
}

export async function updateItemQuantity(id: string, quantity: number): Promise<void> {
    const { error } = await supabase
        .from('items')
        .update({ quantity })
        .eq('id', id);
    if (error) throw error;
}

// ─── MOVEMENTS ───────────────────────────────────────────────────────────────

export async function fetchMovements(): Promise<Movement[]> {
    const { data, error } = await supabase
        .from('movements')
        .select('*')
        .is('deleted_at', null)
        .order('timestamp', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => dbToMovement(r as Record<string, unknown>));
}

export async function addMovement(m: Omit<Movement, 'id'>, id?: string): Promise<Movement> {
    const payload = id ? { id, ...movementToDb(m) } : movementToDb(m);
    const { data, error } = await supabase
        .from('movements')
        .insert(payload)
        .select()
        .single();
    if (error) throw error;
    return dbToMovement(data as Record<string, unknown>);
}

/** Igual que con los ítems: lápida, no borrón. Ver `deleteItem`. */
export async function deleteMovement(id: string, quien?: string): Promise<void> {
    const { error } = await supabase.from('movements')
        .update({ deleted_at: new Date().toISOString(), deleted_by: quien ?? null }).eq('id', id);
    if (error) throw error;
}

// PGRST202 = la función RPC no existe aún en el proyecto (migración sin aplicar)
const isMissingRpc = (error: { code?: string }) =>
    error.code === 'PGRST202' || error.code === '42883';

/**
 * Movimiento + stock en una sola transacción (RPC log_movement_and_update_stock).
 * El UPDATE condicional del servidor evita race conditions y stock negativo.
 * Fallback no atómico si la migración aún no se aplicó.
 */
export async function logMovementWithStock(
    m: Omit<Movement, 'id'>,
    id: string,
    fallbackQty: number
): Promise<void> {
    const { error } = await supabase.rpc('log_movement_and_update_stock', {
        p_id: id,
        p_item_id: m.itemId,
        p_type: m.type,
        p_quantity: m.quantity,
        p_timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
        p_personnel_id: m.personnelId ?? null,
        p_notes: m.notes ?? null,
        p_project_id: m.projectId ?? null,
        p_is_loan: m.isLoan ?? false,
        p_is_returned: m.isReturned ?? false,
        p_pending_pickup: m.pendingPickup ?? false,
    });
    if (!error) return;
    if (!isMissingRpc(error)) throw error;
    await addMovement(m, id);
    await updateItemQuantity(m.itemId, fallbackQty);
}

/**
 * Borra un movimiento revirtiendo su efecto en el stock (RPC transaccional).
 * Fallback no atómico si la migración aún no se aplicó.
 */
/**
 * El borrado y el reverso de stock en una sola transacción.
 *
 * El RPC ahora pone LÁPIDA en vez de borrar la fila: una fila que desaparece se
 * resucita sola desde el otro celular, que todavía la tiene guardada. Así
 * volvieron los 15 movimientos de prueba de agosto después de borrarlos.
 *
 * El camino de respaldo (cuando la migración no está aplicada) hace lo mismo en
 * dos pasos, que no es atómico pero sí deja la lápida.
 */
export async function deleteMovementWithRevert(id: string, fallbackItemId?: string, fallbackQty?: number, quien?: string): Promise<void> {
    const { error } = await supabase.rpc('delete_movement_and_revert_stock', { p_movement_id: id });
    if (!error) {
        // El RPC pone la lápida pero no sabe de `deleted_by`: se anota aparte.
        // Si esta segunda escritura falla, el movimiento igual quedó borrado y
        // recuperable — solo se pierde el nombre de quién fue.
        if (quien) await supabase.from('movements').update({ deleted_by: quien }).eq('id', id);
        return;
    }
    if (!isMissingRpc(error)) throw error;
    await deleteMovement(id, quien);
    if (fallbackItemId !== undefined && fallbackQty !== undefined) {
        await updateItemQuantity(fallbackItemId, fallbackQty);
    }
}

export async function markMovementReturned(id: string, condition?: ReturnCondition, notes?: string): Promise<void> {
    const update: Record<string, unknown> = { is_returned: true };
    if (condition) update.return_condition = condition;
    if (notes) update.return_notes = notes;
    const { error } = await supabase.from('movements').update(update).eq('id', id);
    if (error) throw error;
}

/**
 * Devolución de préstamo: marca el movimiento como devuelto Y repone la unidad
 * al inventario, en una sola transacción. Es idempotente — devolver dos veces
 * no suma stock dos veces.
 * Ojo: NO usar en traspasos entre trabajadores; ahí la herramienta no vuelve
 * a la bodega y debe usarse markMovementReturned.
 */
export async function returnLoanAndRestoreStock(
    id: string,
    condition?: ReturnCondition,
    notes?: string,
    fallbackItemId?: string,
    fallbackQty?: number
): Promise<void> {
    const { error } = await supabase.rpc('return_loan_and_restore_stock', {
        p_movement_id: id,
        p_condition: condition ?? null,
        p_notes: notes ?? null,
    });
    if (!error) return;
    if (!isMissingRpc(error)) throw error;
    await markMovementReturned(id, condition, notes);
    if (fallbackItemId !== undefined && fallbackQty !== undefined) {
        await updateItemQuantity(fallbackItemId, fallbackQty);
    }
}

export async function markMovementPendingPickup(id: string, pending: boolean): Promise<void> {
    const { error } = await supabase
        .from('movements')
        .update({ pending_pickup: pending })
        .eq('id', id);
    if (error) throw error;
}

export async function updateMovementProject(id: string, projectId: string | null): Promise<void> {
    const { error } = await supabase
        .from('movements')
        .update({ project_id: projectId })
        .eq('id', id);
    if (error) throw error;
}

export async function updateMovementPersonnel(id: string, personnelId: string): Promise<void> {
    const { error } = await supabase
        .from('movements')
        .update({ personnel_id: personnelId })
        .eq('id', id);
    if (error) throw error;
}

// ─── PERSONNEL ───────────────────────────────────────────────────────────────

export async function fetchPersonnel(): Promise<Personnel[]> {
    const { data, error } = await supabase.from('personnel').select('*').is('deleted_at', null).order('name');
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id as string,
        name: r.name as string,
        phone: r.phone as string | undefined,
        isTeamLeader: (r.is_team_leader as boolean) || undefined,
        teamLeaderId: r.team_leader_id as string | undefined,
        updatedAt: r.updated_at ? new Date(r.updated_at as string) : undefined,
    }));
}

export async function addPersonnel(p: Omit<Personnel, 'id'>, id?: string): Promise<Personnel> {
    const payload: Record<string, unknown> = {
        name: p.name, phone: p.phone ?? null,
        is_team_leader: p.isTeamLeader ?? false,
        team_leader_id: p.teamLeaderId ?? null,
        updated_at: sello(p.updatedAt),
    };
    if (id) payload.id = id;
    const { data, error } = await supabase
        .from('personnel')
        .insert(payload)
        .select()
        .single();
    if (error) throw error;
    const row = data as Record<string, unknown>;
    return { id: row.id as string, name: p.name, phone: row.phone as string | undefined, isTeamLeader: (row.is_team_leader as boolean) || undefined, teamLeaderId: row.team_leader_id as string | undefined };
}

export async function updatePersonnel(p: Personnel): Promise<void> {
    const { error } = await supabase
        .from('personnel')
        .update({ name: p.name, phone: p.phone ?? null, is_team_leader: p.isTeamLeader ?? false, team_leader_id: p.teamLeaderId ?? null })
        .eq('id', p.id);
    if (error) throw error;
}

/**
 * Borrar es marcar la lápida, no quitar la fila.
 *
 * Quitarla no funciona con dos teléfonos: el arranque une las dos listas y gana
 * el que TIENE la fila, así que un teléfono con datos viejos vuelve a subir lo
 * borrado. Pasó de verdad — 4 trabajadores borrados el 8 de junio volvieron el
 * 9, y 19 ítems borrados el mismo día volvieron todos juntos el 18 de agosto.
 * Contra un teléfono que tiene la fila, la ausencia de fila no puede competir.
 */
export async function deletePersonnel(id: string, quien?: string): Promise<void> {
    const { error } = await supabase.from('personnel')
        .update({ deleted_at: new Date().toISOString(), deleted_by: quien ?? null }).eq('id', id);
    if (error) throw error;
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
    const { data, error } = await supabase.from('projects').select('*').is('deleted_at', null).order('created_at');
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id as string,
        name: r.name as string,
        description: r.description as string | undefined,
        status: r.status as 'active' | 'completed',
    }));
}

export async function addProject(p: Omit<Project, 'id'>, id?: string): Promise<Project> {
    const payload: Record<string, unknown> = {
        name: p.name, description: p.description ?? null, status: p.status,
    };
    if (id) payload.id = id;
    const { data, error } = await supabase
        .from('projects')
        .insert(payload)
        .select()
        .single();
    if (error) throw error;
    const row = data as Record<string, unknown>;
    return {
        id: row.id as string,
        name: row.name as string,
        description: row.description as string | undefined,
        status: row.status as 'active' | 'completed',
    };
}

export async function deleteProject(id: string, quien?: string): Promise<void> {
    const { error } = await supabase.from('projects')
        .update({ deleted_at: new Date().toISOString(), deleted_by: quien ?? null }).eq('id', id);
    if (error) throw error;
}

// ─── PURCHASE ORDERS ─────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
    const { data: orders, error: oErr } = await supabase
        .from('purchase_orders')
        .select('*')
        .is('deleted_at', null)
        .order('order_date', { ascending: false });
    if (oErr) throw oErr;

    const { data: poItems, error: piErr } = await supabase
        .from('purchase_order_items')
        .select('*');
    if (piErr) throw piErr;

    return (orders ?? []).map(row => {
        const items = (poItems ?? []).filter(
            (poi: Record<string, unknown>) => poi.purchase_order_id === row.id
        );
        return dbToPurchaseOrder(
            row as Record<string, unknown>,
            items as Record<string, unknown>[]
        );
    });
}

export async function addPurchaseOrder(o: Omit<PurchaseOrder, 'id'>, id?: string): Promise<PurchaseOrder> {
    const { data: orderRow, error: oErr } = await supabase
        .from('purchase_orders')
        .insert({
            ...(id ? { id } : {}),
            supplier: o.supplier,
            status: o.status,
            order_date: o.orderDate instanceof Date ? o.orderDate.toISOString() : o.orderDate,
            expected_delivery_date: o.expectedDeliveryDate
                ? (o.expectedDeliveryDate instanceof Date
                    ? o.expectedDeliveryDate.toISOString()
                    : o.expectedDeliveryDate)
                : null,
            notes: o.notes ?? null,
        })
        .select()
        .single();
    if (oErr) throw oErr;

    const orderId = (orderRow as Record<string, unknown>).id as string;

    if (o.items.length > 0) {
        const { error: piErr } = await supabase
            .from('purchase_order_items')
            .insert(
                o.items.map(i => ({
                    purchase_order_id: orderId,
                    item_id: i.itemId,
                    quantity: i.quantity,
                    price: i.price,
                }))
            );
        if (piErr) throw piErr;
    }

    return dbToPurchaseOrder(
        orderRow as Record<string, unknown>,
        o.items.map(i => ({
            purchase_order_id: orderId,
            item_id: i.itemId,
            quantity: i.quantity,
            price: i.price,
        }))
    );
}

export async function updatePurchaseOrderStatus(
    id: string,
    status: PurchaseOrderStatus
): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (status === PurchaseOrderStatus.RECEIVED) {
        update.received_date = new Date().toISOString();
    }
    const { error } = await supabase.from('purchase_orders').update(update).eq('id', id);
    if (error) throw error;
}

export async function deletePurchaseOrder(id: string, quien?: string): Promise<void> {
    const { error } = await supabase.from('purchase_orders')
        .update({ deleted_at: new Date().toISOString(), deleted_by: quien ?? null }).eq('id', id);
    if (error) throw error;
}

// ─── USERS ───────────────────────────────────────────────────────────────────
// fetchUsers usa RPC server-side que NO devuelve contraseñas al cliente

export async function fetchUsers(): Promise<AppUser[]> {
    const { data, error } = await supabase.rpc('get_users_safe');
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.user_id as string,
        username: r.user_username as string,
        password: '', // contraseña nunca viaja al cliente
        role: r.user_role as UserRole,
        name: r.user_name as string,
        // Viene de la columna, no de deducirlo del nombre de usuario.
        setupComplete: (r.user_setup_complete as boolean) ?? !!r.user_username,
    }));
}

// Autentica credenciales en el servidor — devuelve rol/nombre sin contraseña
export async function authenticateUser(
    username: string,
    password: string
): Promise<{ id: string; role: UserRole; name: string } | null> {
    const { data, error } = await supabase.rpc('authenticate_user', {
        p_username: username,
        p_password: password,
    });
    if (error || !data || data.length === 0) return null;
    const row = data[0] as Record<string, unknown>;
    return {
        id: row.user_id as string,
        role: row.user_role as UserRole,
        name: row.user_name as string,
    };
}

/**
 * Crear un acceso. Sin pedir la fila de vuelta, y ahí está todo el asunto.
 *
 * Esto NUNCA funcionó contra la base. Juli creó Santiago, Camilo, CAMILO y KATE
 * —cinco veces, algunas dos veces seguidas porque "no quedaban"— y en
 * `app_users` no llegó ni uno: los cinco quedaron solo en la memoria de su
 * teléfono. La bitácora los registraba, la nube no.
 *
 * La causa no era el INSERT: era el `.select()` que venía detrás. `app_users`
 * tiene seguridad de fila con permiso de insertar, editar y borrar, pero
 * NINGUNO de leer —por eso los usuarios se leen con `get_users_safe`, que se
 * salta esa restricción—. Al pedir la fila recién creada de vuelta, PostgREST
 * choca contra esa falta de permiso y **revierte el insert entero**.
 *
 * Comprobado contra producción con la llave real de la app:
 *   con `Prefer: return=representation` → 401, no queda nada
 *   sin él                              → 201, la fila queda
 *
 * Así que no se pide de vuelta. El objeto que se devuelve es el mismo que
 * entró, que es exactamente lo que la fila contiene: acá no hay valores que
 * ponga la base por su cuenta.
 */
export async function addUser(u: AppUser): Promise<AppUser> {
    const { error } = await supabase
        .from('app_users')
        .insert({ id: u.id, ...userToDb(u) });
    if (error) throw error;
    return u;
}

/**
 * Cambiarle el nombre o el rol a alguien NO le toca la contraseña.
 *
 * Antes sí se la tocaba, y la borraba. `fetchUsers()` devuelve `password: ''`
 * a propósito —la contraseña nunca viaja al cliente— y la pantalla de accesos
 * edita ESE objeto. Al guardar, `userToDb()` metía `password: ''` en el UPDATE
 * y la contraseña guardada se reemplazaba por una cadena vacía.
 *
 * El daño no se veía de inmediato: en el teléfono donde se hizo el cambio
 * seguía funcionando el respaldo por hash local, mientras la persona dejaba de
 * poder entrar desde cualquier otro. Un error que se esconde a quien lo comete
 * es peor que uno que truena.
 *
 * Por eso van dos funciones y no una con banderas: la lista de campos es
 * explícita, y no hay forma de que un objeto de más arrastre una credencial.
 */
export async function updateUserProfile(u: AppUser): Promise<void> {
    const { error } = await supabase
        .from('app_users')
        .update({
            username: u.username?.trim() || null,   // vacío va como NULL: la tabla tiene UNIQUE (username)
            role: u.role,
            name: u.name,
        })
        .eq('id', u.id);
    if (error) throw error;
}

/** El ÚNICO camino que escribe credenciales. */
export async function setUserCredentials(u: AppUser): Promise<void> {
    const { error } = await supabase
        .from('app_users')
        .update({
            username: u.username?.trim() || null,
            password: u.password ?? '',
            password_hash: u.passwordHash ?? null,
            setup_complete: u.setupComplete ?? false,
        })
        .eq('id', u.id);
    if (error) throw error;
}

/**
 * Un acceso borrado también es lápida, no borrado.
 *
 * Era la única tabla junto con `order_list` donde se quitaba la fila de verdad:
 * si alguien borraba un acceso por equivocación, no había cómo devolverlo. Y
 * `fetchUsers` ya filtra por lápida, así que desaparece igual de la pantalla.
 */
export async function deleteUser(id: string, quien?: string): Promise<void> {
    const { error } = await supabase.from('app_users')
        .update({ deleted_at: new Date().toISOString(), deleted_by: quien ?? null }).eq('id', id);
    if (error) throw error;
}

// ─── BULK UPSERT (migración localStorage → Supabase) ─────────────────────────

export async function bulkUpsertItems(items: Item[]): Promise<void> {
    if (items.length === 0) return;
    const payload = items.map(({ id, ...rest }) => ({ id, ...itemToDb(rest) }));
    const { error } = await supabase.from('items').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
}

export async function bulkUpsertMovements(movements: Movement[]): Promise<void> {
    if (movements.length === 0) return;
    const payload = movements.map(({ id, ...rest }) => ({ id, ...movementToDb(rest) }));
    const { error } = await supabase.from('movements').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
}

export async function bulkUpsertPersonnel(personnel: Personnel[]): Promise<void> {
    if (personnel.length === 0) return;
    const payload = personnel.map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone ?? null,
        is_team_leader: p.isTeamLeader ?? false,
        team_leader_id: p.teamLeaderId ?? null,
        updated_at: sello(p.updatedAt),
    }));
    const { error } = await supabase.from('personnel').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
}

export async function bulkUpsertPurchaseOrders(orders: PurchaseOrder[]): Promise<void> {
    if (orders.length === 0) return;
    const orderPayload = orders.map(o => ({
        id: o.id,
        supplier: o.supplier,
        status: o.status,
        order_date: o.orderDate instanceof Date ? o.orderDate.toISOString() : o.orderDate,
        expected_delivery_date: o.expectedDeliveryDate
            ? (o.expectedDeliveryDate instanceof Date ? o.expectedDeliveryDate.toISOString() : o.expectedDeliveryDate)
            : null,
        received_date: o.receivedDate
            ? (o.receivedDate instanceof Date ? o.receivedDate.toISOString() : o.receivedDate)
            : null,
        notes: o.notes ?? null,
    }));
    const { error: oErr } = await supabase.from('purchase_orders').upsert(orderPayload, { onConflict: 'id' });
    if (oErr) throw oErr;
    const itemPayload = orders.flatMap(o =>
        o.items.map(i => ({
            purchase_order_id: o.id,
            item_id: i.itemId,
            quantity: i.quantity,
            price: i.price,
        }))
    );
    if (itemPayload.length > 0) {
        await supabase.from('purchase_order_items').upsert(itemPayload, { onConflict: 'purchase_order_id,item_id' });
    }
}

export async function bulkUpsertProjects(projects: Project[]): Promise<void> {
    if (projects.length === 0) return;
    const payload = projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        status: p.status,
    }));
    const { error } = await supabase.from('projects').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
}

// ─── BULK DELETE (factory reset) ─────────────────────────────────────────────

/**
 * Acá vivían `deleteAllMovements`, `deleteAllItems`, `deleteAllPersonnel`,
 * `deleteAllProjects` y `deleteAllPurchaseOrders`.
 *
 * Eran las únicas funciones del archivo que hacían un DELETE de verdad sobre
 * las tablas de la bodega: no ponían lápida, quitaban la fila. Las llamaban los
 * dos botones de la «Zona de peligro», que ya no existen.
 *
 * No se reponen. Todo borrado en esta app pone `deleted_at`, y para eso está la
 * papelera: lo borrado se ve y se devuelve.
 */

// ─── AUDIT LOGS ──────────────────────────────────────────────────────────────

export async function fetchAuditLogs(): Promise<AuditLog[]> {
    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1000);
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id as string,
        timestamp: new Date(r.timestamp as string),
        actor: r.actor as string,
        action: r.action as string,
        description: r.description as string,
        origen: (r.origen as string | null) ?? undefined,
        operacionId: (r.operacion_id as string | null) ?? undefined,
    }));
}

export async function addAuditLog(log: AuditLog): Promise<void> {
    const { error } = await supabase.from('audit_logs').insert({
        id: log.id,
        timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
        actor: log.actor,
        action: log.action,
        description: log.description,
        origen: log.origen ?? null,
        operacion_id: log.operacionId ?? null,
    });
    if (error) throw error;
}

export async function bulkUpsertAuditLogs(logs: AuditLog[]): Promise<void> {
    if (logs.length === 0) return;
    const payload = logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
        actor: log.actor,
        action: log.action,
        description: log.description,
        origen: log.origen ?? null,
        operacion_id: log.operacionId ?? null,
    }));
    const { error } = await supabase.from('audit_logs').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
}


// ─── BEHAVIOR LOGS ───────────────────────────────────────────────────────────
// Registro de navegación/uso que alimenta la vista de Trazabilidad.
// Antes vivía solo en localStorage y se perdía al limpiarse el navegador.

export async function fetchBehaviorLogs(): Promise<BehaviorLog[]> {
    const { data, error } = await supabase
        .from('behavior_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1000);
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id as string,
        timestamp: new Date(r.timestamp as string),
        actor: r.actor as string,
        action: r.action as string,
        detail: r.detail as string,
    }));
}

export async function addBehaviorLog(log: BehaviorLog): Promise<void> {
    const { error } = await supabase.from('behavior_logs').insert({
        id: log.id,
        timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
        actor: log.actor,
        action: log.action,
        detail: log.detail,
    });
    if (error) throw error;
}

export async function bulkUpsertBehaviorLogs(logs: BehaviorLog[]): Promise<void> {
    if (logs.length === 0) return;
    const payload = logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
        actor: log.actor,
        action: log.action,
        detail: log.detail,
    }));
    const { error } = await supabase.from('behavior_logs').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
}


// ─── LISTA DE PEDIDOS ────────────────────────────────────────────────────────

function dbToOrderNote(row: Record<string, unknown>): OrderNote {
    return {
        id: row.id as string,
        texto: row.texto as string,
        cantidad: row.cantidad != null ? Number(row.cantidad) : undefined,
        unidad: (row.unidad as string | null) ?? undefined,
        familia: (row.familia as string | null) ?? undefined,
        color: (row.color as string | null) ?? undefined,
        comprado: !!row.comprado,
        recibido: !!row.recibido,
        recibidoQty: row.recibido_qty != null ? Number(row.recibido_qty) : undefined,
        itemId: (row.item_id as string | null) ?? undefined,
        recibidoAt: row.recibido_at ? new Date(row.recibido_at as string) : undefined,
        createdAt: new Date(row.created_at as string),
        updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
    };
}

export async function fetchOrderList(): Promise<OrderNote[]> {
    const { data, error } = await supabase.from('order_list').select('*')
        .is('deleted_at', null).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(dbToOrderNote);
}

export async function addOrderNote(n: Omit<OrderNote, 'id'>, id: string): Promise<void> {
    const { error } = await supabase.from('order_list').insert({
        id, texto: n.texto, cantidad: n.cantidad ?? null, unidad: n.unidad ?? null,
        familia: n.familia ?? null, color: n.color ?? null, comprado: n.comprado,
        recibido: n.recibido ?? false, recibido_qty: n.recibidoQty ?? null,
        item_id: n.itemId ?? null, recibido_at: sello(n.recibidoAt),
        created_at: sello(n.createdAt), updated_at: sello(n.updatedAt),
    });
    if (error) throw error;
}

export async function updateOrderNote(n: OrderNote): Promise<void> {
    const { error } = await supabase.from('order_list').update({
        texto: n.texto, cantidad: n.cantidad ?? null, unidad: n.unidad ?? null,
        familia: n.familia ?? null, color: n.color ?? null, comprado: n.comprado,
        recibido: n.recibido ?? false, recibido_qty: n.recibidoQty ?? null,
        item_id: n.itemId ?? null, recibido_at: sello(n.recibidoAt), updated_at: sello(new Date()),
    }).eq('id', n.id);
    if (error) throw error;
}

export async function deleteOrderNote(id: string, quien?: string): Promise<void> {
    const { error } = await supabase.from('order_list')
        .update({ deleted_at: new Date().toISOString(), deleted_by: quien ?? null }).eq('id', id);
    if (error) throw error;
}



// ─── PAPELERA ────────────────────────────────────────────────────────────────

/**
 * Lo que está borrado, de todas las tablas, en una sola lista.
 *
 * Borrar en esta app siempre fue poner una lápida (`deleted_at`) y no quitar la
 * fila — el dato nunca se iba—, pero no había ninguna pantalla que lo mostrara:
 * para devolver algo tocaba entrar a la base a mano. Esto es lo que le faltaba
 * a esa mitad.
 */
export type TablaPapelera =
    | 'items' | 'movements' | 'personnel' | 'projects'
    | 'purchase_orders' | 'app_users' | 'order_list';

export interface EnLaPapelera {
    tabla: TablaPapelera;
    id: string;
    /** Qué era, en una línea. */
    titulo: string;
    /** Lo que traía puesto: cantidad, unidad, con quién estaba. */
    detalle?: string;
    borradoEl: Date;
    /** Nulo en lo borrado antes de que se guardara el dato. */
    borradoPor?: string;
    /** Solo para movimientos: cuánto y de qué ítem, para poder devolver el stock. */
    movItemId?: string;
    movCantidad?: number;
    movEsSalida?: boolean;
    /** Préstamo ya devuelto: salió y volvió, su efecto neto sobre el stock es cero. */
    movNetoCero?: boolean;
}

const fechaDe = (r: Record<string, unknown>): Date =>
    new Date((r.deleted_at as string) ?? Date.now());
const quienDe = (r: Record<string, unknown>): string | undefined =>
    (r.deleted_by as string | null) ?? undefined;

export async function fetchPapelera(): Promise<EnLaPapelera[]> {
    const traer = (tabla: TablaPapelera) =>
        supabase.from(tabla).select('*').not('deleted_at', 'is', null)
            .order('deleted_at', { ascending: false }).limit(200);

    /**
     * Los accesos van por RPC y no por SELECT.
     *
     * `app_users` tiene seguridad de fila con permisos de insertar, editar y
     * borrar, pero ninguno de LEER —por eso los vivos se leen con
     * `get_users_safe`—. Un SELECT directo acá devuelve vacío siempre, así que
     * un acceso borrado desaparecía de la pantalla de entrada y tampoco salía
     * en la papelera: se perdía sin forma de devolverlo. Comprobado contra
     * producción con la llave real de la app.
     */
    const [it, mov, per, proj, po, us, ord] = await Promise.all([
        traer('items'), traer('movements'), traer('personnel'), traer('projects'),
        traer('purchase_orders'), supabase.rpc('get_deleted_users_safe'), traer('order_list'),
    ]);

    const salida: EnLaPapelera[] = [];
    const fila = (r: Record<string, unknown>, tabla: TablaPapelera, titulo: string, detalle?: string) =>
        ({ tabla, id: r.id as string, titulo, detalle, borradoEl: fechaDe(r), borradoPor: quienDe(r) });

    for (const r of (it.data ?? []) as Record<string, unknown>[])
        salida.push(fila(r, 'items', r.name as string,
            `${Number(r.quantity)} ${r.unit ?? ''} · ${r.inventory_type ?? ''}`.trim()));

    for (const r of (mov.data ?? []) as Record<string, unknown>[])
        salida.push({
            ...fila(r, 'movements',
                `${r.type} de ${Number(r.quantity)}`,
                (r.notes as string | null) ?? undefined),
            movItemId: r.item_id as string,
            movCantidad: Number(r.quantity),
            movEsSalida: (r.type as string) === MovementType.CHECK_OUT || (r.type as string) === MovementType.WASTE,
            movNetoCero: !!r.is_loan && !!r.is_returned,
        });

    for (const r of (per.data ?? []) as Record<string, unknown>[])
        salida.push(fila(r, 'personnel', r.name as string, (r.phone as string | null) ?? undefined));

    for (const r of (proj.data ?? []) as Record<string, unknown>[])
        salida.push(fila(r, 'projects', r.name as string, (r.description as string | null) ?? undefined));

    for (const r of (po.data ?? []) as Record<string, unknown>[])
        salida.push(fila(r, 'purchase_orders', `Orden a ${r.supplier}`, r.status as string));

    // El RPC devuelve las columnas con otro nombre (`user_*`): se adaptan acá.
    for (const r of (us.data ?? []) as Record<string, unknown>[])
        salida.push({
            tabla: 'app_users',
            id: r.user_id as string,
            titulo: r.user_name as string,
            detalle: `acceso · ${r.user_role}`,
            borradoEl: new Date((r.user_deleted_at as string) ?? Date.now()),
            borradoPor: (r.user_deleted_by as string | null) ?? undefined,
        });

    for (const r of (ord.data ?? []) as Record<string, unknown>[])
        salida.push(fila(r, 'order_list', r.texto as string,
            r.cantidad != null ? `${Number(r.cantidad)} ${r.unidad ?? ''}`.trim() : undefined));

    return salida.sort((a, b) => b.borradoEl.getTime() - a.borradoEl.getTime());
}

/**
 * Devuelve una fila de la papelera.
 *
 * Además de quitar la lápida sella `updated_at`. El sello es lo que hace que la
 * restauración le gane al dato viejo que el otro teléfono todavía tiene en
 * memoria: sin él, la siguiente sincronización vuelve a borrarla. Es la misma
 * regla de `updateItem`.
 *
 * `order_list` y `app_users` no tienen `updated_at` con ese papel, así que solo
 * se les levanta la lápida.
 */
export async function restaurar(tabla: TablaPapelera, id: string): Promise<void> {
    // Los accesos, por el mismo camino que se leen: por RPC.
    if (tabla === 'app_users') {
        const { error } = await supabase.rpc('restore_user', { p_id: id });
        if (error) throw error;
        return;
    }
    const conSello: TablaPapelera[] = ['items', 'movements', 'personnel', 'projects', 'purchase_orders'];
    const cambios: Record<string, unknown> = { deleted_at: null, deleted_by: null };
    if (conSello.includes(tabla)) cambios.updated_at = sello();
    const { error } = await supabase.from(tabla).update(cambios).eq('id', id);
    if (error) throw error;
}

/**
 * Los ids que están marcados como borrados.
 *
 * Hace falta explícitamente: si la fila simplemente no viene, el arranque no
 * puede distinguir "esto lo borraron" de "esto todavía no se ha subido", y ante
 * la duda conserva lo local — que es exactamente cómo volvieron los borrados.
 */
export async function fetchBorrados(): Promise<{ personnel: string[]; projects: string[]; purchaseOrders: string[]; movements: string[]; items: string[] }> {
    const [per, proj, po, mov, it] = await Promise.all([
        supabase.from('personnel').select('id').not('deleted_at', 'is', null),
        supabase.from('projects').select('id').not('deleted_at', 'is', null),
        supabase.from('purchase_orders').select('id').not('deleted_at', 'is', null),
        supabase.from('movements').select('id').not('deleted_at', 'is', null),
        supabase.from('items').select('id').not('deleted_at', 'is', null),
    ]);
    return {
        personnel:      (per.data  ?? []).map(r => r.id as string),
        projects:       (proj.data ?? []).map(r => r.id as string),
        purchaseOrders: (po.data   ?? []).map(r => r.id as string),
        movements:      (mov.data  ?? []).map(r => r.id as string),
        items:          (it.data   ?? []).map(r => r.id as string),
    };
}
