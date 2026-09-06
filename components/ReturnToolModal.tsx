import React, { useState } from 'react';
import { Item, ReturnCondition } from '../types';

interface Props {
    item: Item;
    personName: string;
    movementIds: string[];
    onConfirm: (ids: string[], condition: ReturnCondition, notes: string) => void;
    onClose: () => void;
}

const CONDITIONS: { value: ReturnCondition; label: string; color: string; icon: string }[] = [
    { value: 'good',              label: 'Bueno',                        color: 'border-bien bg-bien-suave text-bien',  icon: '✅' },
    { value: 'worn',              label: 'Desgaste normal',              color: 'border-atencion bg-atencion-suave text-atencion', icon: '🔧' },
    { value: 'incomplete',        label: 'Incompleta (faltan accesorios)', color: 'border-atencion bg-atencion-suave text-atencion', icon: '⚠️' },
    { value: 'damaged',           label: 'Dañada',                       color: 'border-alerta bg-alerta-suave text-alerta',        icon: '❌' },
    { value: 'needs_maintenance', label: 'Requiere mantenimiento',        color: 'border-marca bg-marca-suave text-marca-oscuro', icon: '🔨' },
];

export const ReturnToolModal: React.FC<Props> = ({ item, personName, movementIds, onConfirm, onClose }) => {
    const [condition, setCondition] = useState<ReturnCondition | null>(null);
    const [notes, setNotes] = useState('');

    // Solo los retornables se revisan: un disco se gastó, no tiene por qué volver.
    const retornables = (item.accessories ?? []).filter(a => !a.itemId);
    // Arrancan todos marcados: lo normal es que vuelva completa, y así el
    // bodeguero solo desmarca lo que falta en vez de marcar lo que sí llegó.
    const [volvieron, setVolvieron] = useState<boolean[]>(() => retornables.map(() => true));
    const faltantes = retornables.filter((_, i) => !volvieron[i]).map(a => a.nombre);

    const noteRequired = !!item.requiresReturnNote && retornables.length === 0;
    const canSubmit = condition !== null && (!noteRequired || notes.trim().length > 0);

    const alternar = (idx: number) => setVolvieron(prev => {
        const next = prev.map((v, i) => (i === idx ? !v : v));
        // Si falta algo, el estado es "incompleta": no hay que acordarse de elegirlo.
        const hayFaltantes = retornables.some((_, i) => !next[i]);
        if (hayFaltantes) setCondition('incomplete');
        else if (condition === 'incomplete') setCondition(null);
        return next;
    });

    const handleSubmit = () => {
        if (!condition) return;
        // Lo que faltó queda ESCRITO con nombre. "Incompleta" a secas no sirve
        // para reclamarle nada a nadie.
        const detalle = faltantes.length > 0 ? `Faltó: ${faltantes.join(', ')}.` : '';
        const nota = [detalle, notes.trim()].filter(Boolean).join(' ');
        onConfirm(movementIds, condition, nota);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-papel rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-papel-borde">
                    <h3 className="text-base font-black text-tinta">Registrar devolución</h3>
                    <p className="text-xs text-tinta-tenue mt-0.5">
                        <span className="font-semibold text-tinta-suave">{item.name}</span> · {personName}
                    </p>
                </div>

                <div className="px-5 py-4 space-y-4">
                    {retornables.length > 0 && (
                        <div>
                            <label className="text-xs font-black text-tinta-tenue uppercase tracking-wide">
                                ¿Volvió con todo?
                            </label>
                            <p className="text-[10px] text-tinta-tenue mt-0.5 mb-1.5">Desmarcá lo que no volvió.</p>
                            <div className="space-y-1">
                                {retornables.map((acc, idx) => (
                                    <button key={idx} type="button" onClick={() => alternar(idx)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-all ${
                                            volvieron[idx]
                                                ? 'border-bien bg-bien-suave text-bien'
                                                : 'border-atencion bg-atencion-suave text-atencion font-bold'}`}>
                                        <span>{volvieron[idx] ? '✅' : '⚠️'}</span>
                                        <span className="flex-1">{acc.nombre}</span>
                                        {!volvieron[idx] && <span className="text-[10px] font-black uppercase">Falta</span>}
                                    </button>
                                ))}
                            </div>
                            {faltantes.length > 0 && (
                                <p className="text-[11px] text-atencion font-bold mt-1.5">
                                    Va a quedar registrado: faltó {faltantes.join(', ')}.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Condition picker */}
                    <div>
                        <p className="text-xs font-black text-tinta-tenue uppercase tracking-wide mb-2">
                            Estado al regresar <span className="text-alerta">*</span>
                        </p>
                        <div className="space-y-2">
                            {CONDITIONS.map(c => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setCondition(c.value)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all text-left ${
                                        condition === c.value
                                            ? c.color + ' border-2'
                                            : 'border-papel-borde bg-papel text-tinta-suave hover:border-papel-borde'
                                    }`}
                                >
                                    <span>{c.icon}</span>
                                    {c.label}
                                    {condition === c.value && <span className="ml-auto text-xs font-black">✓</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-xs font-black text-tinta-tenue uppercase tracking-wide">
                            Nota {noteRequired ? <span className="text-alerta">* (obligatoria)</span> : <span className="text-tinta-tenue">(opcional)</span>}
                        </label>
                        {noteRequired && (
                            <p className="text-[10px] text-atencion font-semibold mt-0.5 mb-1">
                                Esta herramienta lleva accesorios — indicá cuáles estaban y cuáles volvieron.
                            </p>
                        )}
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder={noteRequired
                                ? 'Ej: volvió con 2 de los 3 discos, falta el disco de corte fino...'
                                : 'Ej: cable un poco pelado en la punta...'}
                            rows={3}
                            className="mt-1 w-full text-sm border border-papel-borde rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-marca resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-2 px-5 pb-5">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-bold bg-papel-hondo hover:bg-papel-borde text-tinta-suave rounded-xl transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="flex-1 py-2.5 text-sm font-bold bg-bien hover:bg-bien text-papel rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Confirmar devolución
                    </button>
                </div>
            </div>
        </div>
    );
};
