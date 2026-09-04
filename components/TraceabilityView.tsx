
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Movement, Item, Personnel, Project, ReturnCondition, InventoryType, AuditLog, BehaviorLog, AppUser, UserRole } from '../types';

interface Props {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    projects: Project[];
    auditLogs: AuditLog[];
    behaviorLogs: BehaviorLog[];
    users: AppUser[];
    onBehaviorLog?: (action: string, detail: string) => void;
}

type MainTab = 'actividad' | 'estadisticas' | 'herramientas';
type HerramientasTab = 'tools' | 'workers' | 'projects' | 'history';

const CONDITION_LABEL: Record<ReturnCondition, string> = {
    good:              '✅ Bueno',
    worn:              '🔧 Desgaste',
    incomplete:        '⚠️ Incompleta',
    damaged:           '❌ Dañada',
    needs_maintenance: '🔨 Mantenimiento',
};

const CONDITION_COLOR: Record<ReturnCondition, string> = {
    good:              'bg-green-100 text-green-800',
    worn:              'bg-yellow-100 text-yellow-800',
    incomplete:        'bg-orange-100 text-orange-800',
    damaged:           'bg-red-100 text-red-800',
    needs_maintenance: 'bg-purple-100 text-purple-800',
};

const ALL_CONDITIONS: ReturnCondition[] = ['good', 'worn', 'incomplete', 'damaged', 'needs_maintenance'];

const BEHAVIOR_CATEGORY: Record<string, { label: string; icon: string; color: string; bg: string }> = {
    SESSION: { label: 'Sesión',     icon: '🔐', color: 'text-indigo-700', bg: 'bg-indigo-50' },
    NAV:     { label: 'Navegación', icon: '🧭', color: 'text-blue-700',   bg: 'bg-blue-50'   },
    FILTER:  { label: 'Filtro',     icon: '🎛️', color: 'text-teal-700',   bg: 'bg-teal-50'   },
    SEARCH:  { label: 'Búsqueda',   icon: '🔎', color: 'text-gray-700',   bg: 'bg-gray-50'   },
    CHAT:    { label: 'Chatbot',    icon: '💬', color: 'text-purple-700', bg: 'bg-purple-50' },
    BUTTON:  { label: 'Botón',      icon: '🖱️', color: 'text-orange-700', bg: 'bg-orange-50' },
    ACTION:  { label: 'Acción',     icon: '✅', color: 'text-green-700',  bg: 'bg-green-50'  },
    SCROLL:  { label: 'Scroll',     icon: '📜', color: 'text-slate-700',  bg: 'bg-slate-50'  },
};

