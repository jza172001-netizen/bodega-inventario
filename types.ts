
export enum UserRole {
    OWNER    = 'owner',
    EMPLOYEE = 'employee',
    VISITOR  = 'visitor',
}

export interface AppUser {
    id: string;
    username: string;
    password: string;
    /** SHA-256 de la contraseña — único dato de credencial que se persiste localmente (login offline) */
    passwordHash?: string;
    role: UserRole;
    name: string;
    setupComplete?: boolean;
}

export enum InventoryType {
    HAND_TOOL = 'Herramienta Manual',
    ELECTRICAL_TOOL = 'Herramienta Eléctrica',
    PPE = 'Equipo de Protección Personal',
    SINGLE_USE = 'Material de Consumo',
}

export enum MovementType {
    PURCHASE = 'Compra',
    CHECK_IN = 'Entrada',
    CHECK_OUT = 'Salida',
    WASTE = 'Merma',
}

export enum PurchaseOrderStatus {
    ORDERED = 'Ordenado',
    SHIPPED = 'Enviado',
    RECEIVED = 'Recibido',
    CANCELLED = 'Cancelado',
}

export type ReturnCondition = 'good' | 'worn' | 'incomplete' | 'damaged' | 'needs_maintenance';

/**
 * Un accesorio de una herramienta. Hay dos clases y la diferencia es de
 * negocio, no de forma:
 *  · Sin `itemId` — retornable (maleta, llave, cargador): sale y vuelve CON la
 *    herramienta, y se revisa al devolverla.
 *  · Con `itemId` — consumible (disco, broca): es un ítem del inventario con su
 *    propio stock, sale pegado a la herramienta, se gasta y no vuelve.
 */
export interface Accessory {
    nombre: string;
    itemId?: string;
    cantidad?: number;
}

export interface Item {
    id: string;
    name: string;
    category: string;
    subCategory: string;
    inventoryType: InventoryType;
    quantity: number;
    minStock: number;
    price?: number;
    unit: string;
    color?: string;
    brand?: string;
    requiresReturnNote?: boolean;
    accessories?: Accessory[];
}

export interface Project {
    id: string;
    name: string;
    description?: string;
    status: 'active' | 'completed';
}

export interface Movement {
    id: string;
    itemId: string;
    type: MovementType;
    quantity: number;
    timestamp: Date;
    personnelId?: string;
    notes?: string;
    projectId?: string; // Link movement to a project
    isLoan?: boolean;
    isReturned?: boolean;
    pendingPickup?: boolean;
    returnCondition?: ReturnCondition;
    returnNotes?: string;
    /** Cuándo volvió la herramienta a la bodega. Antes solo se guardaba QUE había
     *  vuelto y en qué estado, nunca cuándo: una devolución de hoy seguía
     *  apareciendo en el historial con la fecha de su salida. */
    returnedAt?: Date;
}

export interface Personnel {
    id: string;
    name: string;
    phone?: string;
    isTeamLeader?: boolean;
    teamLeaderId?: string;
}

export interface PurchaseOrderItem {
    itemId: string;
    quantity: number;
    price: number;
}

export interface PurchaseOrder {
    id: string;
    supplier: string;
    items: PurchaseOrderItem[];
    status: PurchaseOrderStatus;
    orderDate: Date;
    expectedDeliveryDate?: Date;
    receivedDate?: Date;
    notes?: string;
}

export interface AuditLog {
    id: string;
    timestamp: Date;
    action: string;
    actor: string;
    description: string;
}

export interface BehaviorLog {
    id: string;
    timestamp: Date;
    actor: string;
    action: string;
    detail: string;
}
