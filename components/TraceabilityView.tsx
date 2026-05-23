import React, { useMemo, useState } from 'react';
import { Movement, Item, Personnel, Project, ReturnCondition, InventoryType } from '../types';

interface Props {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    projects: Project[];
}

type SubTab = 'tools' | 'workers' | 'projects' | 'history';

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

export const TraceabilityView: React.FC<Props> = ({ movements, items, personnel, projects }) => {
    const [subTab, setSubTab] = useState<SubTab>('tools');
    const [selectedItemId, setSelectedItemId] = useState<string>('');

    const itemMap     = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const personMap   = useMemo(() => new Map(personnel.map(p => [p.id, p])), [personnel]);
    const projectMap  = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

    // Solo movimientos con condición de devolución registrada (herramienta manual y eléctrica)
    const returnedWithCondition = useMemo(() =>
        movements.filter(m =>
            m.isLoan && m.isReturned && m.returnCondition &&
            (itemMap.get(m.itemId)?.inventoryType === InventoryType.HAND_TOOL ||
             itemMap.get(m.itemId)?.inventoryType === InventoryType.ELECTRICAL_TOOL)
        ),
        [movements, itemMap]
    );

    const isIssue = (c: ReturnCondition) => c !== 'good' && c !== 'worn';

    // ── Por herramienta ──────────────────────────────────────────────────────
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

    // ── Por trabajador ───────────────────────────────────────────────────────
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
            .map(([key, v]) => ({
                name: key === '__none__' ? 'Sin asignar' : (personMap.get(key)?.name ?? 'Desconocido'),
                ...v,
                issueRate: v.returns > 0 ? v.issues / v.returns : 0,
            }))
            .sort((a, b) => b.issueRate - a.issueRate || b.returns - a.returns);
    }, [returnedWithCondition, personMap]);

    // ── Por proyecto ─────────────────────────────────────────────────────────
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
            .map(([key, v]) => ({
                name: key === '__none__' ? 'Sin proyecto' : (projectMap.get(key)?.name ?? 'Proyecto eliminado'),
                ...v,
                issueRate: v.returns > 0 ? v.issues / v.returns : 0,
            }))
            .sort((a, b) => b.issueRate - a.issueRate || b.returns - a.returns);
    }, [returnedWithCondition, projectMap]);

    // ── Historial de herramienta ─────────────────────────────────────────────
    const toolHistory = useMemo(() => {
        if (!selectedItemId) return [];
        return returnedWithCondition
            .filter(m => m.itemId === selectedItemId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [returnedWithCondition, selectedItemId]);

    const toolsWithHistory = useMemo(() =>
        [...new Set(returnedWithCondition.map(m => m.itemId))]
            .map(id => itemMap.get(id))
            .filter(Boolean)
            .sort((a, b) => a!.name.localeCompare(b!.name, 'es')) as Item[],
        [returnedWithCondition, itemMap]
    );

    const IssueBar = ({ rate }: { rate: number }) => (
        <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
                <div
                    className={`h-1.5 rounded-full ${rate > 0.5 ? 'bg-red-500' : rate > 0.25 ? 'bg-orange-400' : 'bg-green-500'}`}
                    style={{ width: `${Math.round(rate * 100)}%` }}
                />
            </div>
            <span className={`text-xs font-black flex-shrink-0 ${rate > 0.5 ? 'text-red-600' : rate > 0.25 ? 'text-orange-600' : 'text-green-600'}`}>
                {Math.round(rate * 100)}%
            </span>
        </div>
    );

    const SUBTABS: { key: SubTab; label: string; icon: string }[] = [
        { key: 'tools',    label: 'Por herramienta', icon: '🔧' },
        { key: 'workers',  label: 'Por trabajador',  icon: '👷' },
        { key: 'projects', label: 'Por proyecto',    icon: '🏗' },
        { key: 'history',  label: 'Historial',       icon: '📋' },
    ];

    if (returnedWithCondition.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <p className="text-3xl mb-3">📊</p>
                <p className="font-bold text-gray-700">Sin datos de trazabilidad aún</p>
                <p className="text-sm text-gray-400 mt-1">
                    Los datos aparecerán aquí cuando se registren devoluciones con estado de condición.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Sub-tabs */}
            <div className="flex border-b border-gray-100 overflow-x-auto">
                {SUBTABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setSubTab(t.key)}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition-all border-b-2 ${
                            subTab === t.key
                                ? 'border-blue-600 text-blue-600 bg-blue-50'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <span>{t.icon}</span>
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                ))}
            </div>

            <div className="p-4">
                {/* ── Por herramienta ── */}
                {subTab === 'tools' && (
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">
                            % de devoluciones con problema (incompleta / dañada / mantenimiento)
                        </p>
                        {byTool.map(r => (
                            <div key={r.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{r.item!.name}</p>
                                    <p className="text-[10px] text-gray-400">{r.returns} devolución{r.returns !== 1 ? 'es' : ''}</p>
                                </div>
                                <div className="w-32 flex-shrink-0">
                                    <IssueBar rate={r.issueRate} />
                                </div>
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

                {/* ── Por trabajador ── */}
                {subTab === 'workers' && (
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">
                            Trabajadores con más problemas en devoluciones
                        </p>
                        {byWorker.map((r, i) => (
                            <div key={r.name} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-red-100 text-red-700' : i === 1 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                                    <p className="text-[10px] text-gray-400">{r.returns} devolución{r.returns !== 1 ? 'es' : ''} · {r.issues} con problemas</p>
                                </div>
                                <div className="w-28 flex-shrink-0">
                                    <IssueBar rate={r.issueRate} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Por proyecto ── */}
                {subTab === 'projects' && (
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">
                            Obras con más herramientas dañadas o incompletas
                        </p>
                        {byProject.map((r, i) => (
                            <div key={r.name} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-red-100 text-red-700' : i === 1 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                                    <p className="text-[10px] text-gray-400">{r.returns} devolución{r.returns !== 1 ? 'es' : ''} · {r.issues} con problemas</p>
                                </div>
                                <div className="w-28 flex-shrink-0">
                                    <IssueBar rate={r.issueRate} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Historial ── */}
                {subTab === 'history' && (
                    <div>
                        <select
                            value={selectedItemId}
                            onChange={e => setSelectedItemId(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                            <option value="">— Elegir herramienta —</option>
                            {toolsWithHistory.map(i => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                            ))}
                        </select>

                        {selectedItemId && toolHistory.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-8">Sin devoluciones registradas para esta herramienta.</p>
                        )}

                        {toolHistory.length > 0 && (
                            <div className="relative pl-6">
                                <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-200" />
                                {toolHistory.map((m, i) => {
                                    const cond = m.returnCondition!;
                                    const worker = personMap.get(m.personnelId ?? '')?.name ?? 'Sin asignar';
                                    const proj   = m.projectId ? projectMap.get(m.projectId)?.name : null;
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
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${CONDITION_COLOR[cond]}`}>
                                                        {CONDITION_LABEL[cond]}
                                                    </span>
                                                </div>
                                                {m.returnNotes && (
                                                    <p className="text-xs text-gray-600 mt-2 bg-white rounded-lg px-2 py-1.5 border border-gray-100 italic">
                                                        "{m.returnNotes}"
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
