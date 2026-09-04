
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Item, InventoryType, UserRole, Movement, Personnel } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { EditIcon } from './icons/EditIcon';
import { TrashIcon } from './icons/TrashIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { getGenus, normStr, clusterGenera } from '../utils/genus';

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

export const InventoryView: React.FC<InventoryViewProps> = ({ items, movements = [], personnel = [], openAddItemModal, onEditItem, onDeleteItem, onItemHistory, onOpenInvoiceReader, userRole, category, onGoBack, onBehaviorLog }) => {
    const [search, setSearch] = useState('');
    const [expandedGenus, setExpandedGenus] = useState<Set<string>>(new Set());
    const bottomSentinelRef = useRef<HTMLDivElement>(null);
    const activeLoans = useMemo(() => movements.filter(m => m.isLoan && !m.isReturned), [movements]);

    useEffect(() => {
        const el = bottomSentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) onBehaviorLog?.('SCROLL', 'Llegó al fondo: Inventario');
        }, { threshold: 0.5 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleGenus = (g: string) => setExpandedGenus(prev => {
        const next = new Set(prev);
        next.has(g) ? next.delete(g) : next.add(g);
        return next;
    });

    const displayItems = useMemo(() => {
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'es'));
        if (!search.trim()) return sorted;
        const q = normStr(search);
        return sorted.filter(i => {
            if (normStr(i.name).includes(q)) return true;
            if (normStr(getGenus(i.name)).includes(q)) return true;
            if (normStr(i.subCategory).includes(q)) return true;
            if (normStr(i.category).includes(q)) return true;
            const loan = activeLoans.find(m => m.itemId === i.id);
            if (loan?.personnelId) {
                const name = personnel.find(p => p.id === loan.personnelId)?.name ?? '';
                if (normStr(name).includes(q)) return true;
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
            const g = fam.species[0]?.subCategory?.trim() || 'General';
            if (!porGrupo.has(g)) porGrupo.set(g, []);
            porGrupo.get(g)!.push(fam);
        }
        // "General" al final: es el cajón de lo que todavía no tiene grupo, y
        // no tiene por qué encabezar la lista.
        const grupos = [...porGrupo.keys()].sort((a, b) =>
            a === 'General' ? 1 : b === 'General' ? -1 : a.localeCompare(b, 'es'));

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
        if (item.minStock <= 0) return 'bg-gray-200 text-gray-800';
        if (item.quantity <= 0) return 'bg-red-200 text-red-800';
        if (item.quantity <= item.minStock) return 'bg-yellow-200 text-yellow-800';
        return 'bg-green-200 text-green-800';
    };

    const getStockStatusText = (item: Item) => {
        if (item.minStock <= 0) return 'N/A';
        if (item.quantity <= 0) return 'Agotado';
        if (item.quantity <= item.minStock) return 'Bajo Stock';
        return 'OK';
    };

    const getGenusStatusColor = (species: Item[]) => {
        if (species.some(i => i.quantity <= 0 && i.minStock > 0)) return 'bg-red-200 text-red-800';
        if (species.some(i => i.quantity <= i.minStock && i.minStock > 0)) return 'bg-yellow-200 text-yellow-800';
        if (species.every(i => i.minStock <= 0)) return 'bg-gray-200 text-gray-800';
        return 'bg-green-200 text-green-800';
    };

    const INV_EMOJI: Record<InventoryType, string> = {
        [InventoryType.ELECTRICAL_TOOL]: '⚡',
        [InventoryType.HAND_TOOL]: '🔨',
        [InventoryType.PPE]: '🦺',
        [InventoryType.SINGLE_USE]: '📦',
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                <div className="flex items-center">
                    <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                      <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                    </button>
                    <h2 className="text-2xl font-semibold text-gray-800">
                        {category || 'Todos los Artículos'}
                    </h2>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-56">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onBlur={e => { if (e.target.value.trim().length > 1) onBehaviorLog?.('SEARCH', `Buscó en inventario: "${e.target.value.trim()}"`); }}
                            placeholder="Buscar artículo..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>
                    {userRole !== UserRole.VISITOR && (
                        <button onClick={openAddItemModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm whitespace-nowrap">
                            <PlusIcon className="w-5 h-5 mr-2" />
                            Añadir
                        </button>
                    )}
                </div>
            </div>
            {search && (
                <p className="text-xs text-gray-400 mb-3">{displayItems.length} resultado{displayItems.length !== 1 ? 's' : ''} para "{search}"</p>
            )}

            {/* Mobile cards — agrupadas por género */}
            <div className="md:hidden space-y-2 mb-2">
                {filasAgrupadas.map(fila => {
                    if (fila.tipo === 'grupo') {
                        return (
                            <div key={`grupo-${fila.grupo}`} className="flex items-baseline gap-2 pt-3 pb-1 px-1">
                                <p className="text-[11px] font-black text-indigo-700 uppercase tracking-widest">{fila.grupo}</p>
                                <span className="text-[10px] text-gray-400">{fila.familias} familia{fila.familias !== 1 ? 's' : ''}</span>
                                <span className="flex-1 border-b border-gray-200" />
                            </div>
                        );
                    }
                    const { canonical, species } = fila.cluster;
                    const isExpanded = expandedGenus.has(canonical) || species.length === 1;
                    const totalQty = species.reduce((s, i) => s + i.quantity, 0);
                    const emoji = INV_EMOJI[species[0]?.inventoryType] ?? '📦';
                    const singleItem = species.length === 1 ? species[0] : null;

                    return (
                        <div key={canonical} className="border border-gray-200 rounded-lg overflow-hidden">
                            {/* Genus header */}
                            <div
                                className={`flex items-center justify-between px-3 py-2.5 bg-gray-50 ${species.length > 1 ? 'cursor-pointer active:bg-gray-100' : ''}`}
                                onClick={() => species.length > 1 && toggleGenus(canonical)}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-gray-900 text-sm leading-snug">
                                        {emoji} {canonical}
                                    </p>
                                    {species.length > 1 && (
                                        <p className="text-[10px] text-gray-400">{species.length} especies · {totalQty} en total</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                    {singleItem && (
                                        <>
                                            <span className="text-sm font-bold text-gray-800">{singleItem.quantity} <span className="text-xs font-normal text-gray-500">{singleItem.unit}</span></span>
                                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStockStatusColor(singleItem)}`}>{getStockStatusText(singleItem)}</span>
                                        </>
                                    )}
                                    {species.length > 1 && (
                                        <>
                                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getGenusStatusColor(species)}`}>{species.length} esp.</span>
                                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </>
                                    )}
                                    {singleItem && (
                                        <div className="flex gap-1">
                                            <button onClick={e => { e.stopPropagation(); onBehaviorLog?.('BUTTON', `Ver historial: ${singleItem.name}`); onItemHistory(singleItem); }} className="text-blue-500 p-1" title="Historial"><HistoryIcon className="w-4 h-4"/></button>
                                            {userRole !== UserRole.VISITOR && (
                                                <>
                                                    <button onClick={e => { e.stopPropagation(); onBehaviorLog?.('BUTTON', `Editó ítem: ${singleItem.name}`); onEditItem(singleItem); }} className="text-indigo-500 p-1"><EditIcon className="w-4 h-4"/></button>
                                                    <button onClick={e => { e.stopPropagation(); onBehaviorLog?.('ACTION', `Eliminó ítem: ${singleItem.name}`); onDeleteItem(singleItem.id); }} className="text-red-400 p-1"><TrashIcon className="w-4 h-4"/></button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Species list (expandable) */}
                            {species.length > 1 && isExpanded && (
                                <div className="divide-y divide-gray-100">
                                    {species.map(item => {
                                        const speciesLabel = item.name.match(/\(([^)]+)\)/)?.[1] ?? item.name;
                                        return (
                                            <div key={item.id} className="flex items-center justify-between px-3 py-2 bg-white gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-semibold text-gray-700 cursor-pointer" onClick={() => onItemHistory(item)}>{speciesLabel}</p>
                                                    {item.inventoryType === InventoryType.ELECTRICAL_TOOL && (item.brand || item.color) && (
                                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                                            {item.brand && <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{item.brand}</span>}
                                                            {item.color && <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{item.color}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span className="text-sm font-bold text-gray-800">{item.quantity} <span className="text-xs font-normal text-gray-500">{item.unit}</span></span>
                                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStockStatusColor(item)}`}>{getStockStatusText(item)}</span>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => { onBehaviorLog?.('BUTTON', `Ver historial: ${item.name}`); onItemHistory(item); }} className="text-blue-500 p-1" title="Historial"><HistoryIcon className="w-4 h-4"/></button>
                                                        {userRole !== UserRole.VISITOR && (
                                                            <>
                                                                <button onClick={() => { onBehaviorLog?.('BUTTON', `Editó ítem: ${item.name}`); onEditItem(item); }} className="text-indigo-500 p-1"><EditIcon className="w-4 h-4"/></button>
                                                                <button onClick={() => { onBehaviorLog?.('ACTION', `Eliminó ítem: ${item.name}`); onDeleteItem(item.id); }} className="text-red-400 p-1"><TrashIcon className="w-4 h-4"/></button>
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
                    <p className="text-center py-8 text-gray-500 text-sm">{search ? `Sin resultados para "${search}".` : 'No hay artículos en esta categoría.'}</p>
                )}
            </div>

            {/* Desktop table — agrupada por género */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sub-Clasificación</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
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
                                            className="bg-gray-50 hover:bg-gray-100 cursor-pointer"
                                            onClick={() => toggleGenus(canonical)}
                                        >
                                            <td className="px-6 py-3 text-sm font-bold text-gray-800" colSpan={2}>
                                                <div className="flex items-center gap-2">
                                                    <svg className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                    {emoji} {canonical}
                                                    <span className="text-[10px] font-semibold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{species.length} especies</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-sm font-bold text-gray-700">{totalQty}</td>
                                            <td className="px-6 py-3 text-sm text-gray-400">{species[0]?.unit}</td>
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
                                        <tr key={item.id} className={`hover:bg-gray-50 ${multiSpecies ? 'bg-white' : ''}`}>
                                            <td className={`px-6 py-4 text-sm font-medium text-gray-900 cursor-pointer ${multiSpecies ? 'pl-12' : ''}`} onClick={() => onItemHistory(item)}>
                                                {multiSpecies
                                                    ? (item.name.match(/\(([^)]+)\)/)?.[1] ?? item.name)
                                                    : item.name
                                                }
                                                {item.inventoryType === InventoryType.ELECTRICAL_TOOL && (item.brand || item.color) && !multiSpecies && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {item.brand && <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{item.brand}</span>}
                                                        {item.color && <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{item.color}</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.subCategory}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold">{item.quantity}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.unit}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStockStatusColor(item)}`}>
                                                    {getStockStatusText(item)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                                <button onClick={() => { onBehaviorLog?.('BUTTON', `Ver historial: ${item.name}`); onItemHistory(item); }} className="text-blue-600 hover:text-blue-900 p-1" title="Ver Historial (Kardex)">
                                                    <HistoryIcon className="w-5 h-5"/>
                                                </button>
                                                {userRole !== UserRole.VISITOR && (
                                                    <>
                                                        <button onClick={() => { onBehaviorLog?.('BUTTON', `Editó ítem: ${item.name}`); onEditItem(item); }} className="text-indigo-600 hover:text-indigo-900 p-1" title="Editar">
                                                            <EditIcon className="w-5 h-5"/>
                                                        </button>
                                                        <button onClick={() => { onBehaviorLog?.('ACTION', `Eliminó ítem: ${item.name}`); onDeleteItem(item.id); }} className="text-red-600 hover:text-red-900 p-1" title="Eliminar">
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
                    <div className="text-center py-10 text-gray-500">
                        <p>{search ? `No se encontraron artículos para "${search}".` : 'No hay artículos en esta categoría.'}</p>
                    </div>
                )}
            </div>
            <div ref={bottomSentinelRef} className="h-px" />
        </div>
    );
};
