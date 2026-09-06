
import React, { useMemo, useState } from 'react';
import { Item } from '../types';
import { familiaDe, nombreCorregido, normStr, esParecido } from '../utils/genus';

interface Props {
    items: Item[];
    onEditItem: (item: Item) => void;
    onGoBack: () => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

/** La forma que más se repite; en empate gana la que va con mayúscula. */
const formaMandante = (formas: string[]): string => {
    const cuenta = new Map<string, number>();
    for (const f of formas) cuenta.set(f, (cuenta.get(f) ?? 0) + 1);
    const conMayuscula = (v: string) => (v[0] && v[0] === v[0].toUpperCase() ? 0 : 1);
    return [...cuenta.entries()]
        .sort((a, b) => b[1] - a[1] || conMayuscula(a[0]) - conMayuscula(b[0]) || a[0].localeCompare(b[0], 'es'))[0][0];
};

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
    // Ítems a los que el bodeguero le dijo «no» a la corrección del nombre.
    const [sinCorregir, setSinCorregir] = useState<Set<string>>(new Set());

    /**
     * Los del grupo que están escritos distinto a su familia.
     *
     * Él lo pidió así: *"cuando ya agrupe la familia, se corrijan las palabras
     * y ya"*. Pero se MUESTRA antes de hacerlo: cambiarle los nombres a
     * espaldas del bodeguero es peor que el error de dedo que se está
     * arreglando. Por eso cada uno se puede dejar como está.
     */
    const porCorregir = (familia: string, grupo: Item[]) =>
        grupo
            .map(i => ({ item: i, nuevo: nombreCorregido(i.name, familia) }))
            .filter(c => c.nuevo !== c.item.name);

    const pendientes = useMemo(() => {
        // La clave va normalizada. Con la palabra tal cual, "Pulidora Grande" y
        // "pulidora pequeña" caían en dos grupos de uno —y como los grupos de
        // uno no se muestran, no aparecía ninguno de los dos. La familia que se
        // ofrece es la forma más usada, con la mayúscula ganando los empates.
        const porFamilia = new Map<string, { formas: string[]; its: Item[] }>();
        for (const i of items) {
            if (i.familia?.trim()) continue;              // ya decidido
            const f = familiaDe(i.name);
            const clave = normStr(f);
            if (!porFamilia.has(clave)) porFamilia.set(clave, { formas: [], its: [] });
            const g = porFamilia.get(clave)!;
            g.formas.push(f);
            g.its.push(i);
        }
        // Los sueltos con un dedazo se arriman al grupo que se les parece.
        // Es el caso que él tuvo escribiendo "Peludora": queda solo, y como los
        // grupos de uno no se muestran, nunca se le ofrecía juntarlo con las
        // pulidoras. Ahora entra al grupo, y la corrección de abajo le ofrece
        // arreglarle el nombre — que puede rechazar.
        const grupos = [...porFamilia.entries()];
        const grandes = grupos.filter(([, g]) => g.its.length >= 2);
        for (const [clave, g] of grupos) {
            if (g.its.length >= 2) continue;
            const suelto = g.its[0];
            const destino = grandes.find(([c, otro]) =>
                c !== clave && esParecido(suelto.name, otro.its[0]));
            if (destino) { destino[1].formas.push(...g.formas); destino[1].its.push(suelto); }
        }

        return grandes
            .map(([, g]) => [formaMandante(g.formas), g.its] as [string, Item[]])
            .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'));
    }, [items]);

    const confirmar = (familia: string, grupo: Item[]) => {
        const arreglos = porCorregir(familia, grupo).filter(c => !sinCorregir.has(c.item.id));
        const nuevoNombre = new Map(arreglos.map(c => [c.item.id, c.nuevo]));
        grupo.forEach(i => onEditItem({ ...i, familia, name: nuevoNombre.get(i.id) ?? i.name }));
        onBehaviorLog?.('ACTION', `Confirmó familia "${familia}" (${grupo.length} ítems)`);
        if (arreglos.length) {
            onBehaviorLog?.('ACTION',
                `Corrigió ${arreglos.length} nombre(s) al agrupar en "${familia}": ` +
                arreglos.map(c => `${c.item.name} → ${c.nuevo}`).join(', '));
        }
        setSeparando(null); setFuera(new Set());
    };

