
import { Item, Movement, Personnel, PurchaseOrder, InventoryType, MovementType, PurchaseOrderStatus, Project } from './types';

// Helper to generate recent dates for mock data
const getDate = (daysAgo: number): Date => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(10, 0, 0, 0); // Normalize time
    return date;
};

export const mockProjects: Project[] = [
    { id: 'proj-1', name: 'Torre Residencial A', description: 'Obra principal centro', status: 'active' },
    { id: 'proj-2', name: 'Remodelación Oficinas', description: 'Piso 4 y 5', status: 'active' },
    { id: 'proj-3', name: 'Mantenimiento General', description: 'Reparaciones varias', status: 'active' },
];

export const mockItems: Item[] = [
    { id: 'item-1', name: 'Taladro Percutor 1/2"', category: 'Herramientas', subCategory: 'Herramientas Eléctricas de Rotación', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 15, minStock: 5, price: 120.50, unit: 'unidades', color: 'Azul' },
    { id: 'item-2', name: 'Martillo de uña', category: 'Herramientas', subCategory: 'Herramientas de Golpe', inventoryType: InventoryType.HAND_TOOL, quantity: 40, minStock: 20, price: 15.00, unit: 'unidades' },
    { id: 'item-3', name: 'Guantes de seguridad', category: 'Seguridad', subCategory: 'Protección Manual', inventoryType: InventoryType.PPE, quantity: 80, minStock: 100, price: 5.25, unit: 'pares' },
    { id: 'item-4', name: 'Tornillos para madera #8', category: 'Fijaciones', subCategory: 'Tornillería', inventoryType: InventoryType.SINGLE_USE, quantity: 500, minStock: 200, price: 0.10, unit: 'unidades' },
    { id: 'item-5', name: 'Cinta aislante', category: 'Material Eléctrico', subCategory: 'Adhesivos y Cintas', inventoryType: InventoryType.SINGLE_USE, quantity: 30, minStock: 50, price: 2.50, unit: 'rollos', color: 'Negro' },
    { id: 'item-6', name: 'Pulidora Angular 4-1/2"', category: 'Herramientas', subCategory: 'Herramientas Eléctricas de Corte', inventoryType: InventoryType.ELECTRICAL_TOOL, quantity: 8, minStock: 4, price: 85.00, unit: 'unidades' },
    { id: 'item-7', name: 'Casco de seguridad blanco', category: 'Seguridad', subCategory: 'Protección Craneal', inventoryType: InventoryType.PPE, quantity: 25, minStock: 20, price: 12.00, unit: 'unidades', color: 'Blanco' },
    { id: 'item-8', name: 'Tubo PVC 1/2 pulgada', category: 'Fontanería', subCategory: 'Tuberías', inventoryType: InventoryType.SINGLE_USE, quantity: 120, minStock: 50, price: 2.15, unit: 'metros' },
];

export const mockPersonnel: Personnel[] = [
    { id: 'person-1', name: 'Juan Pérez' },
    { id: 'person-2', name: 'María Rodríguez' },
    { id: 'person-3', name: 'Carlos Gómez' },
];

export const mockMovements: Movement[] = [
    { id: 'move-1', itemId: 'item-1', type: MovementType.CHECK_OUT, quantity: 2, timestamp: getDate(2), personnelId: 'person-1', projectId: 'proj-1', isLoan: true, isReturned: false, notes: 'Prestamo para obra' },
    { id: 'move-2', itemId: 'item-3', type: MovementType.CHECK_OUT, quantity: 10, timestamp: getDate(3), personnelId: 'person-2', projectId: 'proj-1' },
    { id: 'move-3', itemId: 'item-2', type: MovementType.CHECK_IN, quantity: 5, timestamp: getDate(5), personnelId: 'person-1' },
    { id: 'move-4', itemId: 'item-5', type: MovementType.WASTE, quantity: 1, timestamp: getDate(6), notes: 'Dañada en uso' },
    { id: 'move-5', itemId: 'item-4', type: MovementType.PURCHASE, quantity: 1000, timestamp: getDate(10) },
    { id: 'move-6', itemId: 'item-8', type: MovementType.CHECK_OUT, quantity: 30, timestamp: getDate(1), personnelId: 'person-3', projectId: 'proj-2', notes: 'Instalación Baños' },
    { id: 'move-7', itemId: 'item-4', type: MovementType.CHECK_OUT, quantity: 50, timestamp: getDate(4), personnelId: 'person-1', projectId: 'proj-1', notes: 'Fijaciones para estructura' },
    { id: 'move-8', itemId: 'item-6', type: MovementType.CHECK_OUT, quantity: 1, timestamp: getDate(8), personnelId: 'person-2', projectId: 'proj-3', isLoan: true, isReturned: true },
    { id: 'move-9', itemId: 'item-4', type: MovementType.CHECK_OUT, quantity: 25, timestamp: getDate(9), personnelId: 'person-3', projectId: 'proj-2' },
    { id: 'move-10', itemId: 'item-2', type: MovementType.CHECK_OUT, quantity: 3, timestamp: getDate(12), personnelId: 'person-1', projectId: 'proj-1' },
];

export const mockPurchaseOrders: PurchaseOrder[] = [
    { 
        id: 'po-1', 
        supplier: 'Ferretería Central', 
        items: [
            { itemId: 'item-1', quantity: 5, price: 115.00 },
            { itemId: 'item-6', quantity: 3, price: 82.50 },
        ],
        status: PurchaseOrderStatus.RECEIVED,
        orderDate: getDate(15),
        expectedDeliveryDate: getDate(8),
        receivedDate: getDate(9),
    },
    { 
        id: 'po-2', 
        supplier: 'Proveedor de Seguridad Industrial', 
        items: [
            { itemId: 'item-3', quantity: 200, price: 5.00 },
            { itemId: 'item-7', quantity: 50, price: 11.50 },
        ],
        status: PurchaseOrderStatus.SHIPPED,
        orderDate: getDate(5),
        expectedDeliveryDate: new Date(new Date().setDate(new Date().getDate() + 2)), // Future date
    },
    { 
        id: 'po-3', 
        supplier: 'Tornillería Express', 
        items: [
            { itemId: 'item-4', quantity: 5000, price: 0.08 },
        ],
        status: PurchaseOrderStatus.ORDERED,
        orderDate: getDate(1),
        expectedDeliveryDate: new Date(new Date().setDate(new Date().getDate() + 10)), // Future date
    }
];
