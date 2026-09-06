
import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Movement, Item, Personnel, UserRole, InventoryType, ReturnCondition } from '../types';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { ClockIcon } from './icons/ClockIcon';
import { ReturnToolModal } from './ReturnToolModal';
import { getGenus, looseMatch } from '../utils/genus';
import { AccesoriosDeItem, AgregarAccesorio } from './AccesoriosDeItem';
import { getActiveToolLoans, getConsumedMovements } from '../utils/inventory';

/**
 * Dos lentes sobre la misma pantalla, porque son dos preguntas distintas:
 *   préstamo → "¿dónde está y cuándo vuelve?"   (herramienta, vuelve)
 *   consumo  → "¿cuánto se gastó y en qué se va?" (EPP/consumible, no vuelve)
 * Meter todo por la primera era lo que hacía aparecer los guantes de Abel en
 * "Préstamos Activos", como si un guante se prestara.
 */
export type LoansLens = 'loans' | 'consumed';

interface LoansViewProps {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    onReturnItem: (movementId: string, condition?: string, notes?: string) => void;
    onMarkPendingPickup: (movementId: string, pending: boolean) => void;
    /** Con qué lente abre la vista. El deep-link desde el Resumen decide cuál. */
    initialLens?: LoansLens;
    onGoBack: () => void;
    userRole?: UserRole;
    onBehaviorLog?: (action: string, detail: string) => void;
    /** Para engancharle un consumible a la herramienta sin salir de la lista. */
    onEditItem?: (item: Item) => void;
    /** Para crear un consumible que todavía no existe y engancharlo de una. */
    onCreateItem?: (item: Omit<Item, 'id'>) => Item;
    /** Abre el histórico de una herramienta, igual que en Historial e Inventario. */
    onItemHistory?: (item: Item) => void;
}

// Los chips se recortan por lente: no tiene sentido ofrecer "EPP" filtrando
// préstamos de herramienta, ni "Manual" filtrando consumo.
const LOAN_FILTERS = [
    { key: '', label: 'Todas' },
    { key: InventoryType.HAND_TOOL,       label: '🔨 Manual' },
    { key: InventoryType.ELECTRICAL_TOOL, label: '⚡ Eléctrica' },
] as const;

const CONSUMED_FILTERS = [
    { key: '', label: 'Todos' },
    { key: InventoryType.PPE,             label: '🦺 EPP' },
    { key: InventoryType.SINGLE_USE,      label: '📦 Consumibles' },
] as const;

const INV_EMOJI: Record<string, string> = {
    [InventoryType.HAND_TOOL]:       '🔨',
    [InventoryType.ELECTRICAL_TOOL]: '⚡',
    [InventoryType.PPE]:             '🦺',
    [InventoryType.SINGLE_USE]:      '📦',
};

