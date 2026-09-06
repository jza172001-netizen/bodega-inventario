
import React, { useState } from 'react';
import { Item, InventoryType, Accessory } from '../types';
import { unidadesCon } from '../utils/unidades';

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
    /** Para crear un consumible que todavía no existe. */
    onCreateItem?: (item: Omit<Item, 'id'>) => Item;
    onBehaviorLog?: (action: string, detail: string) => void;
}

/**
 * Engancharle un consumible a la herramienta sin salir de donde se está. Es el
 * disco de la pulidora: se decide en el mostrador, no en la pantalla de edición.
 *
 * Y se puede CREARLO ahí mismo. Antes solo ofrecía los que ya existían, y peor:
 * si no había ningún consumible cargado, el botón ni aparecía. O sea que no se
 * podía enganchar un disco justo cuando el disco todavía no estaba en el
 * inventario — que es exactamente cuando hace falta.
 */
export const AgregarAccesorio: React.FC<AgregarProps> = ({ item, items, onEditItem, onCreateItem, onBehaviorLog }) => {
    const [creando, setCreando] = useState(false);
    const [nombre, setNombre] = useState('');
    const [unidad, setUnidad] = useState('unidades');

    const consumibles = items
        .filter(i => i.inventoryType === InventoryType.SINGLE_USE || i.inventoryType === InventoryType.PPE)
        .filter(i => !(item.accessories ?? []).some(a => a.itemId === i.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const enganchar = (it: Item) => {
        const acc: Accessory = { nombre: it.name, itemId: it.id, cantidad: 1 };
        onEditItem({ ...item, accessories: [...(item.accessories ?? []), acc] });
        onBehaviorLog?.('ACTION', `Enganchó "${it.name}" a "${item.name}"`);
    };

    const crearYEnganchar = () => {
        const n = nombre.trim();
        if (!n || !onCreateItem) return;
        const nuevo = onCreateItem({
            name: n, category: 'Materiales', subCategory: 'General',
            inventoryType: InventoryType.SINGLE_USE,
            quantity: 0, minStock: 0, price: 0, unit: unidad,
        });
        enganchar(nuevo);
        setNombre(''); setUnidad('unidades'); setCreando(false);
    };

    if (creando) {
        return (
            <div className="w-full border border-orange-200 bg-orange-50 rounded-lg p-2 space-y-1.5"
                onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-black text-orange-800">Nuevo accesorio para {item.name}</p>
                <input type="text" value={nombre} autoFocus
                    onChange={e => setNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crearYEnganchar(); } }}
                    placeholder="Ej: Disco, Broca"
                    className="w-full text-xs border border-orange-200 rounded-lg px-2 py-1.5 bg-white" />
                <div className="flex gap-1.5">
                    <select value={unidad} onChange={e => setUnidad(e.target.value)}
                        className="flex-1 min-w-0 text-xs border border-orange-200 rounded-lg px-2 py-1.5 bg-white">
                        {unidadesCon(unidad).map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button type="button" onClick={() => { setCreando(false); setNombre(''); }}
                        className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500">
                        Cancelar
                    </button>
                    <button type="button" onClick={crearYEnganchar} disabled={!nombre.trim()}
                        className="text-[11px] font-black px-2.5 py-1.5 rounded-lg bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-white">
                        Crear
                    </button>
                </div>
            </div>
        );
    }

    return (
        <select
            value=""
            onClick={e => e.stopPropagation()}
            onChange={e => {
                if (e.target.value === '__nuevo__') { setCreando(true); return; }
                const c = consumibles.find(x => x.id === e.target.value);
                if (c) enganchar(c);
            }}
            title="Engancharle un consumible a esta herramienta"
            className="text-[11px] font-bold px-2 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white max-w-[130px]"
        >
            <option value="">+ Accesorio</option>
            {consumibles.map(c => (
                <option key={c.id} value={c.id}>{c.name} · {c.quantity} {c.unit}</option>
            ))}
            {onCreateItem && <option value="__nuevo__">➕ Crear uno nuevo…</option>}
        </select>
    );
};
