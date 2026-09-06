
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Movement, Item, Personnel, Project, ReturnCondition, InventoryType, AuditLog, BehaviorLog, AppUser, UserRole } from '../types';
import { CotejoPanel } from './CotejoPanel';

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
    good:              'bg-bien-suave text-bien',
    worn:              'bg-atencion-suave text-atencion',
    incomplete:        'bg-atencion-suave text-atencion',
    damaged:           'bg-alerta-suave text-alerta',
    needs_maintenance: 'bg-marca-suave text-marca-oscuro',
};

const ALL_CONDITIONS: ReturnCondition[] = ['good', 'worn', 'incomplete', 'damaged', 'needs_maintenance'];

const BEHAVIOR_CATEGORY: Record<string, { label: string; icon: string; color: string; bg: string }> = {
    SESSION: { label: 'Sesión',     icon: '🔐', color: 'text-marca-oscuro', bg: 'bg-marca-suave' },
    NAV:     { label: 'Navegación', icon: '🧭', color: 'text-marca-oscuro',   bg: 'bg-marca-suave'   },
    FILTER:  { label: 'Filtro',     icon: '🎛️', color: 'text-bien',   bg: 'bg-bien-suave'   },
    SEARCH:  { label: 'Búsqueda',   icon: '🔎', color: 'text-tinta-suave',   bg: 'bg-papel-hondo'   },
    CHAT:    { label: 'Chatbot',    icon: '💬', color: 'text-marca-oscuro', bg: 'bg-marca-suave' },
    BUTTON:  { label: 'Botón',      icon: '🖱️', color: 'text-atencion', bg: 'bg-atencion-suave' },
    ACTION:  { label: 'Acción',     icon: '✅', color: 'text-bien',  bg: 'bg-bien-suave'  },
    SCROLL:  { label: 'Scroll',     icon: '📜', color: 'text-tinta-suave',  bg: 'bg-papel-hondo'  },
};

