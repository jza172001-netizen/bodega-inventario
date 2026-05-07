/**
 * supabaseService.ts
 * Todas las operaciones CRUD contra Supabase.
 * Convierte snake_case (DB) ↔ camelCase (TypeScript).
 */

import { supabase } from '../lib/supabase';
import {
    Item, Movement, Personnel, Project, PurchaseOrder,
    PurchaseOrderItem, AppUser, InventoryType, MovementType,
    PurchaseOrderStatus, UserRole,
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

export async function addItem(item: Omit<Item, 'id'>): Promise<Item> {
    const { data, error } = await supabase
        .from('items')
        .insert(itemToDb(item))
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

export async function addMovement(m: Omit<Movement, 'id'>): Promise<Movement> {
    const { data, error } = await supabase
        .from('movements')
        .insert(movementToDb(m))
        .select()
        .single();
    if (error) throw error;
    return dbToMovement(data as Record<string, unknown>);
}

export async function deleteMovement(id: string): Promise<void> {
    const { error } = await supabase.from('movements').delete().eq('id', id);
    if (error) throw error;
}

export async function markMovementReturned(id: string): Promise<void> {
    const { error } = await supabase
        .from('movements')
        .update({ is_returned: true })
        .eq('id', id);
    if (error) throw error;
}

// ─── PERSONNEL ───────────────────────────────────────────────────────────────

export async function fetchPersonnel(): Promise<Personnel[]> {
    const { data, error } = await supabase.from('personnel').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(r => ({ id: r.id as string, name: r.name as string }));
}

export async function addPersonnel(p: Omit<Personnel, 'id'>): Promise<Personnel> {
    const { data, error } = await supabase
        .from('personnel')
        .insert({ name: p.name })
        .select()
        .single();
    if (error) throw error;
    return { id: (data as Record<string, unknown>).id as string, name: p.name };
}

export async function updatePersonnel(p: Personnel): Promise<void> {
    const { error } = await supabase
        .from('personnel')
        .update({ name: p.name })
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

export async function addProject(p: Omit<Project, 'id'>): Promise<Project> {
    const { data, error } = await supabase
        .from('projects')
        .insert({ name: p.name, description: p.description ?? null, status: p.status })
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

export async function addPurchaseOrder(o: Omit<PurchaseOrder, 'id'>): Promise<PurchaseOrder> {
    const { data: orderRow, error: oErr } = await supabase
        .from('purchase_orders')
        .insert({
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

export async function fetchUsers(): Promise<AppUser[]> {
    const { data, error } = await supabase.from('app_users').select('*');
    if (error) throw error;
    return (data ?? []).map(r => dbToUser(r as Record<string, unknown>));
}

export async function addUser(u: AppUser): Promise<AppUser> {
    const { data, error } = await supabase
        .from('app_users')
        .insert({ username: u.username, password: u.password, role: u.role, name: u.name })
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
