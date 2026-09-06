import React, { useState } from 'react';
import { Item } from '../types';
import { construirArbol, detalleDe } from '../utils/arbol';
import { tonoDe } from '../utils/colores';

/**
 * La bodega como árbol: familia → variante → ítem.
 *
 * Lo pidió el bodeguero con los clavos —*"abro clavos y me salen las dos
 * familias, y me meto a una y me salen 1 pulgada, 2 pulgadas"*— y aclaró que
 * la quiere **en todo lugar**, no solo ahí. Por eso esto no sabe nada de para
 * qué se está usando: recibe los ítems y una función que dibuja la fila. El
 * chat le pinta una casilla, el inventario le pinta la tarjeta.
 *
 * Una lista plana de once taladros no se lee en un celular. Cuatro colores sí.
 */
interface Props {
    items: Item[];
    /** Cómo se dibuja cada ítem. `detalle` es lo que lo separa de sus vecinos de
     *  rama; va vacío cuando el ítem está solo y hay que mostrar su nombre completo. */
    fila: (item: Item, detalle?: string) => React.ReactNode;
    /** Ítems ya escogidos: su familia y su rama se abren solas para no perderlos de vista. */
    escogidos?: Set<string>;
    /** Con pocos ítems no vale la pena plegar nada. */
    abrirTodo?: boolean;
    className?: string;
}

const Flecha = ({ abierto }: { abierto: boolean }) => (
    <span className={`text-tinta-tenue text-[9px] transition-transform flex-shrink-0 ${abierto ? 'rotate-90' : ''}`}>▶</span>
);

/** El puntico del color, cuando la rama ES un color. */
const Punto = ({ variante }: { variante: string }) => {
    const tono = tonoDe(variante);
    if (!tono) return null;
    return <span className="w-2.5 h-2.5 rounded-full border border-black/10 flex-shrink-0" style={{ backgroundColor: tono }} />;
};

export const ArbolFamilias: React.FC<Props> = ({ items, fila, escogidos, abrirTodo, className = '' }) => {
    const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
    const arbol = construirArbol(items);

    const alternar = (llave: string) => setAbiertas(prev => {
        const s = new Set(prev);
        s.has(llave) ? s.delete(llave) : s.add(llave);
        return s;
    });

    const tieneEscogido = (deLos: Item[]) => !!escogidos && deLos.some(i => escogidos.has(i.id));

    return (
        <div className={`space-y-0.5 ${className}`}>
            {arbol.map(a => {
                // Un ítem solo no es una familia: plegarlo sería esconder algo
                // que ya cabía en una línea.
                const todosLosDeLaFamilia = a.ramas.flatMap(r => r.items);
                // Un ítem solo va con su nombre completo. Con el detalle a secas
                // salía "Nn · 1 disp." y no había forma de saber qué era eso.
                if (a.cuantos === 1) {
                    return <div key={a.familia}>{fila(todosLosDeLaFamilia[0])}</div>;
                }
                const llaveFam = `f:${a.familia}`;
                const abierta = abrirTodo || abiertas.has(llaveFam) || tieneEscogido(todosLosDeLaFamilia);
                const escogidosAca = escogidos ? todosLosDeLaFamilia.filter(i => escogidos.has(i.id)).length : 0;
                // Con una sola rama, la rama no separa nada: se salta el nivel.
                const unaSolaRama = a.ramas.length === 1;

                return (
                    <div key={a.familia}>
                        <button onClick={() => alternar(llaveFam)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-papel-hondo text-left transition-colors">
                            <Flecha abierto={abierta} />
                            <span className="text-sm font-bold text-tinta flex-1 min-w-0 truncate">{a.familia}</span>
                            {escogidosAca > 0 && (
                                <span className="text-[9px] font-black text-tinta bg-marca rounded-full px-1.5 py-0.5 flex-shrink-0">{escogidosAca}</span>
                            )}
                            <span className="text-[10px] text-tinta-tenue flex-shrink-0">{a.cuantos} · {a.total} disp.</span>
                        </button>

                        {abierta && (
                            <div className="ml-3 pl-2 border-l border-papel-borde space-y-0.5">
                                {unaSolaRama
                                    ? a.ramas[0].items.map(i => <div key={i.id}>{fila(i, detalleDe(i, a.familia, todosLosDeLaFamilia))}</div>)
                                    : a.ramas.map(r => {
                                        const llaveRama = `r:${a.familia}:${r.variante}`;
                                        const abiertaR = abrirTodo || abiertas.has(llaveRama) || tieneEscogido(r.items);
                                        const escogidosRama = escogidos ? r.items.filter(i => escogidos.has(i.id)).length : 0;
                                        return (
                                            <div key={llaveRama}>
                                                <button onClick={() => alternar(llaveRama)}
                                                    className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-papel-hondo text-left transition-colors">
                                                    <Flecha abierto={abiertaR} />
                                                    <Punto variante={r.variante} />
                                                    <span className="text-xs font-semibold text-tinta-suave flex-1 min-w-0 truncate">
                                                        {/* Una "Concretadora" al lado de una "Concretadora Electrica":
                                                            la rama de la sencilla se llama como la familia, que es como
                                                            la pide el bodeguero. */}
                                                        {r.variante === '—' ? a.familia : r.variante}
                                                    </span>
                                                    {escogidosRama > 0 && (
                                                        <span className="text-[9px] font-black text-tinta bg-marca rounded-full px-1.5 py-0.5 flex-shrink-0">{escogidosRama}</span>
                                                    )}
                                                    <span className="text-[10px] text-tinta-tenue flex-shrink-0">{r.items.length} · {r.total}</span>
                                                </button>
                                                {abiertaR && (
                                                    <div className="ml-3 pl-2 border-l border-papel-borde space-y-0.5">
                                                        {r.items.map(i => <div key={i.id}>{fila(i, detalleDe(i, a.familia, todosLosDeLaFamilia))}</div>)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ArbolFamilias;