const AUDIT_CATEGORY: Record<string, { icon: string; color: string; bg: string }> = {
    ITEM_CREATED:       { icon: '📦', color: 'text-bien',  bg: 'bg-bien-suave'  },
    ITEM_EDITED:        { icon: '✏️', color: 'text-marca-oscuro',   bg: 'bg-marca-suave'   },
    ITEM_DELETED:       { icon: '🗑️', color: 'text-alerta',    bg: 'bg-alerta-suave'    },
    STOCK_OUT:          { icon: '📤', color: 'text-atencion', bg: 'bg-atencion-suave' },
    STOCK_IN:           { icon: '📥', color: 'text-bien',  bg: 'bg-bien-suave'  },
    PERSONNEL_CREATED:  { icon: '👷', color: 'text-bien',  bg: 'bg-bien-suave'  },
    PERSONNEL_EDITED:   { icon: '✏️', color: 'text-marca-oscuro',   bg: 'bg-marca-suave'   },
    PERSONNEL_DELETED:  { icon: '🗑️', color: 'text-alerta',    bg: 'bg-alerta-suave'    },
    LOAN_CREATED:       { icon: '🔑', color: 'text-marca-oscuro', bg: 'bg-marca-suave' },
    LOAN_RETURNED:      { icon: '✅', color: 'text-bien',  bg: 'bg-bien-suave'  },
    LOAN_TRANSFERRED:   { icon: '🔄', color: 'text-marca-oscuro',   bg: 'bg-marca-suave'   },
    PICKUP_MARKED:      { icon: '📍', color: 'text-atencion', bg: 'bg-atencion-suave' },
    PICKUP_CANCELLED:   { icon: '✕',  color: 'text-alerta',    bg: 'bg-alerta-suave'    },
    PROJECT_CREATED:    { icon: '🏗️', color: 'text-bien',  bg: 'bg-bien-suave'  },
    PROJECT_DELETED:    { icon: '🗑️', color: 'text-alerta',    bg: 'bg-alerta-suave'    },
    USER_CREATED:       { icon: '👤', color: 'text-bien',  bg: 'bg-bien-suave'  },
    USER_DELETED:       { icon: '🗑️', color: 'text-alerta',    bg: 'bg-alerta-suave'    },
    USER_LOGIN:         { icon: '🔐', color: 'text-marca-oscuro', bg: 'bg-marca-suave' },
    USER_LOGOUT:        { icon: '🔓', color: 'text-tinta-suave',   bg: 'bg-papel-hondo'   },
    MOVEMENT_DELETED:   { icon: '⚠️', color: 'text-alerta',    bg: 'bg-alerta-suave'    },
    USER_SETUP:         { icon: '🔑', color: 'text-marca-oscuro', bg: 'bg-marca-suave' },
    CONFIG_CHANGED:     { icon: '⚙️', color: 'text-marca-oscuro',   bg: 'bg-marca-suave'   },
    DATA_EXPORTED:      { icon: '⬇️', color: 'text-atencion',  bg: 'bg-atencion-suave'  },
    DATA_IMPORTED:      { icon: '⬆️', color: 'text-atencion',  bg: 'bg-atencion-suave'  },
    LOAN_PROJECT_ASSIGNED: { icon: '🏗️', color: 'text-marca-oscuro', bg: 'bg-marca-suave' },
    PO_CREATED:         { icon: '🛒', color: 'text-bien',  bg: 'bg-bien-suave'  },
    PO_STATUS_CHANGED:  { icon: '🚚', color: 'text-marca-oscuro',   bg: 'bg-marca-suave'   },
    PO_DELETED:         { icon: '🗑️', color: 'text-alerta',    bg: 'bg-alerta-suave'    },
    WHATSAPP_SENT:      { icon: '📲', color: 'text-bien',  bg: 'bg-bien-suave'  },
    PICKUP_NOTIFIED:    { icon: '📲', color: 'text-atencion', bg: 'bg-atencion-suave' },
    REPORT_EXPORTED:    { icon: '📄', color: 'text-marca-oscuro',   bg: 'bg-marca-suave'   },
    AUDIT_CLEARED:      { icon: '🧹', color: 'text-alerta',    bg: 'bg-alerta-suave'    },
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
    return AUDIT_CATEGORY[log.action] ?? { icon: '•', color: 'text-tinta-suave', bg: 'bg-papel-hondo' };
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

    /**
     * Los chips de persona mezclan dos fuentes: los usuarios con cuenta y el
     * visitante (que no tiene cuenta propia). El visitante quedó guardado como
     * un usuario más con rol 'employee' —el enum de la base no aceptaba
     * 'visitor' hasta la migración 20260817120000—, así que salía dos veces:
     * una desde la lista de usuarios y otra desde el nombre fijo. Se juntan
     * todas las fuentes y se deduplica por nombre conservando el orden.
     * También se suman los actores que aparecen en los registros pero ya no
     * tienen cuenta: si no, se perdería el acceso a la historia de alguien que
     * ya salió.
     */
    const allActors = useMemo(() => {
        const nombresPorRol = (rol: UserRole) => users.filter(u => u.role === rol).map(u => u.name);
        const actoresDeRegistros = [...auditLogs, ...behaviorLogs].map(l => l.actor);
        const enOrden = [
            ...nombresPorRol(UserRole.OWNER),
            ...nombresPorRol(UserRole.EMPLOYEE),
            ...nombresPorRol(UserRole.VISITOR),
            'Visitante',
            ...actoresDeRegistros,
        ];
        return [...new Set(enOrden.map(n => n?.trim()).filter(Boolean))];
    }, [users, auditLogs, behaviorLogs]);

    const combinedEntries = useMemo<CombinedEntry[]>(() => {
        const bEntries: CombinedEntry[] = behaviorLogs.map(l => ({ kind: 'behavior', ts: new Date(l.timestamp), data: l }));
        const aEntries: CombinedEntry[] = auditLogs.map(l => ({ kind: 'audit', ts: new Date(l.timestamp), data: l }));
        return [...bEntries, ...aEntries].sort((a, b) => b.ts.getTime() - a.ts.getTime());
    }, [behaviorLogs, auditLogs]);

    const filteredEntries = useMemo(() => {
        return combinedEntries.filter(e => {
            const actor = e.data.actor;
            const action = e.data.action;
            // Se compara sin espacios sobrantes: los chips también se arman con el nombre recortado
            if (actorFilter && actor?.trim() !== actorFilter) return false;
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
            <div className="flex-1 bg-papel-hondo rounded-full h-1.5 min-w-[60px]">
                <div className={`h-1.5 rounded-full ${rate > 0.5 ? 'bg-alerta' : rate > 0.25 ? 'bg-atencion' : 'bg-bien'}`}
                    style={{ width: `${Math.round(rate * 100)}%` }} />
            </div>
            <span className={`text-xs font-black flex-shrink-0 ${rate > 0.5 ? 'text-alerta' : rate > 0.25 ? 'text-atencion' : 'text-bien'}`}>
                {Math.round(rate * 100)}%
            </span>
        </div>
    );

    return (
        <div className="bg-papel rounded-xl shadow-sm overflow-hidden">
            {/* Main tab bar */}
            <div className="flex border-b border-papel-borde overflow-x-auto">
                {([
                    { key: 'actividad',    label: 'Actividad',     icon: '🔔' },
                    { key: 'estadisticas', label: 'Estadísticas',  icon: '📊' },
                    { key: 'herramientas', label: 'Herramientas',  icon: '🔧' },
                ] as { key: MainTab; label: string; icon: string }[]).map(t => (
                    <button key={t.key} onClick={() => changeMainTab(t.key)}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition-all border-b-2 ${
                            mainTab === t.key ? 'border-marca text-marca-oscuro bg-marca-suave' : 'border-transparent text-tinta-tenue hover:text-tinta-suave'
                        }`}>
                        <span>{t.icon}</span>
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                ))}
            </div>

            {/* ── ACTIVIDAD ── */}
            {mainTab === 'actividad' && (
                <div>
                    {/* El cotejo primero: si algo no cuadra, hay que verlo antes de
                        ponerse a leer la lista de lo que pasó. */}
                    <div className="px-4 pt-3">
                        <CotejoPanel items={items} movements={movements} personnel={personnel} auditLogs={auditLogs} />
                    </div>
                    <div className="px-4 py-3 border-b border-papel-borde space-y-2">
                        {/* Actor filter */}
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                            <button onClick={() => changeActorFilter('')}
                                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-black transition-all ${!actorFilter ? 'bg-marca text-tinta' : 'bg-papel-hondo text-tinta-suave hover:bg-papel-borde'}`}>
                                Todos
                            </button>
                            {allActors.map(actor => (
                                <button key={actor} onClick={() => changeActorFilter(actorFilter === actor ? '' : actor)}
                                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-black transition-all ${actorFilter === actor ? 'bg-marca text-tinta' : 'bg-papel-hondo text-tinta-suave hover:bg-papel-borde'}`}>
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
                                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${typeFilter === f.key ? 'bg-marca text-tinta' : 'bg-papel-hondo text-tinta-tenue hover:bg-papel-borde'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="divide-y divide-papel-borde max-h-[60vh] overflow-y-auto">
                        {filteredEntries.length === 0 && (
                            <p className="text-center py-12 text-tinta-tenue text-sm">Sin actividad para este filtro.</p>
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
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-tinta-tenue">
                                                <span>{timeStr}</span>
                                                {l.actor && <><span>·</span><span className="font-semibold text-tinta-tenue">{l.actor}</span></>}
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
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-tinta-tenue">
                                            <span>{timeStr}</span>
                                            {log.actor && <><span>·</span><span className="font-semibold text-tinta-tenue">{log.actor}</span></>}
                                            <span className="px-1.5 py-0.5 rounded-full font-black uppercase tracking-wide bg-papel-hondo text-tinta-tenue" style={{ fontSize: '9px' }}>
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
                            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-3">Distribución por categoría</p>
                            {categoryCounts.map(([cat, count]) => {
                                const meta = BEHAVIOR_CATEGORY[cat];
                                const total = behaviorLogs.length || 1;
                                const pct = Math.round((count / total) * 100);
                                return (
                                    <div key={cat} className="flex items-center gap-3 py-1.5">
                                        <span className="text-sm w-5 flex-shrink-0">{meta?.icon ?? '•'}</span>
                                        <span className="text-xs font-semibold text-tinta-suave w-20 flex-shrink-0">{meta?.label ?? cat}</span>
                                        <div className="flex-1 bg-papel-hondo rounded-full h-2">
                                            <div className={`h-2 rounded-full ${meta?.bg.replace('bg-', 'bg-').replace('-50', '-400') ?? 'bg-marca'}`}
                                                style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs font-black text-tinta-suave w-10 text-right flex-shrink-0">{count}×</span>
                                        <span className="text-[10px] text-tinta-tenue w-8 flex-shrink-0">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Secciones más visitadas */}
                    {sectionVisits.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-3">Secciones más visitadas</p>
                            {sectionVisits.map(([section, count], i) => (
                                <div key={section} className="flex items-center gap-3 py-1.5 border-b border-papel-borde last:border-0">
                                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black flex-shrink-0 ${i === 0 ? 'bg-marca text-tinta' : i === 1 ? 'bg-marca text-tinta' : 'bg-papel-hondo text-tinta-tenue'}`}>{i + 1}</span>
                                    <span className="flex-1 text-xs font-semibold text-tinta-suave truncate">{section}</span>
                                    <span className="text-xs font-black text-marca-oscuro flex-shrink-0">{count}×</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Filtros más usados */}
                    {filterUsage.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-3">Filtros más usados</p>
                            {filterUsage.map(([detail, count]) => (
                                <div key={detail} className="flex items-center gap-3 py-1.5 border-b border-papel-borde last:border-0">
                                    <span className="text-sm flex-shrink-0">🎛️</span>
                                    <span className="flex-1 text-xs text-tinta-suave truncate">{detail}</span>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <div className="w-14 bg-papel-hondo rounded-full h-1.5">
                                            <div className="h-1.5 rounded-full bg-bien"
                                                style={{ width: `${Math.round((count / (filterUsage[0]?.[1] ?? 1)) * 100)}%` }} />
                                        </div>
                                        <span className="text-xs font-black text-tinta-suave w-6 text-right">{count}×</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Horario de uso */}
                    {behaviorLogs.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-3">Actividad por hora del día</p>
                            <div className="flex items-end gap-0.5 h-16">
                                {hourlyActivity.map((count, h) => (
                                    <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                                        <div className="w-full bg-marca rounded-t-sm transition-all"
                                            style={{ height: `${Math.round((count / maxHourly) * 52)}px`, opacity: count > 0 ? 1 : 0.15 }}
                                            title={`${h}:00 — ${count} eventos`} />
                                        {(h % 6 === 0) && (
                                            <span className="text-[8px] text-tinta-tenue font-semibold">{h}h</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actividad por usuario */}
                    <div>
                        <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-3">Actividad por usuario</p>
                        {actorStats.length === 0
                            ? <p className="text-sm text-tinta-tenue text-center py-4">Sin datos aún.</p>
                            : actorStats.map(s => {
                                const catMeta = s.topCat ? BEHAVIOR_CATEGORY[s.topCat[0]] : null;
                                return (
                                    <div key={s.actor} className="flex items-center gap-3 py-2 border-b border-papel-borde last:border-0">
                                        <div className="w-9 h-9 rounded-full bg-marca-suave text-marca-oscuro font-black text-sm flex items-center justify-center flex-shrink-0">
                                            {s.actor.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-tinta">{s.actor}</p>
                                            <p className="text-[10px] text-tinta-tenue">
                                                {s.count} eventos · {s.lastSeen.toLocaleDateString('es-CO')}
                                            </p>
                                            {catMeta && (
                                                <p className="text-[10px] text-tinta-tenue">
                                                    Más: {catMeta.icon} {catMeta.label} ({s.topCat![1]}×)
                                                </p>
                                            )}
                                        </div>
                                        <span className="text-xl font-black text-marca-oscuro flex-shrink-0">{s.count}</span>
                                    </div>
                                );
                            })
                        }
                    </div>

                    {/* Acciones más frecuentes */}
                    <div>
                        <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-3">Acciones más frecuentes</p>
                        {actionCounts.length === 0
                            ? <p className="text-sm text-tinta-tenue text-center py-4">Sin datos aún.</p>
                            : actionCounts.slice(0, 15).map(([detail, count]) => (
                                <div key={detail} className="flex items-center gap-3 py-1.5 border-b border-papel-borde last:border-0">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-tinta-suave truncate">{detail}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="w-20 bg-papel-hondo rounded-full h-1.5">
                                            <div className="h-1.5 rounded-full bg-marca"
                                                style={{ width: `${Math.round((count / (actionCounts[0]?.[1] ?? 1)) * 100)}%` }} />
                                        </div>
                                        <span className="text-xs font-black text-tinta-suave w-8 text-right">{count}×</span>
                                    </div>
                                </div>
                            ))
                        }
                    </div>

                    {/* Búsquedas */}
                    {searchQueries.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-3">Últimas búsquedas</p>
                            <div className="flex flex-wrap gap-2">
                                {searchQueries.map(l => (
                                    <span key={l.id} className="bg-papel-hondo text-tinta-suave text-xs font-semibold px-2 py-1 rounded-full">
                                        🔎 {l.detail.replace('Buscó: ', '')}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mensajes de chatbot */}
                    {chatMessages.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-3">Mensajes en el chatbot</p>
                            <div className="space-y-2">
                                {chatMessages.map(l => (
                                    <div key={l.id} className="bg-marca-suave rounded-lg px-3 py-2">
                                        <p className="text-xs text-marca-oscuro font-semibold">{l.detail.replace('Escribió en chatbot: ', '')}</p>
                                        <p className="text-[10px] text-tinta-tenue mt-0.5">{l.actor} · {new Date(l.timestamp).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {behaviorLogs.length === 0 && auditLogs.length === 0 && (
                        <p className="text-sm text-tinta-tenue text-center py-8">Sin datos de actividad todavía.</p>
                    )}
                </div>
            )}

            {/* ── HERRAMIENTAS ── */}
            {mainTab === 'herramientas' && (
                <>
                    <div className="flex border-b border-papel-borde overflow-x-auto">
                        {([
                            { key: 'tools',    label: 'Por herramienta', icon: '🔧' },
                            { key: 'workers',  label: 'Por trabajador',  icon: '👷' },
                            { key: 'projects', label: 'Por proyecto',    icon: '🏗' },
                            { key: 'history',  label: 'Historial',       icon: '📋' },
                        ] as { key: HerramientasTab; label: string; icon: string }[]).map(t => (
                            <button key={t.key} onClick={() => setHerramientasTab(t.key)}
                                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all border-b-2 ${
                                    herramientasTab === t.key ? 'border-marca text-marca-oscuro' : 'border-transparent text-tinta-tenue hover:text-tinta-suave'
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
                                <p className="font-bold text-tinta-suave">Sin devoluciones con condición aún</p>
                                <p className="text-xs text-tinta-tenue mt-1">Los datos aparecen cuando se registran devoluciones con estado.</p>
                            </div>
                        ) : (
                            <>
                                {herramientasTab === 'tools' && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-wider mb-3">% devoluciones con problema</p>
                                        {byTool.map(r => (
                                            <div key={r.id} className="flex items-center gap-3 py-2 border-b border-papel-borde last:border-0">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-tinta truncate">{r.item!.name}</p>
                                                    <p className="text-[10px] text-tinta-tenue">{r.returns} devolución{r.returns !== 1 ? 'es' : ''}</p>
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
                                        <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-wider mb-3">Trabajadores con más problemas en devoluciones</p>
                                        {byWorker.map((r, i) => (
                                            <div key={r.name} className="flex items-center gap-3 py-2 border-b border-papel-borde last:border-0">
                                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-alerta-suave text-alerta' : i === 1 ? 'bg-atencion-suave text-atencion' : 'bg-papel-hondo text-tinta-suave'}`}>{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-tinta truncate">{r.name}</p>
                                                    <p className="text-[10px] text-tinta-tenue">{r.returns} dev. · {r.issues} con problemas</p>
                                                </div>
                                                <div className="w-28 flex-shrink-0"><IssueBar rate={r.issueRate} /></div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {herramientasTab === 'projects' && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-wider mb-3">Obras con más herramientas dañadas</p>
                                        {byProject.map((r, i) => (
                                            <div key={r.name} className="flex items-center gap-3 py-2 border-b border-papel-borde last:border-0">
                                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-alerta-suave text-alerta' : i === 1 ? 'bg-atencion-suave text-atencion' : 'bg-papel-hondo text-tinta-suave'}`}>{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-tinta truncate">{r.name}</p>
                                                    <p className="text-[10px] text-tinta-tenue">{r.returns} dev. · {r.issues} con problemas</p>
                                                </div>
                                                <div className="w-28 flex-shrink-0"><IssueBar rate={r.issueRate} /></div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {herramientasTab === 'history' && (
                                    <div>
                                        <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}
                                            className="w-full text-sm border border-papel-borde rounded-xl px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-marca">
                                            <option value="">— Elegir herramienta —</option>
                                            {toolsWithHistory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                        </select>
                                        {selectedItemId && toolHistory.length === 0 && <p className="text-sm text-tinta-tenue text-center py-8">Sin devoluciones para esta herramienta.</p>}
                                        {toolHistory.length > 0 && (
                                            <div className="relative pl-6">
                                                <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-papel-borde" />
                                                {toolHistory.map(m => {
                                                    const cond = m.returnCondition!;
                                                    const worker = personMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar';
                                                    const proj = m.projectId ? projectMap.get(m.projectId)?.name : null;
                                                    return (
                                                        <div key={m.id} className="relative mb-5 last:mb-0">
                                                            <div className={`absolute -left-[22px] w-4 h-4 rounded-full border-2 border-papel flex items-center justify-center text-[10px] ${isIssue(cond) ? 'bg-alerta' : 'bg-bien'}`} />
                                                            <div className="bg-papel-hondo rounded-xl p-3 border border-papel-borde">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <p className="text-xs text-tinta-tenue">{new Date(m.timestamp).toLocaleDateString('es-CO')}</p>
                                                                        <p className="text-sm font-semibold text-tinta mt-0.5">👷 {worker}</p>
                                                                        {proj && <p className="text-xs text-marca-oscuro mt-0.5">📁 {proj}</p>}
                                                                    </div>
                                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${CONDITION_COLOR[cond]}`}>{CONDITION_LABEL[cond]}</span>
                                                                </div>
                                                                {m.returnNotes && <p className="text-xs text-tinta-suave mt-2 bg-papel rounded-lg px-2 py-1.5 border border-papel-borde italic">"{m.returnNotes}"</p>}
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
