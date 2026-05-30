import React from 'react';
import { UserRole } from '../types';
import { MenuIcon } from './icons/MenuIcon';
import { UsersIcon } from './icons/UsersIcon';

interface HeaderProps {
    toggleSidebar: () => void;
    userRole: UserRole;
    userName?: string;
    setUserRole: (role: UserRole) => void;
    onOpenUserManagement: () => void;
    onLogout?: () => void;
    onOpenInvoiceReader?: () => void;
    onOpenSearch?: () => void;
    syncStatus?: 'idle' | 'syncing' | 'error';
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar, userRole, userName, onOpenInvoiceReader, onOpenSearch, syncStatus }) => {
    return (
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-3 min-w-0">
                <button onClick={toggleSidebar} className="flex-shrink-0 p-1 rounded-full text-gray-500 hover:bg-gray-100">
                    <MenuIcon className="w-6 h-6"/>
                </button>
                <h1 className="hidden sm:block text-xl font-black text-gray-800 uppercase tracking-tighter truncate">Montecielo</h1>
                {syncStatus === 'syncing' && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        <span className="hidden sm:inline">Guardando</span>
                    </span>
                )}
                {syncStatus === 'error' && (
                    <span className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-black text-white bg-red-500 px-2.5 py-1 rounded-full shadow-sm animate-pulse">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                        <span>⚠ Sin guardar</span>
                    </span>
                )}
            </div>
            <div className="flex items-center space-x-2 md:space-x-4 flex-shrink-0">
                <div className="flex items-center space-x-3">
                    {onOpenSearch && (
                        <button
                            onClick={onOpenSearch}
                            title="Buscar"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                            </svg>
                        </button>
                    )}
                    {onOpenInvoiceReader && userRole === UserRole.OWNER && (
                        <button
                            onClick={onOpenInvoiceReader}
                            title="Importar factura o archivo"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.586-6.586a4 4 0 00-5.656-5.656l-6.586 6.586a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                        </button>
                    )}
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none">
                            {userName || (userRole === UserRole.OWNER ? 'Bodeguero' : 'Visitante')}
                        </span>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg border-2 border-white shadow-sm">
                        {userName ? userName[0].toUpperCase() : (userRole === UserRole.OWNER ? 'B' : 'V')}
                    </div>
                </div>
            </div>
        </header>
    );
};
