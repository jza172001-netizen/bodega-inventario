import React from 'react';
import { UserRole } from '../types';
import { InventoryIcon } from './icons/InventoryIcon';

interface LoginViewProps {
    onLoginSuccess: (role: UserRole, name: string) => void;
}

const USERS: Array<{ name: string; role: UserRole; avatar: string; desc: string; color: string }> = [
    { name: 'Juli',     role: UserRole.OWNER,    avatar: 'J', desc: 'Bodeguero — acceso completo',  color: 'bg-blue-600' },
    { name: 'Kate',     role: UserRole.OWNER,    avatar: 'K', desc: 'Bodeguero — acceso completo',  color: 'bg-indigo-600' },
    { name: 'Visitante',role: UserRole.EMPLOYEE, avatar: 'V', desc: 'Solo lectura — sin edición',   color: 'bg-gray-500' },
];

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
            {/* Logo */}
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg mb-4">
                    <InventoryIcon className="w-9 h-9 text-white" />
                </div>
                <h1 className="text-2xl font-black text-gray-900">Bodega Pro</h1>
                <p className="text-gray-500 text-sm mt-1">¿Quién eres?</p>
            </div>

            {/* Tarjetas de usuario */}
            <div className="space-y-3">
                {USERS.map(u => (
                    <button
                        key={u.name}
                        onClick={() => onLoginSuccess(u.role, u.name)}
                        className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-2xl text-left transition-all group"
                    >
                        <div className={`w-12 h-12 rounded-xl ${u.color} flex items-center justify-center text-white font-black text-xl flex-shrink-0 group-hover:scale-105 transition-transform`}>
                            {u.avatar}
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 text-base">{u.name}</p>
                            <p className="text-xs text-gray-500">{u.desc}</p>
                        </div>
                        <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-500 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                ))}
            </div>

            <p className="text-center text-xs text-gray-400 mt-6">
                Bodega Pro · Sistema de gestión de inventario
            </p>
        </div>
    </div>
);
