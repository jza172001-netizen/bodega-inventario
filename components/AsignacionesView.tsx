/**
 * AsignacionesView — ¿Dónde está?
 * ================================
 * Lo que está afuera SIN préstamo confirmado: el tercer estado que la app no
 * tenía. Antes un ítem estaba en bodega o prestado, y las 24 unidades del
 * Apéndice B.5 —«1 láser Total fuera → posible: Jesús → verificar»— no tenían
 * dónde vivir sin mentir.
 *
 * La pantalla dice las cosas como las dice Juli: nunca «lo tiene Jesús» si no
 * está confirmado. Y lo que no se sabe se escribe «No especificado».
 *
 * Resolver NO borra: cierra la asignación con qué pasó, y el movimiento que
 * corresponde entra al libro. Una posible asignación nunca se vuelve préstamo
 * sola: hace falta que una persona toque «La tiene…».
 */
import React, { useMemo, useState } from 'react';
import { Asignacion, CondicionAsignacion, EstadoAsignacion, Item, Personnel, Project } from '../types';
import { DatosAsignacion, ESTADOS, NO_ESPECIFICADO, Resolucion, estaAbierta } from '../core/custodia';

interface Props {
    asignaciones: Asignacion[];
    items: Item[];
    personnel: Personnel[];
    projects: Project[];
    /** Sin esto la pantalla es de solo mirar (visitante). */
    onCrear?: (d: DatosAsignacion) => boolean;
    onResolver?: (a: Asignacion, r: Resolucion) => boolean;
    onCorregir?: (a: Asignacion, cambios: Partial<Asignacion>) => void;
}

type Filtro = 'abiertas' | EstadoAsignacion | 'resueltas';

const COLOR: Record<EstadoAsignacion, string> = {
    confirmada: 'bg-bien-suave text-bien',
    posible: 'bg-atencion-suave text-atencion',
    pendiente_verificar: 'bg-alerta-suave text-alerta',
};

const CONDICION: Record<CondicionAsignacion, string> = {
    buena: 'Buena', mala: 'Mala', no_especificado: NO_ESPECIFICADO,
};

const MOTIVO: Record<string, string> = {
    confirmada_prestamo: 'Confirmada como préstamo',
    hallada_bodega: 'Hallada en bodega',
    hallada_obra: 'Hallada en una obra',
    perdida: 'Dada por perdida',
    duplicada: 'Estaba contada dos veces',
    corregida: 'Corregida',
};

const fecha = (d?: Date) => (d ? new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined);

const campo = 'w-full text-sm border border-papel-borde rounded-xl px-3 py-2 bg-papel focus:outline-none focus:ring-2 focus:ring-marca';
const etiqueta = 'text-[10px] font-black text-tinta-tenue uppercase tracking-wide';

