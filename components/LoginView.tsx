
import React, { useState } from 'react';
import { AppUser, UserRole } from '../types';
import { InventoryIcon } from './icons/InventoryIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { BrainIcon } from './icons/BrainIcon';
import { TruckIcon } from './icons/TruckIcon';
import { PurchaseOrdersIcon } from './icons/PurchaseOrdersIcon';

interface LoginViewProps {
    onLoginSuccess: (role: UserRole) => void;
    onLoginAttempt: (username: string, password: string) => Promise<boolean>;
}

const Benefit: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
    <div className="flex items-start">
        <div className="flex-shrink-0">
            <Icon className="w-6 h-6 text-blue-500" />
        </div>
        <div className="ml-4">
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <p className="mt-1 text-gray-600">{children}</p>
        </div>
    </div>
);


export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, onLoginAttempt }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const ok = await onLoginAttempt(username, password);
        setLoading(false);
        if (!ok) {
            setError('Usuario o contraseña incorrectos. Verifique mayúsculas.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-6xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden md:grid md:grid-cols-2">
                {/* Benefits Section */}
                <div className="p-8 md:p-12 bg-gray-100/50">
                    <div className="flex items-center mb-6">
                        <InventoryIcon className="w-10 h-10 text-blue-600" />
                        <h1 className="ml-3 text-2xl font-bold text-gray-900">Inventario de Almacén Pro</h1>
                    </div>
                    <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">
                        La Gestión de Inventario, <span className="text-blue-600">Reimaginada.</span>
                    </h2>
                    <p className="mt-4 text-lg text-gray-600">
                        Toma el control total de tu bodega con análisis inteligente, seguimiento en tiempo real y optimización de stock.
                    </p>
                    <div className="mt-8 space-y-6">
                        <Benefit icon={CheckCircleIcon} title="Control de Stock Preciso">
                           Monitorea tus niveles de inventario en tiempo real y evita quiebres de stock.
                        </Benefit>
                        <Benefit icon={BrainIcon} title="Análisis con IA">
                           Recibe reportes y recomendaciones estratégicas para tomar mejores decisiones.
                        </Benefit>
                        <Benefit icon={PurchaseOrdersIcon} title="Gestión de Órdenes">
                            Crea y sigue tus órdenes de compra desde un solo lugar.
                        </Benefit>
                        <Benefit icon={TruckIcon} title="Historial de Movimientos">
                            Registra cada entrada y salida para una trazabilidad completa.
                        </Benefit>
                    </div>
                </div>

                {/* Login Section */}
                <div className="p-8 md:p-12 flex flex-col justify-center">
                    <h2 className="text-2xl font-bold text-center text-gray-800">Iniciar Sesión</h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Accede a tu panel de control.
                    </p>
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        <div className="space-y-4 rounded-md">
                            <div>
                                <label htmlFor="username" className="sr-only">Usuario</label>
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    autoComplete="username"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="relative block w-full px-4 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-lg appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                    placeholder="Usuario (ej: juli)"
                                />
                            </div>
                            <div>
                                <label htmlFor="password" className="sr-only">Contraseña</label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="relative block w-full px-4 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-lg appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                    placeholder="Contraseña"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded text-center">
                                {error}
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="relative flex justify-center w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg group hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60"
                            >
                                {loading ? 'Verificando...' : 'Acceder'}
                            </button>
                        </div>
                         <p className="text-xs text-center text-gray-500 pt-2">
                            * El sistema distingue mayúsculas y minúsculas.
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};
