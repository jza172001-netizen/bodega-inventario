import React from 'react';
import { UserRole } from '../types';

interface LoginViewProps {
    onLoginSuccess: (role: UserRole, name: string) => void;
}

const USERS: Array<{ name: string; role: UserRole; avatar: string; desc: string }> = [
    { name: 'Juli',      role: UserRole.OWNER,    avatar: 'J', desc: 'Bodeguero — acceso completo' },
    { name: 'Kate',      role: UserRole.OWNER,    avatar: 'K', desc: 'Bodeguero — acceso completo' },
    { name: 'Visitante', role: UserRole.EMPLOYEE, avatar: 'V', desc: 'Solo lectura — sin edición'  },
];

const MontecieloMark = () => (
    <svg viewBox="0 0 48 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Zigzag mountain mark */}
        <polyline
            points="2,30 10,10 18,22 24,6 30,18 38,4 46,30"
            stroke="#C9973A" strokeWidth="4" fill="none"
            strokeLinecap="round" strokeLinejoin="round"
        />
        {/* Vertical accent */}
        <line x1="24" y1="6" x2="24" y2="30" stroke="#C9973A" strokeWidth="2.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
);

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #f0f7f4 0%, #ffffff 50%, #f5f0e8 100%)' }}>
        <div className="w-full max-w-md">
            {/* Logo Montecielo */}
            <div className="text-center mb-10">
                <div
                    className="inline-flex items-center justify-center w-20 h-20 rounded-2xl shadow-xl mb-5"
                    style={{ backgroundColor: '#1B4332' }}
                >
                    <div className="w-12 h-9">
                        <MontecieloMark />
                    </div>
                </div>
                <p className="text-xs font-black uppercase tracking-[0.2em] mb-1" style={{ color: '#C9973A' }}>Grupo</p>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Montecielo</h1>
                <p className="text-gray-400 text-sm mt-2">Sistema de inventario de bodega</p>
            </div>

            {/* Tarjetas de usuario */}
            <div className="space-y-3">
                {USERS.map((u, i) => (
                    <button
                        key={u.name}
                        onClick={() => onLoginSuccess(u.role, u.name)}
                        className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-2xl text-left transition-all group shadow-sm hover:shadow-md"
                        style={{ borderColor: undefined }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = '#1B4332')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
                    >
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-xl flex-shrink-0 group-hover:scale-105 transition-transform"
                            style={{ backgroundColor: i === 2 ? '#6b7280' : '#1B4332' }}
                        >
                            {u.avatar}
                        </div>
                        <div>
                            <p className="font-bold text-gray-900 text-base">{u.name}</p>
                            <p className="text-xs text-gray-500">{u.desc}</p>
                        </div>
                        <svg className="w-5 h-5 text-gray-300 ml-auto transition-colors group-hover:text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                ))}
            </div>

            <p className="text-center text-xs text-gray-400 mt-8">
                Grupo Montecielo · Gestión de inventario de construcción
            </p>
        </div>
    </div>
);