export const AsignacionesView: React.FC<Props> = ({ asignaciones, items, personnel, projects, onCrear, onResolver, onCorregir }) => {
    const [filtro, setFiltro] = useState<Filtro>('abiertas');
    const [anotando, setAnotando] = useState(false);
    const [accion, setAccion] = useState<{ id: string; tipo: 'prestamo' | 'bodega' | 'obra' | 'perdida' | 'corregir' } | null>(null);

    const nombre = (id?: string) => (id ? personnel.find(p => p.id === id)?.name : undefined);
    const obra = (id?: string) => (id ? projects.find(p => p.id === id)?.name : undefined);
    const itemNombre = (id?: string) => (id ? items.find(i => i.id === id)?.name : undefined);
    const herramientas = useMemo(
        () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
        [items],
    );

    const abiertas = asignaciones.filter(estaAbierta);
    const cuenta = (e: EstadoAsignacion) => abiertas.filter(a => a.estado === e).reduce((s, a) => s + a.cantidad, 0);
    const visibles = asignaciones.filter(a => {
        if (filtro === 'resueltas') return !estaAbierta(a);
        if (!estaAbierta(a)) return false;
        return filtro === 'abiertas' || a.estado === filtro;
    });

    /** Cómo se dice, en las palabras de la regla de Juli. */
    const frase = (a: Asignacion): string => {
        const quien = a.posibleResponsable ?? nombre(a.personnelId);
        if (a.estado === 'confirmada') {
            const donde = [quien, obra(a.projectId), a.ubicacion].filter(Boolean).join(' · ');
            return `Confirmado: ${donde || NO_ESPECIFICADO}`;
        }
        if (a.estado === 'posible') return `Posible asignación: ${quien ?? NO_ESPECIFICADO} → verificar`;
        return quien ? `Falta por verificar (relacionado: ${quien})` : 'Falta por verificar: sin ubicación ni responsable';
    };

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
            <div>
                <h2 className="text-xl font-black text-tinta">¿Dónde está?</h2>
                <p className="text-xs text-tinta-tenue mt-0.5">
                    Lo que está afuera sin préstamo confirmado. No cuenta como stock de bodega ni como préstamo hasta que se resuelva.
                </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {(['pendiente_verificar', 'posible', 'confirmada'] as EstadoAsignacion[]).map(e => (
                    <button key={e} type="button" onClick={() => setFiltro(filtro === e ? 'abiertas' : e)}
                        className={`rounded-2xl border p-3 text-left transition-all ${filtro === e ? 'border-marca ring-2 ring-marca' : 'border-papel-borde bg-papel'}`}>
                        <div className="text-2xl font-black text-tinta">{cuenta(e)}</div>
                        <div className={`inline-block mt-1 text-[10px] font-black px-1.5 py-0.5 rounded-full ${COLOR[e]}`}>{ESTADOS[e]}</div>
                    </button>
                ))}
            </div>

            <div className="flex gap-2 overflow-x-auto">
                {(['abiertas', 'resueltas'] as Filtro[]).map(f => (
                    <button key={f} type="button" onClick={() => setFiltro(f)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${filtro === f ? 'bg-marca text-tinta' : 'bg-papel border border-papel-borde text-tinta-suave'}`}>
                        {f === 'abiertas' ? `Abiertas (${abiertas.length})` : `Resueltas (${asignaciones.length - abiertas.length})`}
                    </button>
                ))}
                {onCrear && (
                    <button type="button" onClick={() => setAnotando(v => !v)}
                        className="ml-auto px-3 py-1.5 rounded-full text-xs font-black bg-marca-fuerte text-papel whitespace-nowrap">
                        {anotando ? 'Cerrar' : '+ Anotar'}
                    </button>
                )}
            </div>

            {anotando && onCrear && (
                <FormAnotar items={herramientas} personnel={personnel} projects={projects}
                    onGuardar={d => { if (onCrear(d)) setAnotando(false); }} />
            )}

            {visibles.length === 0 && (
                <p className="text-sm text-tinta-tenue text-center py-8">
                    {filtro === 'resueltas' ? 'Todavía no se ha resuelto ninguna.' : 'Nada por ubicar en este grupo.'}
                </p>
            )}

            <ul className="space-y-2">
                {visibles.map(a => {
                    const abierta = estaAbierta(a);
                    const activa = accion?.id === a.id ? accion.tipo : null;
                    return (
                        <li key={a.id} className="bg-papel border border-papel-borde rounded-2xl p-4">
                            <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-tinta">
                                        {a.cantidad} × {a.descripcion}
                                        {a.itemId && itemNombre(a.itemId) !== a.descripcion && (
                                            <span className="font-semibold text-tinta-tenue"> · {itemNombre(a.itemId)}</span>
                                        )}
                                    </p>
                                    <p className="text-xs text-tinta-suave mt-0.5">{frase(a)}</p>
                                </div>
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap ${COLOR[a.estado]}`}>{ESTADOS[a.estado]}</span>
                            </div>

                            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px]">
                                <Dato t="Desde" v={a.desdeDesconocido ? NO_ESPECIFICADO : fecha(a.desde)} />
                                <Dato t="Estado físico" v={CONDICION[a.condicion]} />
                                {(a.projectId || a.ubicacion) && <Dato t="Dónde" v={[obra(a.projectId), a.ubicacion].filter(Boolean).join(' · ')} />}
                                {a.responsableAnterior && <Dato t="La tenía" v={a.responsableAnterior} />}
                                {a.entregadoPor && <Dato t="Entregó" v={a.entregadoPor} />}
                                {a.procedencia && <Dato t="De dónde sale" v={a.procedencia} />}
                            </dl>
                            {a.notas && <p className="text-[11px] text-tinta-tenue mt-1.5">{a.notas}</p>}

                            {!abierta && (
                                <p className="text-[11px] font-bold text-tinta-suave mt-2 border-t border-papel-borde pt-2">
                                    {MOTIVO[a.cierreMotivo ?? ''] ?? 'Cerrada'} · {fecha(a.cerradaEn)}{a.cerradaPor ? ` · ${a.cerradaPor}` : ''}
                                    {a.cierreNota && <span className="block font-normal text-tinta-tenue">{a.cierreNota}</span>}
                                </p>
                            )}

                            {abierta && onResolver && !activa && (
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    <Boton onClick={() => setAccion({ id: a.id, tipo: 'prestamo' })}>La tiene…</Boton>
                                    <Boton onClick={() => setAccion({ id: a.id, tipo: 'bodega' })}>Está en bodega</Boton>
                                    <Boton onClick={() => setAccion({ id: a.id, tipo: 'obra' })}>Está en una obra</Boton>
                                    <Boton onClick={() => setAccion({ id: a.id, tipo: 'perdida' })}>No existe / repetida</Boton>
                                    {onCorregir && <Boton onClick={() => setAccion({ id: a.id, tipo: 'corregir' })}>Corregir</Boton>}
                                </div>
                            )}

                            {activa && activa !== 'corregir' && onResolver && (
                                <FormResolver a={a} tipo={activa} items={herramientas} personnel={personnel} projects={projects}
                                    onCancelar={() => setAccion(null)}
                                    onConfirmar={r => { if (onResolver(a, r)) setAccion(null); }} />
                            )}
                            {activa === 'corregir' && onCorregir && (
                                <FormCorregir a={a} personnel={personnel} projects={projects}
                                    onCancelar={() => setAccion(null)}
                                    onGuardar={c => { onCorregir(a, c); setAccion(null); }} />
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

const Dato: React.FC<{ t: string; v?: string }> = ({ t, v }) => (
    <div className="min-w-0">
        <dt className="text-tinta-tenue">{t}</dt>
        <dd className="font-semibold text-tinta-suave truncate">{v || NO_ESPECIFICADO}</dd>
    </div>
);

const Boton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <button type="button" onClick={onClick}
        className="px-3 py-2 rounded-xl text-xs font-bold border border-papel-borde bg-papel-hondo text-tinta-suave hover:border-marca">
        {children}
    </button>
);

const SelectorItem: React.FC<{ items: Item[]; valor: string; onCambio: (v: string) => void; obligatorio?: boolean }> = ({ items, valor, onCambio, obligatorio }) => (
    <select className={campo} value={valor} onChange={e => onCambio(e.target.value)}>
        <option value="">{obligatorio ? '— ¿Cuál ítem es? —' : '— Todavía no se sabe cuál —'}</option>
        {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
    </select>
);

const FormAnotar: React.FC<{ items: Item[]; personnel: Personnel[]; projects: Project[]; onGuardar: (d: DatosAsignacion) => void }> = ({ items, personnel, projects, onGuardar }) => {
    const [d, setD] = useState<DatosAsignacion>({ descripcion: '', cantidad: 1, estado: 'pendiente_verificar' });
    const [desde, setDesde] = useState('');
    const pon = (c: Partial<DatosAsignacion>) => setD(prev => ({ ...prev, ...c }));
    return (
        <div className="bg-papel border border-marca rounded-2xl p-4 space-y-3">
            <div>
                <label className={etiqueta}>¿Qué es? *</label>
                <input className={campo} value={d.descripcion} placeholder="Ej: Nivel láser Total"
                    onChange={e => pon({ descripcion: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={etiqueta}>Cantidad *</label>
                    <input type="number" min={1} className={campo} value={d.cantidad}
                        onChange={e => pon({ cantidad: Math.max(1, Math.round(Number(e.target.value)) || 1) })} />
                </div>
                <div>
                    <label className={etiqueta}>Qué tan seguro</label>
                    <select className={campo} value={d.estado} onChange={e => pon({ estado: e.target.value as EstadoAsignacion })}>
                        {(Object.keys(ESTADOS) as EstadoAsignacion[]).map(e => <option key={e} value={e}>{ESTADOS[e]}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label className={etiqueta}>Ítem del inventario (opcional)</label>
                <SelectorItem items={items} valor={d.itemId ?? ''} onCambio={v => pon({ itemId: v || undefined })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={etiqueta}>Persona relacionada</label>
                    <select className={campo} value={d.personnelId ?? ''} onChange={e => pon({ personnelId: e.target.value || undefined })}>
                        <option value="">{NO_ESPECIFICADO}</option>
                        {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className={etiqueta}>…o como la dice la lista</label>
                    <input className={campo} value={d.posibleResponsable ?? ''} placeholder="Ej: Dani / William"
                        onChange={e => pon({ posibleResponsable: e.target.value })} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={etiqueta}>Obra</label>
                    <select className={campo} value={d.projectId ?? ''} onChange={e => pon({ projectId: e.target.value || undefined })}>
                        <option value="">{NO_ESPECIFICADO}</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className={etiqueta}>Lugar</label>
                    <input className={campo} value={d.ubicacion ?? ''} placeholder="Ej: contenedor"
                        onChange={e => pon({ ubicacion: e.target.value })} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={etiqueta}>Estado físico</label>
                    <select className={campo} value={d.condicion ?? 'no_especificado'} onChange={e => pon({ condicion: e.target.value as CondicionAsignacion })}>
                        {(Object.keys(CONDICION) as CondicionAsignacion[]).map(c => <option key={c} value={c}>{CONDICION[c]}</option>)}
                    </select>
                </div>
                <div>
                    <label className={etiqueta}>Desde (si se sabe)</label>
                    <input type="date" className={campo} value={desde} onChange={e => setDesde(e.target.value)} />
                </div>
            </div>
            <div>
                <label className={etiqueta}>De dónde sale el dato</label>
                <input className={campo} value={d.procedencia ?? ''} placeholder="Ej: Lista 4, 8 de septiembre"
                    onChange={e => pon({ procedencia: e.target.value })} />
            </div>
            <div>
                <label className={etiqueta}>Nota</label>
                <input className={campo} value={d.notas ?? ''} onChange={e => pon({ notas: e.target.value })} />
            </div>
            <button type="button" disabled={!d.descripcion.trim()}
                onClick={() => onGuardar({ ...d, desde: desde ? new Date(`${desde}T12:00:00`) : undefined })}
                className="w-full py-2.5 rounded-xl text-sm font-black bg-marca-fuerte text-papel disabled:opacity-40">
                Anotar
            </button>
        </div>
    );
};

const FormResolver: React.FC<{
    a: Asignacion; tipo: 'prestamo' | 'bodega' | 'obra' | 'perdida';
    items: Item[]; personnel: Personnel[]; projects: Project[];
    onCancelar: () => void; onConfirmar: (r: Resolucion) => void;
}> = ({ a, tipo, items, personnel, projects, onCancelar, onConfirmar }) => {
    const [itemId, setItemId] = useState(a.itemId ?? '');
    const [personaId, setPersonaId] = useState(a.personnelId ?? '');
    const [obraId, setObraId] = useState(a.projectId ?? '');
    const [cantidad, setCantidad] = useState(a.cantidad);
    const [entrego, setEntrego] = useState('');
    const [nota, setNota] = useState('');
    const [motivo, setMotivo] = useState<'perdida' | 'duplicada'>('perdida');
    const [lugar, setLugar] = useState(a.ubicacion ?? '');

    const listo = tipo === 'prestamo' ? !!itemId && !!personaId
        : tipo === 'bodega' ? !!itemId
        : tipo === 'obra' ? !!obraId || lugar.trim().length > 0
        : nota.trim().length > 0;

    const confirmar = () => {
        if (tipo === 'prestamo') onConfirmar({ tipo, itemId, personnelId: personaId, projectId: obraId || undefined, cantidad, entregadoPor: entrego, nota });
        else if (tipo === 'bodega') onConfirmar({ tipo, itemId, cantidad, nota });
        else if (tipo === 'obra') onConfirmar({ tipo, projectId: obraId || undefined, ubicacion: lugar, cantidad, nota });
        else onConfirmar({ tipo: motivo, cantidad, nota });
    };

    return (
        <div className="mt-3 border-t border-papel-borde pt-3 space-y-2">
            <p className="text-xs font-black text-tinta">
                {tipo === 'prestamo' ? 'Confirmar quién la tiene' : tipo === 'bodega' ? 'Apareció en la bodega'
                    : tipo === 'obra' ? 'Apareció en una obra, sin responsable' : '¿Por qué se cierra?'}
            </p>
            {tipo === 'obra' && (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className={etiqueta}>Obra</label>
                        <select className={campo} value={obraId} onChange={e => setObraId(e.target.value)}>
                            <option value="">{NO_ESPECIFICADO}</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={etiqueta}>Lugar</label>
                        <input className={campo} value={lugar} placeholder="Ej: Salvador Bahía" onChange={e => setLugar(e.target.value)} />
                    </div>
                </div>
            )}
            {(tipo === 'prestamo' || tipo === 'bodega') && (
                <div>
                    <label className={etiqueta}>Ítem del inventario *</label>
                    <SelectorItem items={items} valor={itemId} onCambio={setItemId} obligatorio />
                </div>
            )}
            {tipo === 'prestamo' && (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={etiqueta}>La tiene *</label>
                            <select className={campo} value={personaId} onChange={e => setPersonaId(e.target.value)}>
                                <option value="">— ¿Quién? —</option>
                                {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={etiqueta}>Obra</label>
                            <select className={campo} value={obraId} onChange={e => setObraId(e.target.value)}>
                                <option value="">{NO_ESPECIFICADO}</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className={etiqueta}>Quién la entregó (si se sabe)</label>
                        <input className={campo} value={entrego} onChange={e => setEntrego(e.target.value)} />
                    </div>
                </>
            )}
            {tipo === 'perdida' && (
                <div className="flex gap-2">
                    {(['perdida', 'duplicada'] as const).map(m => (
                        <button key={m} type="button" onClick={() => setMotivo(m)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold border ${motivo === m ? 'border-marca bg-marca-suave text-marca-oscuro' : 'border-papel-borde text-tinta-suave'}`}>
                            {m === 'perdida' ? 'No existe / se perdió' : 'Estaba repetida'}
                        </button>
                    ))}
                </div>
            )}
            {a.cantidad > 1 && (
                <div>
                    <label className={etiqueta}>¿Cuántas de las {a.cantidad}?</label>
                    <input type="number" min={1} max={a.cantidad} className={campo} value={cantidad}
                        onChange={e => setCantidad(Math.min(a.cantidad, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
                    {cantidad < a.cantidad && (
                        <p className="text-[11px] text-atencion font-bold mt-1">Las otras {a.cantidad - cantidad} siguen abiertas.</p>
                    )}
                </div>
            )}
            <div>
                <label className={etiqueta}>Nota {tipo === 'perdida' ? '* (obligatoria)' : '(opcional)'}</label>
                <input className={campo} value={nota} onChange={e => setNota(e.target.value)} />
            </div>
            <div className="flex gap-2">
                <button type="button" onClick={onCancelar} className="flex-1 py-2 rounded-xl text-sm font-bold bg-papel-hondo text-tinta-suave">Cancelar</button>
                <button type="button" disabled={!listo} onClick={confirmar}
                    className="flex-1 py-2 rounded-xl text-sm font-black bg-bien text-papel disabled:opacity-40">Confirmar</button>
            </div>
        </div>
    );
};

const FormCorregir: React.FC<{
    a: Asignacion; personnel: Personnel[]; projects: Project[];
    onCancelar: () => void; onGuardar: (c: Partial<Asignacion>) => void;
}> = ({ a, personnel, projects, onCancelar, onGuardar }) => {
    const [c, setC] = useState<Partial<Asignacion>>({
        estado: a.estado, personnelId: a.personnelId, posibleResponsable: a.posibleResponsable,
        projectId: a.projectId, ubicacion: a.ubicacion, condicion: a.condicion, notas: a.notas,
    });
    const pon = (x: Partial<Asignacion>) => setC(prev => ({ ...prev, ...x }));
    return (
        <div className="mt-3 border-t border-papel-borde pt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={etiqueta}>Qué tan seguro</label>
                    <select className={campo} value={c.estado} onChange={e => pon({ estado: e.target.value as EstadoAsignacion })}>
                        {(Object.keys(ESTADOS) as EstadoAsignacion[]).map(e => <option key={e} value={e}>{ESTADOS[e]}</option>)}
                    </select>
                </div>
                <div>
                    <label className={etiqueta}>Estado físico</label>
                    <select className={campo} value={c.condicion} onChange={e => pon({ condicion: e.target.value as CondicionAsignacion })}>
                        {(Object.keys(CONDICION) as CondicionAsignacion[]).map(x => <option key={x} value={x}>{CONDICION[x]}</option>)}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={etiqueta}>Persona relacionada</label>
                    <select className={campo} value={c.personnelId ?? ''} onChange={e => pon({ personnelId: e.target.value || undefined })}>
                        <option value="">{NO_ESPECIFICADO}</option>
                        {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className={etiqueta}>…o como la dice la lista</label>
                    <input className={campo} value={c.posibleResponsable ?? ''} onChange={e => pon({ posibleResponsable: e.target.value || undefined })} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={etiqueta}>Obra</label>
                    <select className={campo} value={c.projectId ?? ''} onChange={e => pon({ projectId: e.target.value || undefined })}>
                        <option value="">{NO_ESPECIFICADO}</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className={etiqueta}>Lugar</label>
                    <input className={campo} value={c.ubicacion ?? ''} onChange={e => pon({ ubicacion: e.target.value || undefined })} />
                </div>
            </div>
            <div>
                <label className={etiqueta}>Nota</label>
                <input className={campo} value={c.notas ?? ''} onChange={e => pon({ notas: e.target.value || undefined })} />
            </div>
            <div className="flex gap-2">
                <button type="button" onClick={onCancelar} className="flex-1 py-2 rounded-xl text-sm font-bold bg-papel-hondo text-tinta-suave">Cancelar</button>
                <button type="button" onClick={() => onGuardar(c)} className="flex-1 py-2 rounded-xl text-sm font-black bg-marca-fuerte text-papel">Guardar</button>
            </div>
        </div>
    );
};
