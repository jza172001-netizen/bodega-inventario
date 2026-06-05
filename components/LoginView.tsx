
import React, { useState, useRef, useEffect } from 'react';
import { AppUser, UserRole } from '../types';
import * as db from '../services/supabaseService';

interface LoginViewProps {
    users: AppUser[];
    onLoginSuccess: (role: UserRole, name: string) => void;
    onFirstSetup: (userId: string, username: string, password: string) => void;
}

type Screen = 'main' | 'users' | 'password' | 'setup';

export const LoginView: React.FC<LoginViewProps> = ({ users, onLoginSuccess, onFirstSetup }) => {
    const [screen, setScreen] = useState<Screen>('main');
    const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
    const [password, setPassword] = useState('');
    const [setupUsername, setSetupUsername] = useState('');
    const [setupPassword, setSetupPassword] = useState('');
    const [setupConfirm, setSetupConfirm] = useState('');
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const passwordRef = useRef<HTMLInputElement>(null);
    const setupUsernameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (screen === 'password') setTimeout(() => passwordRef.current?.focus(), 100);
        if (screen === 'setup') setTimeout(() => setupUsernameRef.current?.focus(), 100);
    }, [screen]);

    const bodegueroUsers = users.filter(u => u.role !== UserRole.VISITOR);

    const triggerShake = (msg: string) => {
        setError(msg);
        setShake(true);
        setTimeout(() => setShake(false), 500);
    };

    const handleSelectUser = (user: AppUser) => {
        setSelectedUser(user);
        setPassword('');
        setError('');
        if (!user.setupComplete) {
            setSetupUsername('');
            setSetupPassword('');
            setSetupConfirm('');
            setScreen('setup');
        } else {
            setScreen('password');
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || isLoading) return;
        setIsLoading(true);
        try {
            if (selectedUser.username) {
                const result = await db.authenticateUser(selectedUser.username, password);
                if (result) {
                    onLoginSuccess(result.role, result.name);
                    return;
                }
            }
            // Fallback offline: contraseña local solo si Supabase no responde
            if (selectedUser.password && password === selectedUser.password) {
                onLoginSuccess(selectedUser.role, selectedUser.name);
            } else {
                setPassword('');
                triggerShake('Contraseña incorrecta');
            }
        } catch {
            // Supabase no disponible — usar credencial local como respaldo
            if (selectedUser.password && password === selectedUser.password) {
                onLoginSuccess(selectedUser.role, selectedUser.name);
            } else {
                setPassword('');
                triggerShake('Sin conexión y contraseña incorrecta');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetupSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;
        if (!setupUsername.trim()) { triggerShake('Pon un nombre de usuario'); return; }
        if (setupPassword.length < 3) { triggerShake('La contraseña debe tener al menos 3 caracteres'); return; }
        if (setupPassword !== setupConfirm) { triggerShake('Las contraseñas no coinciden'); return; }
        if (users.some(u => u.username === setupUsername.trim() && u.id !== selectedUser.id)) {
            triggerShake('Ese nombre de usuario ya está en uso'); return;
        }
        onFirstSetup(selectedUser.id, setupUsername.trim(), setupPassword);
    };

    const goBack = () => {
        setScreen(screen === 'users' || screen === 'main' ? 'main' : 'users');
        setSelectedUser(null);
        setError('');
        setPassword('');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <img src="/montecielo-logo.png" alt="Grupo Montecielo"
                        className="h-16 w-auto object-contain mx-auto drop-shadow-sm" />
                    <p className="text-gray-400 text-sm mt-3">Sistema de inventario de bodega</p>
                </div>

                {/* ── PANTALLA PRINCIPAL ── */}
                {screen === 'main' && (
                    <div className="space-y-3">
                        <button
                            onClick={() => setScreen('users')}
                            className="w-full flex items-center gap-4 p-5 bg-white border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg rounded-2xl text-left transition-all group shadow-sm"
                        >
                            <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center text-white text-2xl flex-shrink-0 group-hover:scale-105 transition-transform">
                                👷
                            </div>
                            <div>
                                <p className="font-black text-gray-900 text-lg">Bodeguero</p>
                                <p className="text-xs text-gray-500">Acceso completo al sistema</p>
                            </div>
                            <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-500 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>

                        <button
                            onClick={() => onLoginSuccess(UserRole.VISITOR, 'Visitante')}
                            className="w-full flex items-center gap-4 p-5 bg-white border-2 border-gray-200 hover:border-gray-400 hover:shadow-md rounded-2xl text-left transition-all group shadow-sm"
                        >
                            <div className="w-14 h-14 rounded-xl bg-gray-400 flex items-center justify-center text-white text-2xl flex-shrink-0 group-hover:scale-105 transition-transform">
                                👁️
                            </div>
                            <div>
                                <p className="font-black text-gray-900 text-lg">Visitante</p>
                                <p className="text-xs text-gray-500">Solo lectura · Sin contraseña</p>
                            </div>
                            <svg className="w-5 h-5 text-gray-300 group-hover:text-gray-500 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* ── SELECCIÓN DE USUARIO ── */}
                {screen === 'users' && (
                    <div>
                        <button onClick={goBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 mb-5 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                            </svg>
                            Volver
                        </button>
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">¿Quién eres?</p>
                        <div className="space-y-3">
                            {bodegueroUsers.map(user => (
                                <button
                                    key={user.id}
                                    onClick={() => handleSelectUser(user)}
                                    className="w-full flex items-center gap-4 p-4 bg-white border-2 border-gray-200 hover:border-blue-400 hover:shadow-md rounded-2xl text-left transition-all group shadow-sm"
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-black flex-shrink-0 group-hover:scale-105 transition-transform ${user.role === UserRole.OWNER ? 'bg-indigo-600' : 'bg-blue-500'}`}>
                                        {'👷'}
                                    </div>
                                    <div>
                                        <p className="font-black text-gray-900">{user.name}</p>
                                        <p className="text-xs text-gray-400">
                                            {!user.setupComplete
                                                ? '✨ Primera vez — crea tu cuenta'
                                                : user.role === UserRole.OWNER ? 'Administrador' : 'Bodeguero'
                                            }
                                        </p>
                                    </div>
                                    <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-500 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                                    </svg>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── CONTRASEÑA ── */}
                {screen === 'password' && selectedUser && (
                    <div className={shake ? 'animate-bounce' : ''}>
                        <button onClick={goBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 mb-5 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                            </svg>
                            Cambiar usuario
                        </button>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <div className="flex items-center gap-3 mb-5">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-2xl ${selectedUser.role === UserRole.OWNER ? 'bg-indigo-600' : 'bg-blue-500'}`}>
                                    👷
                                </div>
                                <div>
                                    <p className="font-black text-gray-900">{selectedUser.name}</p>
                                    <p className="text-xs text-gray-400">Ingresa tu contraseña</p>
                                </div>
                            </div>

                            <form onSubmit={handlePasswordSubmit} className="space-y-4">
                                <input
                                    ref={passwordRef}
                                    type="password"
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); setError(''); }}
                                    placeholder="••••••••"
                                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 outline-none text-gray-800 font-bold text-lg tracking-widest"
                                />
                                {error && <p className="text-sm text-red-500 font-semibold text-center">{error}</p>}
                                <button type="submit"
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition-all text-sm">
                                    Entrar →
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* ── PRIMER SETUP ── */}
                {screen === 'setup' && selectedUser && (
                    <div className={shake ? 'animate-bounce' : ''}>
                        <button onClick={goBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 mb-5 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                            </svg>
                            Volver
                        </button>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <div className="text-center mb-5">
                                <p className="text-2xl mb-1">✨</p>
                                <p className="font-black text-gray-900 text-lg">Bienvenido/a, {selectedUser.name}</p>
                                <p className="text-xs text-gray-400 mt-1">Crea tu nombre de usuario y contraseña</p>
                            </div>

                            <form onSubmit={handleSetupSubmit} className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Nombre de usuario</label>
                                    <input
                                        ref={setupUsernameRef}
                                        type="text"
                                        value={setupUsername}
                                        onChange={e => { setSetupUsername(e.target.value); setError(''); }}
                                        placeholder="ej: esteban_bodega"
                                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 outline-none text-gray-800 font-bold"
                                        autoComplete="username"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Contraseña</label>
                                    <input
                                        type="password"
                                        value={setupPassword}
                                        onChange={e => { setSetupPassword(e.target.value); setError(''); }}
                                        placeholder="••••••••"
                                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 outline-none text-gray-800 font-bold"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Confirmar contraseña</label>
                                    <input
                                        type="password"
                                        value={setupConfirm}
                                        onChange={e => { setSetupConfirm(e.target.value); setError(''); }}
                                        placeholder="••••••••"
                                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 outline-none text-gray-800 font-bold"
                                        autoComplete="new-password"
                                    />
                                </div>
                                {error && <p className="text-sm text-red-500 font-semibold text-center">{error}</p>}
                                <button type="submit"
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition-all text-sm">
                                    Crear cuenta y entrar →
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                <p className="text-center text-xs text-gray-400 mt-8">
                    Grupo Montecielo · Sistema de gestión de inventario
                </p>
            </div>
        </div>
    );
};
