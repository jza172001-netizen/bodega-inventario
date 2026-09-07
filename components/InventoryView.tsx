
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Item, InventoryType, UserRole, Movement, Personnel } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { EditIcon } from './icons/EditIcon';
import { TrashIcon } from './icons/TrashIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { getGenus, normStr, clusterGenera, looseMatch } from '../utils/genus';
import { construirArbol, detalleDe } from '../utils/arbol';
import { tonoDe } from '../utils/colores';

interface InventoryViewProps {
    items: Item[];
    movements?: Movement[];
    personnel?: Personnel[];
    openAddItemModal: () => void;
    onEditItem: (item: Item) => void;
    onDeleteItem: (itemId: string) => void;
    onItemHistory: (item: Item) => void;
    onOpenInvoiceReader?: () => void;
    userRole: UserRole;
    category: string | null;
    onGoBack: () => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

/**
 * Las especies de una familia, con la rama que las separa intercalada.
 *
 * Una lista plana de once taladros no se lee; «Alambrico / Inhalambrico /
 * Percutor» sí. Si solo hay una rama no se intercala nada: un encabezado que
 * cubre toda la lista no separa nada.
 */
type EntradaDeRama =
    | { tipo: 'rama'; nombre: string; cuantos: number; total: number }
    | { tipo: 'item'; item: Item };

const enRamas = (species: Item[]): EntradaDeRama[] => {
    const ramas = construirArbol(species).flatMap(a => a.ramas);
    if (ramas.length < 2) return species.map(item => ({ tipo: 'item', item }));
    return ramas.flatMap(r => [
        { tipo: 'rama', nombre: r.variante, cuantos: r.items.length, total: r.total } as EntradaDeRama,
        ...r.items.map(item => ({ tipo: 'item', item }) as EntradaDeRama),
    ]);
};

export const InventoryView: React.FC<InventoryViewProps> = ({ items, movements = [], personnel = [], openAddItemModal, onEditItem, onDeleteItem, onItemHistory, onOpenInvoiceReader, userRole, category, onGoBack, onBehaviorLog }) => {
    const [search, setSearch] = useState('');
    const [expandedGenus, setExpandedGenus] = useState<Set<string>>(new Set());
    const bottomSentinelRef = useRef<HTMLDivElement>(null);
    const activeLoans = useMemo(() => movements.filter(m => m.isLoan && !m.isReturned), [movements]);

    /**
     * Acá había un observador que anotaba «Llegó al fondo: Inventario» cada vez
     * que la lista se recorría hasta abajo.
     *
     * Medido en producción: entre eso y los avisos de cambiar de pestaña, el
     * 53% del registro de comportamiento —950 renglones de 1.786— era eso.
     * No responde ninguna pregunta que alguien se haya hecho, y cada renglón
     * costaba una escritura completa al almacenamiento del teléfono, que es lo
     * que ponía lenta la app en el navegador de Huawei.
     *
     * Lo que ya está guardado no se toca. Esto solo deja de producir más.
     */


    const toggleGenus = (g: string) => setExpandedGenus(prev => {
        const next = new Set(prev);
        next.has(g) ? next.delete(g) : next.add(g);
        return next;
    });

    const displayItems = useMemo(() => {
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'es'));
        if (!search.trim()) return sorted;
        // `normStr(...).includes()` respeta las tildes pero no los errores de dedo:
        // "amrtillo" no encontraba nada. Mismo criterio que el buscador general.
        return sorted.filter(i => {
            if (looseMatch(i.name, search)) return true;
            if (looseMatch(getGenus(i.name), search)) return true;
            if (looseMatch(i.subCategory, search)) return true;
            if (looseMatch(i.category, search)) return true;
            const loan = activeLoans.find(m => m.itemId === i.id);
            if (loan?.personnelId) {
                const name = personnel.find(p => p.id === loan.personnelId)?.name ?? '';
                if (looseMatch(name, search)) return true;
            }
            return false;
        });
    }, [items, search, activeLoans, personnel]);

    const genusList = useMemo(() => clusterGenera(displayItems), [displayItems]);

    /**
     * Las familias, repartidas por grupo. La vista ya juntaba las variantes de
     * una misma familia ("Guantes (Negro)" + "Guantes (Rojo)" → Guantes), pero
     * dos familias emparentadas —"Gafas" y "Gafas de seguridad"— quedaban
     * sueltas y revueltas con todo lo demás.
     *
     * Se devuelve una sola lista de filas, encabezados incluidos, para no
     * reescribir el renderizado de cada familia.
     */
    const filasAgrupadas = useMemo(() => {
        const porGrupo = new Map<string, typeof genusList>();
        for (const fam of genusList) {
            // El encabezado sale del TIPO DE INVENTARIO, no de la
            // sub-clasificación.
            //
            // Antes salía de `subCategory`, y como ese campo casi nadie lo
            // llenaba, la pantalla mostraba "HERRAMIENTA ELÉCTRICA · 9 familias"
            // y más abajo "GENERAL · 11 familias" con más herramientas
            // eléctricas adentro. No eran dos grupos: era qué ítems tenían
            // escrito ese campo y cuáles no. Y "GOLOE" era un "GOLPE" con un
            // error de dedo que se quedó guardado.
            const g = fam.species[0]?.inventoryType ?? 'Sin tipo';
            if (!porGrupo.has(g)) porGrupo.set(g, []);
            porGrupo.get(g)!.push(fam);
        }
        // El orden es el del uso real de la bodega, no el alfabético: primero lo
        // que más se mueve. Lo dijo Juli con estas palabras — "consumibles,
        // herramienta eléctrica, herramienta manual tercera y elementos de
        // protección personal de última".
        const ORDEN: string[] = [
            InventoryType.SINGLE_USE,
            InventoryType.ELECTRICAL_TOOL,
            InventoryType.HAND_TOOL,
            InventoryType.PPE,
            // El catálogo de accesorios va de último: no se despacha solo, sale
            // pegado a su herramienta.
            InventoryType.ACCESSORY,
        ];
        const peso = (g: string) => { const i = ORDEN.indexOf(g); return i === -1 ? ORDEN.length : i; };
        const grupos = [...porGrupo.keys()].sort((a, b) =>
            peso(a) - peso(b) || a.localeCompare(b, 'es'));

        type Fila =
            | { tipo: 'grupo'; grupo: string; familias: number }
            | { tipo: 'familia'; cluster: typeof genusList[number] };
        const filas: Fila[] = [];
        // Con un solo grupo el encabezado no informa nada: se omite.
        const conEncabezado = grupos.length > 1;
        for (const g of grupos) {
            const fams = porGrupo.get(g)!;
            if (conEncabezado) filas.push({ tipo: 'grupo', grupo: g, familias: fams.length });
            for (const f of fams) filas.push({ tipo: 'familia', cluster: f });
        }
        return filas;
    }, [genusList]);

    const getStockStatusColor = (item: Item) => {
        if (item.minStock <= 0) return 'bg-papel-borde text-tinta';
        if (item.quantity <= 0) return 'bg-alerta-suave text-alerta';
        if (item.quantity <= item.minStock) return 'bg-atencion-suave text-atencion';
        return 'bg-bien-suave text-bien';
    };

    /** Vacío = no hay nada que decir. Sin mínimo definido no hay estado que
     *  reportar, y ese "N/A" salía en 16 filas de una sola pantalla. */
    const getStockStatusText = (item: Item) => {
        if (item.minStock <= 0) return '';
        if (item.quantity <= 0) return 'Agotado';
        if (item.quantity <= item.minStock) return 'Bajo Stock';
        return 'OK';
    };

    const getGenusStatusColor = (species: Item[]) => {
        if (species.some(i => i.quantity <= 0 && i.minStock > 0)) return 'bg-alerta-suave text-alerta';
        if (species.some(i => i.quantity <= i.minStock && i.minStock > 0)) return 'bg-atencion-suave text-atencion';
        if (species.every(i => i.minStock <= 0)) return 'bg-papel-hondo text-tinta-tenue';
        return 'bg-bien-suave text-bien';
    };

    const INV_EMOJI: Record<InventoryType, string> = {
        [InventoryType.ELECTRICAL_TOOL]: '⚡',
        [InventoryType.HAND_TOOL]: '🔨',
        [InventoryType.PPE]: '🦺',
        [InventoryType.SINGLE_USE]: '📦',
        [InventoryType.ACCESSORY]: '🔩',
    };

    return (
        <div className="bg-papel p-2.5 md:p-6 rounded-xl shadow-md">
            {/* En el celular el título sobra: la pestaña de arriba ya dice dónde
                estás, y repetirlo en 2xl gastaba 40 px más sus márgenes. La flecha
                de volver se queda, pegada al buscador. */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-1.5 md:mb-4 gap-2 md:gap-3">
                <div className="hidden md:flex items-center">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-papel-hondo">
                      <ArrowLeftIcon className="w-6 h-6 text-tinta-suave" />
                    </button>
                    <h2 className="text-2xl font-semibold text-tinta">
                        {category || 'Todos los Artículos'}
                    </h2>
                </div>
                <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
                    <button onClick={onGoBack} className="md:hidden p-1.5 rounded-full hover:bg-papel-hondo flex-shrink-0" title="Volver">
                        <ArrowLeftIcon className="w-5 h-5 text-tinta-suave" />
                    </button>
                    <div className="relative flex-1 md:w-56">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-tenue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onBlur={e => { if (e.target.value.trim().length > 1) onBehaviorLog?.('SEARCH', `Buscó en inventario: "${e.target.value.trim()}"`); }}
                            placeholder="Buscar artículo..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-papel-borde rounded-lg focus:outline-none focus:ring-2 focus:ring-marca focus:border-transparent"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>
                    {userRole !== UserRole.VISITOR && (
                        <button onClick={openAddItemModal} className="flex items-center bg-marca hover:bg-marca-fuerte text-tinta font-bold py-2 px-4 rounded-lg text-sm whitespace-nowrap">
                            <PlusIcon className="w-5 h-5 mr-2" />
                            Añadir
                        </button>
                    )}
                </div>
            </div>
            {search && (
                <p className="text-xs text-tinta-tenue mb-3">{displayItems.length} resultado{displayItems.length !== 1 ? 's' : ''} para "{search}"</p>
            )}

            {/* Mobile cards — agrupadas por género */}
            {/* Antes cada ítem era su propia tarjeta con borde y separación: 8 filas
                por pantalla. Ahora es una lista con divisiones finas. */}
            <div className="md:hidden mb-2 rounded-xl border border-papel-borde overflow-hidden divide-y divide-papel-borde bg-papel">
                {filasAgrupadas.map(fila => {
                    if (fila.tipo === 'grupo') {
                        return (
                            <div key={`grupo-${fila.grupo}`} className="flex items-baseline gap-2 px-3 py-1.5 bg-papel-hondo">
                                <p className="text-[11px] font-black text-marca-oscuro uppercase tracking-widest">{fila.grupo}</p>
                                <span className="text-[10px] text-tinta-tenue">{fila.familias} familia{fila.familias !== 1 ? 's' : ''}</span>
                                <span className="flex-1 border-b border-papel-borde" />
                            </div>
                        );
                    }
                    const { canonical, species } = fila.cluster;
                    const isExpanded = expandedGenus.has(canonical) || species.length === 1;
                    const totalQty = species.reduce((s, i) => s + i.quantity, 0);
                    const emoji = INV_EMOJI[species[0]?.inventoryType] ?? '📦';
                    const singleItem = species.length === 1 ? species[0] : null;

                    return (
                        <div key={canonical}>
                            {/* Genus header */}
                            {/* El nombre en su PROPIO renglón. Antes iba peleando la línea
                                con la cantidad, el estado y tres iconos: en 390 px le
                                quedaban ~130, y "Compresor" se partía y se encimaba con
                                el número. Debajo, en pequeño, todo lo demás. */}
                            <div
                                className={`px-3 py-1.5 ${species.length > 1 ? 'cursor-pointer active:bg-papel-hondo' : ''}`}
                                onClick={() => species.length > 1 && toggleGenus(canonical)}
                            >
                                <div className="flex items-center gap-2">
                                    <p className="flex-1 min-w-0 truncate font-bold text-tinta text-sm leading-tight" title={canonical}>
                                        {emoji} {canonical}
                                    </p>
                                    {/* La cantidad al lado, no debajo. Lo que arreglaba el
                                        choque era `truncate` con `min-w-0`, no partir la fila
                                        en dos: así el nombre nunca invade el número, y cada
                                        ítem ocupa un renglón en vez de dos. */}
                                    {singleItem && (
                                        <button onClick={e => { e.stopPropagation(); onBehaviorLog?.('BUTTON', `Ver historial: ${singleItem.name}`); onItemHistory(singleItem); }}
                                            className="flex-shrink-0 text-[11px] text-tinta-tenue hover:text-tinta whitespace-nowrap">
                                            <span className="font-bold text-tinta-suave">{singleItem.quantity}</span> {singleItem.unit}
                                        </button>
                                    )}
                                    {singleItem && getStockStatusText(singleItem) && (
                                        <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded ${getStockStatusColor(singleItem)}`}>{getStockStatusText(singleItem)}</span>
                                    )}
                                    {species.length > 1 && (
                                        <span className="flex-shrink-0 text-[11px] text-tinta-tenue whitespace-nowrap">{totalQty} en total</span>
                                    )}
                                    {species.length > 1 && (
                                        <>
                                            <span className={`px-1.5 py-0.5 text-[11px] font-bold rounded flex-shrink-0 ${getGenusStatusColor(species)}`}>{species.length} esp.</span>
                                            <svg className={`w-4 h-4 text-tinta-tenue transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </>
                                    )}
                                    {/* El reloj se fue: el nombre ya abre el histórico al
                                        tocarlo, igual que en Préstamos. Eran tres iconos de
                                        colores por fila peleándole al dato. */}
                                    {singleItem && userRole !== UserRole.VISITOR && (
                                        <div className="flex gap-0.5 flex-shrink-0">
                                            <button onClick={e => { e.stopPropagation(); onBehaviorLog?.('BUTTON', `Editó ítem: ${singleItem.name}`); onEditItem(singleItem); }}
                                                className="text-tinta-tenue hover:text-tinta p-1" title="Editar"><EditIcon className="w-4 h-4"/></button>
                                            <button onClick={e => { e.stopPropagation(); onBehaviorLog?.('ACTION', `Eliminó ítem: ${singleItem.name}`); onDeleteItem(singleItem.id); }}
                                                className="text-tinta-tenue hover:text-alerta p-1" title="Eliminar"><TrashIcon className="w-4 h-4"/></button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Species list (expandable) */}
                            {species.length > 1 && isExpanded && (
                                <div className="divide-y divide-papel-borde">
                                    {/* El nivel del medio que faltaba. Él lo pidió con los clavos
                                        —«me meto a una familia y me salen 1 pulgada, 2 pulgadas»— y
                                        lo mismo aplica a las pulidoras: grandes y pequeñas, y dentro
                                        de cada una los colores y las marcas. Con una sola rama no se
                                        muestra nada: no separaría nada. */}
                                    {enRamas(species).map(entrada => {
                                        if (entrada.tipo === 'rama') {
                                            return (
                                                <div key={`rama-${entrada.nombre}`} className="flex items-center gap-1.5 px-3 py-1 bg-papel-hondo/70">
                                                    {tonoDe(entrada.nombre) && (
                                                        <span className="w-2 h-2 rounded-full border border-black/10 flex-shrink-0"
                                                            style={{ backgroundColor: tonoDe(entrada.nombre)! }} />
                                                    )}
                                                    <p className="text-[11px] font-black text-tinta-tenue uppercase tracking-wider flex-1 min-w-0 truncate">
                                                        {entrada.nombre === '—' ? canonical : entrada.nombre}
                                                    </p>
                                                    <span className="text-[10px] text-tinta-tenue">{entrada.cuantos} · {entrada.total}</span>
                                                </div>
                                            );
                                        }
                                        const item = entrada.item;
                                        const speciesLabel = detalleDe(item, canonical, species) || item.name.match(/\(([^)]+)\)/)?.[1] || item.name;
                                        return (
                                            <div key={item.id} className="flex items-center justify-between px-3 py-2 bg-papel gap-2 pl-5">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-semibold text-tinta-suave cursor-pointer" onClick={() => onItemHistory(item)}>{speciesLabel}</p>
                                                    {/* Antes acá iban dos chips con la marca y el color. Ahora la
                                                        etiqueta ya dice "Amarillo · Dwalt" y la rama de arriba dice
                                                        el resto: repetirlo tres veces gastaba media pantalla. */}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span className="text-sm font-bold text-tinta">{item.quantity} <span className="text-xs font-normal text-tinta-tenue">{item.unit}</span></span>
                                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStockStatusColor(item)}`}>{getStockStatusText(item)}</span>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => { onBehaviorLog?.('BUTTON', `Ver historial: ${item.name}`); onItemHistory(item); }} className="text-marca-oscuro p-1" title="Historial"><HistoryIcon className="w-4 h-4"/></button>
                                                        {userRole !== UserRole.VISITOR && (
                                                            <>
                                                                <button onClick={() => { onBehaviorLog?.('BUTTON', `Editó ítem: ${item.name}`); onEditItem(item); }} className="text-marca-oscuro p-1"><EditIcon className="w-4 h-4"/></button>
                                                                <button onClick={() => { onBehaviorLog?.('ACTION', `Eliminó ítem: ${item.name}`); onDeleteItem(item.id); }} className="text-tinta-tenue p-1"><TrashIcon className="w-4 h-4"/></button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
                {genusList.length === 0 && (
                    <p className="text-center py-8 text-tinta-tenue text-sm">{search ? `Sin resultados para "${search}".` : 'No hay artículos en esta categoría.'}</p>
                )}
            </div>

            {/* Desktop table — agrupada por género */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-papel-borde">
                    <thead className="bg-papel-hondo">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-tinta-tenue uppercase tracking-wider">Nombre</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-tinta-tenue uppercase tracking-wider">Sub-Clasificación</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-tinta-tenue uppercase tracking-wider">Cantidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-tinta-tenue uppercase tracking-wider">Unidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-tinta-tenue uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-tinta-tenue uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-papel divide-y divide-papel-borde">
                        {genusList.map(({ canonical, species }) => {
                            const totalQty = species.reduce((s, i) => s + i.quantity, 0);
                            const emoji = INV_EMOJI[species[0]?.inventoryType] ?? '📦';
                            const isExpanded = expandedGenus.has(canonical) || species.length === 1;
                            const multiSpecies = species.length > 1;

                            return (
                                <React.Fragment key={canonical}>
                                    {/* Genus header row */}
                                    {multiSpecies && (
                                        <tr
                                            className="bg-papel-hondo hover:bg-papel-hondo cursor-pointer"
                                            onClick={() => toggleGenus(canonical)}
                                        >
                                            <td className="px-6 py-3 text-sm font-bold text-tinta" colSpan={2}>
                                                <div className="flex items-center gap-2">
                                                    <svg className={`w-3 h-3 text-tinta-tenue transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                    {emoji} {canonical}
                                                    <span className="text-[10px] font-semibold bg-papel-borde text-tinta-suave px-1.5 py-0.5 rounded-full">{species.length} especies</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-sm font-bold text-tinta-suave">{totalQty}</td>
                                            <td className="px-6 py-3 text-sm text-tinta-tenue">{species[0]?.unit}</td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getGenusStatusColor(species)}`}>
                                                    {species.some(i => i.quantity <= 0 && i.minStock > 0) ? 'Agotado' : species.some(i => i.quantity <= i.minStock && i.minStock > 0) ? 'Bajo Stock' : 'OK'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3"></td>
                                        </tr>
                                    )}
                                    {/* Species rows */}
                                    {isExpanded && species.map(item => (
                                        <tr key={item.id} className={`hover:bg-papel-hondo ${multiSpecies ? 'bg-papel' : ''}`}>
                                            <td className={`px-6 py-4 text-sm font-medium text-tinta cursor-pointer ${multiSpecies ? 'pl-12' : ''}`} onClick={() => onItemHistory(item)}>
                                                {multiSpecies
                                                    ? (item.name.match(/\(([^)]+)\)/)?.[1] ?? item.name)
                                                    : item.name
                                                }
                                                {item.inventoryType === InventoryType.ELECTRICAL_TOOL && (item.brand || item.color) && !multiSpecies && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {item.brand && <span className="text-[10px] font-semibold bg-marca-suave text-marca-oscuro px-1.5 py-0.5 rounded-full">{item.brand}</span>}
                                                        {item.color && <span className="text-[10px] font-semibold bg-marca-suave text-marca-oscuro px-1.5 py-0.5 rounded-full">{item.color}</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-tinta-tenue">{item.subCategory}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-tinta font-semibold">{item.quantity}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-tinta-tenue">{item.unit}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStockStatusColor(item)}`}>
                                                    {getStockStatusText(item)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                                <button onClick={() => { onBehaviorLog?.('BUTTON', `Ver historial: ${item.name}`); onItemHistory(item); }} className="text-marca-oscuro hover:text-tinta p-1" title="Ver Historial (Kardex)">
                                                    <HistoryIcon className="w-5 h-5"/>
                                                </button>
                                                {userRole !== UserRole.VISITOR && (
                                                    <>
                                                        <button onClick={() => { onBehaviorLog?.('BUTTON', `Editó ítem: ${item.name}`); onEditItem(item); }} className="text-marca-oscuro hover:text-marca-oscuro p-1" title="Editar">
                                                            <EditIcon className="w-5 h-5"/>
                                                        </button>
                                                        <button onClick={() => { onBehaviorLog?.('ACTION', `Eliminó ítem: ${item.name}`); onDeleteItem(item.id); }} className="text-alerta hover:text-alerta p-1" title="Eliminar">
                                                            <TrashIcon className="w-5 h-5"/>
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
                {genusList.length === 0 && (
                    <div className="text-center py-10 text-tinta-tenue">
                        <p>{search ? `No se encontraron artículos para "${search}".` : 'No hay artículos en esta categoría.'}</p>
                    </div>
                )}
            </div>
            <div ref={bottomSentinelRef} className="h-px" />
        </div>
    );
};
