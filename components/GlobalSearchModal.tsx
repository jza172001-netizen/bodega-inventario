
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Item, Movement, Personnel, InventoryType } from '../types';
import { getGenus } from '../utils/genus';
import { rankMatches } from '../utils/search';
import { getActiveLoansByItem } from '../utils/inventory';

interface GlobalSearchModalProps {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    onClose: () => void;
    onNavigate: (view: string, tab?: string) => void;
    onBehaviorLog?: (action: string, detail: string) => void;
}

const TYPE_LABEL: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: '⚡',
    [InventoryType.HAND_TOOL]:       '🔨',
    [InventoryType.PPE]:             '🦺',
    [InventoryType.SINGLE_USE]:      '📦',
};

// Orden en que se pintan los grupos. Las herramientas primero porque son las
// que más se buscan para reclamar.
const CAT_ORDER: InventoryType[] = [
    InventoryType.HAND_TOOL,
    InventoryType.ELECTRICAL_TOOL,
    InventoryType.PPE,
    InventoryType.SINGLE_USE,
];

const CAT_NAME: Record<InventoryType, string> = {
    [InventoryType.HAND_TOOL]:       'H. Manual',
    [InventoryType.ELECTRICAL_TOOL]: 'H. Eléctrica',
    [InventoryType.PPE]:             'EPP',
    [InventoryType.SINGLE_USE]:      'Consumibles',
};

// Topes generosos: esto sugiere, no filtra. Cortar de más es lo que hacía que
// no apareciera lo que uno buscaba al escribir mal.
const MAX_TOTAL   = 30;
const MAX_BEST    = 3;
const MAX_PER_CAT = 6;
const MAX_PERSON  = 8;

type Hit =
    | { kind: 'item';   score: number; item: Item; holders: string[]; recent: Movement[] }
    | { kind: 'person'; score: number; person: Personnel; loanItems: Item[] };

