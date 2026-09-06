
import React from 'react';
import { Item, InventoryType, Accessory } from '../types';

/**
 * Lo que sale pegado a una herramienta, dicho donde el bodeguero está mirando.
 *
 * Los accesorios solo se veían dentro del editor del ítem, así que al despachar
 * una pulidora no había forma de saber que llevaba disco, ni de engancharle uno
 * sin salirse a buscar el ítem en el inventario. Y engancharlo es justo lo que
 * hay que hacer cuando el trabajador ya está ahí parado esperando.
 *
 *   🔁 vuelve con la herramienta      📦 se gasta y descuenta stock
 */
export const AccesoriosDeItem: React.FC<{ item?: Item; className?: string }> = ({ item, className }) => {
    const accs = item?.accessories ?? [];
    if (accs.length === 0) return null;
    return (
        <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
            {accs.map((a, i) => (
                <span key={i}
                    title={a.itemId ? 'Se gasta: descuenta stock' : 'Vuelve con la herramienta'}
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        a.itemId ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                 : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                    {a.itemId ? '📦' : '🔁'} {a.nombre}{a.itemId && (a.cantidad ?? 1) > 1 ? ` ×${a.cantidad}` : ''}
                </span>
            ))}
        </div>
    );
};

interface AgregarProps {
    item: Item;
    items: Item[];
    onEditItem: (item: Item) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

/**
 * Engancharle un consumible a la herramienta sin salir de donde se está. Es el
 * disco de la pulidora: se decide en el mostrador, no en la pantalla de edición.
 */
/**
 * Engancharle un consumible a la herramienta sin salir de donde se está. Es el
 * disco de la pulidora: se decide en el mostrador, no en la pantalla de edición.
 *
 * Es un `select` nativo a propósito, no un menú flotante. En el teléfono el
 * selector del sistema es más cómodo, y sobre todo no tiene estado propio que
 * perder: las filas de préstamos se redefinen en cada render, así que un menú
 * con su propio "abierto/cerrado" se cerraba solo antes de poder elegir nada.
 */
export const AgregarAccesorio: React.FC<AgregarProps> = ({ item, items, onEditItem, onBehaviorLog }) => {
    const consumibles = items
        .filter(i => i.inventoryType === InventoryType.SINGLE_USE || i.inventoryType === InventoryType.PPE)
        .filter(i => !(item.accessories ?? []).some(a => a.itemId === i.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    if (consumibles.length === 0) return null;

    const enganchar = (id: string) => {
        const c = consumibles.find(x => x.id === id);
        if (!c) return;
        const acc: Accessory = { nombre: c.name, itemId: c.id, cantidad: 1 };
        onEditItem({ ...item, accessories: [...(item.accessories ?? []), acc] });
        onBehaviorLog?.('ACTION', `Enganchó "${c.name}" a "${item.name}"`);
    };

    return (
        <select
            value=""
            onClick={e => e.stopPropagation()}
            onChange={e => enganchar(e.target.value)}
            title="Engancharle un consumible a esta herramienta"
            className="text-[10px] font-black px-1.5 py-1 rounded-lg border border-gray-200 text-gray-500 bg-white max-w-[92px]"
        >
            <option value="">+ Accesorio</option>
            {consumibles.map(c => (
                <option key={c.id} value={c.id}>{c.name} · {c.quantity} {c.unit}</option>
            ))}
        </select>
    );
};
