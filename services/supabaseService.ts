/**
 * supabaseService.ts
 * Todas las operaciones CRUD contra Supabase.
 * Convierte snake_case (DB) ↔ camelCase (TypeScript).
 */

import { supabase, crearClienteAparte } from '../lib/supabase';
import { correoInterno } from '../core/identidad';
import {
    Item, Movement, Personnel, Project, PurchaseOrder,
    PurchaseOrderItem, AppUser, AuditLog, BehaviorLog, InventoryType, MovementType,
    PurchaseOrderStatus, UserRole, ReturnCondition, OrderNote, Asignacion,
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

/**
 * Una fecha que puede no saberse. NO es `sello`: `sello` rellena con la hora de
 * ahora, que es lo correcto para «cuándo se tocó esto» y un invento para «desde
 * cuándo la tiene» o «cuándo se cerró». Lo que no se sabe queda vacío.
 */
const fechaOVacio = (d?: Date | string): string | null =>
    d instanceof Date ? d.toISOString() : (d ?? null);

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
        ruta: (row.ruta as string | null) ?? undefined,
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
        ruta: item.ruta ?? null,
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
        devuelveA: row.devuelve_a as string | undefined,
        vieneDe: (row.viene_de as string | null) ?? undefined,
        esTraslado: (row.es_traslado as boolean | null) ?? undefined,
        entregadoPor: (row.entregado_por as string | null) ?? undefined,
        responsableAnterior: (row.responsable_anterior as string | null) ?? undefined,
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
        devuelve_a: m.devuelveA ?? null,
        viene_de: m.vieneDe ?? null,
        es_traslado: m.esTraslado ?? false,
        entregado_por: m.entregadoPor ?? null,
        responsable_anterior: m.responsableAnterior ?? null,
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
        debeCambiarClave: !!row.debe_cambiar_clave,
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
    /**
     * Una devolución NO puede ir por esta función.
     *
     * `log_movement_and_update_stock` recibe los campos uno por uno y no tiene
     * dónde recibir `devuelve_a`. Agregárselos cambiaría su firma, y en
     * PostgreSQL eso no reemplaza la función: crea una segunda con el mismo
     * nombre, y las llamadas viejas siguen yendo a la de antes. Así que la
     * devolución se escribe por la vía normal —fila y cantidad— que sí lleva
     * todas las columnas. Es el camino de respaldo, no el de todos los días:
     * solo se llega acá si la función del lote no está instalada.
     */
    if (m.devuelveA || m.vieneDe) {
        await addMovement(m, id);
        await updateItemQuantity(m.itemId, fallbackQty);
        return;
    }
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
 * EL DESPACHO ENTERO EN UNA TRANSACCIÓN.
 *
 * `logMovementWithStock` manda un viaje por movimiento, y la red no respeta el
 * orden en que uno los suelta. El núcleo pone la entrada automática ANTES que
 * la salida —para que el stock exista antes de salir— pero el servidor podía
 * recibir la salida primero, rechazarla por falta de stock, y guardar la
 * entrada después. La app ya había cantado éxito y mostraba saldo cero; el
 * servidor quedaba con una entrada, ninguna salida y saldo uno.
 *
 * No se arregla acá arriba: mientras sean dos viajes pueden llegar en cualquier
 * orden, o puede llegar uno solo. Tiene que ser un viaje. El lote entero va
 * como JSON y el servidor lo aplica en orden dentro de una transacción: o entra
 * completo, o no entra nada.
 *
 * El camino de respaldo —cuando la migración todavía no está aplicada en algún
 * ambiente— es el de antes, de a un movimiento. No es atómico, y por eso se
 * usa solo cuando la función no existe.
 */
export async function logMovementsWithStock(
    movimientos: Array<{ m: Omit<Movement, 'id'>; id: string; fallbackQty: number }>,
): Promise<void> {
    if (movimientos.length === 0) return;
    const { error } = await supabase.rpc('log_movements_and_update_stock', {
        p_movements: movimientos.map(({ m, id }) => ({
            id,
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
            // Los campos de la devolución. Sin ellos, una devolución parcial
            // entraba al servidor como una entrada suelta: el préstamo seguía
            // figurando completo afuera y el siguiente intento reponía el stock
            // por segunda vez.
            devuelve_a: m.devuelveA ?? null,
            return_condition: m.returnCondition ?? null,
            return_notes: m.returnNotes ?? null,
            returned_at: m.returnedAt instanceof Date ? m.returnedAt.toISOString() : (m.returnedAt ?? null),
            // La cadena de custodia: de qué préstamo viene, quién entregó, quién
            // la tenía. Sin esto un traslado llegaba al servidor como un
            // préstamo cualquiera y se perdía de dónde venía.
            viene_de: m.vieneDe ?? null,
            es_traslado: m.esTraslado ?? false,
            entregado_por: m.entregadoPor ?? null,
            responsable_anterior: m.responsableAnterior ?? null,
        })),
    });
    if (!error) return;
    if (!isMissingRpc(error)) throw error;
    for (const { m, id, fallbackQty } of movimientos) {
        await logMovementWithStock(m, id, fallbackQty);
    }
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

/**
 * Cierra un préstamo: lo marca devuelto y NO toca el stock.
 *
 * Con la devolución convertida en movimiento propio, la reposición ya la hizo
 * esa entrada. Usar `returnLoanAndRestoreStock` para cerrar el préstamo subiría
 * el stock una segunda vez por la misma herramienta.
 *
 * `cerradoEn` llega desde la devolución que lo saldó, para que la fecha del
 * préstamo cerrado sea la de la devolución de verdad y no la del momento en que
 * la cola alcanzó a mandarlo —que puede ser al otro día, cuando vuelva la señal.
 * Los traspasos entre trabajadores no la mandan: ahí la herramienta no volvió a
 * la bodega y no hay fecha de regreso que contar.
 */
export async function markMovementReturned(
    id: string,
    condition?: ReturnCondition,
    notes?: string,
    cerradoEn?: string | Date,
): Promise<void> {
    const update: Record<string, unknown> = { is_returned: true, pending_pickup: false };
    if (condition) update.return_condition = condition;
    if (notes) update.return_notes = notes;
    if (cerradoEn) update.returned_at = cerradoEn instanceof Date ? cerradoEn.toISOString() : cerradoEn;
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
/**
 * Las TRES respuestas posibles a un intento de entrar.
 *
 * Antes eran dos —o entraba, o `null`— y ahí estaba el hueco: «el servidor dice
 * que esa contraseña no es» y «no pude preguntarle al servidor» se devolvían
 * igual. Quien llamaba leía `null` como «probá con el respaldo del teléfono», y
 * **con el respaldo del teléfono entraba**.
 *
 * O sea: cambiarle la contraseña a alguien, o quitarle el acceso, no se lo
 * quitaba. Seguía entrando con la vieja desde su celular, y el servidor no tenía
 * cómo enterarse.
 *
 * `rechazado` es una respuesta, no una falla: el servidor comparó y dijo que no.
 * Ahí no se cae al respaldo. `sinRespuesta` sí lo permite, porque no saber no
 * puede dejar a la encargada afuera de la bodega a las siete de la mañana.
 */
export type ResultadoLogin =
    | { estado: 'ok'; usuario: { id: string; role: UserRole; name: string; debeCambiarClave?: boolean } }
    | { estado: 'rechazado' }
    | { estado: 'sinRespuesta' };

/**
 * Entrar CON IDENTIDAD DE SERVIDOR.
 *
 * Hoy la app entra a Supabase como `anon`: una sola llave pública, la misma para
 * todo el mundo, metida dentro del JavaScript publicado. El servidor no tiene
 * cómo saber quién está escribiendo, así que no puede negarle nada a nadie —
 * cualquiera con esa llave mueve el inventario entero.
 *
 * Esto abre el otro camino: cada acceso es un usuario de verdad del servidor, y
 * el servidor sabe quién es. La pantalla de entrada NO CAMBIA: la persona sigue
 * escribiendo su nombre y su contraseña de siempre, y la app traduce el nombre a
 * su correo interno por debajo (`core/identidad.ts`).
 *
 * Devuelve `sinRespuesta` cuando no se pudo preguntar, para que quien llama
 * decida si cae al camino de antes. Durante la transición los dos sirven: primero
 * se comprueba que los cinco accesos entran por acá, y **solo entonces** se le
 * quita el permiso a la llave pública.
 */
/**
 * Cambia la contraseña de quien acaba de entrar, en los DOS lados.
 *
 * Hay dos sitios donde vive la credencial mientras dura la transición: el
 * servidor de identidad (Auth) y la tabla `app_users`, que es lo que compara el
 * camino viejo. Cambiar solo uno deja a la persona entrando con la vieja por la
 * otra puerta, que es exactamente lo que este cambio viene a cerrar.
 *
 * El orden importa: primero Auth. Si eso falla no se toca nada más y la persona
 * conserva la contraseña que ya tenía — quedarse sin poder entrar es peor que
 * quedarse con una contraseña corta un día más.
 */
export async function cambiarClave(_userId: string, nueva: string): Promise<void> {
    const { error: errorAuth } = await supabase.auth.updateUser({ password: nueva });
    if (errorAuth) throw errorAuth;
    // La clave nueva vive SOLO en la identidad. Antes se escribía también en
    // texto plano en `app_users.password`; ahora esta función baja la bandera
    // y borra la vieja de la tabla.
    const { error } = await supabase.rpc('ya_cambie_mi_clave');
    if (error) throw error;
}

/** El mensaje del servidor, para mostrárselo a la persona tal cual. */
const mensajeDe = (error: { message?: string } | null, porDefecto: string): string =>
    (error?.message ?? '').replace(/^.*?ERROR:\s*/, '').trim() || porDefecto;

/**
 * El primer ingreso, hecho por el SERVIDOR.
 *
 * Antes el código se comparaba en el teléfono contra una columna que la nube
 * nunca manda, y la clave se guardaba solo en la tabla vieja, sin identidad de
 * servidor: el acceso nuevo no podía entrar NUNCA. `dar_de_alta` compara el
 * código, crea la identidad y no guarda la clave en ninguna tabla.
 */
export async function darDeAlta(id: string, codigo: string, clave: string): Promise<{ username: string }> {
    const { data, error } = await supabase.rpc('dar_de_alta', { p_id: id, p_codigo: codigo, p_clave: clave });
    if (error) throw new Error(mensajeDe(error, 'No se pudo completar el alta.'));
    const fila = (data ?? [])[0] as { user_username?: string } | undefined;
    // Vacío = código incorrecto. El servidor no lanza error ahí a propósito:
    // un error revertiría el intento que cuenta para el tope de diez.
    if (!fila?.user_username) throw new Error('Código de alta incorrecto.');
    return { username: fila.user_username };
}

/** Crear un acceso. Solo un administrador con sesión; devuelve el código UNA vez. */
export async function crearAcceso(nombre: string, rol: string): Promise<{ id: string; codigo: string }> {
    const { data, error } = await supabase.rpc('crear_acceso', { p_nombre: nombre, p_rol: rol });
    if (error) throw new Error(mensajeDe(error, 'No se pudo crear el acceso.'));
    const fila = (data ?? [])[0] as { acceso_id: string; codigo: string } | undefined;
    if (!fila) throw new Error('El servidor no devolvió el código.');
    return { id: fila.acceso_id, codigo: fila.codigo };
}

/** Código de alta nuevo para un acceso que todavía no ha entrado. */
export async function nuevoCodigoDeAlta(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('nuevo_codigo_de_alta', { p_id: id });
    if (error) throw new Error(mensajeDe(error, 'No se pudo generar el código.'));
    return data as string;
}

export async function editarAcceso(id: string, nombre: string, rol: string): Promise<void> {
    const { error } = await supabase.rpc('editar_acceso', { p_id: id, p_nombre: nombre, p_rol: rol });
    if (error) throw new Error(mensajeDe(error, 'No se pudo guardar el acceso.'));
}

export async function borrarAcceso(id: string, quien?: string): Promise<void> {
    const { error } = await supabase.rpc('borrar_acceso', { p_id: id, p_quien: quien ?? null });
    if (error) throw new Error(mensajeDe(error, 'No se pudo borrar el acceso.'));
}

/**
 * Cierra la identidad del servidor en ESTE teléfono (`scope: 'local'`: los
 * otros teléfonos de la misma persona siguen adentro). Sin señal también la
 * borra del teléfono: el SDK la quita aunque el servidor no conteste.
 */
export async function cerrarIdentidad(): Promise<void> {
    paraReconectar = null;
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ya no hay sesión que cerrar */ }
}

export async function entrarConIdentidad(
    username: string,
    password: string
): Promise<ResultadoLogin> {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: correoInterno(username),
        password,
    });
    if (error) {
        /**
         * Credenciales malas es una RESPUESTA; no llegar es otra cosa.
         *
         * Supabase contesta 400 con «Invalid login credentials» cuando comparó y
         * dijo que no. Cualquier otra cosa —red caída, servidor dormido— es no
         * saber, y ahí hay que dejar que el camino viejo lo intente en vez de
         * dejar a la encargada afuera de la bodega.
         */
        const rechazo = error.status === 400
            || /invalid login credentials|email not confirmed/i.test(error.message ?? '');
        return rechazo ? { estado: 'rechazado' } : { estado: 'sinRespuesta' };
    }
    const uid = data.user?.id;
    if (!uid) return { estado: 'sinRespuesta' };

    // Quién es esta persona EN LA BODEGA —su nombre y su rol— lo sigue diciendo
    // `app_users`. Auth solo responde «sí, es quien dice ser».
    const { data: fila, error: errorFila } = await supabase
        .from('app_users')
        .select('id, name, role, debe_cambiar_clave')
        .eq('auth_uid', uid)
        .is('deleted_at', null)
        .maybeSingle();
    if (errorFila || !fila) return { estado: 'sinRespuesta' };

    const f = fila as { id: string; name: string; role: UserRole; debe_cambiar_clave: boolean };
    paraReconectar = null;
    return {
        estado: 'ok',
        usuario: { id: f.id, role: f.role, name: f.name, debeCambiarClave: !!f.debe_cambiar_clave },
    };
}

