
import React, { useMemo, useState } from 'react';
import { Movement, Item, Personnel, UserRole } from '../types';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { ClockIcon } from './icons/ClockIcon';
import {
    ReminderLog,
    loadReminderLog,
    recordReminders,
    isDueForReminder,
    buildLoanReminderUrl,
    REMINDER_INTERVAL_DAYS,
} from '../services/whatsappService';

interface LoansViewProps {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    onReturnItem: (movementId: string) => void;
    onMarkPendingPickup: (movementId: string, pending: boolean) => void;
    onGoBack: () => void;
    userRole?: UserRole;
}

export const LoansView: React.FC<LoansViewProps> = ({
    movements, items, personnel, onReturnItem, onMarkPendingPickup, onGoBack, userRole = UserRole.EMPLOYEE,
}) => {
    const isOwner = userRole === UserRole.OWNER;
    const [search, setSearch] = useState('');
    const [reminderLog, setReminderLog] = useState<ReminderLog>(loadReminderLog);
    const [remindStep, setRemindStep] = useState<number | null>(null);

    const activeLoans = useMemo(() => movements.filter(m => m.isLoan && !m.isReturned), [movements]);

    const getItem = (itemId: string) => items.find(i => i.id === itemId);
    const getItemName = (itemId: string) => getItem(itemId)?.name ?? 'Desconocido';
    const getPerson = (id?: string) => personnel.find(p => p.id === id);
    const getPersonnelName = (id?: string) => getPerson(id)?.name ?? 'Sin asignar';

    const getDays = (date: Date) =>
        Math.ceil(Math.abs(Date.now() - new Date(date).getTime()) / 86400000);

    const filteredLoans = useMemo(() => {
        if (!search.trim()) return activeLoans;
        const q = search.toLowerCase();
        return activeLoans.filter(m =>
            getItemName(m.itemId).toLowerCase().includes(q) ||
            getPersonnelName(m.personnelId).toLowerCase().includes(q)
        );
    }, [activeLoans, search]);

    const pendingPickup = useMemo(() => filteredLoans.filter(m => m.pendingPickup), [filteredLoans]);
    const overdueLoans  = useMemo(() => filteredLoans.filter(m => !m.pendingPickup && getDays(new Date(m.timestamp)) > 14), [filteredLoans]);
    const warningLoans  = useMemo(() => filteredLoans.filter(m => !m.pendingPickup && getDays(new Date(m.timestamp)) > 7 && getDays(new Date(m.timestamp)) <= 14), [filteredLoans]);
    const normalLoans   = useMemo(() => filteredLoans.filter(m => !m.pendingPickup && getDays(new Date(m.timestamp)) <= 7), [filteredLoans]);

    const loansWithPhone = useMemo(
        () => activeLoans.filter(m => !!getPerson(m.personnelId)?.phone),
        [activeLoans, personnel]
    );

    const handleReturn = (id: string) => {
        if (window.confirm('¿Marcar como devuelta? Esta acción no se puede deshacer.')) {
            onReturnItem(id);
        }
    };

    const handleRemind = (loan: Movement) => {
        const person = getPerson(loan.personnelId);
        const item = getItem(loan.itemId);
        if (!person?.phone || !item) return;
        const days = getDays(new Date(loan.timestamp));
        const url = buildLoanReminderUrl(person.phone, person.name, item.name, days);
        window.open(url, '_blank');
        const newLog = recordReminders([loan.id]);
        setReminderLog({ ...newLog });
    };

    const remindAllList = loansWithPhone;

    const startRemindAll = () => {
        if (remindAllList.length === 0) return;
        setRemindStep(0);
        handleRemind(remindAllList[0]);
    };

    const nextRemindStep = () => {
        if (remindStep === null) return;
        const next = remindStep + 1;
        if (next >= remindAllList.length) { setRemindStep(null); return; }
        setRemindStep(next);
        handleRemind(remindAllList[next]);
    };

    const LoanCard: React.FC<{ loan: Movement }> = ({ loan }) => {
        const days = getDays(new Date(loan.timestamp));
        const isPending = !!loan.pendingPickup;
        const person = getPerson(loan.personnelId);
        const hasPhone = !!person?.phone;
        const dueReminder = isDueForReminder(loan.id, new Date(loan.timestamp), reminderLog);
        const lastReminded = reminderLog[loan.id];

        let cardClass = 'border border-gray-100 bg-white';
        let daysBadge = 'bg-green-100 text-green-800';
        if (isPending) { cardClass = 'border border-orange-200 bg-orange-50'; daysBadge = 'bg-orange-100 text-orange-800'; }
        else if (days > 14) { cardClass = 'border border-red-200 bg-red-50'; daysBadge = 'bg-red-100 text-red-800'; }
        else if (days > 7) { cardClass = 'border border-yellow-200 bg-yellow-50'; daysBadge = 'bg-yellow-100 text-yellow-800'; }

        return (
            <div className={`rounded-2xl p-4 ${cardClass} flex flex-col gap-3`}>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm leading-snug">{getItemName(loan.itemId)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">x{loan.quantity} · {getPersonnelName(loan.personnelId)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(loan.timestamp).toLocaleDateString('es-CO')}</p>
                        {lastReminded && (
                            <p className="text-[10px] text-green-600 mt-0.5">
                                📲 Recordado el {new Date(lastReminded).toLocaleDateString('es-CO')}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${daysBadge}`}>{days} días</span>
                        {isPending && <span className="text-[10px] font-black bg-orange-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">Recoger</span>}
                        {dueReminder && hasPhone && (
                            <span className="text-[10px] font-black bg-green-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide animate-pulse">
                                +{REMINDER_INTERVAL_DAYS}d sin recordar
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    {isOwner && (
                        <button
                            onClick={() => handleReturn(loan.id)}
                            className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all"
                        >
                            ✓ Devuelta
                        </button>
                    )}
                    {isOwner && (!isPending ? (
                        <button
                            onClick={() => onMarkPendingPickup(loan.id, true)}
                            className="flex-1 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-800 text-xs font-bold rounded-xl transition-all"
                        >
                            📍 Ir a recoger
                        </button>
                    ) : (
                        <button
                            onClick={() => onMarkPendingPickup(loan.id, false)}
                            className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-xl transition-all"
                        >
                            ✕ Cancelar
                        </button>
                    ))}
                    {hasPhone && (
                        <button
                            onClick={() => handleRemind(loan)}
                            title="Recordar por WhatsApp (pide foto de la herramienta)"
                            className={`flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                dueReminder
                                    ? 'bg-green-500 hover:bg-green-600 text-white'
                                    : 'bg-green-100 hover:bg-green-200 text-green-800'
                            }`}
                        >
                            📲 <span className="hidden sm:inline">Recordar</span>
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const Section: React.FC<{ title: string; color: string; loans: Movement[] }> = ({ title, color, loans }) => {
        if (loans.length === 0) return null;
        return (
            <div className="mb-6">
                <p className={`text-xs font-black uppercase tracking-widest mb-3 ${color}`}>{title} ({loans.length})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {loans.map(l => <LoanCard key={l.id} loan={l} />)}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm">
            <div className="flex items-center mb-4">
                <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                    <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <ClockIcon className="w-6 h-6 text-indigo-600" />
                        Préstamos Activos
                    </h2>
                    <p className="text-xs text-gray-500">{activeLoans.length} herramienta(s) fuera de bodega</p>
                </div>
                {loansWithPhone.length > 0 && remindStep === null && (
                    <button
                        onClick={startRemindAll}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl transition-colors"
                    >
                        📲 <span className="hidden sm:inline">Recordar a todos</span>
                        <span className="sm:hidden">All</span>
                    </button>
                )}
            </div>

            {/* Banner paso a paso recordar todos */}
            {remindStep !== null && (
                <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-black text-green-800">
                            Paso {remindStep + 1} de {remindAllList.length} — {getPersonnelName(remindAllList[remindStep].personnelId)}
                        </p>
                        <p className="text-[10px] text-green-600">WhatsApp abierto. Mensaje incluye solicitud de foto 📸</p>
                    </div>
                    <button
                        onClick={nextRemindStep}
                        className="flex-shrink-0 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl"
                    >
                        {remindStep < remindAllList.length - 1 ? 'Siguiente →' : '✓ Listo'}
                    </button>
                </div>
            )}

            {activeLoans.length > 0 && (
                <div className="relative mb-4">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por herramienta o persona..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                </div>
            )}

            {activeLoans.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <p className="text-4xl mb-3">🎉</p>
                    <p className="font-semibold">¡Todo está en bodega!</p>
                </div>
            ) : filteredLoans.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">Sin resultados para "{search}".</p>
            ) : (
                <>
                    <Section title="📍 Pendientes de recoger" color="text-orange-600" loans={pendingPickup} />
                    <Section title="🔴 Más de 14 días" color="text-red-600" loans={overdueLoans} />
                    <Section title="⚠️ Entre 7 y 14 días" color="text-yellow-600" loans={warningLoans} />
                    <Section title="✅ Al día (menos de 7 días)" color="text-green-600" loans={normalLoans} />
                </>
            )}
        </div>
    );
};
