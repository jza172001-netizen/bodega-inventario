/**
 * supabaseService.ts
 * Todas las operaciones CRUD contra Supabase.
 * Convierte snake_case (DB) ↔ camelCase (TypeScript).
 */

import { supabase } from '../lib/supabase';
import {
    Item, Movement, Personnel, Project, PurchaseOrder,
    PurchaseOrderItem, AppUser, AuditLog, BehaviorLog, InventoryType, MovementType,
    PurchaseOrderStatus, UserRole, ReturnCondition,
} from '../types';

// ─── HELPERS DE MAPEO ────────────────────────────────────────────────────────

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
        username: row.username as string,
        password: row.password as string,
        role: row.role as UserRole,
        name: row.name as string,
    };
}

// ─── ITEMS ───────────────────────────────────────────────────────────────────

export async function fetchItems(): Promise<Item[]> {
    const { data, error } = await supabase.from('items').select('*').order('created_at');
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

export async function deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from('items').delete().eq('id', id);
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

export async function deleteMovement(id: string): Promise<void> {
    const { error } = await supabase.from('movements').delete().eq('id', id);
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
export async function deleteMovementWithRevert(id: string, fallbackItemId?: string, fallbackQty?: number): Promise<void> {
    const { error } = await supabase.rpc('delete_movement_and_revert_stock', { p_movement_id: id });
    if (!error) return;
    if (!isMissingRpc(error)) throw error;
    await deleteMovement(id);
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
    const { data, error } = await supabase.from('personnel').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id as string,
        name: r.name as string,
        phone: r.phone as string | undefined,
        isTeamLeader: (r.is_team_leader as boolean) || undefined,
        teamLeaderId: r.team_leader_id as string | undefined,
    }));
}

export async function addPersonnel(p: Omit<Personnel, 'id'>, id?: string): Promise<Personnel> {
    const payload: Record<string, unknown> = {
        name: p.name, phone: p.phone ?? null,
        is_team_leader: p.isTeamLeader ?? false,
        team_leader_id: p.teamLeaderId ?? null,
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

export async function deletePersonnel(id: string): Promise<void> {
    const { error } = await supabase.from('personnel').delete().eq('id', id);
    if (error) throw error;
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
    const { data, error } = await supabase.from('projects').select('*').order('created_at');
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

export async function deleteProject(id: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
}

// ─── PURCHASE ORDERS ─────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
    const { data: orders, error: oErr } = await supabase
        .from('purchase_orders')
        .select('*')
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

export async function deletePurchaseOrder(id: string): Promise<void> {
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
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

export async function addUser(u: AppUser): Promise<AppUser> {
    const { data, error } = await supabase
        .from('app_users')
        .insert({ id: u.id, username: u.username, password: u.password, role: u.role, name: u.name })
        .select()
        .single();
    if (error) throw error;
    return dbToUser(data as Record<string, unknown>);
}

export async function updateUser(u: AppUser): Promise<void> {
    const { error } = await supabase
        .from('app_users')
        .update({ username: u.username, password: u.password, role: u.role, name: u.name })
        .eq('id', u.id);
    if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
    const { error } = await supabase.from('app_users').delete().eq('id', id);
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

export async function deleteAllMovements(): Promise<void> {
    const { error } = await supabase.from('movements').delete().not('id', 'is', null);
    if (error) throw error;
}

export async function deleteAllItems(): Promise<void> {
    const { error } = await supabase.from('items').delete().not('id', 'is', null);
    if (error) throw error;
}

export async function deleteAllPersonnel(): Promise<void> {
    const { error } = await supabase.from('personnel').delete().not('id', 'is', null);
    if (error) throw error;
}

export async function deleteAllProjects(): Promise<void> {
    const { error } = await supabase.from('projects').delete().not('id', 'is', null);
    if (error) throw error;
}

export async function deleteAllPurchaseOrders(): Promise<void> {
    const { error } = await supabase.from('purchase_orders').delete().not('id', 'is', null);
    if (error) throw error;
}

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
    }));
}

export async function addAuditLog(log: AuditLog): Promise<void> {
    const { error } = await supabase.from('audit_logs').insert({
        id: log.id,
        timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
        actor: log.actor,
        action: log.action,
        description: log.description,
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
