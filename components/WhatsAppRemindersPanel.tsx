
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
    movementIds: string[];
}

export const WhatsAppRemindersPanel: React.FC<Props> = ({ movements, items, personnel }) => {
    const [log, setLog] = useState<ReminderLog>(loadReminderLog);
    const [step, setStep] = useState<number | null>(null);
    const [sentAll, setSentAll] = useState(false);

    const itemMap = new Map(items.map(i => [i.id, i]));
    const activeLoans = movements.filter(m => m.isLoan && !m.isReturned);

    const groups: PersonGroup[] = [];
    const seen = new Set<string>();
    for (const loan of activeLoans) {
        const person = personnel.find(p => p.id === loan.personnelId);
        if (!person?.phone || seen.has(person.id)) continue;
        const personLoans = activeLoans.filter(m => m.personnelId === person.id);
        const hasDue = personLoans.some(m => isDueForReminder(m.id, new Date(m.timestamp), log));
        if (!hasDue) continue;
        seen.add(person.id);
        groups.push({ person, loans: personLoans, movementIds: personLoans.map(m => m.id) });
    }

    const buildUrl = (g: PersonGroup) => {
        const reminderGroups = buildPersonGroups(g.person, movements, items);
        return buildPersonReminderUrl(g.person.phone!, g.person.name, reminderGroups);
    };

    const remind = (g: PersonGroup) => {
        window.open(buildUrl(g), '_blank');
        const newLog = recordReminders(g.movementIds);
        setLog({ ...newLog });
    };

    const startRemindAll = () => {
        if (groups.length === 0) return;
        setStep(0);
        setSentAll(false);
        remind(groups[0]);
    };

    const nextStep = () => {
        if (step === null) return;
        const next = step + 1;
        if (next >= groups.length) {
            setStep(null);
            setSentAll(true);
            return;
        }
        setStep(next);
        remind(groups[next]);
    };

    if (groups.length === 0 && !sentAll) return null;

    if (sentAll) {
        return (
            <div className="bg-bien-suave border border-bien rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                    <p className="text-sm font-black text-bien">Recordatorios enviados</p>
                    <p className="text-xs text-bien mt-0.5">Todos los WhatsApp fueron abiertos. Próximo recordatorio en {REMINDER_INTERVAL_DAYS} días.</p>
                </div>
                <button onClick={() => setSentAll(false)} className="ml-auto text-xs text-bien hover:text-bien">✕</button>
            </div>
        );
    }

    return (
        <div className="bg-papel border border-bien rounded-2xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="bg-bien px-4 py-3 flex items-center justify-between">
                <div>
                    <p className="text-sm font-black text-papel">📱 Recordatorios WhatsApp</p>
                    <p className="text-xs text-papel mt-0.5">
                        {groups.length} persona{groups.length > 1 ? 's' : ''} sin contactar hace +{REMINDER_INTERVAL_DAYS} días
                    </p>
                </div>
                <a
                    href={buildTestReminderUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold bg-bien hover:bg-bien text-papel px-2.5 py-1.5 rounded-lg transition-colors"
                    title={`Enviar prueba a ${TEST_PHONE_DISPLAY}`}
                >
                    🧪 Probar
                </a>
            </div>

            {/* Paso a paso mientras se está enviando */}
            {step !== null && (
                <div className="bg-bien-suave border-b border-bien px-4 py-3 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-black text-bien">Paso {step + 1} de {groups.length}</p>
                        <p className="text-xs text-bien">WhatsApp abierto para {groups[step].person.name}</p>
                    </div>
                    <button
                        onClick={nextStep}
                        className="px-3 py-1.5 bg-bien hover:bg-bien text-papel text-xs font-black rounded-xl"
                    >
                        {step < groups.length - 1 ? 'Siguiente →' : '✓ Finalizar'}
                    </button>
                </div>
            )}

            {/* Lista de personas pendientes */}
            <div className="divide-y divide-papel-borde">
                {groups.map((g, i) => {
                    const itemNames = g.loans.map(m => itemMap.get(m.itemId)?.name ?? 'Herramienta').join(', ');
                    const maxDays = Math.max(...g.loans.map(m => daysSince(new Date(m.timestamp))));
                    const lastReminded = g.movementIds
                        .map(id => log[id])
                        .filter(Boolean)
                        .sort()
                        .reverse()[0];
                    const daysSinceReminder = lastReminded ? daysSince(lastReminded) : null;
                    const isCurrent = step === i;
                    return (
                        <div key={g.person.id} className={`flex items-center justify-between px-4 py-3 ${isCurrent ? 'bg-bien-suave' : ''}`}>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-bien-suave text-bien flex items-center justify-center font-black text-xs flex-shrink-0">
                                        {g.person.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-tinta truncate">{g.person.name}</p>
                                        <p className="text-[10px] text-tinta-tenue truncate">{itemNames}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-1 ml-9">
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${maxDays > 14 ? 'bg-alerta-suave text-alerta' : 'bg-atencion-suave text-atencion'}`}>
                                        {maxDays}d sin devolver
                                    </span>
                                    {daysSinceReminder !== null && (
                                        <span className="text-[10px] text-tinta-tenue">último recordatorio hace {daysSinceReminder}d</span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => remind(g)}
                                className="flex-shrink-0 ml-3 flex items-center gap-1 px-3 py-1.5 bg-bien-suave hover:bg-bien-suave text-bien text-xs font-black rounded-xl transition-all"
                            >
                                📲 <span>Recordar</span>
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Footer — Recordar a todos */}
            {step === null && (
                <div className="px-4 py-3 border-t border-papel-borde">
                    <button
                        onClick={startRemindAll}
                        className="w-full py-2.5 bg-bien hover:bg-bien text-papel text-sm font-black rounded-xl transition-colors"
                    >
                        📲 Recordar a todos ({groups.length})
                    </button>
                    <p className="text-[10px] text-tinta-tenue text-center mt-1.5">
                        Abre WhatsApp para cada persona paso a paso. Mensaje incluye foto 📸
                    </p>
                </div>
            )}
        </div>
    );
};
