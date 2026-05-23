
export enum UserRole {
    OWNER = 'owner',
    EMPLOYEE = 'employee',
}

// Nueva interfaz para usuarios del sistema
export interface AppUser {
    id: string;
    username: string; // Sensible a mayúsculas/minúsculas
    password: string;
    role: UserRole;
    name: string; // Nombre real (ej: Juan Perez)
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
    requiresReturnNote?: boolean;
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
}

export interface Personnel {
    id: string;
    name: string;
    phone?: string;
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
