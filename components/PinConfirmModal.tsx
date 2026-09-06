import React, { useState, useRef, useEffect } from 'react';
import { AppUser, UserRole } from '../types';
import * as db from '../services/supabaseService';
import { sha256Hex } from '../utils/hash';

interface PinConfirmModalProps {
    title?: string;
    message?: string;
    users: AppUser[];
    onConfirm: () => void;
    onClose: () => void;
}

export const PinConfirmModal: React.FC<PinConfirmModalProps> = ({
    title = 'Autorización requerida',
    message,
    users,
    onConfirm,
    onClose,
}) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [user, setUser] = useState('');
    const [pin, setPin]   = useState('');
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const userRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (step === 2) setTimeout(() => userRef.current?.focus(), 50);
    }, [step]);

    const fail = (msg: string) => {
        setError(msg);
        setShake(true);
        setPin('');
        setTimeout(() => setShake(false), 500);
    };

    // Solo un OWNER puede autorizar acciones destructivas.
    // Valida contra Supabase; si no hay conexión, compara el hash local.
    const verifyOwner = async (username: string, password: string): Promise<boolean> => {
        try {
            const result = await db.authenticateUser(username, password);
            if (result) return result.role === UserRole.OWNER;
        } catch {
            // Sin conexión — usar respaldo local por hash
        }
        const candidate = users.find(u =>
            u.role === UserRole.OWNER &&
            (u.username.toLowerCase() === username.toLowerCase() || u.name.toLowerCase() === username.toLowerCase())
        );
        if (!candidate?.passwordHash) return false;
        return (await sha256Hex(password)) === candidate.passwordHash;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) return;
        setIsLoading(true);
        try {
            if (await verifyOwner(user.trim(), pin)) {
                onConfirm();
                onClose();
            } else {
                fail('Usuario o contraseña incorrectos');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <div
                className={`w-full max-w-sm bg-papel rounded-2xl shadow-2xl border border-papel-borde overflow-hidden transition-all ${shake ? 'animate-shake' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-alerta px-5 py-4 flex items-center gap-3">
                    <span className="text-2xl">{step === 1 ? '⚠️' : '🔐'}</span>
                    <div>
                        <p className="text-papel font-black text-sm">{title}</p>
                        {message && <p className="text-papel text-xs mt-0.5">{message}</p>}
                    </div>
                </div>

                {step === 1 ? (
                    <div className="p-5 space-y-4">
                        <p className="text-sm text-tinta-suave text-center font-medium">
                            Esta acción no se puede deshacer.<br />¿Estás seguro de continuar?
                        </p>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={onClose}
                                className="flex-1 py-2.5 bg-papel-hondo hover:bg-papel-borde text-tinta-suave text-sm font-bold rounded-xl transition-all">
                                Cancelar
                            </button>
                            <button type="button" onClick={() => setStep(2)}
                                className="flex-1 py-2.5 bg-alerta hover:bg-alerta text-papel text-sm font-black rounded-xl transition-all">
                                Sí, continuar
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-5 space-y-4">
                        <p className="text-xs text-tinta-tenue text-center">Ingresa credenciales de administrador para confirmar</p>
                        <div>
                            <label className="block text-xs font-bold text-tinta-suave mb-1">Usuario</label>
                            <input
                                ref={userRef}
                                type="text"
                                value={user}
                                onChange={e => { setUser(e.target.value); setError(''); }}
                                className="w-full px-3 py-2 text-sm border border-papel-borde rounded-xl focus:outline-none focus:ring-2 focus:ring-alerta"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-tinta-suave mb-1">Contraseña</label>
                            <input
                                type="password"
                                value={pin}
                                onChange={e => { setPin(e.target.value); setError(''); }}
                                className="w-full px-3 py-2 text-sm border border-papel-borde rounded-xl focus:outline-none focus:ring-2 focus:ring-alerta"
                                autoComplete="off"
                            />
                        </div>

                        {error && (
                            <p className="text-xs text-alerta font-semibold text-center">{error}</p>
                        )}

                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => { setStep(1); setUser(''); setPin(''); setError(''); }}
                                className="flex-1 py-2.5 bg-papel-hondo hover:bg-papel-borde text-tinta-suave text-sm font-bold rounded-xl transition-all">
                                Atrás
                            </button>
                            <button type="submit" disabled={isLoading}
                                className="flex-1 py-2.5 bg-alerta hover:bg-alerta disabled:bg-papel-borde text-papel text-sm font-black rounded-xl transition-all">
                                {isLoading ? 'Verificando…' : 'Autorizar'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
