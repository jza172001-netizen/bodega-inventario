
import { PurchaseOrderStatus } from './types';

export const CATEGORIES = [
    'Herramientas',
    'Fijaciones',
    'Material Eléctrico',
    'Fontanería',
    'Acabados',
    'Seguridad',
    'Maquinaria'
];

export const PO_STATUS_COLORS: { [key in PurchaseOrderStatus]: string } = {
    [PurchaseOrderStatus.ORDERED]: 'bg-blue-100 text-blue-800',
    [PurchaseOrderStatus.SHIPPED]: 'bg-indigo-100 text-indigo-800',
    [PurchaseOrderStatus.RECEIVED]: 'bg-green-100 text-green-800',
    [PurchaseOrderStatus.CANCELLED]: 'bg-red-100 text-red-800',
};
