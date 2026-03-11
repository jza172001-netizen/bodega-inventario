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
    setUserRole: (role: UserRole) => void;
    onExportData: () => void;
    onImportData: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onResetData: () => void;
    onOpenUserManagement: () => void;
    onLogout: () => void;
    onStartNewBusiness: () => void;
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar, userRole, onExportData, onImportData, onResetData, onOpenUserManagement, onLogout }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    return (
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
            <div className="flex items-center">
                <button onClick={toggleSidebar} className="p-1 rounded-full text-gray-500 hover:bg-gray-100 mr-4">
                    <MenuIcon className="w-6 h-6"/>
                </button>
                <h1 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Gestion Bodega</h1>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
                {userRole === UserRole.OWNER && (
                    <div className="flex items-center space-x-2 border-r pr-4 border-gray-200">
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
                        <button onClick={onOpenUserManagement} className="p-2 text-gray-400 hover:text-indigo-600 rounded-full">
                            <UsersIcon className="w-5 h-5" />
                        </button>
                    </div>
                )}
                <div className="flex items-center space-x-3">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none mb-1">
                            {userRole === UserRole.OWNER ? 'Admin' : 'Operativo'}
                        </span>
                        <span onClick={onLogout} className="text-[9px] text-gray-400 font-bold uppercase hover:text-red-600 cursor-pointer">Salir</span>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg border-2 border-white shadow-sm">
                        {userRole === UserRole.OWNER ? 'A' : 'O'}
                    </div>
                </div>
            </div>
        </header>
    );
};