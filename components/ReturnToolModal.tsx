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
    { value: 'good',              label: 'Bueno',                        color: 'border-green-400 bg-green-50 text-green-800',  icon: '✅' },
    { value: 'worn',              label: 'Desgaste normal',              color: 'border-yellow-400 bg-yellow-50 text-yellow-800', icon: '🔧' },
    { value: 'incomplete',        label: 'Incompleta (faltan accesorios)', color: 'border-orange-400 bg-orange-50 text-orange-800', icon: '⚠️' },
    { value: 'damaged',           label: 'Dañada',                       color: 'border-red-400 bg-red-50 text-red-800',        icon: '❌' },
    { value: 'needs_maintenance', label: 'Requiere mantenimiento',        color: 'border-purple-400 bg-purple-50 text-purple-800', icon: '🔨' },
];

export const ReturnToolModal: React.FC<Props> = ({ item, personName, movementIds, onConfirm, onClose }) => {
    const [condition, setCondition] = useState<ReturnCondition | null>(null);
    const [notes, setNotes] = useState('');

    const noteRequired = !!item.requiresReturnNote;
    const canSubmit = condition !== null && (!noteRequired || notes.trim().length > 0);

    const handleSubmit = () => {
        if (!condition) return;
        onConfirm(movementIds, condition, notes.trim());
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-gray-100">
                    <h3 className="text-base font-black text-gray-900">Registrar devolución</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-semibold text-gray-700">{item.name}</span> · {personName}
                    </p>
                </div>

                <div className="px-5 py-4 space-y-4">
                    {/* Condition picker */}
                    <div>
                        <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                            Estado al regresar <span className="text-red-500">*</span>
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
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
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
                        <label className="text-xs font-black text-gray-500 uppercase tracking-wide">
                            Nota {noteRequired ? <span className="text-red-500">* (obligatoria)</span> : <span className="text-gray-400">(opcional)</span>}
                        </label>
                        {noteRequired && (
                            <p className="text-[10px] text-orange-600 font-semibold mt-0.5 mb-1">
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
                            className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-2 px-5 pb-5">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="flex-1 py-2.5 text-sm font-bold bg-green-600 hover:bg-green-700 text-white rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Confirmar devolución
                    </button>
                </div>
            </div>
        </div>
    );
};