export const LoansView: React.FC<LoansViewProps> = ({
    movements, items, personnel, onReturnItem, onMarkPendingPickup, onGoBack, userRole = UserRole.EMPLOYEE, onBehaviorLog, onEditItem, onCreateItem, onItemHistory,
    initialLens = 'loans',
}) => {
    const isOwner = userRole !== UserRole.VISITOR;
    const [lens, setLens]             = useState<LoansLens>(initialLens);
    const [search, setSearch]         = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [returningLoan, setReturningLoan] = useState<Movement | null>(null);
    const bottomSentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = bottomSentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) onBehaviorLog?.('SCROLL', 'Llegó al fondo: Préstamos');
        }, { threshold: 0.5 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const itemMap   = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);

    const getItemName   = (id: string)  => itemMap.get(id)?.name ?? 'Desconocido';
    const getPersonName = (id?: string) => personMap.get(id ?? '')?.name ?? 'Sin asignar';
    const getDays       = (d: Date | string) =>
        Math.ceil(Math.abs(Date.now() - new Date(d).getTime()) / 86400000);

    const isConsumedLens = lens === 'consumed';
    const INV_FILTERS = isConsumedLens ? CONSUMED_FILTERS : LOAN_FILTERS;

    // Préstamos: solo herramienta — un guante no se presta, se gasta.
    // Consumidos: todo lo entregado que no vuelve, INCLUIDO lo que quedó marcado
    // como préstamo (los EPP viejos de antes del arreglo del default por tipo, y
    // el arnés que el bodeguero fuerza a propósito). Si los escondiéramos acá
    // quedarían en el limbo: fuera del lente de préstamos por ser consumibles, y
    // fuera de este por estar marcados.
    const activeLoans = useMemo(
        () => isConsumedLens ? getConsumedMovements(movements, itemMap) : getActiveToolLoans(movements, itemMap),
        [movements, itemMap, isConsumedLens]
    );

    const totalUnidades = useMemo(() => activeLoans.reduce((s, m) => s + m.quantity, 0), [activeLoans]);

    const filteredLoans = useMemo(() => {
        let list = activeLoans;
        if (typeFilter) list = list.filter(m => itemMap.get(m.itemId)?.inventoryType === typeFilter);
        if (search.trim()) {
            // `.includes()` a secas no perdona nada: "hector" no encontraba a
            // "Héctor" ni "amrtillo" al "Martillo". `looseMatch` es lo mismo que
            // usa el buscador general —sin tildes y aguantando errores de dedo— y
            // conserva el orden, así que el índice A-Z de la derecha sigue sirviendo.
            list = list.filter(m =>
                looseMatch(getItemName(m.itemId), search) ||
                looseMatch(getPersonName(m.personnelId), search)
            );
        }
        return list;
    }, [activeLoans, typeFilter, search, itemMap]); // eslint-disable-line react-hooks/exhaustive-deps

    // Group by genus → species → loans
    const genusGroups = useMemo(() => {
        const genusMap = new Map<string, { genus: string; speciesMap: Map<string, { item: Item; loans: Movement[] }> }>();
        for (const m of filteredLoans) {
            const item = itemMap.get(m.itemId);
            if (!item) continue;
            const g = getGenus(item.name);
            if (!genusMap.has(g)) genusMap.set(g, { genus: g, speciesMap: new Map() });
            const entry = genusMap.get(g)!;
            if (!entry.speciesMap.has(item.id)) entry.speciesMap.set(item.id, { item, loans: [] });
            entry.speciesMap.get(item.id)!.loans.push(m);
        }
        return [...genusMap.values()]
            .map(({ genus, speciesMap }) => ({ genus, species: [...speciesMap.values()] }))
            .sort((a, b) => a.genus.localeCompare(b.genus, 'es'));
    }, [filteredLoans, itemMap]);

    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    const activeLetters = useMemo(() => {
        const letters = new Set<string>();
        for (const { genus } of genusGroups) {
            letters.add(genus.charAt(0).toUpperCase());
        }
        return letters;
    }, [genusGroups]);

    const jumpToLetter = useCallback((letter: string) => {
        const el = document.querySelector(`[data-tool-letter="${letter}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const handleReturn = (loan: Movement) => {
        onBehaviorLog?.('BUTTON', `Abrió devolución: ${getItemName(loan.itemId)} (${getPersonName(loan.personnelId)})`);
        setReturningLoan(loan);
    };

    const confirmReturn = (ids: string[], condition: ReturnCondition, notes: string) => {
        ids.forEach(id => {
            const loan = movements.find(m => m.id === id);
            if (loan) onBehaviorLog?.('ACTION', `Confirmó devolución: ${getItemName(loan.itemId)} de ${getPersonName(loan.personnelId)} — ${condition}`);
            onReturnItem(id, condition, notes);
        });
        setReturningLoan(null);
    };

    // Lente de consumo: un consumible ya se gastó, así que no hay días de mora ni
    // nada que ir a recoger. Solo queda registrar cuánto se fue y con quién.
    const ConsumedRow: React.FC<{ mov: Movement }> = ({ mov }) => {
        const item = itemMap.get(mov.itemId);
        // Marcado como préstamo: es un EPP/consumible con isLoan pegado. Se muestra
        // acá (donde corresponde) pero conserva su botón de devolución para poder
        // cerrarlo, sin tener que tocar los datos históricos.
        const marcadoPrestamo = !!mov.isLoan && !mov.isReturned;

        return (
            <div className="py-2 border-l-2 border-papel-borde pl-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-tinta truncate">{getPersonName(mov.personnelId)}</p>
                    <p className="text-xs text-tinta-tenue">{new Date(mov.timestamp).toLocaleDateString('es-CO')}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-bien-suave text-bien">
                    ×{mov.quantity} {item?.unit ?? 'ud'}
                </span>
                {marcadoPrestamo && (
                    <>
                        <span className="text-[10px] font-bold bg-atencion-suave text-atencion px-1.5 py-0.5 rounded-full flex-shrink-0">
                            marcado como préstamo
                        </span>
                        {isOwner && (
                            <button onClick={() => handleReturn(mov)}
                                className="py-1 px-2 bg-marca hover:bg-marca-fuerte text-tinta text-[10px] font-bold rounded-lg transition-all flex-shrink-0">
                                ✓
                            </button>
                        )}
                    </>
                )}
            </div>
        );
    };

    const LoanRow: React.FC<{ loan: Movement }> = ({ loan }) => {
        if (isConsumedLens) return <ConsumedRow mov={loan} />;

        const days = getDays(loan.timestamp);
        const isPending = !!loan.pendingPickup;
        let rowClass = 'border-l-2 border-papel-borde pl-3';
        let daysBadge = 'bg-bien-suave text-bien';
        if (isPending)      { rowClass = 'border-l-2 border-marca pl-3'; daysBadge = 'bg-marca-suave text-marca-oscuro'; }
        else if (days > 14) { rowClass = 'border-l-2 border-alerta pl-3';    daysBadge = 'bg-alerta-suave text-alerta'; }
        else if (days > 7)  { rowClass = 'border-l-2 border-atencion pl-3'; daysBadge = 'bg-atencion-suave text-atencion'; }

        // El nombre va SOLO en su renglón. Antes competía en la misma línea con la
        // cantidad, los días, la etiqueta "Recoger", dos botones y un selector de
        // 92 px: en un teléfono de 390 px el nombre desaparecía —ni truncado, un
        // hilito encima de la fecha— y el botón de devolver se salía de la tarjeta.
        // Saber QUIÉN la tiene es la única razón por la que existe esta pantalla.
        return (
            <div className={`py-1.5 ${rowClass} space-y-1`}>
                {/* El nombre, los días y la fecha en UN renglón. Cada préstamo
                    gastaba 209 px para una línea de información: nombre arriba,
                    fecha en otra, botones en otra y el selector en una cuarta.
                    El `truncate` con `min-w-0` es lo que impide que el nombre
                    invada lo de al lado — no hace falta partirlo en renglones. */}
                <div className="flex items-baseline gap-2">
                    <p className="min-w-0 text-sm font-bold text-tinta truncate" title={getPersonName(loan.personnelId)}>
                        {getPersonName(loan.personnelId)}
                    </p>
                    <span className="flex-1 min-w-0 text-[11px] text-tinta-tenue truncate">
                        {new Date(loan.timestamp).toLocaleDateString('es-CO')} · ×{loan.quantity}
                    </span>
                    {isPending && <span className="text-[10px] font-black bg-marca text-tinta px-1.5 py-0.5 rounded-full flex-shrink-0">Recoger</span>}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${daysBadge}`}>{days}d</span>
                </div>

                {/* Lo que salió pegado a la herramienta. Acá se corrige y se quita:
                    antes solo se podía añadir, y un accesorio enganchado por error
                    se quedaba puesto para siempre. */}
                <AccesoriosDeItem item={itemMap.get(loan.itemId)}
                    onEditItem={isOwner ? onEditItem : undefined} onBehaviorLog={onBehaviorLog} />

                {/* Los tres en UNA línea. Envolviéndose gastaban 66 px de los 103
                    de la fila: dos renglones de botones para dos botones. */}
                <div className="flex flex-nowrap gap-1 items-center pt-0.5">
                    {isOwner && (
                        <button onClick={() => handleReturn(loan)}
                            className="flex-shrink-0 py-1.5 px-2.5 bg-marca hover:bg-marca-fuerte text-tinta text-[11px] font-black rounded-lg transition-all">
                            ✓ Devolver
                        </button>
                    )}
                    {!isPending ? (
                        <button onClick={() => { onBehaviorLog?.('ACTION', `Marcó recoger: ${getItemName(loan.itemId)}`); onMarkPendingPickup(loan.id, true); }}
                            className="flex-shrink-0 py-1.5 px-2.5 bg-papel-hondo hover:bg-marca-suave text-marca-oscuro text-[11px] font-bold rounded-lg transition-all">
                            📍 Recoger
                        </button>
                    ) : (
                        <button onClick={() => { onMarkPendingPickup(loan.id, false); }}
                            className="flex-shrink-0 py-1.5 px-2.5 bg-marca-suave text-marca-oscuro text-[11px] font-bold rounded-lg transition-all">
                            ✕ Cancelar
                        </button>
                    )}
                    {isOwner && onEditItem && itemMap.get(loan.itemId) && (
                        <AgregarAccesorio item={itemMap.get(loan.itemId)!} items={items}
                            onCreateItem={onCreateItem}
                            onEditItem={onEditItem} onBehaviorLog={onBehaviorLog} />
                    )}
                </div>
            </div>
        );
    };

    const seenGenusLetters = new Set<string>();

    return (
        <div className="relative">
            <div className="bg-papel p-2.5 md:p-6 rounded-2xl shadow-sm pr-8">
                <div className="flex items-center mb-1.5 md:mb-4">
                    <button onClick={onGoBack} className="mr-2 md:mr-4 p-1 md:p-2 rounded-full hover:bg-papel-hondo flex-shrink-0">
                        <ArrowLeftIcon className="w-5 h-5 text-tinta-suave" />
                    </button>
                    <div className="flex-1 min-w-0">
                        {/* El toggle de lente. Ojo: NO es la flecha de la izquierda,
                            que es el "volver" (onGoBack). */}
                        <button
                            onClick={() => {
                                const next: LoansLens = isConsumedLens ? 'loans' : 'consumed';
                                setLens(next);
                                setTypeFilter('');
                                onBehaviorLog?.('BUTTON', `Cambió lente: ${next === 'consumed' ? 'Elementos Consumidos' : 'Préstamos Activos'}`);
                            }}
                            className="group flex items-center gap-2 text-left"
                            title="Cambiar entre préstamos y consumo"
                        >
                            {/* No se puede quitar como el título de Inventario: ESTE es
                                el botón que alterna préstamos y consumidos. Se compacta. */}
                            <h2 className="text-sm md:text-xl font-black text-tinta flex items-center gap-1.5">
                                {isConsumedLens
                                    ? <span className="text-base md:text-2xl leading-none">📦</span>
                                    : <ClockIcon className="w-4 h-4 md:w-6 md:h-6 text-marca-oscuro" />}
                                {isConsumedLens ? 'Consumidos' : 'Préstamos'}
                            </h2>
                            <span className="flex-shrink-0 w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full bg-papel-hondo text-tinta-tenue text-xs font-black group-hover:bg-marca-suave group-hover:text-marca-oscuro transition-colors">
                                ›
                            </span>
                        </button>
                        <p className="text-[11px] text-tinta-tenue leading-tight">
                            {isConsumedLens
                                ? `${totalUnidades} consumidas · no vuelven`
                                : `${totalUnidades} fuera de bodega`}
                        </p>
                    </div>
                </div>

                {/* Chips de tipo */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 mb-1.5 md:mb-3 scrollbar-hide">
                    {INV_FILTERS.map(f => (
                        <button key={f.key} onClick={() => { setTypeFilter(f.key); onBehaviorLog?.('FILTER', `Filtro préstamos: ${f.label}`); }}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                                typeFilter === f.key
                                    ? 'bg-marca text-tinta shadow-sm'
                                    : 'bg-papel-hondo text-tinta-suave hover:bg-papel-borde'
                            }`}>
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Búsqueda */}
                {activeLoans.length > 0 && (
                    <div className="relative mb-1.5 md:mb-4">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-tenue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder={isConsumedLens ? 'Buscar material o persona...' : 'Buscar herramienta o persona...'}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-papel-borde rounded-xl focus:outline-none focus:ring-2 focus:ring-marca"
                            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
                    </div>
                )}

                {activeLoans.length === 0 ? (
                    <div className="text-center py-16 text-tinta-tenue">
                        <p className="text-4xl mb-3">{isConsumedLens ? '📦' : '🎉'}</p>
                        <p className="font-semibold">{isConsumedLens ? 'Sin consumo registrado' : '¡Todo está en bodega!'}</p>
                    </div>
                ) : filteredLoans.length === 0 ? (
                    <p className="text-center py-10 text-tinta-tenue text-sm">Sin resultados.</p>
                ) : (
                    // Antes: 16 px entre familias, encabezado alto y más relleno
                    // adentro — 209 px por herramienta para una línea de información.
                    <div className="space-y-1.5">
                        {genusGroups.map(({ genus, species }) => {
                            const letter = genus.charAt(0).toUpperCase();
                            const isFirst = !seenGenusLetters.has(letter);
                            if (isFirst) seenGenusLetters.add(letter);
                            const totalLoans = species.reduce((s, sp) => s + sp.loans.reduce((n, l) => n + l.quantity, 0), 0);
                            const emoji = INV_EMOJI[species[0]?.item.inventoryType] ?? '📦';

                            return (
                                <div
                                    key={genus}
                                    className="rounded-xl border border-papel-borde bg-papel-hondo overflow-hidden"
                                    {...(isFirst ? { 'data-tool-letter': letter } : {})}
                                >
                                    {/* Genus header */}
                                    <div className="flex items-center justify-between px-3 py-1.5 bg-papel border-b border-papel-borde">
                                        <button type="button" className="min-w-0 flex-1 text-left"
                                            disabled={!onItemHistory || !species[0]}
                                            onClick={() => { if (species[0]) { onBehaviorLog?.('BUTTON', `Historial desde préstamos: ${genus}`); onItemHistory?.(species[0].item); } }}>
                                            {/* Desde Préstamos no había forma de ver el histórico de una
                                                herramienta: onItemHistory llegaba a Historial y a Inventario,
                                                pero no acá. */}
                                            <p className="font-black text-tinta text-sm leading-snug">
                                                {emoji} {genus}{onItemHistory && <span className="ml-1 text-tinta-tenue font-normal">›</span>}
                                            </p>
                                            {species.length > 1 && (
                                                <p className="text-[10px] text-tinta-tenue">{species.length} especies</p>
                                            )}
                                        </button>
                                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isConsumedLens ? 'bg-bien-suave text-bien' : 'bg-marca-suave text-marca-oscuro'}`}>
                                                {totalLoans} {isConsumedLens
                                                    ? `consumida${totalLoans !== 1 ? 's' : ''}`
                                                    : `prestada${totalLoans !== 1 ? 's' : ''}`}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Species → Loan rows */}
                                    <div className="px-3 py-1.5 space-y-1.5">
                                        {species.map(({ item, loans }) => (
                                            <div key={item.id}>
                                                {species.length > 1 && (
                                                    <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-wide mb-1">
                                                        {item.name.match(/\(([^)]+)\)/)?.[1] ?? item.name}
                                                        <span className="ml-1 font-normal text-tinta-tenue">· stock {item.quantity}</span>
                                                    </p>
                                                )}
                                                <div className="space-y-1">
                                                    {loans
                                                        .sort((a, b) => getDays(b.timestamp) - getDays(a.timestamp))
                                                        .map(loan => <LoanRow key={loan.id} loan={loan} />)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={bottomSentinelRef} className="h-px" />
                    </div>
                )}
            </div>

            {/* Índice alfabético lateral derecho — A-Z por herramienta */}
            {filteredLoans.length > 0 && (
                <div className="fixed right-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-30">
                    {ALPHABET.map(letter => {
                        const active = activeLetters.has(letter);
                        return (
                            <button
                                key={letter}
                                onClick={() => active && jumpToLetter(letter)}
                                disabled={!active}
                                className={`w-5 h-5 flex items-center justify-center text-[10px] font-black rounded-full transition-all ${
                                    active
                                        ? 'text-marca-oscuro hover:text-tinta hover:bg-marca cursor-pointer'
                                        : 'text-tinta-tenue cursor-default'
                                }`}
                            >
                                {letter}
                            </button>
                        );
                    })}
                </div>
            )}

            {returningLoan && (() => {
                const item = itemMap.get(returningLoan.itemId);
                if (!item) return null;
                return (
                    <ReturnToolModal
                        item={item}
                        personName={getPersonName(returningLoan.personnelId)}
                        movementIds={[returningLoan.id]}
                        onConfirm={confirmReturn}
                        onClose={() => setReturningLoan(null)}
                    />
                );
            })()}
        </div>
    );
};
