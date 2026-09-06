
import React, { useState } from 'react';
import { Item, InventoryType, Accessory } from '../types';
import { unidadesCon } from '../utils/unidades';
import { familiaDe, accesorioDeFamilia, palabraDeAccesorio } from '../utils/genus';

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
interface ChipsProps {
    item?: Item;
    className?: string;
    /** Con esto los chips se pueden corregir y quitar. Sin esto solo se leen. */
    onEditItem?: (item: Item) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

export const AccesoriosDeItem: React.FC<ChipsProps> = ({ item, className, onEditItem, onBehaviorLog }) => {
    const accs = item?.accessories ?? [];
    if (accs.length === 0) return null;
    const sePuedeTocar = !!(item && onEditItem);

    // Ojo: nada de estado de React acá dentro. `LoanRow` se define dentro de
    // `LoansView`, así que React lo remonta en cada render y cualquier estado
    // local se borraría — es lo que hacía que el menú flotante de accesorios se
    // cerrara solo. Por eso el ✕ está siempre a la vista y la cantidad va en un
    // <select> nativo, gobernado por los datos del ítem.
    const cambiar = (i: number, cambio: Partial<Accessory> | null) => {
        if (!item || !onEditItem) return;
        const antes = accs[i];
        const nuevas = cambio === null
            ? accs.filter((_, j) => j !== i)
            : accs.map((a, j) => j === i ? { ...a, ...cambio } : a);
        onEditItem({ ...item, accessories: nuevas });
        onBehaviorLog?.('ACTION', cambio === null
            ? `Quitó el accesorio "${antes.nombre}" de "${item.name}"`
            : `Cambió el accesorio "${antes.nombre}" de "${item.name}" a ×${cambio.cantidad}`);
    };

    return (
        <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
            {accs.map((a, i) => (
                <span key={`${a.itemId ?? a.nombre}-${i}`}
                    title={a.itemId ? 'Se gasta: descuenta stock' : 'Vuelve con la herramienta'}
                    className={`inline-flex items-center gap-1 text-[9px] font-bold rounded-full ${
                        sePuedeTocar ? 'pl-1.5 pr-0.5 py-0.5' : 'px-1.5 py-0.5'} ${
                        a.itemId ? 'bg-atencion-suave text-atencion border border-atencion'
                                 : 'bg-papel-hondo text-tinta-suave border border-papel-borde'}`}>
                    {a.itemId ? '📦' : '🔁'} {a.nombre}
                    {/* La cantidad solo tiene sentido en lo que se gasta: una maleta
                        que vuelve con la herramienta es una, y ya. */}
                    {a.itemId && sePuedeTocar ? (
                        <select value={a.cantidad ?? 1}
                            onClick={e => e.stopPropagation()}
                            onChange={e => cambiar(i, { cantidad: Number(e.target.value) })}
                            title="Cuántos salen con la herramienta"
                            className="bg-transparent text-[9px] font-bold text-atencion border-0 focus:outline-none cursor-pointer -mr-0.5">
                            {Array.from({ length: 20 }, (_, n) => n + 1).map(n =>
                                <option key={n} value={n}>×{n}</option>)}
                        </select>
                    ) : a.itemId && (a.cantidad ?? 1) > 1 ? `×${a.cantidad}` : null}
                    {sePuedeTocar && (
                        <button type="button"
                            onClick={e => { e.stopPropagation(); cambiar(i, null); }}
                            title={`Quitar ${a.nombre}`}
                            className={`w-4 h-4 flex items-center justify-center rounded-full text-[10px] leading-none transition-colors ${
                                a.itemId ? 'text-tinta-tenue hover:bg-atencion-suave hover:text-atencion'
                                         : 'text-tinta-tenue hover:bg-papel-borde hover:text-tinta'}`}>
                            ✕
                        </button>
                    )}
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

    // El taladro pide brocas y la pulidora discos. Lo que le corresponde a esta
    // familia va arriba; el resto queda abajo, sin esconderse.
    const familia = item.familia?.trim() || familiaDe(item.name);
    const propios = new Set(accesorioDeFamilia(familia, items));

    const disponibles = items
        .filter(i => i.inventoryType === InventoryType.SINGLE_USE || i.inventoryType === InventoryType.PPE)
        .filter(i => !(item.accessories ?? []).some(a => a.itemId === i.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const suyos = disponibles.filter(i => propios.has(i.id));
    const demas = disponibles.filter(i => !propios.has(i.id));
    const consumibles = [...suyos, ...demas];

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
            <div className="w-full border border-atencion bg-atencion-suave rounded-lg p-2 space-y-1.5"
                onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-black text-atencion">Nuevo accesorio para {item.name}</p>
                <input type="text" value={nombre || palabraDeAccesorio(familia)} autoFocus
                    onChange={e => setNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crearYEnganchar(); } }}
                    placeholder="Ej: Disco, Broca"
                    className="w-full text-xs border border-atencion rounded-lg px-2 py-1.5 bg-papel" />
                <div className="flex gap-1.5">
                    <select value={unidad} onChange={e => setUnidad(e.target.value)}
                        className="flex-1 min-w-0 text-xs border border-atencion rounded-lg px-2 py-1.5 bg-papel">
                        {unidadesCon(unidad).map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button type="button" onClick={() => { setCreando(false); setNombre(''); }}
                        className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-papel-borde bg-papel text-tinta-tenue">
                        Cancelar
                    </button>
                    <button type="button" onClick={crearYEnganchar} disabled={!nombre.trim()}
                        className="text-[11px] font-black px-2.5 py-1.5 rounded-lg bg-atencion disabled:bg-papel-borde disabled:text-tinta-tenue text-papel">
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
            className="flex-shrink-0 min-w-0 text-[11px] font-bold px-1.5 py-1.5 rounded-lg border border-papel-borde text-tinta-suave bg-papel max-w-[112px]"
        >
            <option value="">+ Accesorio</option>
            {suyos.length > 0 && (
                <optgroup label={`Para ${familia.toLowerCase()}`}>
                    {suyos.map(c => <option key={c.id} value={c.id}>{c.name} · {c.quantity} {c.unit}</option>)}
                </optgroup>
            )}
            {demas.length > 0 && (
                <optgroup label={suyos.length > 0 ? 'Todo lo demás' : 'Consumibles'}>
                    {demas.map(c => <option key={c.id} value={c.id}>{c.name} · {c.quantity} {c.unit}</option>)}
                </optgroup>
            )}
            {onCreateItem && <option value="__nuevo__">➕ Crear uno nuevo…</option>}
        </select>
    );
};
