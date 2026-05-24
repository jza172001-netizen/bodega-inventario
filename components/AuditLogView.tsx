
import React, { useState, useMemo } from 'react';
import { AuditLog, UserRole } from '../types';

interface AuditLogViewProps {
    auditLogs: AuditLog[];
    userRole: UserRole;
    onClearLogs?: () => void;
}

const ACTION_META: Record<string, { icon: string; color: string; bg: string }> = {
    ITEM_CREATED:       { icon: '📦', color: 'text-green-700',  bg: 'bg-green-100' },
    ITEM_EDITED:        { icon: '✏️', color: 'text-blue-700',   bg: 'bg-blue-100' },
    ITEM_DELETED:       { icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-100' },
    PERSONNEL_CREATED:  { icon: '👷', color: 'text-green-700',  bg: 'bg-green-100' },
    PERSONNEL_EDITED:   { icon: '✏️', color: 'text-blue-700',   bg: 'bg-blue-100' },
    PERSONNEL_DELETED:  { icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-100' },
    LOAN_CREATED:       { icon: '🔑', color: 'text-indigo-700', bg: 'bg-indigo-100' },
    LOAN_RETURNED:      { icon: '✅', color: 'text-green-700',  bg: 'bg-green-100' },
    LOAN_TRANSFERRED:   { icon: '🔄', color: 'text-blue-700',   bg: 'bg-blue-100' },
    PICKUP_MARKED:      { icon: '📍', color: 'text-orange-700', bg: 'bg-orange-100' },
    PICKUP_CANCELLED:   { icon: '✕',  color: 'text-red-700',    bg: 'bg-red-100' },
    PROJECT_CREATED:    { icon: '🏗️', color: 'text-green-700',  bg: 'bg-green-100' },
    PROJECT_DELETED:    { icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-100' },
    USER_CREATED:       { icon: '👤', color: 'text-green-700',  bg: 'bg-green-100' },
    USER_DELETED:       { icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-100' },
    MOVEMENT_DELETED:   { icon: '⚠️', color: 'text-red-700',    bg: 'bg-red-100' },
};

const FILTER_OPTIONS = [
    { label: 'Todos', value: '' },
    { label: '🔑 Préstamos',   value: 'LOAN' },
    { label: '📦 Ítems',       value: 'ITEM' },
    { label: '👷 Personal',    value: 'PERSONNEL' },
    { label: '📍 Recoger',     value: 'PICKUP' },
    { label: '🗑️ Eliminados',  value: 'DELETED' },
];

export const AuditLogView: React.FC<AuditLogViewProps> = ({ auditLogs, userRole, onClearLogs }) => {
    const [filter, setFilter] = useState('');
    const isOwner = userRole === UserRole.OWNER;

    const filtered = useMemo(() => {
        if (!filter) return auditLogs;
        if (filter === 'DELETED') return auditLogs.filter(l => l.action.endsWith('_DELETED') || l.action === 'MOVEMENT_DELETED');
        return auditLogs.filter(l => l.action.startsWith(filter));
    }, [auditLogs, filter]);

    const grouped = useMemo(() => {
        const map = new Map<string, AuditLog[]>();
        for (const l of filtered) {
            const key = new Date(l.timestamp).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(l);
        }
        return [...map.entries()];
    }, [filtered]);

    const handleClear = () => { onClearLogs?.(); };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-black text-gray-900">📋 Bitácora de auditoría</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{auditLogs.length} registro{auditLogs.length !== 1 ? 's' : ''} en total</p>
                </div>
                {isOwner && auditLogs.length > 0 && (
                    <button onClick={handleClear}
                        className="text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl transition-all">
                        Limpiar
                    </button>
                )}
            </div>

            {/* Filtros */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {FILTER_OPTIONS.map(f => (
                    <button key={f.value} onClick={() => setFilter(f.value)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                            filter === f.value
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {auditLogs.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <p className="text-4xl mb-3">📋</p>
                    <p className="font-semibold text-gray-500">La bitácora está vacía</p>
                    <p className="text-sm mt-1">Cada cambio en la app quedará registrado aquí.</p>
                </div>
            ) : filtered.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">Sin registros para ese filtro.</p>
            ) : (
                <div className="space-y-5">
                    {grouped.map(([dateLabel, entries]) => (
                        <div key={dateLabel}>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 capitalize">{dateLabel}</p>
                            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                                {entries.map((log, idx) => {
                                    const meta = ACTION_META[log.action] ?? { icon: '•', color: 'text-gray-600', bg: 'bg-gray-100' };
                                    return (
                                        <div key={log.id}
                                            className={`flex items-start gap-3 px-4 py-3 ${idx < entries.length - 1 ? 'border-b border-gray-50' : ''}`}>
                                            <div className={`w-7 h-7 rounded-full ${meta.bg} flex items-center justify-center text-sm flex-shrink-0 mt-0.5`}>
                                                {meta.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-semibold ${meta.color} leading-snug`}>{log.description}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-gray-400">
                                                        {new Date(log.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {log.actor && (
                                                        <>
                                                            <span className="text-gray-200">·</span>
                                                            <span className="text-[10px] text-gray-400">{log.actor}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
