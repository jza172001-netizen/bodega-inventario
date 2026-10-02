
import React, { useState, useRef, useEffect } from 'react';
import { AppUser, UserRole } from '../types';
import * as db from '../services/supabaseService';
import { sha256Hex } from '../utils/hash';

interface LoginViewProps {
    users: AppUser[];
    onLoginSuccess: (role: UserRole, name: string) => void;
    onFirstSetup: (userId: string, username: string, password: string) => void;
    onCredentialVerified?: (userId: string, passwordHash: string) => void;
}

type Screen = 'main' | 'users' | 'password' | 'setup' | 'cambiarClave';

export const LoginView: React.FC<LoginViewProps> = ({ users, onLoginSuccess, onFirstSetup, onCredentialVerified }) => {
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
    /** El código que el administrador le pasó a esta persona. */
    const [setupCodigo, setSetupCodigo] = useState('');
    /** Quién quedó autenticado y esperando a cambiar su contraseña para entrar. */
    const [pendienteDeEntrar, setPendienteDeEntrar] = useState<{ role: UserRole; name: string } | null>(null);

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
            setSetupCodigo('');
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
                /**
                 * Primero la identidad de servidor, después el camino de antes.
                 *
                 * Son dos vías A PROPÓSITO, y solo durante la transición. La
                 * nueva le pregunta al servidor quién es esta persona; la vieja
                 * compara la contraseña contra una tabla y no le dice nada al
                 * servidor. Mientras las dos estén vivas nadie se queda afuera,
                 * y cuando esté comprobado que los cinco accesos entran por la
                 * nueva, se corta la llave pública y la vieja sobra.
                 *
                 * Un RECHAZO de la nueva NO cae a la vieja: si el servidor
                 * comparó y dijo que no, probar otra vez por otra puerta es
                 * exactamente el agujero que se cerró en el PR #85.
                 */
                const conIdentidad = await db.entrarConIdentidad(selectedUser.username, password);
                if (conIdentidad.estado === 'ok') {
                    /**
                     * Con la contraseña vieja se AUTENTICA pero no se entra.
                     *
                     * Las tres contraseñas que había eran de dos caracteres. Al
                     * cerrar todo lo demás, esas dos letras pasaban a ser lo
                     * único que separa el inventario de internet. No se cambian
                     * por detrás —eso deja a la encargada parada en la puerta—
                     * sino acá, con la suya vieja en la mano.
                     */
                    if (conIdentidad.usuario.debeCambiarClave) {
                        setPendienteDeEntrar({ role: conIdentidad.usuario.role, name: conIdentidad.usuario.name });
                        setSetupPassword('');
                        setSetupConfirm('');
                        setError('');
                        setScreen('cambiarClave');
                        return;
                    }
                    onCredentialVerified?.(selectedUser.id, await sha256Hex(password));
                    onLoginSuccess(conIdentidad.usuario.role, conIdentidad.usuario.name);
                    return;
                }
                if (conIdentidad.estado === 'rechazado') {
                    setPassword('');
                    triggerShake('Contraseña incorrecta');
                    return;
                }

                const r = await db.authenticateUser(selectedUser.username, password);
                if (r.estado === 'ok') {
                    // Guardar hash para que el respaldo offline funcione tras recargar
                    onCredentialVerified?.(selectedUser.id, await sha256Hex(password));
                    onLoginSuccess(r.usuario.role, r.usuario.name);
                    return;
                }
                /**
                 * EL SERVIDOR DIJO QUE NO. Acá se para.
                 *
                 * Antes esto caía al respaldo del teléfono, porque «contraseña
                 * equivocada» y «no hay conexión» llegaban como el mismo `null`.
                 * Con eso, cambiarle la contraseña a alguien no se la cambiaba:
                 * seguía entrando con la vieja desde su celular.
                 *
                 * El respaldo del teléfono es para cuando no se puede preguntar,
                 * no para cuando la respuesta no gustó.
                 */
                if (r.estado === 'rechazado') {
                    setPassword('');
                    triggerShake('Contraseña incorrecta');
                    return;
                }
            }
            // Sin respuesta del servidor: respaldo con el hash guardado en este
            // dispositivo (las contraseñas no se persisten en texto plano).
            if (await offlineMatch(selectedUser, password)) {
                onLoginSuccess(selectedUser.role, selectedUser.name);
            } else {
                setPassword('');
                triggerShake('Contraseña incorrecta');
            }
        } catch {
            // Supabase no disponible — usar credencial local como respaldo
            if (await offlineMatch(selectedUser, password)) {
                onLoginSuccess(selectedUser.role, selectedUser.name);
            } else {
                setPassword('');
                triggerShake('Sin conexión y contraseña incorrecta');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const offlineMatch = async (user: AppUser, password: string): Promise<boolean> => {
        if (user.passwordHash) return (await sha256Hex(password)) === user.passwordHash;
        // Compatibilidad con sesiones antiguas que aún tengan la contraseña en memoria
        return !!user.password && password === user.password;
    };

    /**
     * El cambio obligatorio de contraseña, con la persona YA autenticada.
     *
     * Esto corre después de que el servidor dijo «sí, es quien dice ser», así
     * que hay sesión abierta y `cambiarClave` puede escribir en los dos lados:
     * el servidor de identidad y la tabla que usa el camino viejo. Cambiar uno
     * solo dejaría a la persona entrando con la vieja por la otra puerta.
     *
     * Si falla, NO se entra pero tampoco se pierde nada: la contraseña de
     * siempre sigue sirviendo y se puede volver a intentar. Preferir eso a
     * dejarla adentro sin cambiarla es a propósito — si se deja pasar «por esta
     * vez», nadie la cambia nunca.
     */
    const handleCambioSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || !pendienteDeEntrar || isLoading) return;
        if (setupPassword.length < 6) { triggerShake('La contraseña nueva debe tener al menos 6 caracteres'); return; }
        if (setupPassword !== setupConfirm) { triggerShake('Las contraseñas no coinciden'); return; }
        setIsLoading(true);
        try {
            await db.cambiarClave(selectedUser.id, setupPassword);
            onCredentialVerified?.(selectedUser.id, await sha256Hex(setupPassword));
            onLoginSuccess(pendienteDeEntrar.role, pendienteDeEntrar.name);
        } catch {
            triggerShake('No se pudo guardar la contraseña nueva. Revisá la conexión e intentá otra vez.');
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * EL PRIMER INGRESO, por el servidor.
     *
     * Antes esto comparaba el código acá, contra `selectedUser.password`: una
     * columna que la nube nunca manda. En cualquier teléfono que no fuera el que
     * creó el acceso salía «no tiene código de alta» — le pasaba a Camilo. Y
     * aunque pasara, la clave quedaba solo en la tabla vieja, sin identidad de
     * servidor, y la entrada siguiente decía «contraseña incorrecta» con la
     * contraseña bien puesta.
     *
     * Ahora `dar_de_alta` compara el código EN EL SERVIDOR (con tope de
     * intentos), crea la identidad y no guarda la clave en ninguna tabla. Acá
     * solo se valida lo que se puede validar sin preguntar, y después se entra
     * con la identidad recién creada, igual que cualquier otro día.
     */
    const handleSetupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || isLoading) return;
        if (!setupCodigo.trim()) { triggerShake('Escribí el código de alta que te dio el administrador'); return; }
        if (setupPassword.length < 6) { triggerShake('La contraseña debe tener al menos 6 caracteres'); return; }
        if (setupPassword !== setupConfirm) { triggerShake('Las contraseñas no coinciden'); return; }
        setIsLoading(true);
        try {
            const { username } = await db.darDeAlta(selectedUser.id, setupCodigo.trim(), setupPassword);
            const r = await db.entrarConIdentidad(username, setupPassword);
            if (r.estado !== 'ok') {
                triggerShake('Quedó creada, pero no pude entrar todavía. Volvé a intentar con tu clave nueva.');
                return;
            }
            onCredentialVerified?.(selectedUser.id, await sha256Hex(setupPassword));
            onFirstSetup(selectedUser.id, username, setupPassword);
        } catch (err) {
            // El servidor dice por qué en palabras: código incorrecto, demasiados
            // intentos, ya configurado. Eso es lo que la persona tiene que leer.
            triggerShake(err instanceof Error && err.message ? err.message : 'No se pudo completar el alta. Revisá la conexión.');
        } finally {
            setIsLoading(false);
        }
    };

    const goBack = () => {
        setScreen(screen === 'users' || screen === 'main' ? 'main' : 'users');
        setSelectedUser(null);
        setError('');
        setPassword('');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-marca-suave via-papel to-papel-hondo flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <img src="/montecielo-logo.png" alt="Grupo Montecielo"
                        className="h-16 w-auto object-contain mx-auto drop-shadow-sm" />
                    <p className="text-tinta-tenue text-sm mt-3">Sistema de inventario de bodega</p>
                </div>

                {/* ── PANTALLA PRINCIPAL ── */}
                {screen === 'main' && (
                    <div className="space-y-3">
                        <button
                            onClick={() => setScreen('users')}
                            className="w-full flex items-center gap-4 p-5 bg-papel border-2 border-papel-borde hover:border-marca hover:shadow-lg rounded-2xl text-left transition-all group shadow-sm"
                        >
                            <div className="w-14 h-14 rounded-xl bg-marca flex items-center justify-center text-tinta text-2xl flex-shrink-0 group-hover:scale-105 transition-transform">
                                👷
                            </div>
                            <div>
                                <p className="font-black text-tinta text-lg">Bodeguero</p>
                                <p className="text-xs text-tinta-tenue">Acceso completo al sistema</p>
                            </div>
                            <svg className="w-5 h-5 text-tinta-tenue group-hover:text-marca-oscuro ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>

                        <button
                            onClick={() => onLoginSuccess(UserRole.VISITOR, 'Visitante')}
                            className="w-full flex items-center gap-4 p-5 bg-papel border-2 border-papel-borde hover:border-tinta-tenue hover:shadow-md rounded-2xl text-left transition-all group shadow-sm"
                        >
                            <div className="w-14 h-14 rounded-xl bg-papel-borde flex items-center justify-center text-tinta-suave text-2xl flex-shrink-0 group-hover:scale-105 transition-transform">
                                👁️
                            </div>
                            <div>
                                <p className="font-black text-tinta text-lg">Visitante</p>
                                <p className="text-xs text-tinta-tenue">Solo lectura · Sin contraseña</p>
                            </div>
                            <svg className="w-5 h-5 text-tinta-tenue group-hover:text-tinta-tenue ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* ── SELECCIÓN DE USUARIO ── */}
                {screen === 'users' && (
                    <div>
                        <button onClick={goBack} className="flex items-center gap-2 text-sm text-tinta-tenue hover:text-tinta-suave mb-5 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                            </svg>
                            Volver
                        </button>
                        <p className="text-xs font-black text-tinta-tenue uppercase tracking-widest mb-4">¿Quién eres?</p>
                        <div className="space-y-3">
                            {bodegueroUsers.map(user => (
                                <button
                                    key={user.id}
                                    onClick={() => handleSelectUser(user)}
                                    className="w-full flex items-center gap-4 p-4 bg-papel border-2 border-papel-borde hover:border-marca hover:shadow-md rounded-2xl text-left transition-all group shadow-sm"
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-tinta text-xl font-black flex-shrink-0 group-hover:scale-105 transition-transform ${user.role === UserRole.OWNER ? 'bg-marca' : 'bg-marca'}`}>
                                        {'👷'}
                                    </div>
                                    <div>
                                        <p className="font-black text-tinta">{user.name}</p>
                                        <p className="text-xs text-tinta-tenue">
                                            {!user.setupComplete
                                                ? '✨ Primera vez — crea tu cuenta'
                                                : user.role === UserRole.OWNER ? 'Administrador' : 'Bodeguero'
                                            }
                                        </p>
                                    </div>
                                    <svg className="w-5 h-5 text-tinta-tenue group-hover:text-marca-oscuro ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <button onClick={goBack} className="flex items-center gap-2 text-sm text-tinta-tenue hover:text-tinta-suave mb-5 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                            </svg>
                            Cambiar usuario
                        </button>

                        <div className="bg-papel rounded-2xl shadow-sm border border-papel-borde p-6">
                            <div className="flex items-center gap-3 mb-5">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-tinta text-2xl ${selectedUser.role === UserRole.OWNER ? 'bg-marca' : 'bg-marca'}`}>
                                    👷
                                </div>
                                <div>
                                    <p className="font-black text-tinta">{selectedUser.name}</p>
                                    <p className="text-xs text-tinta-tenue">Ingresa tu contraseña</p>
                                </div>
                            </div>

                            <form onSubmit={handlePasswordSubmit} className="space-y-4">
                                <input
                                    ref={passwordRef}
                                    type="password"
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); setError(''); }}
                                    placeholder="••••••••"
                                    className="w-full px-4 py-3 rounded-xl border-2 border-papel-borde focus:border-marca outline-none text-tinta font-bold text-lg tracking-widest"
                                />
                                {error && <p className="text-sm text-alerta font-semibold text-center">{error}</p>}
                                <button type="submit"
                                    className="w-full bg-marca hover:bg-marca-fuerte text-tinta font-black py-3 rounded-xl transition-all text-sm">
                                    Entrar →
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* ── PRIMER SETUP ── */}
                {screen === 'cambiarClave' && selectedUser && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="mb-5">
                            <p className="text-lg font-black text-tinta">Hola, {selectedUser.name}</p>
                            <p className="text-sm text-tinta-tenue mt-1">
                                Tu contraseña era muy corta para lo que ahora protege. Poné una nueva
                                —de <strong>seis caracteres o más</strong>— y seguís.
                            </p>
                            <p className="text-[11px] text-tinta-tenue mt-2">
                                Es una sola vez. Nadie más la sabe, ni siquiera quien te abrió el acceso.
                            </p>
                        </div>
                        <form onSubmit={handleCambioSubmit} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-1 block">
                                    Contraseña nueva
                                </label>
                                <input
                                    autoFocus
                                    type="password"
                                    value={setupPassword}
                                    onChange={e => { setSetupPassword(e.target.value); setError(''); }}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    className="w-full px-4 py-3 rounded-xl border-2 border-papel-borde focus:border-marca outline-none text-tinta font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-1 block">
                                    Repetila
                                </label>
                                <input
                                    type="password"
                                    value={setupConfirm}
                                    onChange={e => { setSetupConfirm(e.target.value); setError(''); }}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    className="w-full px-4 py-3 rounded-xl border-2 border-papel-borde focus:border-marca outline-none text-tinta font-bold"
                                />
                            </div>
                            {error && <p className="text-sm text-alerta font-semibold text-center">{error}</p>}
                            <button type="submit" disabled={isLoading}
                                className="w-full bg-marca hover:bg-marca-fuerte disabled:opacity-60 text-tinta font-black py-3 rounded-xl transition-all text-sm">
                                {isLoading ? 'Guardando…' : 'Guardar y entrar →'}
                            </button>
                        </form>
                    </div>
                )}
                {screen === 'setup' && selectedUser && (
                    <div className={shake ? 'animate-bounce' : ''}>
                        <button onClick={goBack} className="flex items-center gap-2 text-sm text-tinta-tenue hover:text-tinta-suave mb-5 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                            </svg>
                            Volver
                        </button>

                        <div className="bg-papel rounded-2xl shadow-sm border border-papel-borde p-6">
                            <div className="text-center mb-5">
                                <p className="text-2xl mb-1">✨</p>
                                <p className="font-black text-tinta text-lg">Bienvenido/a, {selectedUser.name}</p>
                                {/* El nombre de usuario ya no se pide: es el nombre de la
                                    persona, que es con el que ella se reconoce y con el que
                                    entra. Pedirle que se invente otro era un paso de más
                                    para alguien que solo quiere ponerle clave a su tarjeta. */}
                                <p className="text-xs text-tinta-tenue mt-1">Crea tu contraseña</p>
                                <p className="text-[11px] text-tinta-tenue mt-1">
                                    Solo la sabés vos. Nadie más la puede ver, ni el administrador.
                                </p>
                            </div>

                            <form onSubmit={handleSetupSubmit} className="space-y-4">
                                {/* El código va PRIMERO y con el foco: sin él no
                                    hay alta, así que pedirlo de último sería
                                    hacer escribir dos contraseñas para nada. */}
                                <div>
                                    <label className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-1 block">
                                        Código de alta
                                    </label>
                                    <input
                                        ref={setupUsernameRef}
                                        type="text"
                                        value={setupCodigo}
                                        onChange={e => { setSetupCodigo(e.target.value); setError(''); }}
                                        placeholder="Los 6 caracteres que te dieron"
                                        autoCapitalize="characters"
                                        autoComplete="off"
                                        className="w-full px-4 py-3 rounded-xl border-2 border-papel-borde focus:border-marca outline-none text-tinta font-black tracking-[0.2em] uppercase"
                                    />
                                    <p className="text-[10px] text-tinta-tenue mt-1">
                                        Te lo da quien te abrió el acceso. Sin eso no se puede entrar la primera vez.
                                    </p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-1 block">Contraseña</label>
                                    <input
                                        type="password"
                                        value={setupPassword}
                                        onChange={e => { setSetupPassword(e.target.value); setError(''); }}
                                        placeholder="••••••••"
                                        className="w-full px-4 py-3 rounded-xl border-2 border-papel-borde focus:border-marca outline-none text-tinta font-bold"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-1 block">Confirmar contraseña</label>
                                    <input
                                        type="password"
                                        value={setupConfirm}
                                        onChange={e => { setSetupConfirm(e.target.value); setError(''); }}
                                        placeholder="••••••••"
                                        className="w-full px-4 py-3 rounded-xl border-2 border-papel-borde focus:border-marca outline-none text-tinta font-bold"
                                        autoComplete="new-password"
                                    />
                                </div>
                                {error && <p className="text-sm text-alerta font-semibold text-center">{error}</p>}
                                <button type="submit" disabled={isLoading}
                                    className="w-full bg-marca hover:bg-marca-fuerte disabled:opacity-60 text-tinta font-black py-3 rounded-xl transition-all text-sm">
                                    {isLoading ? 'Creando…' : 'Crear cuenta y entrar →'}
                                </button>
                                <p className="text-[10px] text-tinta-tenue text-center">Mínimo 6 caracteres.</p>
                            </form>
                        </div>
                    </div>
                )}

                <p className="text-center text-xs text-tinta-tenue mt-8">
                    Grupo Montecielo · Sistema de gestión de inventario
                </p>
            </div>
        </div>
    );
};
