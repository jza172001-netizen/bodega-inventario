import React, { useMemo, useState } from 'react';
import { Item } from '../types';
import { Arbol, Nodo, caminosDe, construirRuta, partirRuta } from '../utils/arbol';
import { looseMatch } from '../utils/genus';
import { denominacionesDe, medidaDe, rutaSugerida, seMideEnPulgadas } from '../utils/medida';
import {
    describir, familiaEfectiva, moverGenero, ponerFamilia, ponerMedida, ponerRuta,
    quitarGenero, renombrarFamilia, renombrarGenero,
} from '../core/organizar';

/**
 * Organizar la bodega a mano: géneros, familias y pulgadas.
 *
 *   📂 Tubería
 *      📂 Accesorios
 *         Codos → 1/2" · 2" · 4"
 *         Y     → 2" · 4"
 *      Tubos → Naranja → 2"
 *
 * Todo pasa por una VISTA PREVIA antes de guardar: qué ítems cambian y cómo
 * quedan. Nada se aplica a escondidas, y nada toca cantidades — reorganizar no
 * es mover inventario. Se guarda ítem por ítem con `onEditItem`, que es la
 * cola durable y la bitácora de siempre.
 *
 * La lógica vive en `core/organizar.ts`, probada sin pantalla; esto solo pinta
 * y pregunta.
 */
