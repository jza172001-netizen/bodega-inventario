import React, { useState } from 'react';

export interface LinaPersona {
    id: string;
    nombre: string;
    telefono?: string;
    /** Qué tiene esa persona: una línea por cosa, ya redactada. */
    tiene: string[];
}

interface Props {
    titulo: string;
    /** Qué se reporta y con qué ventana. Va debajo del título, en chiquito. */
    subtitulo: string;
    gente: LinaPersona[];
    onConfirm: (idsIncluidos: string[]) => void;
    onClose: () => void;
}

/**
 * La confirmación de un envío en lote.
 *
 * Antes era un `ConfirmDialog` de texto plano: salía la lista de nombres y
 * nada más. Si Juli veía ahí que a uno no había que escribirle, la única
 * salida era cancelar todo, volver atrás, destildarlo en la lista y arrancar
 * de nuevo — y ni siquiera podía ver desde el diálogo qué tenía cada quien
 * para decidirlo.
 *
 * Acá se decide en el mismo lugar donde se está mirando: cada persona viene
 * marcada, se destilda a la que no va, y debajo del nombre está lo que tiene
 * prestado o consumido. El botón dice cuántos mensajes salen de verdad.
 *
 * El estado de quién queda por fuera vive adentro de este componente, que se
 * declara arriba del todo — no dentro de la vista de WhatsApp. Un componente
 * declarado adentro de otro se vuelve a montar en cada render y pierde lo que
 * uno acaba de marcar: es la misma trampa de `LoanRow` en Préstamos.
 */
export const ConfirmLoteWhatsApp: React.FC<Props> = ({ titulo, subtitulo, gente, onConfirm, onClose }) => {
    const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
    const [abierto, setAbierto] = useState<string | null>(null);

    const alternar = (id: string) => setExcluidos(prev => {
        const s = new Set(prev);
        s.has(id) ? s.delete(id) : s.add(id);
        return s;
    });

    const incluidos = gente.filter(p => !excluidos.has(p.id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <div
                className="w-full max-w-sm bg-papel rounded-2xl shadow-2xl border border-papel-borde overflow-hidden flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-atencion px-5 py-4 flex items-center gap-3 flex-shrink-0">
                    <span className="text-2xl">⚠️</span>
                    <div className="min-w-0">
                        <p className="text-papel font-black text-sm">{titulo}</p>
                        <p className="text-papel/90 text-[11px] font-semibold">{subtitulo}</p>
                    </div>
                </div>

                <div className="px-5 pt-4 flex-shrink-0">
                    <p className="text-[11px] text-tinta-tenue font-semibold text-center">
                        Se envían uno por uno. Destildá a quien no le va, y tocá el nombre para ver qué tiene.
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-5 pt-3 space-y-1.5">
                    {gente.map(p => {
                        const fuera = excluidos.has(p.id);
                        const desplegado = abierto === p.id;
                        return (
                            <div key={p.id} className={`rounded-xl border transition-all ${fuera ? 'bg-papel-hondo border-papel-borde opacity-60' : 'bg-papel border-papel-borde'}`}>
                                <div className="flex items-center gap-2.5 p-2.5">
                                    <input
                                        type="checkbox"
                                        checked={!fuera}
                                        onChange={() => alternar(p.id)}
                                        aria-label={`Enviarle a ${p.nombre}`}
                                        className="w-4 h-4 flex-shrink-0 accent-bien"
                                    />
                                    <button type="button" onClick={() => setAbierto(desplegado ? null : p.id)}
                                        className="flex-1 min-w-0 text-left">
                                        <p className={`text-sm font-bold truncate ${fuera ? 'text-tinta-tenue line-through' : 'text-tinta'}`}>
                                            {p.nombre}
                                        </p>
                                        <p className="text-[10px] text-tinta-tenue">
                                            {p.tiene.length} cosa{p.tiene.length === 1 ? '' : 's'}
                                            {p.telefono ? ` · ${p.telefono}` : ''}
                                        </p>
                                    </button>
                                    <span className="text-[10px] text-tinta-tenue flex-shrink-0">{desplegado ? '▲' : '▼'}</span>
                                </div>
                                {desplegado && (
                                    <ul className="px-3 pb-2.5 space-y-0.5">
                                        {p.tiene.length === 0 && (
                                            <li className="text-[11px] text-tinta-tenue italic">Nada que reportar en esta ventana.</li>
                                        )}
                                        {p.tiene.map((linea, i) => (
                                            <li key={i} className="text-[11px] text-tinta-suave">• {linea}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="p-5 pt-0 flex gap-2 flex-shrink-0">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-2.5 bg-papel-hondo hover:bg-papel-borde text-tinta-suave text-sm font-bold rounded-xl transition-all">
                        Cancelar
                    </button>
                    <button type="button"
                        disabled={incluidos.length === 0}
                        onClick={() => { onConfirm(incluidos.map(p => p.id)); onClose(); }}
                        className="flex-1 py-2.5 bg-atencion text-papel text-sm font-black rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                        {incluidos.length === 0 ? 'Nadie marcado' : `Enviar ${incluidos.length}`}
                    </button>
                </div>
            </div>
        </div>
    );
};
