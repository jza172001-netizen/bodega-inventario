import React, { useRef } from 'react';
import { UserRole } from '../types';
import { MenuIcon } from './icons/MenuIcon';
import { TrashIcon } from './icons/TrashIcon';
import { UsersIcon } from './icons/UsersIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { UploadIcon } from './icons/UploadIcon';

interface HeaderProps {
    toggleSidebar: () => void;
    userRole: UserRole;
    userName?: string;
    setUserRole: (role: UserRole) => void;
    onExportData: () => void;
    onImportData: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onResetData: () => void;
    onOpenUserManagement: () => void;
    onLogout: () => void;
    onStartNewBusiness: () => void;
    onOpenInvoiceReader?: () => void;
    syncStatus?: 'idle' | 'syncing' | 'error';
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar, userRole, userName, onExportData, onImportData, onResetData, onOpenUserManagement, onLogout, onOpenInvoiceReader, syncStatus }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    return (
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-3 min-w-0">
                <button onClick={toggleSidebar} className="flex-shrink-0 p-1 rounded-full text-gray-500 hover:bg-gray-100">
                    <MenuIcon className="w-6 h-6"/>
                </button>
                <h1 className="hidden sm:block text-xl font-black uppercase tracking-tighter truncate" style={{ color: '#1B4332' }}>Montecielo</h1>
                {syncStatus === 'syncing' && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        <span className="hidden sm:inline">Guardando</span>
                    </span>
                )}
                {syncStatus === 'error' && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                        !<span className="hidden sm:inline"> Sin conexión</span>
                    </span>
                )}
            </div>
            <div className="flex items-center space-x-2 md:space-x-4 flex-shrink-0">
                {userRole === UserRole.OWNER && (
                    <>
                        {/* Exportar / Importar / Vaciar — solo desktop */}
                        <div className="hidden md:flex items-center space-x-2 border-r pr-4 border-gray-200">
                            <button onClick={onExportData}
                                className="flex items-center px-3 py-2 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-all"
                                title="Exportar datos a JSON">
                                <DownloadIcon className="w-4 h-4 md:mr-1.5" />
                                <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">Exportar</span>
                            </button>
                            <button onClick={() => fileInputRef.current?.click()}
                                className="flex items-center px-3 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all"
                                title="Importar datos desde JSON">
                                <UploadIcon className="w-4 h-4 md:mr-1.5" />
                                <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">Importar</span>
                            </button>
                            <input ref={fileInputRef} type="file" accept=".json" onChange={onImportData} className="hidden" />
                            <button onClick={onResetData}
                                className="flex items-center px-3 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all"
                                title="Vaciar bodega">
                                <TrashIcon className="w-4 h-4 md:mr-1.5" />
                                <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">Vaciar</span>
                            </button>
                        </div>
                    </>
                )}
                <div className="flex items-center space-x-3">
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
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none mb-1">
                            {userName || (userRole === UserRole.OWNER ? 'Bodeguero' : 'Visitante')}
                        </span>
                        <span onClick={onLogout} className="text-[9px] text-gray-400 font-bold uppercase hover:text-red-600 cursor-pointer">Salir</span>
                    </div>
                    {/* Cerrar sesión — visible en mobile */}
                    <button
                        onClick={onLogout}
                        className="flex md:hidden items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-black border border-red-100 hover:bg-red-100 transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Salir
                    </button>
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg border-2 border-white shadow-sm">
                        {userName ? userName[0].toUpperCase() : (userRole === UserRole.OWNER ? 'B' : 'V')}
                    </div>
                </div>
            </div>
        </header>
    );
};
