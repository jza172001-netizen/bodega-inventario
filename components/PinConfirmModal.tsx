import React, { useState, useRef, useEffect } from 'react';

interface PinConfirmModalProps {
    title?: string;
    message?: string;
    onConfirm: () => void;
    onClose: () => void;
}

const ADMIN_USER = 'july';
const ADMIN_PIN  = '6274';

export const PinConfirmModal: React.FC<PinConfirmModalProps> = ({
    title = 'Autorización requerida',
    message,
    onConfirm,
    onClose,
}) => {
    const [user, setUser] = useState('');
    const [pin, setPin]   = useState('');
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);
    const userRef = useRef<HTMLInputElement>(null);

    useEffect(() => { userRef.current?.focus(); }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (user.trim() === ADMIN_USER && pin === ADMIN_PIN) {
            onConfirm();
            onClose();
        } else {
            setError('Usuario o contraseña incorrectos');
            setShake(true);
            setPin('');
            setTimeout(() => setShake(false), 500);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <div
                className={`w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transition-all ${shake ? 'animate-shake' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
                    <span className="text-2xl">🔐</span>
                    <div>
                        <p className="text-white font-black text-sm">{title}</p>
                        {message && <p className="text-red-100 text-xs mt-0.5">{message}</p>}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Usuario</label>
                        <input
                            ref={userRef}
                            type="text"
                            value={user}
                            onChange={e => { setUser(e.target.value); setError(''); }}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Contraseña</label>
                        <input
                            type="password"
                            value={pin}
                            onChange={e => { setPin(e.target.value); setError(''); }}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400"
                            autoComplete="off"
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-red-600 font-semibold text-center">{error}</p>
                    )}

                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose}
                            className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold rounded-xl transition-all">
                            Cancelar
                        </button>
                        <button type="submit"
                            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-black rounded-xl transition-all">
                            Autorizar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
