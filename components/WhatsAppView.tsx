
import React, { useState } from 'react';
import { Movement, Item, Personnel } from '../types';
import {
    ReminderLog,
    loadReminderLog,
    recordReminders,
    isDueForReminder,
    buildPersonGroups,
    buildPersonReminderUrl,
    buildTestReminderUrl,
    daysSince,
    REMINDER_INTERVAL_DAYS,
    TEST_PHONE_DISPLAY,
} from '../services/whatsappService';

interface Props {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
}

interface PersonGroup {
    person: Personnel;
    loans: Movement[];
    hasPhone: boolean;
    isDue: boolean;
}

export const WhatsAppView: React.FC<Props> = ({ movements, items, personnel }) => {
    const [log, setLog] = useState<ReminderLog>(loadReminderLog);
    const [step, setStep] = useState<number | null>(null);

    const itemMap = new Map(items.map(i => [i.id, i]));
    const activeLoans = movements.filter(m => m.isLoan && !m.isReturned);

    const groups: PersonGroup[] = [];
    const seen = new Set<string>();
    for (const loan of activeLoans) {
        const person = personnel.find(p => p.id === loan.personnelId);
        if (!person || seen.has(person.id)) continue;
        seen.add(person.id);
        const personLoans = activeLoans.filter(m => m.personnelId === person.id);
        const hasPhone = !!person.phone;
        const isDue = hasPhone && personLoans.some(m => isDueForReminder(m.id, m.timestamp, log));
        groups.push({ person, loans: personLoans, hasPhone, isDue });
    }

    groups.sort((a, b) => a.person.name.localeCompare(b.person.name, 'es'));

    const dueGroups       = groups.filter(g => g.isDue);
    const onTrackGroups   = groups.filter(g => g.hasPhone && !g.isDue);
    const noPhoneGroups   = groups.filter(g => !g.hasPhone);

    const remind = (g: PersonGroup, windowDays = 7) => {
        if (!g.person.phone) return;
        const groups = buildPersonGroups(g.person, movements, items, windowDays);
        window.open(buildPersonReminderUrl(g.person.phone, g.person.name, groups), '_blank');
        const newLog = recordReminders(g.loans.map(m => m.id));
        setLog({ ...newLog });
    };

    const remindMonthly = (g: PersonGroup) => remind(g, 30);

    const startRemindAll = () => {
        if (dueGroups.length === 0) return;
        setStep(0);
        remind(dueGroups[0]);
    };

    const nextStep = () => {
        if (step === null) return;
        const next = step + 1;
        if (next >= dueGroups.length) { setStep(null); return; }
        setStep(next);
        remind(dueGroups[next]);
    };

    const startRemindAllMonthly = () => {
        const withPhone = groups.filter(g => g.hasPhone);
        withPhone.forEach((g, i) => setTimeout(() => remindMonthly(g), i * 400));
    };

    const PersonCard: React.FC<{ g: PersonGroup }> = ({ g }) => {
        const maxDays = Math.max(...g.loans.map(m => daysSince(m.timestamp)));
        const itemNames = g.loans.map(m => itemMap.get(m.itemId)?.name ?? '—').join(', ');
        const lastRemindedTs = g.loans.map(m => log[m.id]).filter(Boolean).sort().reverse()[0];
        const daysSinceReminder = lastRemindedTs ? daysSince(lastRemindedTs) : null;

        return (
            <div className={`rounded-2xl p-4 border flex items-center gap-3 ${g.isDue ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-base flex-shrink-0">
                    {g.person.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{g.person.name}</p>
                        {g.isDue && (
                            <span className="text-[10px] font-black bg-green-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">
                                recordar
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{itemNames}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className={`text-[10px] font-semibold ${maxDays > 14 ? 'text-red-500' : maxDays > 7 ? 'text-yellow-600' : 'text-gray-400'}`}>
                            {maxDays}d fuera
                        </span>
                        {g.person.phone && (
                            <span className="text-[10px] text-gray-400">{g.person.phone}</span>
                        )}
                        {daysSinceReminder !== null && (
                            <span className="text-[10px] text-green-600">• recordado hace {daysSinceReminder}d</span>
                        )}
                    </div>
                </div>
                {g.hasPhone ? (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                            onClick={() => remind(g)}
                            className={`flex items-center gap-1 px-3 py-2 text-xs font-black rounded-xl transition-all ${
                                g.isDue
                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                    : 'bg-green-100 hover:bg-green-200 text-green-800'
                            }`}
                        >
                            📲 Semana
                        </button>
                        <button
                            onClick={() => remindMonthly(g)}
                            className="flex items-center gap-1 px-3 py-2 text-xs font-black bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-xl transition-all"
                            title="Resumen del último mes"
                        >
                            📅 Mes
                        </button>
                    </div>
                ) : (
                    <span className="flex-shrink-0 text-[10px] text-gray-300 text-right max-w-[72px] leading-tight">
                        Sin número en Personal
                    </span>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-5 max-w-2xl mx-auto">
            {/* Page header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-black text-gray-900">📱 WhatsApp Recordatorios</h1>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {activeLoans.length} herramienta{activeLoans.length !== 1 ? 's' : ''} fuera de bodega
                        {dueGroups.length > 0 && ` · ${dueGroups.length} persona${dueGroups.length > 1 ? 's' : ''} sin recordar`}
                    </p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {groups.some(g => g.hasPhone) && (
                        <button
                            onClick={startRemindAllMonthly}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl transition-colors"
                            title="Enviar resumen del último mes a todos"
                        >
                            📅 Resumen mes a todos
                        </button>
                    )}
                    <a
                        href={buildTestReminderUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-800 text-xs font-black rounded-xl transition-colors"
                        title={`Enviar prueba a ${TEST_PHONE_DISPLAY}`}
                    >
                        🧪 Probar
                    </a>
                </div>
            </div>

            {activeLoans.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 text-gray-400">
                    <p className="text-4xl mb-3">🎉</p>
                    <p className="font-semibold">¡Todo está en bodega!</p>
                    <p className="text-sm mt-1">No hay herramientas prestadas.</p>
                </div>
            ) : (
                <>
                    {/* Pendientes (+8 días sin recordar) */}
                    {dueGroups.length > 0 && (
                        <div className="bg-white rounded-2xl border border-green-200 overflow-hidden shadow-sm">
                            <div className="bg-green-600 px-4 py-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-white">🔔 Necesitan recordatorio</p>
                                    <p className="text-xs text-green-100">
                                        Sin contactar hace +{REMINDER_INTERVAL_DAYS} días
                                    </p>
                                </div>
                                {step === null && (
                                    <button
                                        onClick={startRemindAll}
                                        className="flex-shrink-0 text-xs font-black bg-white text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-xl transition-colors"
                                    >
                                        Recordar a todos ({dueGroups.length}) →
                                    </button>
                                )}
                            </div>

                            {/* Banner paso a paso */}
                            {step !== null && (
                                <div className="bg-green-50 border-b border-green-200 px-4 py-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black text-green-900">
                                            Paso {step + 1} de {dueGroups.length} — {dueGroups[step].person.name}
                                        </p>
                                        <p className="text-xs text-green-700">
                                            WhatsApp abierto → toca Enviar → vuelve aquí
                                        </p>
                                    </div>
                                    <button
                                        onClick={nextStep}
                                        className="flex-shrink-0 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl transition-colors"
                                    >
                                        {step < dueGroups.length - 1 ? 'Siguiente →' : '✓ Listo'}
                                    </button>
                                </div>
                            )}

                            <div className="p-3 space-y-2">
                                {dueGroups.map((g, i) => (
                                    <div key={g.person.id} className={step === i ? 'ring-2 ring-green-400 rounded-2xl' : ''}>
                                        <PersonCard g={g} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {dueGroups.length === 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                            <span className="text-2xl">✅</span>
                            <div>
                                <p className="text-sm font-black text-green-900">Al día con los recordatorios</p>
                                <p className="text-xs text-green-700">Nadie lleva más de {REMINDER_INTERVAL_DAYS} días sin recibir mensaje.</p>
                            </div>
                        </div>
                    )}

                    {/* Con teléfono, al día */}
                    {onTrackGroups.length > 0 && (
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">📋 Préstamos activos — al día</p>
                            <div className="space-y-2">
                                {onTrackGroups.map(g => <PersonCard key={g.person.id} g={g} />)}
                            </div>
                        </div>
                    )}

                    {/* Sin teléfono */}
                    {noPhoneGroups.length > 0 && (
                        <div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">⚠️ Sin número de WhatsApp</p>
                            <div className="space-y-2">
                                {noPhoneGroups.map(g => <PersonCard key={g.person.id} g={g} />)}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 text-center">
                                Agrega el teléfono en la sección Personal → toca el nombre del trabajador → editar.
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
