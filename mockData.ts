// Re-exporta los datos reales como defaults de la app
export {
    realUsers as mockUsers,
    realPersonnel as mockPersonnel,
    realProjects as mockProjects,
    realItems as mockItems,
    realMovements as mockMovements,
} from './realData';

import { PurchaseOrder } from './types';
export const mockPurchaseOrders: PurchaseOrder[] = [];