const AUDIT_CATEGORY: Record<string, { icon: string; color: string; bg: string }> = {
    ITEM_CREATED:       { icon: '📦', color: 'text-green-700',  bg: 'bg-green-50'  },
    ITEM_EDITED:        { icon: '✏️', color: 'text-blue-700',   bg: 'bg-blue-50'   },
    ITEM_DELETED:       { icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-50'    },
    STOCK_OUT:          { icon: '📤', color: 'text-orange-700', bg: 'bg-orange-50' },
    STOCK_IN:           { icon: '📥', color: 'text-green-700',  bg: 'bg-green-50'  },
    PERSONNEL_CREATED:  { icon: '👷', color: 'text-green-700',  bg: 'bg-green-50'  },
    PERSONNEL_EDITED:   { icon: '✏️', color: 'text-blue-700',   bg: 'bg-blue-50'   },
    PERSONNEL_DELETED:  { icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-50'    },
    LOAN_CREATED:       { icon: '🔑', color: 'text-indigo-700', bg: 'bg-indigo-50' },
    LOAN_RETURNED:      { icon: '✅', color: 'text-green-700',  bg: 'bg-green-50'  },
    LOAN_TRANSFERRED:   { icon: '🔄', color: 'text-blue-700',   bg: 'bg-blue-50'   },
    PICKUP_MARKED:      { icon: '📍', color: 'text-orange-700', bg: 'bg-orange-50' },
    PICKUP_CANCELLED:   { icon: '✕',  color: 'text-red-700',    bg: 'bg-red-50'    },
    PROJECT_CREATED:    { icon: '🏗️', color: 'text-green-700',  bg: 'bg-green-50'  },
    PROJECT_DELETED:    { icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-50'    },
    USER_CREATED:       { icon: '👤', color: 'text-green-700',  bg: 'bg-green-50'  },
    USER_DELETED:       { icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-50'    },
    USER_LOGIN:         { icon: '🔐', color: 'text-indigo-700', bg: 'bg-indigo-50' },
    USER_LOGOUT:        { icon: '🔓', color: 'text-gray-700',   bg: 'bg-gray-50'   },
    MOVEMENT_DELETED:   { icon: '⚠️', color: 'text-red-700',    bg: 'bg-red-50'    },
    USER_SETUP:         { icon: '🔑', color: 'text-indigo-700', bg: 'bg-indigo-50' },
    CONFIG_CHANGED:     { icon: '⚙️', color: 'text-blue-700',   bg: 'bg-blue-50'   },
    DATA_EXPORTED:      { icon: '⬇️', color: 'text-amber-700',  bg: 'bg-amber-50'  },
    DATA_IMPORTED:      { icon: '⬆️', color: 'text-amber-700',  bg: 'bg-amber-50'  },
    LOAN_PROJECT_ASSIGNED: { icon: '🏗️', color: 'text-purple-700', bg: 'bg-purple-50' },
    PO_CREATED:         { icon: '🛒', color: 'text-green-700',  bg: 'bg-green-50'  },
    PO_STATUS_CHANGED:  { icon: '🚚', color: 'text-blue-700',   bg: 'bg-blue-50'   },
    PO_DELETED:         { icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-50'    },
    WHATSAPP_SENT:      { icon: '📲', color: 'text-green-700',  bg: 'bg-green-50'  },
    PICKUP_NOTIFIED:    { icon: '📲', color: 'text-orange-700', bg: 'bg-orange-50' },
    REPORT_EXPORTED:    { icon: '📄', color: 'text-blue-700',   bg: 'bg-blue-50'   },
    AUDIT_CLEARED:      { icon: '🧹', color: 'text-red-700',    bg: 'bg-red-50'    },
};

/**
 * Los registros guardados antes de que salidas y entradas tuvieran acción
 * propia dicen ITEM_EDITED / ITEM_CREATED, y saldrían con el icono de "editado"
 * o "creado". Se corrige la LECTURA, mirando el prefijo de la descripción — el
 * registro guardado no se toca: una bitácora que se puede reescribir hacia
 * atrás deja de servir para lo único que sirve.
 */
const categoriaDe = (log: { action: string; description: string }) => {
    if (log.description.startsWith('📤')) return AUDIT_CATEGORY.STOCK_OUT;
    if (log.description.startsWith('📥')) return AUDIT_CATEGORY.STOCK_IN;
    return AUDIT_CATEGORY[log.action] ?? { icon: '•', color: 'text-gray-600', bg: 'bg-gray-50' };
};

type CombinedEntry =
    | { kind: 'behavior'; ts: Date; data: BehaviorLog }
    | { kind: 'audit';    ts: Date; data: AuditLog };

function getBehaviorCategory(action: string): keyof typeof BEHAVIOR_CATEGORY {
    if (action === 'SESSION' || action === 'USER_LOGIN' || action === 'USER_LOGOUT') return 'SESSION';
    if (action.startsWith('NAV')) return 'NAV';
    if (action.startsWith('FILTER')) return 'FILTER';
    if (action.startsWith('SEARCH')) return 'SEARCH';
    if (action.startsWith('CHAT')) return 'CHAT';
    if (action.startsWith('ACTION')) return 'ACTION';
    if (action.startsWith('SCROLL')) return 'SCROLL';
    return 'BUTTON';
}

export const TraceabilityView: React.FC<Props> = ({
    movements, items, personnel, projects, auditLogs, behaviorLogs, users, onBehaviorLog,
}) => {
    const [mainTab, setMainTab] = useState<MainTab>('actividad');
    const [herramientasTab, setHerramientasTab] = useState<HerramientasTab>('tools');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [actorFilter, setActorFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');

    const bottomSentinelRef = useRef<HTMLDivElement>(null);

    // Scroll sentinel — fires once when the bottom of the activity list becomes visible
    useEffect(() => {
        const el = bottomSentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) onBehaviorLog?.('SCROLL', 'Llegó al fondo: Trazabilidad');
        }, { threshold: 0.5 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const changeMainTab = (tab: MainTab) => {
        const label = tab === 'actividad' ? 'Actividad' : tab === 'estadisticas' ? 'Estadísticas' : 'Herramientas';
        setMainTab(tab);
        onBehaviorLog?.('NAV', `Trazabilidad → ${label}`);
    };

    const changeActorFilter = (actor: string) => {
        setActorFilter(actor);
        onBehaviorLog?.('FILTER', `Trazabilidad: actor=${actor || 'Todos'}`);
    };

    const changeTypeFilter = (type: string) => {
        setTypeFilter(type);
        onBehaviorLog?.('FILTER', `Trazabilidad: tipo=${type || 'Todo'}`);
    };

    const itemMap    = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personMap  = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);
    const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

    const allActors = useMemo(() => {
        const owners   = users.filter(u => u.role === UserRole.OWNER).map(u => u.name);
        const employees = users.filter(u => u.role === UserRole.EMPLOYEE).map(u => u.name);
        return [...owners, ...employees, 'Visitante'];
    }, [users]);

    const combinedEntries = useMemo<CombinedEntry[]>(() => {
        const bEntries: CombinedEntry[] = behaviorLogs.map(l => ({ kind: 'behavior', ts: new Date(l.timestamp), data: l }));
        const aEntries: CombinedEntry[] = auditLogs.map(l => ({ kind: 'audit', ts: new Date(l.timestamp), data: l }));
        return [...bEntries, ...aEntries].sort((a, b) => b.ts.getTime() - a.ts.getTime());
    }, [behaviorLogs, auditLogs]);

    const filteredEntries = useMemo(() => {
        return combinedEntries.filter(e => {
            const actor = e.data.actor;
            const action = e.data.action;
            if (actorFilter && actor !== actorFilter) return false;
            if (typeFilter) {
                if (typeFilter === 'SESSION' && e.kind === 'behavior') return getBehaviorCategory(action) === 'SESSION';
                if (typeFilter === 'SESSION' && e.kind === 'audit') return action === 'USER_LOGIN' || action === 'USER_LOGOUT';
                if (typeFilter === 'NAV' && e.kind === 'behavior') return getBehaviorCategory(action) === 'NAV';
                if (typeFilter === 'FILTER' && e.kind === 'behavior') return getBehaviorCategory(action) === 'FILTER';
                if (typeFilter === 'SEARCH' && e.kind === 'behavior') return getBehaviorCategory(action) === 'SEARCH';
                if (typeFilter === 'CHAT' && e.kind === 'behavior') return getBehaviorCategory(action) === 'CHAT';
                if (typeFilter === 'BUTTON' && e.kind === 'behavior') return getBehaviorCategory(action) === 'BUTTON';
                if (typeFilter === 'ACTION' && e.kind === 'behavior') return getBehaviorCategory(action) === 'ACTION';
                if (typeFilter === 'SCROLL' && e.kind === 'behavior') return getBehaviorCategory(action) === 'SCROLL';
                if (typeFilter === 'NEGOCIO' && e.kind === 'audit') return action !== 'USER_LOGIN' && action !== 'USER_LOGOUT';
                return false;
            }
            return true;
        });
    }, [combinedEntries, actorFilter, typeFilter]);

    // Existing stats
    const actionCounts = useMemo(() => {
        const map = new Map<string, number>();
        behaviorLogs.forEach(l => map.set(l.detail, (map.get(l.detail) ?? 0) + 1));
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }, [behaviorLogs]);

    const actorStats = useMemo(() => {
        const map = new Map<string, { count: number; lastSeen: Date; categories: Map<string, number> }>();
        const process = (actor: string, ts: Date, action: string) => {
            if (!actor) return;
            if (!map.has(actor)) map.set(actor, { count: 0, lastSeen: ts, categories: new Map() });
            const e = map.get(actor)!;
            e.count++;
            if (ts > e.lastSeen) e.lastSeen = ts;
            const cat = getBehaviorCategory(action);
            e.categories.set(cat, (e.categories.get(cat) ?? 0) + 1);
        };
        behaviorLogs.forEach(l => process(l.actor, new Date(l.timestamp), l.action));
        auditLogs.forEach(l => process(l.actor, new Date(l.timestamp), l.action));
        return [...map.entries()].map(([actor, v]) => {
            const topCat = [...v.categories.entries()].sort((a, b) => b[1] - a[1])[0];
            return { actor, count: v.count, lastSeen: v.lastSeen, topCat };
        }).sort((a, b) => b.count - a.count);
    }, [behaviorLogs, auditLogs]);

    const searchQueries = useMemo(() =>
        behaviorLogs.filter(l => l.action === 'SEARCH_QUERY').slice(0, 20), [behaviorLogs]);

    const chatMessages = useMemo(() =>
        behaviorLogs.filter(l => l.action === 'CHAT_MESSAGE').slice(0, 20), [behaviorLogs]);

    // New stats
    const categoryCounts = useMemo(() => {
        const map = new Map<string, number>();
        behaviorLogs.forEach(l => {
            const cat = getBehaviorCategory(l.action);
            map.set(cat, (map.get(cat) ?? 0) + 1);
        });
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }, [behaviorLogs]);

    const sectionVisits = useMemo(() => {
        const map = new Map<string, number>();
        behaviorLogs
            .filter(l => l.action === 'NAV' && l.detail.startsWith('Abrió '))
            .forEach(l => {
                const section = l.detail.replace('Abrió ', '');
                map.set(section, (map.get(section) ?? 0) + 1);
            });
        return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    }, [behaviorLogs]);

    const filterUsage = useMemo(() => {
        const map = new Map<string, number>();
        behaviorLogs
            .filter(l => l.action === 'FILTER')
            .forEach(l => map.set(l.detail, (map.get(l.detail) ?? 0) + 1));
        return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    }, [behaviorLogs]);

    const hourlyActivity = useMemo(() => {
        const hours = new Array(24).fill(0) as number[];
        [...behaviorLogs, ...auditLogs].forEach(l => {
            const h = new Date(l.timestamp).getHours();
            hours[h]++;
        });
        return hours;
    }, [behaviorLogs, auditLogs]);

    // Tool condition data
    const returnedWithCondition = useMemo(() =>
        movements.filter(m =>
            m.isLoan && m.isReturned && m.returnCondition &&
            (itemMap.get(m.itemId)?.inventoryType === InventoryType.HAND_TOOL ||
             itemMap.get(m.itemId)?.inventoryType === InventoryType.ELECTRICAL_TOOL)
        ), [movements, itemMap]
    );

    const isIssue = (c: ReturnCondition) => c !== 'good' && c !== 'worn';

    const byTool = useMemo(() => {
        const map = new Map<string, { returns: number; issues: number; conditions: Record<string, number> }>();
        for (const m of returnedWithCondition) {
            if (!map.has(m.itemId)) map.set(m.itemId, { returns: 0, issues: 0, conditions: {} });
            const e = map.get(m.itemId)!;
            e.returns++;
            if (isIssue(m.returnCondition!)) e.issues++;
            e.conditions[m.returnCondition!] = (e.conditions[m.returnCondition!] ?? 0) + 1;
        }
        return [...map.entries()]
            .map(([id, v]) => ({ item: itemMap.get(id), id, ...v, issueRate: v.returns > 0 ? v.issues / v.returns : 0 }))
            .filter(r => r.item)
            .sort((a, b) => b.issueRate - a.issueRate || b.returns - a.returns);
    }, [returnedWithCondition, itemMap]);

    const byWorker = useMemo(() => {
        const map = new Map<string, { returns: number; issues: number }>();
        for (const m of returnedWithCondition) {
            const key = m.personnelId ?? '__none__';
            if (!map.has(key)) map.set(key, { returns: 0, issues: 0 });
            const e = map.get(key)!;
            e.returns++;
            if (isIssue(m.returnCondition!)) e.issues++;
        }
        return [...map.entries()]
            .map(([key, v]) => ({ name: key === '__none__' ? 'Sin asignar' : (personMap.get(key)?.name ?? 'Desconocido'), ...v, issueRate: v.returns > 0 ? v.issues / v.returns : 0 }))
            .sort((a, b) => b.issueRate - a.issueRate || b.returns - a.returns);
    }, [returnedWithCondition, personMap]);

    const byProject = useMemo(() => {
        const map = new Map<string, { returns: number; issues: number }>();
        for (const m of returnedWithCondition) {
            const key = m.projectId ?? '__none__';
            if (!map.has(key)) map.set(key, { returns: 0, issues: 0 });
            const e = map.get(key)!;
            e.returns++;
            if (isIssue(m.returnCondition!)) e.issues++;
        }
        return [...map.entries()]
            .map(([key, v]) => ({ name: key === '__none__' ? 'Sin proyecto' : (projectMap.get(key)?.name ?? 'Proyecto eliminado'), ...v, issueRate: v.returns > 0 ? v.issues / v.returns : 0 }))
            .sort((a, b) => b.issueRate - a.issueRate || b.returns - a.returns);
    }, [returnedWithCondition, projectMap]);

    const toolHistory = useMemo(() => {
        if (!selectedItemId) return [];
        return returnedWithCondition.filter(m => m.itemId === selectedItemId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [returnedWithCondition, selectedItemId]);

    const toolsWithHistory = useMemo(() =>
        [...new Set(returnedWithCondition.map(m => m.itemId))]
            .map(id => itemMap.get(id)).filter(Boolean)
            .sort((a, b) => a!.name.localeCompare(b!.name, 'es')) as Item[],
        [returnedWithCondition, itemMap]
    );

    const maxHourly = Math.max(...hourlyActivity, 1);

    const IssueBar = ({ rate }: { rate: number }) => (
        <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
                <div className={`h-1.5 rounded-full ${rate > 0.5 ? 'bg-red-500' : rate > 0.25 ? 'bg-orange-400' : 'bg-green-500'}`}
                    style={{ width: `${Math.round(rate * 100)}%` }} />
            </div>
            <span className={`text-xs font-black flex-shrink-0 ${rate > 0.5 ? 'text-red-600' : rate > 0.25 ? 'text-orange-600' : 'text-green-600'}`}>
                {Math.round(rate * 100)}%
            </span>
        </div>
    );

    return (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Main tab bar */}
            <div className="flex border-b border-gray-100 overflow-x-auto">
                {([
                    { key: 'actividad',    label: 'Actividad',     icon: '🔔' },
                    { key: 'estadisticas', label: 'Estadísticas',  icon: '📊' },
                    { key: 'herramientas', label: 'Herramientas',  icon: '🔧' },
                ] as { key: MainTab; label: string; icon: string }[]).map(t => (
                    <button key={t.key} onClick={() => changeMainTab(t.key)}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition-all border-b-2 ${
                            mainTab === t.key ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}>
                        <span>{t.icon}</span>
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                ))}
            </div>

            {/* ── ACTIVIDAD ── */}
            {mainTab === 'actividad' && (
                <div>
                    <div className="px-4 py-3 border-b border-gray-50 space-y-2">
                        {/* Actor filter */}
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                            <button onClick={() => changeActorFilter('')}
                                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-black transition-all ${!actorFilter ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                Todos
                            </button>
                            {allActors.map(actor => (
                                <button key={actor} onClick={() => changeActorFilter(actorFilter === actor ? '' : actor)}
                                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-black transition-all ${actorFilter === actor ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                    {actor}
                                </button>
                            ))}
                        </div>
                        {/* Type filter */}
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                            {[
                                { key: '', label: 'Todo' },
                                { key: 'SESSION', label: '🔐 Sesión' },
                                { key: 'NAV', label: '🧭 Nav' },
                                { key: 'FILTER', label: '🎛️ Filtros' },
                                { key: 'SEARCH', label: '🔎 Búsqueda' },
                                { key: 'CHAT', label: '💬 Chat' },
                                { key: 'BUTTON', label: '🖱️ Botones' },
                                { key: 'ACTION', label: '✅ Acciones' },
                                { key: 'SCROLL', label: '📜 Scroll' },
                                { key: 'NEGOCIO', label: '📋 Negocio' },
                            ].map(f => (
                                <button key={f.key} onClick={() => changeTypeFilter(f.key)}
                                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${typeFilter === f.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
                        {filteredEntries.length === 0 && (
                            <p className="text-center py-12 text-gray-400 text-sm">Sin actividad para este filtro.</p>
                        )}
                        {filteredEntries.map(entry => {
                            const timeStr = entry.ts.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

                            if (entry.kind === 'behavior') {
                                const l = entry.data;
                                const cat = BEHAVIOR_CATEGORY[getBehaviorCategory(l.action)] ?? BEHAVIOR_CATEGORY.BUTTON;
                                return (
                                    <div key={l.id} className={`flex items-start gap-3 px-4 py-2.5 ${cat.bg}`}>
                                        <span className="text-base flex-shrink-0 mt-0.5">{cat.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-semibold ${cat.color} leading-snug`}>{l.detail}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-gray-400">
                                                <span>{timeStr}</span>
                                                {l.actor && <><span>·</span><span className="font-semibold text-gray-500">{l.actor}</span></>}
                                                <span className={`px-1.5 py-0.5 rounded-full font-black uppercase tracking-wide ${cat.bg} ${cat.color} border border-current border-opacity-20`} style={{ fontSize: '9px' }}>
                                                    {cat.label}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            const log = entry.data;
                            const meta = categoriaDe(log);
                            return (
                                <div key={log.id} className={`flex items-start gap-3 px-4 py-2.5 ${meta.bg}`}>
                                    <span className="text-base flex-shrink-0 mt-0.5">{meta.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-semibold ${meta.color} leading-snug`}>{log.description}</p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-gray-400">
                                            <span>{timeStr}</span>
                                            {log.actor && <><span>·</span><span className="font-semibold text-gray-500">{log.actor}</span></>}
                                            <span className="px-1.5 py-0.5 rounded-full font-black uppercase tracking-wide bg-gray-100 text-gray-500" style={{ fontSize: '9px' }}>
                                                Negocio
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={bottomSentinelRef} className="h-px" />
                    </div>
                </div>
            )}

            {/* ── ESTADÍSTICAS ── */}
            {mainTab === 'estadisticas' && (
                <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto">

                    {/* Distribución por categoría */}
                    {categoryCounts.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Distribución por categoría</p>
                            {categoryCounts.map(([cat, count]) => {
                                const meta = BEHAVIOR_CATEGORY[cat];
                                const total = behaviorLogs.length || 1;
                                const pct = Math.round((count / total) * 100);
                                return (
                                    <div key={cat} className="flex items-center gap-3 py-1.5">
                                        <span className="text-sm w-5 flex-shrink-0">{meta?.icon ?? '•'}</span>
                                        <span className="text-xs font-semibold text-gray-600 w-20 flex-shrink-0">{meta?.label ?? cat}</span>
                                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                                            <div className={`h-2 rounded-full ${meta?.bg.replace('bg-', 'bg-').replace('-50', '-400') ?? 'bg-blue-400'}`}
                                                style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs font-black text-gray-700 w-10 text-right flex-shrink-0">{count}×</span>
                                        <span className="text-[10px] text-gray-400 w-8 flex-shrink-0">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Secciones más visitadas */}
                    {sectionVisits.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Secciones más visitadas</p>
                            {sectionVisits.map(([section, count], i) => (
                                <div key={section} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black flex-shrink-0 ${i === 0 ? 'bg-blue-500 text-white' : i === 1 ? 'bg-blue-300 text-white' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                                    <span className="flex-1 text-xs font-semibold text-gray-700 truncate">{section}</span>
                                    <span className="text-xs font-black text-blue-600 flex-shrink-0">{count}×</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Filtros más usados */}
                    {filterUsage.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Filtros más usados</p>
                            {filterUsage.map(([detail, count]) => (
                                <div key={detail} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                                    <span className="text-sm flex-shrink-0">🎛️</span>
                                    <span className="flex-1 text-xs text-gray-600 truncate">{detail}</span>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <div className="w-14 bg-gray-100 rounded-full h-1.5">
                                            <div className="h-1.5 rounded-full bg-teal-400"
                                                style={{ width: `${Math.round((count / (filterUsage[0]?.[1] ?? 1)) * 100)}%` }} />
                                        </div>
                                        <span className="text-xs font-black text-gray-700 w-6 text-right">{count}×</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Horario de uso */}
                    {behaviorLogs.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Actividad por hora del día</p>
                            <div className="flex items-end gap-0.5 h-16">
                                {hourlyActivity.map((count, h) => (
                                    <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                                        <div className="w-full bg-blue-500 rounded-t-sm transition-all"
                                            style={{ height: `${Math.round((count / maxHourly) * 52)}px`, opacity: count > 0 ? 1 : 0.15 }}
                                            title={`${h}:00 — ${count} eventos`} />
                                        {(h % 6 === 0) && (
                                            <span className="text-[8px] text-gray-400 font-semibold">{h}h</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actividad por usuario */}
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Actividad por usuario</p>
                        {actorStats.length === 0
                            ? <p className="text-sm text-gray-400 text-center py-4">Sin datos aún.</p>
                            : actorStats.map(s => {
                                const catMeta = s.topCat ? BEHAVIOR_CATEGORY[s.topCat[0]] : null;
                                return (
                                    <div key={s.actor} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-black text-sm flex items-center justify-center flex-shrink-0">
                                            {s.actor.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900">{s.actor}</p>
                                            <p className="text-[10px] text-gray-400">
                                                {s.count} eventos · {s.lastSeen.toLocaleDateString('es-CO')}
                                            </p>
                                            {catMeta && (
                                                <p className="text-[10px] text-gray-500">
                                                    Más: {catMeta.icon} {catMeta.label} ({s.topCat![1]}×)
                                                </p>
                                            )}
                                        </div>
                                        <span className="text-xl font-black text-indigo-600 flex-shrink-0">{s.count}</span>
                                    </div>
                                );
                            })
                        }
                    </div>

                    {/* Acciones más frecuentes */}
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Acciones más frecuentes</p>
                        {actionCounts.length === 0
                            ? <p className="text-sm text-gray-400 text-center py-4">Sin datos aún.</p>
                            : actionCounts.slice(0, 15).map(([detail, count]) => (
                                <div key={detail} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-700 truncate">{detail}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="w-20 bg-gray-100 rounded-full h-1.5">
                                            <div className="h-1.5 rounded-full bg-blue-500"
                                                style={{ width: `${Math.round((count / (actionCounts[0]?.[1] ?? 1)) * 100)}%` }} />
                                        </div>
                                        <span className="text-xs font-black text-gray-700 w-8 text-right">{count}×</span>
                                    </div>
                                </div>
                            ))
                        }
                    </div>

                    {/* Búsquedas */}
                    {searchQueries.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Últimas búsquedas</p>
                            <div className="flex flex-wrap gap-2">
                                {searchQueries.map(l => (
                                    <span key={l.id} className="bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-1 rounded-full">
                                        🔎 {l.detail.replace('Buscó: ', '')}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mensajes de chatbot */}
                    {chatMessages.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Mensajes en el chatbot</p>
                            <div className="space-y-2">
                                {chatMessages.map(l => (
                                    <div key={l.id} className="bg-purple-50 rounded-lg px-3 py-2">
                                        <p className="text-xs text-purple-800 font-semibold">{l.detail.replace('Escribió en chatbot: ', '')}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">{l.actor} · {new Date(l.timestamp).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {behaviorLogs.length === 0 && auditLogs.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-8">Sin datos de actividad todavía.</p>
                    )}
                </div>
            )}

            {/* ── HERRAMIENTAS ── */}
            {mainTab === 'herramientas' && (
                <>
                    <div className="flex border-b border-gray-100 overflow-x-auto">
                        {([
                            { key: 'tools',    label: 'Por herramienta', icon: '🔧' },
                            { key: 'workers',  label: 'Por trabajador',  icon: '👷' },
                            { key: 'projects', label: 'Por proyecto',    icon: '🏗' },
                            { key: 'history',  label: 'Historial',       icon: '📋' },
                        ] as { key: HerramientasTab; label: string; icon: string }[]).map(t => (
                            <button key={t.key} onClick={() => setHerramientasTab(t.key)}
                                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all border-b-2 ${
                                    herramientasTab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                                }`}>
                                <span>{t.icon}</span>
                                <span className="hidden sm:inline">{t.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="p-4">
                        {returnedWithCondition.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-3xl mb-2">📊</p>
                                <p className="font-bold text-gray-600">Sin devoluciones con condición aún</p>
                                <p className="text-xs text-gray-400 mt-1">Los datos aparecen cuando se registran devoluciones con estado.</p>
                            </div>
                        ) : (
                            <>
                                {herramientasTab === 'tools' && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">% devoluciones con problema</p>
                                        {byTool.map(r => (
                                            <div key={r.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{r.item!.name}</p>
                                                    <p className="text-[10px] text-gray-400">{r.returns} devolución{r.returns !== 1 ? 'es' : ''}</p>
                                                </div>
                                                <div className="w-32 flex-shrink-0"><IssueBar rate={r.issueRate} /></div>
                                                <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end max-w-[120px]">
                                                    {ALL_CONDITIONS.filter(c => r.conditions[c]).map(c => (
                                                        <span key={c} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CONDITION_COLOR[c]}`}>
                                                            {r.conditions[c]}× {CONDITION_LABEL[c].split(' ')[0]}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {herramientasTab === 'workers' && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Trabajadores con más problemas en devoluciones</p>
                                        {byWorker.map((r, i) => (
                                            <div key={r.name} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-red-100 text-red-700' : i === 1 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                                                    <p className="text-[10px] text-gray-400">{r.returns} dev. · {r.issues} con problemas</p>
                                                </div>
                                                <div className="w-28 flex-shrink-0"><IssueBar rate={r.issueRate} /></div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {herramientasTab === 'projects' && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Obras con más herramientas dañadas</p>
                                        {byProject.map((r, i) => (
                                            <div key={r.name} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-red-100 text-red-700' : i === 1 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                                                    <p className="text-[10px] text-gray-400">{r.returns} dev. · {r.issues} con problemas</p>
                                                </div>
                                                <div className="w-28 flex-shrink-0"><IssueBar rate={r.issueRate} /></div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {herramientasTab === 'history' && (
                                    <div>
                                        <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}
                                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400">
                                            <option value="">— Elegir herramienta —</option>
                                            {toolsWithHistory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                        </select>
                                        {selectedItemId && toolHistory.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Sin devoluciones para esta herramienta.</p>}
                                        {toolHistory.length > 0 && (
                                            <div className="relative pl-6">
                                                <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-200" />
                                                {toolHistory.map(m => {
                                                    const cond = m.returnCondition!;
                                                    const worker = personMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar';
                                                    const proj = m.projectId ? projectMap.get(m.projectId)?.name : null;
                                                    return (
                                                        <div key={m.id} className="relative mb-5 last:mb-0">
                                                            <div className={`absolute -left-[22px] w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-[10px] ${isIssue(cond) ? 'bg-red-400' : 'bg-green-400'}`} />
                                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <p className="text-xs text-gray-400">{new Date(m.timestamp).toLocaleDateString('es-CO')}</p>
                                                                        <p className="text-sm font-semibold text-gray-800 mt-0.5">👷 {worker}</p>
                                                                        {proj && <p className="text-xs text-indigo-600 mt-0.5">📁 {proj}</p>}
                                                                    </div>
                                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${CONDITION_COLOR[cond]}`}>{CONDITION_LABEL[cond]}</span>
                                                                </div>
                                                                {m.returnNotes && <p className="text-xs text-gray-600 mt-2 bg-white rounded-lg px-2 py-1.5 border border-gray-100 italic">"{m.returnNotes}"</p>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