    const alternarCorreccion = (id: string) => setSinCorregir(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });

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
                <button onClick={onGoBack} className="text-tinta-tenue hover:text-tinta-suave text-xl leading-none">←</button>
                <div>
                    <h1 className="text-xl font-black text-tinta">Revisar agrupaciones</h1>
                    <p className="text-xs text-tinta-tenue mt-0.5">
                        La app propone; vos decidís. Lo que confirmes queda guardado.
                    </p>
                </div>
            </div>

            {pendientes.length === 0 ? (
                <div className="text-center py-20 text-tinta-tenue">
                    <p className="text-4xl mb-3">✅</p>
                    <p className="font-semibold text-tinta-suave">No queda nada por revisar</p>
                    <p className="text-sm mt-1">Todas las familias están decididas.</p>
                </div>
            ) : (
                pendientes.map(([familia, grupo]) => {
                    const enSeparacion = separando === familia;
                    return (
                        <div key={familia} className="bg-papel rounded-2xl border border-papel-borde overflow-hidden">
                            <div className="px-4 py-3 bg-papel-hondo border-b border-papel-borde">
                                <p className="text-sm font-black text-tinta">{familia}</p>
                                <p className="text-[11px] text-tinta-tenue">{grupo.length} ítems propuestos</p>
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
                                                ? 'border-transparent text-tinta-suave'
                                                : fuera.has(i.id)
                                                    ? 'border-atencion bg-atencion-suave text-atencion font-bold'
                                                    : 'border-bien bg-bien-suave text-bien'
                                        }`}>
                                        {enSeparacion && <span className="mr-1.5">{fuera.has(i.id) ? '✕' : '✓'}</span>}
                                        {i.name}
                                        {enSeparacion && fuera.has(i.id) && <span className="ml-2 text-[10px] font-black uppercase">Sale</span>}
                                    </button>
                                ))}
                            </div>

                            {!enSeparacion && porCorregir(familia, grupo).length > 0 && (
                                <div className="mx-4 mb-3 rounded-xl border border-atencion bg-atencion-suave px-3 py-2 space-y-1.5">
                                    <p className="text-[10px] font-black text-atencion uppercase tracking-wider">
                                        Se escribieron distinto
                                    </p>
                                    {porCorregir(familia, grupo).map(c => {
                                        const se = sinCorregir.has(c.item.id);
                                        return (
                                            <button key={c.item.id} type="button"
                                                onClick={() => alternarCorreccion(c.item.id)}
                                                className="w-full flex items-center gap-2 text-left text-xs">
                                                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 text-[10px] font-black ${
                                                    se ? 'border-papel-borde bg-papel text-transparent' : 'border-atencion bg-atencion text-tinta-tenue'}`}>✓</span>
                                                <span className={`flex-1 min-w-0 truncate ${se ? 'text-tinta-tenue' : 'text-atencion'}`}>
                                                    <span className="line-through opacity-60">{c.item.name}</span>
                                                    {' → '}
                                                    <strong>{c.nuevo}</strong>
                                                </span>
                                            </button>
                                        );
                                    })}
                                    <p className="text-[10px] text-atencion pt-0.5">
                                        Toca uno para dejarlo como está.
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-2 px-4 pb-3">
                                {enSeparacion ? (
                                    <>
                                        <button onClick={() => { setSeparando(null); setFuera(new Set()); }}
                                            className="px-3 py-2 text-xs font-bold text-tinta-tenue border border-papel-borde rounded-xl">
                                            Cancelar
                                        </button>
                                        <button onClick={() => aplicarSeparacion(familia, grupo)}
                                            disabled={fuera.size === 0}
                                            className="flex-1 py-2 text-xs font-black bg-atencion hover:bg-atencion disabled:bg-papel-borde disabled:text-papel text-papel rounded-xl">
                                            Sacar {fuera.size || ''} de "{familia}"
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => { setSeparando(familia); setFuera(new Set()); }}
                                            className="px-3 py-2 text-xs font-bold text-tinta-suave border border-papel-borde rounded-xl hover:border-tinta-tenue">
                                            Separar…
                                        </button>
                                        <button onClick={() => confirmar(familia, grupo)}
                                            className="flex-1 py-2 text-xs font-black bg-bien hover:bg-bien text-papel rounded-xl">
                                            {porCorregir(familia, grupo).some(c => !sinCorregir.has(c.item.id))
                                                ? 'Sí, y corregir los nombres'
                                                : 'Sí, son la misma familia'}
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
