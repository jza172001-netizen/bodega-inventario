
import React, { useMemo, useState } from 'react';
import { Item } from '../types';
import { familiaDe } from '../utils/genus';

interface Props {
    items: Item[];
    onEditItem: (item: Item) => void;
    onGoBack: () => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

/**
 * Los ítems creados antes de que la familia fuera una decisión traen la
 * suposición del nombre. Acá se confirman de una sentada.
 *
 * Solo se muestran grupos de DOS O MÁS sin decidir: un ítem solo no tiene nada
 * que confirmar, y llenarle la pantalla de decisiones vacías es la forma más
 * rápida de que deje de leerlas.
 */
export const ReviewFamiliesView: React.FC<Props> = ({ items, onEditItem, onGoBack, onBehaviorLog }) => {
    const [separando, setSeparando] = useState<string | null>(null);
    const [fuera, setFuera] = useState<Set<string>>(new Set());

    const pendientes = useMemo(() => {
        const porFamilia = new Map<string, Item[]>();
        for (const i of items) {
            if (i.familia?.trim()) continue;              // ya decidido
            const f = familiaDe(i.name);
            if (!porFamilia.has(f)) porFamilia.set(f, []);
            porFamilia.get(f)!.push(i);
        }
        return [...porFamilia.entries()]
            .filter(([, its]) => its.length >= 2)
            .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'));
    }, [items]);

    const confirmar = (familia: string, grupo: Item[]) => {
        grupo.forEach(i => onEditItem({ ...i, familia }));
        onBehaviorLog?.('ACTION', `Confirmó familia "${familia}" (${grupo.length} ítems)`);
        setSeparando(null); setFuera(new Set());
    };

    const aplicarSeparacion = (familia: string, grupo: Item[]) => {
        for (const i of grupo) {
            // Los que se sacan se llevan familia propia: así no se los vuelve a
            // proponer con este grupo. La app aprende del "no".
            const fam = fuera.has(i.id) ? `${familia} · ${i.name}` : familia;
            onEditItem({ ...i, familia: fam });
        }
        onBehaviorLog?.('ACTION', `Separó ${fuera.size} de la familia "${familia}"`);
        setSeparando(null); setFuera(new Set());
    };

    const alternar = (id: string) => setFuera(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });

    return (
        <div className="space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center gap-2">
                <button onClick={onGoBack} className="text-gray-400 hover:text-gray-600 text-xl leading-none">←</button>
                <div>
                    <h1 className="text-xl font-black text-gray-900">Revisar agrupaciones</h1>
                    <p className="text-xs text-gray-400 mt-0.5">
                        La app propone; vos decidís. Lo que confirmes queda guardado.
                    </p>
                </div>
            </div>

            {pendientes.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <p className="text-4xl mb-3">✅</p>
                    <p className="font-semibold text-gray-600">No queda nada por revisar</p>
                    <p className="text-sm mt-1">Todas las familias están decididas.</p>
                </div>
            ) : (
                pendientes.map(([familia, grupo]) => {
                    const enSeparacion = separando === familia;
                    return (
                        <div key={familia} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                                <p className="text-sm font-black text-gray-900">{familia}</p>
                                <p className="text-[11px] text-gray-500">{grupo.length} ítems propuestos</p>
                            </div>

                            <div className="px-4 py-3 space-y-1">
                                {grupo.map(i => (
                                    <button
                                        key={i.id}
                                        type="button"
                                        disabled={!enSeparacion}
                                        onClick={() => alternar(i.id)}
                                        className={`w-full text-left text-sm px-2.5 py-1.5 rounded-lg border transition-all ${
                                            !enSeparacion
                                                ? 'border-transparent text-gray-700'
                                                : fuera.has(i.id)
                                                    ? 'border-orange-400 bg-orange-50 text-orange-800 font-bold'
                                                    : 'border-green-300 bg-green-50 text-green-800'
                                        }`}>
                                        {enSeparacion && <span className="mr-1.5">{fuera.has(i.id) ? '✕' : '✓'}</span>}
                                        {i.name}
                                        {enSeparacion && fuera.has(i.id) && <span className="ml-2 text-[10px] font-black uppercase">Sale</span>}
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-2 px-4 pb-3">
                                {enSeparacion ? (
                                    <>
                                        <button onClick={() => { setSeparando(null); setFuera(new Set()); }}
                                            className="px-3 py-2 text-xs font-bold text-gray-500 border border-gray-200 rounded-xl">
                                            Cancelar
                                        </button>
                                        <button onClick={() => aplicarSeparacion(familia, grupo)}
                                            disabled={fuera.size === 0}
                                            className="flex-1 py-2 text-xs font-black bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl">
                                            Sacar {fuera.size || ''} de "{familia}"
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => { setSeparando(familia); setFuera(new Set()); }}
                                            className="px-3 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-xl hover:border-gray-400">
                                            Separar…
                                        </button>
                                        <button onClick={() => confirmar(familia, grupo)}
                                            className="flex-1 py-2 text-xs font-black bg-green-600 hover:bg-green-700 text-white rounded-xl">
                                            Sí, son la misma familia
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};
