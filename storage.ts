import { AppUser, Item, Movement, Personnel, Project, PurchaseOrder } from './types';

export interface AppData {
  items: Item[];
  movements: Movement[];
  personnel: Personnel[];
  purchaseOrders: PurchaseOrder[];
  projects: Project[];
  users: AppUser[];
}

const STORAGE_KEY = 'warehouse_inventory_pro_data';

export const saveToLocalStorage = (data: AppData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const loadFromLocalStorage = (): AppData | null => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  try {
    const data = JSON.parse(saved);
    // Convert date strings back to Date objects
    if (data.movements) {
      data.movements = data.movements.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp)
      }));
    }
    if (data.purchaseOrders) {
      data.purchaseOrders = data.purchaseOrders.map((po: any) => ({
        ...po,
        orderDate: new Date(po.orderDate),
        expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : undefined,
        receivedDate: po.receivedDate ? new Date(po.receivedDate) : undefined
      }));
    }
    return data;
  } catch (e) {
    console.error("Failed to load from local storage", e);
    return null;
  }
};

export const exportToFile = (data: AppData) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `inventory_backup_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const importFromFile = (
  e: React.ChangeEvent<HTMLInputElement>,
  onSuccess: (data: AppData) => void,
  onError: (msg: string) => void
) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target?.result as string);
      // Basic validation could be added here
      onSuccess(data);
    } catch (err) {
      onError("Error al importar el archivo. Asegúrate de que sea un JSON válido.");
    }
  };
  reader.readAsText(file);
};
