// FIX: Define all necessary types and enums to resolve compilation errors across the project.
export enum UserRole {
    OWNER = 'owner',
    EMPLOYEE = 'employee',
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

export interface Item {
    id: string;
    name: string;
    category: string;
    subCategory: string;
    inventoryType: InventoryType;
    quantity: number;
    minStock: number;
    price: number;
    unit: string;
    color?: string;
}

export interface Movement {
    id: string;
    itemId: string;
    type: MovementType;
    quantity: number;
    timestamp: Date;
    personnelId?: string;
    notes?: string;
}

export interface Personnel {
    id: string;
    name: string;
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