/**
 * ¿Esta clave es de esta persona? Sin tocar la sesión abierta.
 *
 * Para el PIN y la confirmación de dos personas: el que autoriza no es el que
 * tiene la sesión. Se pregunta con un cliente aparte que no guarda nada, y se
 * cierra enseguida. Antes esto iba por `authenticate_user`, que comparaba
 * contra la clave en texto plano de la tabla; esa entrada ya no existe.
 */
export async function verificarClave(username: string, password: string): Promise<ResultadoLogin> {
    if (!username || !password) return { estado: 'rechazado' };
    const aparte = crearClienteAparte();
    const { data, error } = await aparte.auth.signInWithPassword({ email: correoInterno(username), password });
    if (error) {
        const rechazo = error.status === 400 || /invalid login credentials|banned/i.test(error.message ?? '');
        return rechazo ? { estado: 'rechazado' } : { estado: 'sinRespuesta' };
    }
    try {
        const { data: fila, error: errorFila } = await aparte
            .from('app_users')
            .select('id, name, role')
            .eq('auth_uid', data.user?.id ?? '')
            .is('deleted_at', null)
            .maybeSingle();
        if (errorFila) return { estado: 'sinRespuesta' };
        if (!fila) return { estado: 'rechazado' };
        const f = fila as { id: string; name: string; role: UserRole };
        return { estado: 'ok', usuario: { id: f.id, role: f.role, name: f.name } };
    } finally {
        await aparte.auth.signOut({ scope: 'local' }).catch(() => {});
    }
}

