
import React, { useMemo, useState } from 'react';
import { Item, Movement, Personnel, AuditLog } from '../types';
import * as db from '../services/supabaseService';

interface Props {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    auditLogs: AuditLog[];
}

/** Una diferencia entre lo que muestra este teléfono y lo que hay en la nube. */
interface Diferencia {
    que: string;
    detalle: string;
}

/**
 * Cotejo: los datos que hay contra lo que dice la bitácora.
 *
 * Esto salió porque al bodeguero se le ocurrió mirar, y encontró dos cosas que
 * llevaban meses ahí: 19 ítems y 4 trabajadores que él había borrado y que
 * volvieron solos, y dos trabajadores metidos en una cuadrilla que él nunca
 * armó. Ninguna de las dos dejó rastro.
 *
 * Que se vea sin tener que acordarse de buscarlo. Un dato que aparece solo se
 * nota el mismo día, no dos meses después.
 */
export const CotejoPanel: React.FC<Props> = ({ items, movements, personnel, auditLogs }) => {
    /**
     * El segundo cotejo, y el que la bitácora no puede hacer: lo que muestra
     * ESTE teléfono contra lo que hay de verdad en la base.
     *
     * Ninguna bitácora avisa de esto. Si el teléfono dice que hay 5 lechadas y
     * la base dice 3, las dos cosas están "bien" según su propia historia: la
     * diferencia solo se ve poniéndolas una al lado de la otra. Y es la que
     * arruina un inventario, porque se despacha contra un número que no existe.
     */
    const [contraste, setContraste] = useState<{ estado: 'idle' | 'mirando' | 'listo' | 'error'; difs: Diferencia[] }>(
        { estado: 'idle', difs: [] });

    const cotejarConLaBase = async () => {
        setContraste({ estado: 'mirando', difs: [] });
        try {
            const [remItems, remMovs, remPers] = await Promise.all([
                db.fetchItems(), db.fetchMovements(), db.fetchPersonnel(),
            ]);
            const difs: Diferencia[] = [];

            const remItemById = new Map(remItems.map(i => [i.id, i]));
            for (const i of items) {
                const r = remItemById.get(i.id);
                if (!r) { difs.push({ que: `Ítem "${i.name}"`, detalle: 'está en el teléfono y NO en la base' }); continue; }
                if (Number(r.quantity) !== Number(i.quantity)) {
                    difs.push({ que: `Ítem "${i.name}"`, detalle: `el teléfono dice ${i.quantity} ${i.unit} y la base dice ${r.quantity}` });
                }
                if (r.name.trim() !== i.name.trim()) {
                    difs.push({ que: `Ítem "${i.name}"`, detalle: `en la base se llama "${r.name}"` });
                }
            }
            const localItemIds = new Set(items.map(i => i.id));
            for (const r of remItems) {
                if (!localItemIds.has(r.id)) difs.push({ que: `Ítem "${r.name}"`, detalle: 'está en la base y NO en el teléfono' });
            }

            // Los préstamos abiertos son lo que hay que reclamar: si no coinciden,
            // alguien va a reclamar una herramienta que ya volvió, o al revés.
            const abiertos = (ms: Movement[]) => new Set(ms.filter(m => m.isLoan && !m.isReturned).map(m => m.id));
            const locAbiertos = abiertos(movements), remAbiertos = abiertos(remMovs);
            const nombreItem = (id: string) => items.find(x => x.id === id)?.name ?? '?';
            for (const m of movements) {
                if (locAbiertos.has(m.id) && !remAbiertos.has(m.id)) {
                    difs.push({ que: `Préstamo de "${nombreItem(m.itemId)}"`, detalle: 'el teléfono lo da por afuera; la base, no' });
                }
            }
            for (const m of remMovs) {
                if (remAbiertos.has(m.id) && !locAbiertos.has(m.id)) {
                    difs.push({ que: `Préstamo de "${nombreItem(m.itemId)}"`, detalle: 'la base lo da por afuera; el teléfono, no' });
                }
            }

            const remPerIds = new Set(remPers.map(p => p.id));
            for (const p of personnel) {
                if (!remPerIds.has(p.id)) difs.push({ que: `Trabajador "${p.name}"`, detalle: 'está en el teléfono y NO en la base' });
            }

            setContraste({ estado: 'listo', difs });
        } catch {
            setContraste({ estado: 'error', difs: [] });
        }
    };

    const hallazgos = useMemo(() => {
        const nombrado = (accion: string, nombre: string) =>
            auditLogs.some(l => l.action === accion && l.description.includes(`"${nombre}"`));

        // 1) Vivos que la bitácora dice borrados, sin una creación posterior.
        const ultimo = (accion: string, nombre: string): number => {
            let t = 0;
            for (const l of auditLogs) {
                if (l.action !== accion || !l.description.includes(`"${nombre}"`)) continue;
                t = Math.max(t, new Date(l.timestamp).getTime());
            }
            return t;
        };
        const resucitados: string[] = [];
        for (const i of items) {
            const b = ultimo('ITEM_DELETED', i.name);
            if (b > 0 && ultimo('ITEM_CREATED', i.name) <= b) resucitados.push(`Ítem "${i.name}"`);
        }
        for (const p of personnel) {
            const b = ultimo('PERSONNEL_DELETED', p.name);
            if (b > 0 && ultimo('PERSONNEL_CREATED', p.name) <= b) resucitados.push(`Trabajador "${p.name}"`);
        }

        // 2) Cuadrillas sin quién las armara.
        const nombreDe = (id?: string) => personnel.find(p => p.id === id)?.name ?? '?';
        const cuadrillasSinRastro = personnel
            .filter(p => p.teamLeaderId)
            .filter(p => !auditLogs.some(l =>
                l.action === 'PERSONNEL_EDITED' && l.description.includes(`"${p.name}"`)))
            .map(p => `"${p.name}" figura en la cuadrilla de "${nombreDe(p.teamLeaderId)}"`);

        // 3) Ítems que existen sin registro de creación.
        const sinOrigen = items
            .filter(i => !nombrado('ITEM_CREATED', i.name))
            .map(i => `Ítem "${i.name}"`);

        return { resucitados, cuadrillasSinRastro, sinOrigen };
    }, [items, personnel, auditLogs]);

    const total = hallazgos.resucitados.length + hallazgos.cuadrillasSinRastro.length + hallazgos.sinOrigen.length;

    const Bloque = ({ titulo, explica, lista }: { titulo: string; explica: string; lista: string[] }) => {
        if (lista.length === 0) return null;
        return (
            <div className="border border-atencion bg-atencion-suave rounded-xl p-3 space-y-1">
                <p className="text-xs font-black text-atencion">{titulo} · {lista.length}</p>
                <p className="text-[11px] text-atencion">{explica}</p>
                <ul className="space-y-0.5 pt-1">
                    {lista.slice(0, 12).map((x, i) => (
                        <li key={i} className="text-[11px] text-tinta-suave">· {x}</li>
                    ))}
                    {lista.length > 12 && (
                        <li className="text-[11px] text-tinta-tenue">…y {lista.length - 12} más</li>
                    )}
                </ul>
            </div>
        );
    };

    return (
        <div className="space-y-2">
            <div>
                <h3 className="text-sm font-black text-tinta">Cotejo con la bitácora</h3>
                <p className="text-[11px] text-tinta-tenue">
                    Lo que hay en la bodega contra lo que dice que pasó. Si algo no cuadra, sale acá.
                </p>
            </div>

            {/* Cotejo contra la nube: se pide, no corre solo, porque baja todo. */}
            <div className="border border-papel-borde rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-tinta">Este teléfono contra la base</p>
                        <p className="text-[11px] text-tinta-tenue">
                            Lo que la bitácora no puede ver: que los dos muestren cosas distintas.
                        </p>
                    </div>
                    <button type="button" onClick={cotejarConLaBase}
                        disabled={contraste.estado === 'mirando'}
                        className="text-[11px] font-black px-3 py-1.5 rounded-lg bg-tinta hover:bg-black disabled:bg-papel-borde text-papel flex-shrink-0">
                        {contraste.estado === 'mirando' ? 'Mirando…' : 'Cotejar'}
                    </button>
                </div>

                {contraste.estado === 'error' && (
                    <p className="text-[11px] text-alerta">No se pudo leer la base. ¿Hay señal?</p>
                )}
                {contraste.estado === 'listo' && contraste.difs.length === 0 && (
                    <p className="text-[11px] font-bold text-bien">✅ Coinciden. Nada que reportar.</p>
                )}
                {contraste.estado === 'listo' && contraste.difs.length > 0 && (
                    <div className="border border-alerta bg-alerta-suave rounded-lg p-2 space-y-0.5">
                        <p className="text-[11px] font-black text-alerta">
                            {contraste.difs.length} diferencia{contraste.difs.length !== 1 ? 's' : ''}
                        </p>
                        {contraste.difs.slice(0, 12).map((d, i) => (
                            <p key={i} className="text-[11px] text-tinta-suave">
                                · <strong>{d.que}</strong>: {d.detalle}
                            </p>
                        ))}
                        {contraste.difs.length > 12 && (
                            <p className="text-[11px] text-tinta-tenue">…y {contraste.difs.length - 12} más</p>
                        )}
                    </div>
                )}
            </div>

            {total === 0 ? (
                <div className="border border-bien bg-bien-suave rounded-xl p-3">
                    <p className="text-xs font-bold text-bien">✅ Todo cuadra</p>
                    <p className="text-[11px] text-bien mt-0.5">
                        Nada vive sin explicación y ninguna cuadrilla se armó sola.
                    </p>
                </div>
            ) : (
                <>
                    <Bloque
                        titulo="Está pero la bitácora dice que se borró"
                        explica="Volvió sin que nadie lo creara. Suele ser un dispositivo con datos viejos."
                        lista={hallazgos.resucitados} />
                    <Bloque
                        titulo="En una cuadrilla sin que nadie lo pusiera ahí"
                        explica="No hay registro de la asignación. Se puede corregir con el lápiz del trabajador."
                        lista={hallazgos.cuadrillasSinRastro} />
                    <Bloque
                        titulo="Existe sin registro de creación"
                        explica="Normal si entró en la carga inicial; raro si es reciente."
                        lista={hallazgos.sinOrigen} />
                </>
            )}
        </div>
    );
};