interface Props {
    items: Item[];
    onEditItem: (item: Item) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

interface Propuesta { titulo: string; cambios: Item[] }

const boton = 'text-[10px] font-bold px-2 py-0.5 rounded-full border border-papel-borde text-tinta-suave hover:border-tinta-tenue bg-papel flex-shrink-0';

const NUEVO = '__nuevo__';

export const OrganizarBodega: React.FC<Props> = ({ items, onEditItem, onBehaviorLog }) => {
    const [buscar, setBuscar] = useState('');
    const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
    const [marcados, setMarcados] = useState<Set<string>>(new Set());
    const [propuesta, setPropuesta] = useState<Propuesta | null>(null);

    const filtrados = useMemo(() => {
        const q = buscar.trim();
        if (!q) return items;
        return items.filter(i => looseMatch(i.name, q) || looseMatch(familiaEfectiva(i), q) || looseMatch(i.ruta ?? '', q));
    }, [items, buscar]);

    const raiz = useMemo(() => construirRuta(filtrados), [filtrados]);
    const caminos = useMemo(() => caminosDe(construirRuta(items)), [items]);
    const familias = useMemo(() => {
        const vistas = new Map<string, { nombre: string; ruta: string }>();
        for (const i of items) {
            const f = familiaEfectiva(i);
            if (!vistas.has(f.toLowerCase())) vistas.set(f.toLowerCase(), { nombre: f, ruta: i.ruta ?? '' });
        }
        return [...vistas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }, [items]);

    const abierto = (llave: string) => !!buscar.trim() || abiertos.has(llave);
    const alternar = (llave: string) => setAbiertos(prev => {
        const s = new Set(prev);
        s.has(llave) ? s.delete(llave) : s.add(llave);
        return s;
    });
    const marcar = (ids: string[], si: boolean) => setMarcados(prev => {
        const s = new Set(prev);
        ids.forEach(id => (si ? s.add(id) : s.delete(id)));
        return s;
    });

    /** Si no cambia nada, se dice y no se abre una vista previa vacía. */
    const proponer = (titulo: string, cambios: Item[]) => {
        if (cambios.length === 0) { window.alert('No hay nada que cambiar: ya está así.'); return; }
        setPropuesta({ titulo, cambios });
    };

    const guardar = () => {
        if (!propuesta) return;
        propuesta.cambios.forEach(onEditItem);
        onBehaviorLog?.('ACTION', `Organizar: ${propuesta.titulo} (${propuesta.cambios.length} ítems)`);
        setPropuesta(null);
        setMarcados(new Set());
    };

    const pedir = (pregunta: string, inicial = ''): string | null => {
        const r = window.prompt(pregunta, inicial)?.trim();
        return r ? r : null;
    };

    // ── Acciones ──────────────────────────────────────────────────────────

    const renombrarG = (n: Nodo) => {
        const nuevo = pedir(`Nuevo nombre para el género «${n.nombre}»:`, n.nombre);
        if (nuevo) proponer(`Renombrar género «${n.nombre}» → «${nuevo}»`, renombrarGenero(items, n.camino, nuevo));
    };

    const moverG = (n: Nodo, destino: string) => {
        const padre = destino === NUEVO ? pedir('¿Dentro de qué género? (use « / » para varios niveles)') : destino;
        if (padre === null) return;
        proponer(`Mover «${n.nombre}» a ${padre || 'la raíz'}`, moverGenero(items, n.camino, padre));
    };

    const quitarG = (n: Nodo) =>
        proponer(`Quitar el nivel «${n.nombre}» (lo de adentro sube un nivel)`, quitarGenero(items, n.camino));

    const renombrarF = (a: Arbol) => {
        const nuevo = pedir(`Nuevo nombre para la familia «${a.familia}»:`, a.familia);
        if (!nuevo) return;
        const corregir = window.confirm(`¿Corregir también la primera palabra de cada nombre a «${nuevo}»?\n(Ej.: «Codo 2"» → «${nuevo} 2"»)`);
        proponer(`Renombrar familia «${a.familia}» → «${nuevo}»`, renombrarFamilia(items, a.familia, nuevo, corregir));
    };

    const aGenero = (ids: string[], destino: string, que: string) => {
        const ruta = destino === NUEVO ? pedir('Nombre del género nuevo (ej. «Tubería / Accesorios»):') : destino;
        if (ruta === null) return;
        proponer(`Poner ${que} en ${ruta || 'la raíz'}`, ponerRuta(items, ids, ruta));
    };

    const aFamilia = (ids: string[], destino: string) => {
        const nombre = destino === NUEVO ? pedir('Nombre de la familia nueva:') : destino;
        if (!nombre) return;
        // La familia existente vive en un género: los que llegan se van con ella,
        // para que la familia no quede partida en dos sitios del árbol.
        const existente = familias.find(f => f.nombre.toLowerCase() === nombre.toLowerCase());
        const corregir = window.confirm(`¿Corregir la primera palabra de cada nombre a «${nombre}»?`);
        proponer(`Pasar ${ids.length} ítem(s) a la familia «${nombre}»`,
            ponerFamilia(items, ids, nombre, { ruta: existente ? existente.ruta : undefined, corregirNombre: corregir }));
    };

    const medida = (i: Item, m: string) => {
        const cambiado = ponerMedida(i, m);
        if (!cambiado) return;
        onEditItem(cambiado);
        onBehaviorLog?.('ACTION', `Organizar: medida ${m} a «${i.name}»`);
    };

    // ── Pintar ────────────────────────────────────────────────────────────

    const selectorGenero = (onElegir: (v: string) => void, etiqueta: string, excluir?: string) => (
        <select value="" onChange={e => { if (e.target.value !== '') onElegir(e.target.value === '__raiz__' ? '' : e.target.value); }}
            className="text-[10px] border border-papel-borde rounded-full px-1.5 py-0.5 bg-papel text-tinta-suave max-w-[9rem] flex-shrink-0">
            <option value="">{etiqueta}</option>
            <option value="__raiz__">— Ninguno (raíz)</option>
            {caminos.filter(c => c !== excluir).map(c => <option key={c} value={c}>{partirRuta(c).join(' › ')}</option>)}
            <option value={NUEVO}>➕ Género nuevo…</option>
        </select>
    );

    const familia = (a: Arbol, camino: string) => {
        const llave = `f:${camino}:${a.familia}`;
        const suyos = a.ramas.flatMap(r => r.items);
        const ids = suyos.map(i => i.id);
        const todosMarcados = ids.every(id => marcados.has(id));
        const enPulgadas = seMideEnPulgadas(a.familia);
        const escalera = enPulgadas ? denominacionesDe(suyos, undefined, a.familia) : [];
        const sugerida = !camino ? rutaSugerida(a.familia) : null;
        return (
            <div key={llave} className="border-b border-papel-borde last:border-0">
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <input type="checkbox" checked={todosMarcados} onChange={e => marcar(ids, e.target.checked)} className="flex-shrink-0" />
                    <button onClick={() => alternar(llave)} className="flex-1 min-w-0 text-left">
                        <span className="text-sm font-bold text-tinta truncate">{abierto(llave) ? '▾' : '▸'} {a.familia}</span>
                        <span className="text-[10px] text-tinta-tenue ml-1.5">{a.cuantos} · {a.total} disp.</span>
                    </button>
                    <button onClick={() => renombrarF(a)} className={boton}>✎</button>
                    {selectorGenero(v => aGenero(ids, v, `la familia «${a.familia}»`), '📂 →', camino)}
                </div>
                {sugerida && (
                    <button onClick={() => aGenero(ids, sugerida, `la familia «${a.familia}»`)}
                        className="ml-8 mb-1.5 text-[10px] font-bold text-marca-oscuro bg-marca-suave/50 rounded-full px-2 py-0.5">
                        💡 ¿Va en {partirRuta(sugerida).join(' › ')}?
                    </button>
                )}
                {abierto(llave) && (
                    <div className="ml-7 pb-1.5 space-y-0.5">
                        {suyos.map(i => {
                            const sinMedida = enPulgadas && !medidaDe(i.name);
                            return (
                                <div key={i.id} className="space-y-0.5">
                                    <label className="flex items-center gap-2 text-xs text-tinta-suave py-0.5">
                                        <input type="checkbox" checked={marcados.has(i.id)} onChange={e => marcar([i.id], e.target.checked)} />
                                        <span className="flex-1 min-w-0 truncate">{i.name}</span>
                                        <span className="text-[10px] text-tinta-tenue flex-shrink-0">{i.quantity} {i.unit}</span>
                                    </label>
                                    {/* Sin medida en una familia que se mide en pulgadas: la escalera,
                                        con las que ya tiene la familia, para no escribirla a mano. */}
                                    {sinMedida && (
                                        <div className="flex flex-wrap gap-1 pl-6">
                                            <span className="text-[10px] text-atencion font-bold">¿Medida?</span>
                                            {escalera.map(m => (
                                                <button key={m} onClick={() => medida(i, m)}
                                                    className="text-[10px] font-black px-2 py-0.5 rounded-full border border-marca bg-papel hover:bg-marca">{m}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const contenido = (n: Nodo): React.ReactNode[] =>
        [
            ...n.hijos.map(h => ({ nombre: h.nombre, render: () => genero(h) })),
            ...n.familias.map(f => ({ nombre: f.familia, render: () => familia(f, n.camino) })),
        ]
            .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
            .map(e => e.render());

    const genero = (n: Nodo) => {
        const llave = `g:${n.camino}`;
        return (
            <div key={llave} className="rounded-xl border border-marca/40 bg-papel overflow-hidden">
                <div className="flex items-center gap-1.5 px-2 py-2 bg-marca-suave/40">
                    <button onClick={() => alternar(llave)} className="flex-1 min-w-0 text-left">
                        <span className="text-sm font-black text-marca-oscuro truncate">{abierto(llave) ? '▾' : '▸'} 📂 {n.nombre}</span>
                        <span className="text-[10px] text-tinta-tenue ml-1.5">{n.cuantos} ítems</span>
                    </button>
                    <button onClick={() => renombrarG(n)} className={boton}>✎</button>
                    {selectorGenero(v => moverG(n, v), '↗', n.camino)}
                    <button onClick={() => quitarG(n)} className={boton} title="Quitar este nivel">✕</button>
                </div>
                {abierto(llave) && <div className="pl-3 pr-1 py-1 space-y-1">{contenido(n)}</div>}
            </div>
        );
    };

    const ids = [...marcados];

    return (
        <div className="space-y-3">
            <p className="text-xs text-tinta-tenue leading-snug">
                Géneros → familias → medida. Ej.: <strong>Tubería › Accesorios › Codos › 2"</strong>.
                Todo muestra antes qué cambia, y nada toca cantidades.
            </p>

            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar ítem, familia o género…"
                className="w-full px-3 py-2 text-sm border border-papel-borde rounded-lg bg-papel" autoComplete="off" />

            {ids.length > 0 && (
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 rounded-xl border border-marca bg-marca-suave px-2.5 py-2">
                    <span className="text-[11px] font-black text-tinta">{ids.length} marcado(s)</span>
                    <select value="" onChange={e => { if (e.target.value) aFamilia(ids, e.target.value); }}
                        className="text-[10px] border border-papel-borde rounded-full px-1.5 py-0.5 bg-papel max-w-[9rem]">
                        <option value="">→ a la familia…</option>
                        {familias.map(f => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
                        <option value={NUEVO}>➕ Familia nueva…</option>
                    </select>
                    {selectorGenero(v => aGenero(ids, v, `${ids.length} ítem(s)`), '📂 → al género…')}
                    <button onClick={() => setMarcados(new Set())} className={boton}>Limpiar</button>
                </div>
            )}

            <div className="space-y-1.5">
                {contenido(raiz)}
                {filtrados.length === 0 && <p className="text-center text-sm text-tinta-tenue py-8">Nada coincide con «{buscar}».</p>}
            </div>

            {propuesta && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-3" onClick={() => setPropuesta(null)}>
                    <div className="bg-papel rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-papel-borde">
                            <p className="text-sm font-black text-tinta">{propuesta.titulo}</p>
                            <p className="text-[11px] text-tinta-tenue">Cambian {propuesta.cambios.length} ítem(s). Las cantidades no se tocan.</p>
                        </div>
                        <div className="px-4 py-2 overflow-y-auto space-y-1">
                            {describir(items, propuesta.cambios).map((linea, k) => (
                                <p key={k} className="text-[11px] text-tinta-suave leading-snug">• {linea}</p>
                            ))}
                        </div>
                        <div className="flex gap-2 px-4 py-3 border-t border-papel-borde">
                            <button onClick={() => setPropuesta(null)} className="px-4 py-2 text-xs font-bold text-tinta-tenue border border-papel-borde rounded-xl">Cancelar</button>
                            <button onClick={guardar} className="flex-1 py-2 text-xs font-black bg-bien text-papel rounded-xl">
                                Guardar {propuesta.cambios.length} cambio(s)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrganizarBodega;
