import React, { useState } from 'react';
import { AppUser } from '../types';

interface Props {
    title: string;
    message: string;
    users: AppUser[];
    onConfirm: () => void;
    onClose: () => void;
}

export const MultiUserConfirmModal: React.FC<Props> = ({ title, message, users, onConfirm, onClose }) => {
    const required = users.filter(u => u.setupComplete && u.username && u.password);
    const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
    const [currentPassword, setCurrentPassword] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);

    const handleConfirmUser = (e: React.FormEvent) => {
        e.preventDefault();
        const user = required.find(u => u.id === selectedUserId);
        if (!user) { setError('Selecciona un usuario'); return; }
        if (user.password !== currentPassword) {
            setError('Contraseña incorrecta');
            setShake(true);
            setCurrentPassword('');
            setTimeout(() => setShake(false), 500);
            return;
        }
        const next = new Set(confirmed);
        next.add(user.id);
        setConfirmed(next);
        setSelectedUserId('');
        setCurrentPassword('');
        setError('');
        if (next.size >= required.length) {
            onConfirm();
            onClose();
        }
    };

    const pending = required.filter(u => !confirmed.has(u.id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
            <div className={`w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden ${shake ? 'animate-shake' : ''}`}
                onClick={e => e.stopPropagation()}>
                <div className="bg-red-600 px-5 py-4">
                    <p className="text-white font-black text-sm">🔐 {title}</p>
                    {message && <p className="text-red-100 text-xs mt-0.5">{message}</p>}
                </div>

                <div className="p-5 space-y-4">
                    {/* Progreso */}
                    <div className="flex gap-2">
                        {required.map(u => (
                            <div key={u.id} className={`flex-1 rounded-xl px-2 py-2 text-center text-xs font-black transition-all ${confirmed.has(u.id) ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                                {confirmed.has(u.id) ? '✓ ' : ''}{u.name}
                            </div>
                        ))}
                    </div>

                    {pending.length > 0 ? (
                        <form onSubmit={handleConfirmUser} className="space-y-3">
                            <p className="text-xs text-gray-500 text-center">
                                Faltan <strong className="text-gray-800">{pending.length}</strong> confirmación{pending.length !== 1 ? 'es' : ''}
                            </p>
                            <select
                                value={selectedUserId}
                                onChange={e => { setSelectedUserId(e.target.value); setError(''); }}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                            >
                                <option value="">— Seleccionar usuario —</option>
                                {pending.map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                                ))}
                            </select>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                                placeholder="Contraseña *"
                                autoComplete="current-password"
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                            />
                            {error && <p className="text-xs text-red-500 font-semibold text-center">{error}</p>}
                            <div className="flex gap-2">
                                <button type="button" onClick={onClose}
                                    className="flex-1 py-2 border border-gray-200 text-gray-500 rounded-xl text-sm font-semibold hover:bg-gray-50">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={!selectedUserId || !currentPassword}
                                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl text-sm transition-all">
                                    Confirmar
                                </button>
                            </div>
                        </form>
                    ) : (
                        <p className="text-center text-green-700 font-black text-sm py-2">✅ Todos confirmados</p>
                    )}
                </div>
            </div>
        </div>
    );
};
