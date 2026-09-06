import React from 'react';
import { Item } from '../types';
import { daysSince } from '../utils/inventory';

interface Props {
    items: Item[];
    /** Marca el paso siguiente. Sin esto el panel es de solo lectura (Visitante). */
    onPaso?: (itemId: string, paso: 'enviada' | 'arreglada') => void;
}

/**
 * Las herramientas dañadas, y en qué va cada una.
 *
 * Antes devolver algo "dañado" guardaba la palabra en el movimiento y ahí se
 * acababa la historia. Y son dos olvidos distintos los que cuestan plata:
 * olvidar mandarla a arreglar, y olvidar ir a recogerla cuando ya está lista
 * donde el técnico. Una herramienta puede pasar un mes en un taller sin que
 * nadie la extrañe.
 *
 * Por eso son dos renglones con dos botones, y no un estado que la app cambie
 * sola: solo el bodeguero sabe si de verdad salió para el taller y si de verdad
 * volvió sirviendo. La app recuerda y cuenta los días; el que confirma es él.
 */
export const DañadasPanel: React.FC<Props> = ({ items, onPaso }) => {
    const dañadas = items.filter(i => i.reparacion?.estado === 'dañada');
    const enTaller = items.filter(i => i.reparacion?.estado === 'enviada');
    if (dañadas.length === 0 && enTaller.length === 0) return null;

    const dias = (d?: Date) => (d ? daysSince(d) : 0);

    return (
        <div className="bg-papel border border-alerta rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-alerta px-4 py-3">
                <p className="text-sm font-black text-papel">🔧 Herramientas dañadas</p>
                <p className="text-xs text-papel">
                    {dañadas.length > 0 && `${dañadas.length} por mandar a arreglar`}
                    {dañadas.length > 0 && enTaller.length > 0 && ' · '}
                    {enTaller.length > 0 && `${enTaller.length} en el taller`}
                </p>
            </div>

            {dañadas.length > 0 && (
                <div className="divide-y divide-papel-borde">
                    <p className="text-[10px] font-black text-alerta uppercase tracking-widest px-4 pt-3 pb-1">
                        Están acá, dañadas
                    </p>
                    {dañadas.map(i => (
                        <div key={i.id} className="px-4 py-3 flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-tinta truncate">{i.name}</p>
                                <p className="text-[11px] text-tinta-tenue truncate">
                                    Dañada hace {dias(i.reparacion?.desde)} día{dias(i.reparacion?.desde) !== 1 ? 's' : ''}
                                    {i.reparacion?.nota ? ` · ${i.reparacion.nota}` : ''}
                                </p>
                            </div>
                            {onPaso && (
                                <button onClick={() => onPaso(i.id, 'enviada')}
                                    className="flex-shrink-0 text-[11px] font-black px-2.5 py-1.5 rounded-lg bg-atencion text-papel">
                                    🔧 La mandé a arreglar
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {enTaller.length > 0 && (
                <div className="divide-y divide-papel-borde border-t border-papel-borde">
                    <p className="text-[10px] font-black text-atencion uppercase tracking-widest px-4 pt-3 pb-1">
                        En el taller · hay que ir a recogerlas
                    </p>
                    {enTaller.map(i => (
                        <div key={i.id} className="px-4 py-3 flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-tinta truncate">{i.name}</p>
                                <p className="text-[11px] text-tinta-tenue truncate">
                                    En el taller hace {dias(i.reparacion?.enviadaEl)} día{dias(i.reparacion?.enviadaEl) !== 1 ? 's' : ''}
                                </p>
                            </div>
                            {onPaso && (
                                <button onClick={() => onPaso(i.id, 'arreglada')}
                                    className="flex-shrink-0 text-[11px] font-black px-2.5 py-1.5 rounded-lg bg-bien text-papel">
                                    ✅ Ya volvió buena
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
