
import React, { useMemo, useState } from 'react';
import { Item, Movement, OrderNote, Personnel } from '../types';
import { familiaDe, normStr } from '../utils/genus';
import { construirArbol } from '../utils/arbol';
import { PALETA, raizDeColor, tonoDe } from '../utils/colores';
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
    // El «+» abierto, con lo que se lleva escrito.
    const [anadiendoColor, setAnadiendoColor] = useState(false);
    const [colorNuevo, setColorNuevo] = useState('');

    const ponerColor = (c: string) => {
        const v = c.trim();
        if (!v) return;
        setBorrador(b => ({ ...b, color: v }));
        setAnadiendoColor(false);
        setColorNuevo('');
    };

    const abrirEdicion = (n: OrderNote) => {
        setEditando(n.id);
        setAnadiendoColor(false);
        setColorNuevo('');
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
                <h1 className="text-xl font-black text-tinta">🧾 Lista de pedidos</h1>
                <p className="text-xs text-tinta-tenue mt-0.5">
                    Lo que hay que comprar. No toca el inventario: acá se anota, nada más.
                </p>
            </div>

            {/* ── La libreta ─────────────────────────────────────────────── */}
            <div className="bg-papel border border-papel-borde rounded-2xl p-3 space-y-2">
                <div className="flex gap-1.5">
                    <input type="text" value={texto}
                        onChange={e => setTexto(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
                        placeholder="Ej: lechada gris, clavos de 3"
                        className="flex-1 min-w-0 text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca" />
                </div>
                <div className="flex gap-1.5">
                    <input type="number" value={cantidad} min={0}
                        onChange={e => setCantidad(e.target.value)}
                        placeholder="Cuántos"
                        className="w-24 text-sm border border-papel-borde rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-marca" />
                    <input type="text" value={unidad}
                        onChange={e => setUnidad(e.target.value)}
                        placeholder="bultos, kg…"
                        className="flex-1 min-w-0 text-sm border border-papel-borde rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-marca" />
                    <button onClick={agregar} disabled={!texto.trim()}
                        className="px-4 py-2 text-sm font-black bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-tenue text-tinta rounded-xl flex-shrink-0">
                        Anotar
                    </button>
                </div>
            </div>

            {pendientes.length === 0 && compradas.length === 0 ? (
                <div className="text-center py-12 text-tinta-tenue">
                    <p className="text-3xl mb-2">🧾</p>
                    <p className="text-sm">Todavía no hay nada anotado.</p>
                </div>
            ) : (
                <div className="bg-papel border border-papel-borde rounded-2xl overflow-hidden">
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
                            const delArbol = construirArbol(
                                    items.filter(i => normStr(i.familia?.trim() || familiaDe(i.name)) === normStr(familia)))
                                .flatMap(a => a.ramas.map(r => r.variante));
                            const deLaFamilia = (f?: string, texto = '') =>
                                normStr(f?.trim() || familiaDe(texto)) === normStr(familia);
                            // Lo que ya se pidió antes de esta misma familia cuenta como
                            // opción, aunque en la bodega no exista todavía. Una lista de
                            // pedidos es justamente para lo que NO hay: escribir "blanco"
                            // una vez lo deja de chip para la próxima. Sale gratis — las
                            // notas ya guardan color y familia, no hay nada que guardar.
                            const yaPedidos = notes
                                .filter(o => o.id !== n.id && o.color?.trim() && deLaFamilia(o.familia, o.texto))
                                .map(o => o.color!.trim());
                            const colores: string[] = [];
                            const vistos = new Set<string>();
                            for (const v of [...delArbol, ...yaPedidos, borrador.color.trim()]) {
                                if (!v || v === '—') continue;
                                const raiz = raizDeColor(v);
                                if (vistos.has(raiz)) continue;   // "Blanca" y "Blanco" son uno solo
                                vistos.add(raiz);
                                colores.push(v);
                            }
                            // Los de la paleta que esta familia todavía no tiene: para
                            // escoger "Blanco" sin escribirlo, y ya pintado.
                            const restoDeLaPaleta = PALETA.filter(c => !vistos.has(raizDeColor(c)));
                            return (
                                <div key={n.id} className="px-3 py-2.5 border-b border-papel-borde last:border-0 bg-marca-suave/40 space-y-2">
                                    <input type="text" value={borrador.texto} autoFocus
                                        onChange={e => setBorrador(b => ({ ...b, texto: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(n); if (e.key === 'Escape') setEditando(null); }}
                                        className="w-full text-sm font-semibold border border-marca-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                    <div className="flex gap-1.5">
                                        <input type="number" value={borrador.cantidad} min={0} placeholder="Cant."
                                            onChange={e => setBorrador(b => ({ ...b, cantidad: e.target.value }))}
                                            className="w-20 flex-shrink-0 text-sm border border-papel-borde rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-marca bg-papel" />
                                        <select value={borrador.unidad}
                                            onChange={e => setBorrador(b => ({ ...b, unidad: e.target.value }))}
                                            className="flex-1 min-w-0 text-sm border border-papel-borde rounded-xl px-2 py-2 focus:outline-none focus:ring-2 focus:ring-marca bg-papel">
                                            <option value="">Sin unidad</option>
                                            {unidadesCon(borrador.unidad).map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    {/* La fila va SIEMPRE, aunque la familia no tenga ni una
                                        variante: si no, para la Estopa no había dónde poner
                                        nada. Y el «+» va de primero, a la izquierda. */}
                                    <div className="flex flex-wrap gap-1 items-center">
                                        <span className="text-[10px] font-black text-tinta-tenue uppercase tracking-wider mr-0.5">¿Cuál?</span>
                                        <button type="button"
                                            onClick={() => { setAnadiendoColor(a => !a); setColorNuevo(''); }}
                                            title="Añadir un color que no está"
                                            className={`w-6 h-6 flex items-center justify-center rounded-full border text-sm font-black leading-none transition-all ${
                                                anadiendoColor ? 'border-marca bg-marca text-tinta' : 'border-papel-borde bg-papel text-tinta-tenue hover:border-marca hover:text-marca-oscuro'}`}>
                                            +
                                        </button>
                                        {colores.map(c => {
                                            const puesto = raizDeColor(borrador.color) === raizDeColor(c);
                                            return (
                                                <button key={c} type="button"
                                                    onClick={() => setBorrador(b => ({ ...b, color: puesto ? '' : c }))}
                                                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                                        puesto ? 'border-marca bg-papel text-marca-oscuro' : 'border-papel-borde bg-papel text-tinta-suave hover:border-marca-borde'}`}>
                                                    {tonoDe(c) && <span className="w-2.5 h-2.5 rounded-full border border-black/10"
                                                        style={{ backgroundColor: tonoDe(c)! }} />}
                                                    {c}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {anadiendoColor && (
                                        <div className="rounded-xl border border-dashed border-marca-borde bg-papel p-2 space-y-2">
                                            <div className="flex gap-1.5">
                                                <input type="text" value={colorNuevo} autoFocus
                                                    placeholder="Escribe el color (ej: blanco)"
                                                    onChange={e => setColorNuevo(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') { e.preventDefault(); ponerColor(colorNuevo); }
                                                        if (e.key === 'Escape') { setAnadiendoColor(false); setColorNuevo(''); }
                                                    }}
                                                    className="flex-1 min-w-0 text-sm border border-papel-borde rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-marca" />
                                                <button type="button" onClick={() => ponerColor(colorNuevo)}
                                                    disabled={!colorNuevo.trim()}
                                                    className="px-3 py-1.5 text-xs font-black bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-tenue text-tinta rounded-xl flex-shrink-0">
                                                    Poner
                                                </button>
                                            </div>
                                            {/* O tocar uno de los que la app ya sabe pintar, sin escribirlo. */}
                                            {restoDeLaPaleta.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {restoDeLaPaleta.map(c => (
                                                        <button key={c} type="button" onClick={() => ponerColor(c)}
                                                            className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border border-papel-borde bg-papel text-tinta-suave hover:border-marca">
                                                            <span className="w-2.5 h-2.5 rounded-full border border-black/10"
                                                                style={{ backgroundColor: tonoDe(c)! }} />
                                                            {c}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditando(null)}
                                            className="px-3 py-1.5 text-xs font-bold text-tinta-tenue border border-papel-borde rounded-xl">Cancelar</button>
                                        <button onClick={() => guardarEdicion(n)} disabled={!borrador.texto.trim()}
                                            className="flex-1 py-1.5 text-xs font-black bg-marca hover:bg-marca-fuerte disabled:bg-papel-borde disabled:text-tinta-tenue text-tinta rounded-xl">
                                            Guardar
                                        </button>
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div key={n.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-papel-borde last:border-0">
                                <button onClick={() => onToggleNote(n)}
                                    className="w-5 h-5 flex-shrink-0 rounded-md border-2 border-papel-borde hover:border-bien transition-colors" />
                                {/* Tocar el renglón lo abre para corregirlo. Antes solo se
                                    podía marcar como comprado o borrar: para cambiar 3 bultos
                                    por 5 tocaba borrarlo y escribirlo de nuevo. */}
                                <button onClick={() => abrirEdicion(n)} className="flex-1 min-w-0 text-left">
                                    <p className="text-sm font-semibold text-tinta truncate flex items-center gap-1.5">
                                        {n.color && tonoDe(n.color) && (
                                            <span className="w-2.5 h-2.5 rounded-full border border-black/10 flex-shrink-0"
                                                style={{ backgroundColor: tonoDe(n.color)! }} />
                                        )}
                                        <span className="truncate">{n.texto}</span>
                                    </p>
                                    {(n.cantidad != null || n.color) && (
                                        <p className="text-[11px] text-tinta-tenue truncate">
                                            {[n.cantidad != null ? `${n.cantidad} ${n.unidad ?? ''}`.trim() : null, n.color]
                                                .filter(Boolean).join(' · ')}
                                        </p>
                                    )}
                                </button>
                                <button onClick={() => abrirEdicion(n)}
                                    className="text-tinta-tenue hover:text-marca-oscuro px-1 flex-shrink-0 text-sm" title="Corregir">✎</button>
                                <button onClick={() => onDeleteNote(n)}
                                    className="text-tinta-tenue hover:text-alerta px-1 flex-shrink-0 text-sm">✕</button>
                            </div>
                        );
                    })}
                    {compradas.length > 0 && (
                        <div className="bg-papel-hondo px-3 py-2">
                            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-wider mb-1">Ya comprado</p>
                            {compradas.map(n => (
                                <div key={n.id} className="flex items-center gap-2 py-1">
                                    <button onClick={() => onToggleNote(n)}
                                        className="w-5 h-5 flex-shrink-0 rounded-md bg-bien text-papel text-[11px] font-black">✓</button>
                                    <p className="flex-1 min-w-0 text-sm text-tinta-tenue line-through truncate">{n.texto}</p>
                                    <button onClick={() => onDeleteNote(n)}
                                        className="text-tinta-tenue hover:text-alerta px-1 flex-shrink-0 text-sm">✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {pendientes.length > 0 && (
                <button onClick={compartir}
                    className="w-full py-2.5 text-sm font-black bg-bien hover:bg-bien text-papel rounded-xl">
                    📲 Compartir la lista
                </button>
            )}

            {/* ── Lo que la app propone ──────────────────────────────────── */}
            <div className="pt-2 space-y-2">
                <div>
                    <h2 className="text-sm font-black text-tinta">Lo que más se gastó</h2>
                    <p className="text-[11px] text-tinta-tenue mb-2">
                        Para decidir qué pedir. El número del nombre es la medida, no la cantidad.
                    </p>
                    <PeriodPicker value={periodo} onChange={setPeriodo} onBehaviorLog={onBehaviorLog} />
                </div>

                {sugerencias.length === 0 ? (
                    <p className="text-xs text-tinta-tenue py-4 text-center">Sin consumo en este período.</p>
                ) : sugerencias.map(f => (
                    <div key={f.familia} className="bg-papel border border-papel-borde rounded-2xl overflow-hidden">
                        <div className="px-3 py-2 bg-papel-hondo border-b border-papel-borde flex items-center gap-2">
                            <p className="text-sm font-black text-tinta flex-1 truncate">{f.familia}</p>
                            <span className="text-[11px] font-bold text-tinta-tenue">{f.total} gastados</span>
                        </div>
                        {f.materiales.map(mat => (
                            <div key={mat.material} className="px-3 py-2 border-b border-papel-borde last:border-0">
                                {mat.material !== '—' && (
                                    <p className="text-[10px] font-black text-marca-oscuro uppercase tracking-wider mb-1">{mat.material}</p>
                                )}
                                {mat.medidas.map(m => (
                                    <div key={m.medida} className="flex items-center gap-2 py-1">
                                        <span className="text-xs font-bold text-tinta-suave w-12 flex-shrink-0">
                                            {m.medida === '—' ? '' : m.medida}
                                        </span>
                                        <span className="flex-1 text-xs text-tinta-tenue">{m.unidades} {m.unidad}</span>
                                        <button
                                            onClick={() => {
                                                const t = [f.familia, mat.material !== '—' ? mat.material : '', m.medida !== '—' ? m.medida : '']
                                                    .filter(Boolean).join(' ');
                                                onAddNote(t, m.unidades, m.unidad, f.familia);
                                                onBehaviorLog?.('ACTION', `Pasó a la lista de pedidos: ${t}`);
                                            }}
                                            className="text-[10px] font-black px-2 py-1 rounded-lg border border-papel-borde text-tinta-tenue hover:border-marca hover:text-marca-oscuro flex-shrink-0">
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
