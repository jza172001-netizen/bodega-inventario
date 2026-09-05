
import React, { useState } from 'react';
import { Accessory, Item, InventoryType } from '../types';

interface Props {
    value: Accessory[];
    onChange: (accs: Accessory[]) => void;
    /** Todo el inventario: de acá salen los consumibles que se pueden enganchar. */
    items: Item[];
}

/**
 * Los accesorios de una herramienta son de dos clases, y la diferencia es de
 * negocio, no de forma:
 *
 *  · Retornable (maleta, llave, cargador): sale y vuelve CON la herramienta.
 *    No mueve stock; se revisa al devolverla, y lo que falte queda nombrado en
 *    la devolución incompleta.
 *
 *  · Consumible (disco, broca): es un ítem del inventario con su propio stock.
 *    Sale pegado a la herramienta, descuenta, se gasta y no vuelve.
 *
 * Meterlos en una sola lista de texto los volvía indistinguibles, que es
 * justamente lo que impedía reclamar una llave perdida o descontar un disco.
 */
export const AccessoriesEditor: React.FC<Props> = ({ value, onChange, items }) => {
    const [nuevoRetornable, setNuevoRetornable] = useState('');

    const consumibles = items
        .filter(i => i.inventoryType === InventoryType.SINGLE_USE || i.inventoryType === InventoryType.PPE)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const quitar = (idx: number) => onChange(value.filter((_, i) => i !== idx));
    const cambiar = (idx: number, parche: Partial<Accessory>) =>
        onChange(value.map((a, i) => (i === idx ? { ...a, ...parche } : a)));

    const agregarRetornable = () => {
        const n = nuevoRetornable.trim();
        if (!n) return;
        onChange([...value, { nombre: n }]);
        setNuevoRetornable('');
    };

    const agregarConsumible = () => {
        const primero = consumibles[0];
        if (!primero) return;
        onChange([...value, { nombre: primero.name, itemId: primero.id, cantidad: 1 }]);
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
                Accesorios
                <span className="block text-xs font-normal text-gray-500">
                    Lo que sale con la herramienta. Los retornables se revisan al devolverla; los consumibles descuentan stock.
                </span>
            </label>

            {value.length > 0 && (
                <div className="space-y-1.5">
                    {value.map((acc, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
                            {acc.itemId ? (
                                <>
                                    <span className="text-sm flex-shrink-0" title="Se gasta">📦</span>
                                    <select
                                        value={acc.itemId}
                                        onChange={e => {
                                            const it = consumibles.find(c => c.id === e.target.value);
                                            cambiar(idx, { itemId: e.target.value, nombre: it?.name ?? acc.nombre });
                                        }}
                                        className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white"
                                    >
                                        {consumibles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <input
                                        type="number" min={1} value={acc.cantidad ?? 1}
                                        onFocus={e => e.target.select()}
                                        onChange={e => cambiar(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                                        className="w-12 text-xs text-center border border-gray-200 rounded-md px-1 py-1 bg-white flex-shrink-0"
                                        title="Cuántos salen por cada herramienta"
                                    />
                                </>
                            ) : (
                                <>
                                    <span className="text-sm flex-shrink-0" title="Vuelve con la herramienta">🔁</span>
                                    <input
                                        type="text" value={acc.nombre}
                                        onChange={e => cambiar(idx, { nombre: e.target.value })}
                                        className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white"
                                    />
                                </>
                            )}
                            <button type="button" onClick={() => quitar(idx)}
                                className="text-gray-400 hover:text-red-500 px-1 flex-shrink-0" title="Quitar">✕</button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex gap-1.5">
                <input
                    type="text" value={nuevoRetornable}
                    onChange={e => setNuevoRetornable(e.target.value)}
                    // Enter agregaría el accesorio Y enviaría el formulario del ítem: se corta acá.
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarRetornable(); } }}
                    placeholder="Ej: Maleta, llave, cargador"
                    className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
                />
                <button type="button" onClick={agregarRetornable}
                    className="text-xs font-bold px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex-shrink-0">
                    🔁 Vuelve
                </button>
                <button type="button" onClick={agregarConsumible}
                    disabled={consumibles.length === 0}
                    title={consumibles.length === 0 ? 'Primero creá un consumible en el inventario' : 'Agregar un consumible que sale con la herramienta'}
                    className="text-xs font-bold px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg flex-shrink-0">
                    📦 Se gasta
                </button>
            </div>
        </div>
    );
};
