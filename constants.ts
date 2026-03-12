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

/** Formatea un número como pesos colombianos: 1500000 → "1.500.000" */
export const formatCOP = (value: number): string => {
    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
};

/** Parsea un string con formato COP a número: "1.500.000" → 1500000 */
export const parseCOP = (value: string): number => {
    return parseInt(value.replace(/\./g, '').replace(/[^\d]/g, ''), 10) || 0;
};
