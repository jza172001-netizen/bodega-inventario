
import React, { useMemo, useState } from 'react';
import { Item, Movement, OrderNote, Personnel } from '../types';
import { familiaDe } from '../utils/genus';
import { getConsumption } from '../utils/inventory';
import { materialDe, medidaDe } from '../utils/medida';
import { PeriodPicker, Periodo, periodoPorDefecto } from './PeriodPicker';

interface Props {
    notes: OrderNote[];
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    onAddNote: (texto: string, cantidad?: number, unidad?: string, familia?: string) => void;
    onToggleNote: (n: OrderNote) => void;
    onDeleteNote: (n: OrderNote) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

/**
 * La lista de pedidos: lo que hay que comprar.
 *
 * Arriba es una LIBRETA, y a propósito no toca el inventario: se anota "3
 * bultos de lechada" mientras se camina por la bodega, sin que eso mueva
 * cantidades ni exija que el ítem exista. Una libreta no debe pedir permiso.
 *
 * Abajo la app propone, con lo que de verdad se gastó en el período elegido,
 * agrupado familia → material → medida. Porque los clavos no se compran "por
 * clavos": se compran de acero o de hierro, y de dos, tres o cuatro pulgadas.
 */
export const OrderListView: React.FC<Props> = ({
    notes, items, movements, personnel, onAddNote, onToggleNote, onDeleteNote, onBehaviorLog,
}) => {
    const [texto, setTexto] = useState('');
    const [cantidad, setCantidad] = useState('');
    const [unidad, setUnidad] = useState('');
    const [periodo, setPeriodo] = useState<Periodo>(periodoPorDefecto());

    const pendientes = notes.filter(n => !n.comprado);
    const compradas  = notes.filter(n => n.comprado);

    const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const nombreDe = (id?: string) => personnel.find(p => p.id === id)?.name ?? 'Sin asignar';

    /** familia → material → medida, con lo consumido en el período. */
    const sugerencias = useMemo(() => {
        const rep = getConsumption(movements, itemMap, periodo, nombreDe);
        const porFamilia = new Map<string, Map<string, Map<string, { unidades: number; unidad: string }>>>();
        for (const fila of rep.porItem) {
            const it = fila.key;
            const fam = it.familia?.trim() || familiaDe(it.name);
            const mat = materialDe(it.name) ?? '—';
            const med = medidaDe(it.name) ?? '—';
            if (!porFamilia.has(fam)) porFamilia.set(fam, new Map());
            const mats = porFamilia.get(fam)!;
            if (!mats.has(mat)) mats.set(mat, new Map());
            const meds = mats.get(mat)!;
            const prev = meds.get(med) ?? { unidades: 0, unidad: it.unit };
            meds.set(med, { unidades: prev.unidades + fila.unidades, unidad: it.unit });
        }
        return [...porFamilia.entries()]
            .map(([familia, mats]) => ({
                familia,
                total: [...mats.values()].reduce((s, meds) =>
                    s + [...meds.values()].reduce((t, x) => t + x.unidades, 0), 0),
                materiales: [...mats.entries()]
                    .map(([material, meds]) => ({
                        material,
                        medidas: [...meds.entries()]
                            .map(([medida, x]) => ({ medida, ...x }))
                            .sort((a, b) => b.unidades - a.unidades),
                    }))
                    .sort((a, b) => a.material.localeCompare(b.material, 'es')),
            }))
            .sort((a, b) => b.total - a.total);
    }, [movements, itemMap, periodo, personnel]);

    const agregar = () => {
        const t = texto.trim();
        if (!t) return;
        onAddNote(t, cantidad ? Number(cantidad) : undefined, unidad.trim() || undefined);
        onBehaviorLog?.('ACTION', `Anotó en la lista de pedidos: ${t}`);
        setTexto(''); setCantidad(''); setUnidad('');
    };

    const compartir = () => {
        const lineas = pendientes.map(n =>
            `• ${n.cantidad ? `${n.cantidad} ${n.unidad ?? ''} de ` : ''}${n.texto}`.replace(/\s+/g, ' '));
        const txt = `🧾 *Lista de pedidos — Bodega Grupo Montecielo*\n\n${lineas.join('\n')}`;
        onBehaviorLog?.('ACTION', `Compartió la lista de pedidos (${pendientes.length})`);
        window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="space-y-4 max-w-2xl mx-auto pb-8">
            <div>
                <h1 className="text-xl font-black text-gray-900">🧾 Lista de pedidos</h1>
                <p className="text-xs text-gray-400 mt-0.5">
                    Lo que hay que comprar. No toca el inventario: acá se anota, nada más.
                </p>
            </div>

            {/* ── La libreta ─────────────────────────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-3 space-y-2">
                <div className="flex gap-1.5">
                    <input type="text" value={texto}
                        onChange={e => setTexto(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
                        placeholder="Ej: lechada gris, clavos de 3"
                        className="flex-1 min-w-0 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="flex gap-1.5">
                    <input type="number" value={cantidad} min={0}
                        onChange={e => setCantidad(e.target.value)}
                        placeholder="Cuántos"
                        className="w-24 text-sm border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <input type="text" value={unidad}
                        onChange={e => setUnidad(e.target.value)}
                        placeholder="bultos, kg…"
                        className="flex-1 min-w-0 text-sm border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <button onClick={agregar} disabled={!texto.trim()}
                        className="px-4 py-2 text-sm font-black bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl flex-shrink-0">
                        Anotar
                    </button>
                </div>
            </div>

            {pendientes.length === 0 && compradas.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <p className="text-3xl mb-2">🧾</p>
                    <p className="text-sm">Todavía no hay nada anotado.</p>
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    {pendientes.map(n => (
                        <div key={n.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 last:border-0">
                            <button onClick={() => onToggleNote(n)}
                                className="w-5 h-5 flex-shrink-0 rounded-md border-2 border-gray-300 hover:border-green-500 transition-colors" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{n.texto}</p>
                                {n.cantidad != null && (
                                    <p className="text-[11px] text-gray-400">{n.cantidad} {n.unidad ?? ''}</p>
                                )}
                            </div>
                            <button onClick={() => onDeleteNote(n)}
                                className="text-gray-300 hover:text-red-500 px-1 flex-shrink-0 text-sm">✕</button>
                        </div>
                    ))}
                    {compradas.length > 0 && (
                        <div className="bg-gray-50 px-3 py-2">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Ya comprado</p>
                            {compradas.map(n => (
                                <div key={n.id} className="flex items-center gap-2 py-1">
                                    <button onClick={() => onToggleNote(n)}
                                        className="w-5 h-5 flex-shrink-0 rounded-md bg-green-500 text-white text-[11px] font-black">✓</button>
                                    <p className="flex-1 min-w-0 text-sm text-gray-400 line-through truncate">{n.texto}</p>
                                    <button onClick={() => onDeleteNote(n)}
                                        className="text-gray-300 hover:text-red-500 px-1 flex-shrink-0 text-sm">✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {pendientes.length > 0 && (
                <button onClick={compartir}
                    className="w-full py-2.5 text-sm font-black bg-green-600 hover:bg-green-700 text-white rounded-xl">
                    📲 Compartir la lista
                </button>
            )}

            {/* ── Lo que la app propone ──────────────────────────────────── */}
            <div className="pt-2 space-y-2">
                <div>
                    <h2 className="text-sm font-black text-gray-900">Lo que más se gastó</h2>
                    <p className="text-[11px] text-gray-400 mb-2">
                        Para decidir qué pedir. El número del nombre es la medida, no la cantidad.
                    </p>
                    <PeriodPicker value={periodo} onChange={setPeriodo} onBehaviorLog={onBehaviorLog} />
                </div>

                {sugerencias.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">Sin consumo en este período.</p>
                ) : sugerencias.map(f => (
                    <div key={f.familia} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                            <p className="text-sm font-black text-gray-900 flex-1 truncate">{f.familia}</p>
                            <span className="text-[11px] font-bold text-gray-400">{f.total} gastados</span>
                        </div>
                        {f.materiales.map(mat => (
                            <div key={mat.material} className="px-3 py-2 border-b border-gray-50 last:border-0">
                                {mat.material !== '—' && (
                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider mb-1">{mat.material}</p>
                                )}
                                {mat.medidas.map(m => (
                                    <div key={m.medida} className="flex items-center gap-2 py-1">
                                        <span className="text-xs font-bold text-gray-700 w-12 flex-shrink-0">
                                            {m.medida === '—' ? '' : m.medida}
                                        </span>
                                        <span className="flex-1 text-xs text-gray-500">{m.unidades} {m.unidad}</span>
                                        <button
                                            onClick={() => {
                                                const t = [f.familia, mat.material !== '—' ? mat.material : '', m.medida !== '—' ? m.medida : '']
                                                    .filter(Boolean).join(' ');
                                                onAddNote(t, m.unidades, m.unidad, f.familia);
                                                onBehaviorLog?.('ACTION', `Pasó a la lista de pedidos: ${t}`);
                                            }}
                                            className="text-[10px] font-black px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 flex-shrink-0">
                                            + Agregar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};
