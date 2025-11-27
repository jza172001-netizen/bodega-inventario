
import React, { useRef } from 'react';
import { UserRole } from '../types';
import { MenuIcon } from './icons/MenuIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { UploadIcon } from './icons/UploadIcon';

interface HeaderProps {
    toggleSidebar: () => void;
    userRole: UserRole;
    setUserRole: (role: UserRole) => void;
    onExportData: () => void;
    onImportData: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar, userRole, setUserRole, onExportData, onImportData }) => {
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
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={onImportData}
                        accept=".json"
                        className="hidden" 
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-500 hidden md:inline">Rol:</span>
                    <select 
                        value={userRole} 
                        onChange={(e) => setUserRole(e.target.value as UserRole)}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-32 md:w-full p-2"
                    >
                        <option value={UserRole.OWNER}>Propietario</option>
                        <option value={UserRole.EMPLOYEE}>Empleado</option>
                    </select>
                </div>
             </div>
        </header>
    );
};
