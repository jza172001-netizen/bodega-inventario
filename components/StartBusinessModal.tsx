
import React, { useState } from 'react';
import { Personnel } from '../types';
import { HardHatIcon } from './icons/HardHatIcon';

interface StartBusinessModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSavePersonnel: (personnel: Personnel[]) => void;
}

export const StartBusinessModal: React.FC<StartBusinessModalProps> = ({ isOpen, onClose, onSavePersonnel }) => {
    const [workerName, setWorkerName] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!workerName.trim()) return;

        const firstWorker: Personnel = {
            id: `person-${Date.now()}`,
            name: workerName.trim()
        };

        onSavePersonnel([firstWorker]);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-blue-900/90 backdrop-blur-md flex justify-center items-center z-[200] p-4 text-center">
            <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 w-full max-w-lg border-4 border-blue-500 animate-in zoom-in duration-300">
                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <HardHatIcon className="w-10 h-10" />
                </div>
                
                <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter mb-2">¡Bienvenido a tu Bodega!</h2>
                <p className="text-gray-500 font-bold text-sm uppercase mb-8">Antes de empezar, registra a tu primer trabajador o bodeguero.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Nombre del primer integrante de tu equipo</label>
                        <input
                            type="text"
                            autoFocus
                            value={workerName}
                            onChange={(e) => setWorkerName(e.target.value)}
                            className="w-full p-5 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-blue-500 outline-none font-black text-gray-800 text-xl text-center placeholder:text-gray-300 transition-all"
                            placeholder="Ej: Juan Bodeguero"
                            required
                        />
                    </div>
                    
                    <button 
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-200 transform hover:scale-105 active:scale-95 transition-all uppercase tracking-widest text-sm"
                    >
                        Configurar mi equipo y empezar
                    </button>
                    
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Podrás añadir más trabajadores y productos desde el menú principal.</p>
                </form>
            </div>
        </div>
    );
};