/** ¿Hay sesión de identidad en este teléfono? Sin ella, la base no deja escribir. */
export async function haySesion(): Promise<boolean> {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
}

/**
 * Entrar SIN señal deja a la persona trabajando con el respaldo del teléfono,
 * pero sin sesión: lo que haga queda en la cola. La clave se guarda acá, SOLO
 * en memoria (nunca en el teléfono), para abrir la sesión sola cuando vuelva
 * la señal. Si la app se cierra antes, se pierde y hay que volver a entrar.
 */
let paraReconectar: { usuario: string; clave: string } | null = null;
export const recordarParaReconectar = (usuario: string, clave: string) => { paraReconectar = { usuario, clave }; };
export const olvidarReconexion = () => { paraReconectar = null; };

/** Intenta abrir la sesión con lo recordado. `true` si quedó abierta. */
export async function reconectar(): Promise<boolean> {
    if (!paraReconectar) return false;
    const r = await entrarConIdentidad(paraReconectar.usuario, paraReconectar.clave);
    if (r.estado === 'ok') { paraReconectar = null; return true; }
    if (r.estado === 'rechazado') paraReconectar = null;
    return false;
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



// ─── ASIGNACIONES: lo que está afuera sin préstamo confirmado ────────────────

function dbToAsignacion(row: Record<string, unknown>): Asignacion {
    const fecha = (v: unknown) => (v ? new Date(v as string) : undefined);
    const texto = (v: unknown) => (v as string | null) ?? undefined;
    return {
        id: row.id as string,
        itemId: texto(row.item_id),
        descripcion: row.descripcion as string,
        cantidad: Number(row.cantidad),
        estado: row.estado as Asignacion['estado'],
        personnelId: texto(row.personnel_id),
        posibleResponsable: texto(row.posible_responsable),
        projectId: texto(row.project_id),
        ubicacion: texto(row.ubicacion),
        responsableAnterior: texto(row.responsable_anterior),
        entregadoPor: texto(row.entregado_por),
        condicion: (row.condicion as Asignacion['condicion']) ?? 'no_especificado',
        desde: fecha(row.desde),
        desdeDesconocido: !!row.desde_desconocido,
        procedencia: texto(row.procedencia),
        notas: texto(row.notas),
        cerradaEn: fecha(row.cerrada_en),
        cierreMotivo: (row.cierre_motivo as Asignacion['cierreMotivo'] | null) ?? undefined,
        cierreNota: texto(row.cierre_nota),
        cerradaPor: texto(row.cerrada_por),
        createdAt: new Date(row.created_at as string),
        updatedAt: fecha(row.updated_at),
    };
}

export async function fetchAsignaciones(): Promise<Asignacion[]> {
    const { data, error } = await supabase.from('asignaciones').select('*')
        .is('deleted_at', null).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(dbToAsignacion);
}

/**
 * Guarda una asignación entera. `upsert` y no `insert`: la cola reintenta, y
 * un reintento de algo que sí alcanzó a llegar no puede fallar por repetido.
 */
export async function guardarAsignacion(a: Asignacion): Promise<void> {
    const { error } = await supabase.from('asignaciones').upsert({
        id: a.id,
        item_id: a.itemId ?? null,
        descripcion: a.descripcion,
        cantidad: a.cantidad,
        estado: a.estado,
        personnel_id: a.personnelId ?? null,
        posible_responsable: a.posibleResponsable ?? null,
        project_id: a.projectId ?? null,
        ubicacion: a.ubicacion ?? null,
        responsable_anterior: a.responsableAnterior ?? null,
        entregado_por: a.entregadoPor ?? null,
        condicion: a.condicion,
        desde: fechaOVacio(a.desde),
        desde_desconocido: a.desdeDesconocido,
        procedencia: a.procedencia ?? null,
        notas: a.notas ?? null,
        cerrada_en: fechaOVacio(a.cerradaEn),
        cierre_motivo: a.cierreMotivo ?? null,
        cierre_nota: a.cierreNota ?? null,
        cerrada_por: a.cerradaPor ?? null,
        created_at: sello(a.createdAt),
        updated_at: sello(a.updatedAt),
    }, { onConflict: 'id' });
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
    /**
     * Un movimiento se restaura CON SU EFECTO DE STOCK, en una transacción.
     *
     * Antes esta función le quitaba la lápida de una y la app miraba después si
     * el stock alcanzaba. Con una salida borrada de 3 palas y una existencia de
     * 1, quedaba el movimiento activo por 3, el stock intacto en 1, y un mensaje
     * diciendo que seguía en la papelera. Validar después de escribir no es
     * validar.
     *
     * Ahora si no cabe, el servidor levanta excepción, revierte, y esta función
     * lanza: la lápida se queda puesta y quien llama se entera de verdad.
     */
    if (tabla === 'movements') {
        const { error } = await supabase.rpc('restore_movement_and_apply_stock', { p_movement_id: id });
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