const hitKey = (h: Hit) => h.kind === 'item' ? `i:${h.item.id}` : `p:${h.person.id}`;

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
    items, movements, personnel, onClose, onNavigate, onBehaviorLog,
}) => {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const itemMap      = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);
    const loansByItem  = useMemo(() => getActiveLoansByItem(movements), [movements]);

    const q = query.trim();

    const itemHits = useMemo<Hit[]>(() => {
        if (q.length < 2) return [];
        // Se puede llegar a un ítem por su nombre, por su género ("Pulidora" sin
        // el color y la marca) o por su subcategoría.
        return rankMatches(items, q, i => [i.name, getGenus(i.name), i.subCategory], MAX_TOTAL)
            .map(({ value: item, score }) => ({
                kind: 'item' as const,
                score,
                item,
                // Todos los tenedores, no solo el primero.
                holders: (loansByItem.get(item.id) ?? [])
                    .map(m => personnelMap.get(m.personnelId ?? '')?.name)
                    .filter(Boolean) as string[],
                recent: movements
                    .filter(m => m.itemId === item.id)
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
            }));
    }, [q, items, movements, personnelMap, loansByItem]);

    const personHits = useMemo<Hit[]>(() => {
        if (q.length < 2) return [];
        return rankMatches(personnel, q, p => [p.name], MAX_PERSON + MAX_BEST)
            .map(({ value: person, score }) => ({
                kind: 'person' as const,
                score,
                person,
                loanItems: movements
                    .filter(m => m.personnelId === person.id && m.isLoan && !m.isReturned)
                    .map(m => itemMap.get(m.itemId))
                    .filter(Boolean) as Item[],
            }));
    }, [q, personnel, movements, itemMap]);

    // Lo más parecido gana, sea persona o ítem: si escribiste mal el nombre de
    // una herramienta, no querés que un trabajador te quede de primero.
    const best = useMemo(
        () => [...itemHits, ...personHits].sort((a, b) => b.score - a.score).slice(0, MAX_BEST),
        [itemHits, personHits]
    );
    const bestKeys = useMemo(() => new Set(best.map(hitKey)), [best]);

    const catGroups = useMemo(() =>
        CAT_ORDER.map(type => ({
            type,
            hits: itemHits.filter(h => h.kind === 'item' && h.item.inventoryType === type && !bestKeys.has(hitKey(h))).slice(0, MAX_PER_CAT),
        })).filter(g => g.hits.length > 0),
        [itemHits, bestKeys]
    );

    const personGroup = useMemo(
        () => personHits.filter(h => !bestKeys.has(hitKey(h))).slice(0, MAX_PERSON),
        [personHits, bestKeys]
    );

    const hasResults = best.length > 0;

    const closeWithLog = () => {
        if (q.length >= 2) onBehaviorLog?.('SEARCH_QUERY', `Buscó: ${q}`);
        onClose();
    };

    const PersonRow: React.FC<{ h: Hit & { kind: 'person' }; showCat?: boolean }> = ({ h, showCat }) => (
        <button
            onClick={() => { onBehaviorLog?.('SEARCH_SELECT', `Seleccionó personal: ${h.person.name}`); onNavigate('kardex', 'loans'); onClose(); }}
            className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 transition-colors"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm">👷</span>
                        <span className="font-semibold text-gray-900 text-sm">{h.person.name}</span>
                        {showCat && (
                            <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Personal</span>
                        )}
                    </div>
                    {h.person.phone && <p className="text-xs text-gray-400 mt-0.5">{h.person.phone}</p>}
                    {h.loanItems.length > 0 ? (
                        <p className="text-xs text-yellow-700 font-semibold mt-1">
                            🔑 Tiene: {h.loanItems.map(i => i.name).join(', ')}
                        </p>
                    ) : (
                        <p className="text-xs text-green-600 mt-1">✅ Sin préstamos activos</p>
                    )}
                </div>
                <span className="text-[10px] text-blue-400 font-semibold flex-shrink-0 mt-0.5">Ver préstamos →</span>
            </div>
        </button>
    );

    const ItemRow: React.FC<{ h: Hit & { kind: 'item' }; showCat?: boolean }> = ({ h, showCat }) => (
        <button
            onClick={() => { onBehaviorLog?.('SEARCH_SELECT', `Seleccionó ítem: ${h.item.name}`); onNavigate('kardex', 'inventory'); onClose(); }}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 transition-colors"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm">{TYPE_LABEL[h.item.inventoryType]}</span>
                        <span className="font-semibold text-gray-900 text-sm truncate">{h.item.name}</span>
                        {showCat && (
                            <span className="text-[9px] font-black bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                {CAT_NAME[h.item.inventoryType]}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{h.item.subCategory}</p>
                    {h.holders.length > 0 && (
                        <p className="text-xs text-yellow-700 font-semibold mt-1">
                            🔑 Con {h.holders.join(', ')}
                        </p>
                    )}
                    {h.recent.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-1">
                            Último mov: {new Date(h.recent[0].timestamp).toLocaleDateString('es-CO')} · {h.recent[0].type}
                        </p>
                    )}
                </div>
                <div className="flex-shrink-0 text-right">
                    <span className={`text-lg font-black ${h.item.quantity === 0 ? 'text-red-500' : h.item.quantity <= h.item.minStock && h.item.minStock > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                        {h.item.quantity}
                    </span>
                    <p className="text-[10px] text-gray-400">{h.item.unit}</p>
                </div>
            </div>
        </button>
    );

    const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <p className="px-4 pt-3 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50/60">{children}</p>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={closeWithLog}>
            <div
                className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar herramienta, material o persona..."
                        className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                    <button onClick={closeWithLog} className="text-gray-400 hover:text-gray-600 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-100">
                        ESC
                    </button>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {q.length < 2 && (
                        <p className="text-center py-10 text-gray-400 text-sm">Escribe al menos 2 caracteres…</p>
                    )}
                    {q.length >= 2 && !hasResults && (
                        <div className="text-center py-10 px-6">
                            <p className="text-gray-400 text-sm">Nada se parece a «{q}».</p>
                            <p className="text-gray-300 text-xs mt-1">Probá con menos letras.</p>
                        </div>
                    )}

                    {best.length > 0 && (
                        <>
                            <SectionTitle>Mejores coincidencias</SectionTitle>
                            {best.map(h => h.kind === 'item'
                                ? <ItemRow key={hitKey(h)} h={h} showCat />
                                : <PersonRow key={hitKey(h)} h={h} showCat />)}
                        </>
                    )}

                    {catGroups.map(({ type, hits }) => (
                        <React.Fragment key={type}>
                            <SectionTitle>{TYPE_LABEL[type]} {CAT_NAME[type]}</SectionTitle>
                            {hits.map(h => h.kind === 'item' ? <ItemRow key={hitKey(h)} h={h} /> : null)}
                        </React.Fragment>
                    ))}

                    {personGroup.length > 0 && (
                        <>
                            <SectionTitle>👷 Personal</SectionTitle>
                            {personGroup.map(h => h.kind === 'person' ? <PersonRow key={hitKey(h)} h={h} /> : null)}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
