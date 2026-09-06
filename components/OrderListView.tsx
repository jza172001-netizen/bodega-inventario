
import React, { useMemo, useState } from 'react';
import { Item, Movement, OrderNote, Personnel } from '../types';
import { familiaDe, normStr } from '../utils/genus';
import { construirArbol } from '../utils/arbol';
import { tonoDe } from '../utils/colores';
import { unidadesCon } from '../utils/unidades';
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
    onUpdateNote: (n: OrderNote, cambios: Partial<OrderNote>) => void;
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
    notes, items, movements, personnel, onAddNote, onToggleNote, onUpdateNote, onDeleteNote, onBehaviorLog,
}) => {
    // El renglón que se está corrigiendo, con lo escrito hasta ahora.
    const [editando, setEditando] = useState<string | null>(null);
    const [borrador, setBorrador] = useState<{ texto: string; cantidad: string; unidad: string; color: string }>(
        { texto: '', cantidad: '', unidad: '', color: '' });

    const abrirEdicion = (n: OrderNote) => {
        setEditando(n.id);
        setBorrador({
            texto: n.texto,
            cantidad: n.cantidad != null ? String(n.cantidad) : '',
            unidad: n.unidad ?? '',
            color: n.color ?? '',
        });
    };

    const guardarEdicion = (n: OrderNote) => {
        const texto = borrador.texto.trim();
        if (!texto) return;
        onUpdateNote(n, {
            texto,
            cantidad: borrador.cantidad.trim() === '' ? undefined : Number(borrador.cantidad),
            unidad: borrador.unidad.trim() || undefined,
            color: borrador.color.trim() || undefined,
        });
        onBehaviorLog?.('ACTION', `Editó el pedido "${n.texto}"`);
        setEditando(null);
    };
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
                    {pendientes.map(n => {
                        if (editando === n.id) {
                            // Las variantes que esa familia ya tiene en la bodega, no una
                            // paleta inventada. Y salen del árbol, no del campo `color`:
                            // la lechada no tiene el color guardado en su campo, lo tiene
                            // ESCRITO en el nombre ("Lechada veige"), que es justo lo que
                            // Juli señaló. Para la lechada salen gris y veige; para los
                            // clavos, acero y hierro. Cuando la variante es un color de
                            // verdad, el chip va pintado de ese color.
                            const familia = (n.familia?.trim() || familiaDe(n.texto));
                            const colores = construirArbol(
                                    items.filter(i => normStr(i.familia?.trim() || familiaDe(i.name)) === normStr(familia)))
                                .flatMap(a => a.ramas.map(r => r.variante))
                                .filter(v => v !== '—');
                            return (
                                <div key={n.id} className="px-3 py-2.5 border-b border-gray-50 last:border-0 bg-blue-50/40 space-y-2">
                                    <input type="text" value={borrador.texto} autoFocus
                                        onChange={e => setBorrador(b => ({ ...b, texto: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(n); if (e.key === 'Escape') setEditando(null); }}
                                        className="w-full text-sm font-semibold border border-blue-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                    <div className="flex gap-1.5">
                                        <input type="number" value={borrador.cantidad} min={0} placeholder="Cant."
                                            onChange={e => setBorrador(b => ({ ...b, cantidad: e.target.value }))}
                                            className="w-20 flex-shrink-0 text-sm border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                                        <select value={borrador.unidad}
                                            onChange={e => setBorrador(b => ({ ...b, unidad: e.target.value }))}
                                            className="flex-1 min-w-0 text-sm border border-gray-200 rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                                            <option value="">Sin unidad</option>
                                            {unidadesCon(borrador.unidad).map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    {colores.length > 0 && (
                                        <div className="flex flex-wrap gap-1 items-center">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider mr-0.5">¿Cuál?</span>
                                            {colores.map(c => {
                                                const puesto = borrador.color.toLowerCase() === c.toLowerCase();
                                                return (
                                                    <button key={c} type="button"
                                                        onClick={() => setBorrador(b => ({ ...b, color: puesto ? '' : c }))}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                                            puesto ? 'border-blue-500 bg-white text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}>
                                                        {tonoDe(c) && <span className="w-2.5 h-2.5 rounded-full border border-black/10"
                                                            style={{ backgroundColor: tonoDe(c)! }} />}
                                                        {c}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditando(null)}
                                            className="px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-200 rounded-xl">Cancelar</button>
                                        <button onClick={() => guardarEdicion(n)} disabled={!borrador.texto.trim()}
                                            className="flex-1 py-1.5 text-xs font-black bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl">
                                            Guardar
                                        </button>
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div key={n.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 last:border-0">
                                <button onClick={() => onToggleNote(n)}
                                    className="w-5 h-5 flex-shrink-0 rounded-md border-2 border-gray-300 hover:border-green-500 transition-colors" />
                                {/* Tocar el renglón lo abre para corregirlo. Antes solo se
                                    podía marcar como comprado o borrar: para cambiar 3 bultos
                                    por 5 tocaba borrarlo y escribirlo de nuevo. */}
                                <button onClick={() => abrirEdicion(n)} className="flex-1 min-w-0 text-left">
                                    <p className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">
                                        {n.color && tonoDe(n.color) && (
                                            <span className="w-2.5 h-2.5 rounded-full border border-black/10 flex-shrink-0"
                                                style={{ backgroundColor: tonoDe(n.color)! }} />
                                        )}
                                        <span className="truncate">{n.texto}</span>
                                    </p>
                                    {(n.cantidad != null || n.color) && (
                                        <p className="text-[11px] text-gray-400 truncate">
                                            {[n.cantidad != null ? `${n.cantidad} ${n.unidad ?? ''}`.trim() : null, n.color]
                                                .filter(Boolean).join(' · ')}
                                        </p>
                                    )}
                                </button>
                                <button onClick={() => abrirEdicion(n)}
                                    className="text-gray-300 hover:text-blue-500 px-1 flex-shrink-0 text-sm" title="Corregir">✎</button>
                                <button onClick={() => onDeleteNote(n)}
                                    className="text-gray-300 hover:text-red-500 px-1 flex-shrink-0 text-sm">✕</button>
                            </div>
                        );
                    })}
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
