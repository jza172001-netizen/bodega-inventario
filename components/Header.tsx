
import React, { useRef } from 'react';
import { UserRole } from '../types';
import { MenuIcon } from './icons/MenuIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { UploadIcon } from './icons/UploadIcon';
import { TrashIcon } from './icons/TrashIcon';
import { UsersIcon } from './icons/UsersIcon';
import { LogOutIcon } from './icons/LogOutIcon';

interface HeaderProps {
    toggleSidebar: () => void;
    userRole: UserRole;
    setUserRole: (role: UserRole) => void;
    onExportData: () => void;
    onImportData: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onResetData: () => void;
    onOpenUserManagement: () => void;
    onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar, userRole, onExportData, onImportData, onResetData, onOpenUserManagement, onLogout }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
            <div className="flex items-center">
                 <button onClick={toggleSidebar} className="p-1 rounded-full text-gray-500 hover:bg-gray-100 mr-4">
                    <MenuIcon className="w-6 h-6"/>
                </button>
                 <h1 className="text-xl font-semibold text-gray-800 md:hidden">Bodega</h1>
                 <h1 className="text-xl md:text-2xl font-semibold text-gray-800 hidden md:block">Sistema de Gestión de Bodega</h1>
            </div>
             <div className="flex items-center space-x-2 md:space-x-4">
                {/* User Management (Owner Only) */}
                {userRole === UserRole.OWNER && (
                    <button 
                        onClick={onOpenUserManagement}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full flex items-center"
                        title="Gestionar Usuarios"
                    >
                        <UsersIcon className="w-5 h-5 md:mr-1" />
                        <span className="hidden md:inline text-xs font-medium">Usuarios</span>
                    </button>
                )}

                {/* Data Management Buttons */}
                <div className="flex items-center space-x-1 border-r pr-4 mr-2 border-gray-300">
                    <button 
                        onClick={onExportData}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-full flex items-center"
                        title="Hacer Copia de Seguridad (Descargar)"
                    >
                        <DownloadIcon className="w-5 h-5 md:mr-1" />
                        <span className="hidden md:inline text-xs font-medium">Backup</span>
                    </button>
                    <button 
                        onClick={handleImportClick}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-full flex items-center"
                        title="Restaurar Copia de Seguridad"
                    >
                        <UploadIcon className="w-5 h-5 md:mr-1" />
                        <span className="hidden md:inline text-xs font-medium">Restaurar</span>
                    </button>
                     <button 
                        onClick={onResetData}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-full flex items-center"
                        title="Borrar todos los datos y reiniciar (Requiere Clave)"
                    >
                        <TrashIcon className="w-5 h-5 md:mr-1" />
                        <span className="hidden md:inline text-xs font-medium">Reset</span>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={onImportData}
                        accept=".json"
                        className="hidden" 
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <div className="hidden md:flex flex-col items-end mr-2">
                        <span className="text-sm font-medium text-gray-700">
                            {userRole === UserRole.OWNER ? 'Administrador' : 'Empleado'}
                        </span>
                        <span className="text-xs text-green-600 font-bold cursor-pointer hover:underline" onClick={onLogout}>
                            Cerrar Sesión
                        </span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                        {userRole === UserRole.OWNER ? 'A' : 'E'}
                    </div>
                    <button onClick={onLogout} className="md:hidden p-2 text-gray-500 hover:text-red-600" title="Salir">
                        <LogOutIcon className="w-6 h-6" />
                    </button>
                </div>
             </div>
        </header>
    );
};
