
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
            id: crypto.randomUUID(),
            name: workerName.trim()
        };

        onSavePersonnel([firstWorker]);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-marca-fuerte/90 backdrop-blur-md flex justify-center items-center z-[200] p-4 text-center">
            <div className="bg-papel rounded-[2.5rem] shadow-2xl p-8 md:p-12 w-full max-w-lg border-4 border-marca animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
                <div className="w-20 h-20 bg-marca-suave text-marca-oscuro rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <HardHatIcon className="w-10 h-10" />
                </div>
                
                <h2 className="text-3xl font-black text-tinta uppercase tracking-tighter mb-2">¡Bienvenido a tu Bodega!</h2>
                <p className="text-tinta-tenue font-bold text-sm uppercase mb-8">Antes de empezar, registra a tu primer trabajador o bodeguero.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest block mb-2">Nombre del primer integrante de tu equipo</label>
                        <input
                            type="text"
                            autoFocus
                            value={workerName}
                            onChange={(e) => setWorkerName(e.target.value)}
                            className="w-full p-5 bg-papel-hondo border-2 border-papel-borde rounded-2xl focus:border-marca outline-none font-black text-tinta text-xl text-center placeholder:text-tinta-tenue transition-all"
                            placeholder="Ej: Juan Bodeguero"
                            required
                        />
                    </div>
                    
                    <button 
                        type="submit"
                        className="w-full bg-marca hover:bg-marca-fuerte text-tinta font-black py-5 rounded-2xl shadow-xl shadow-marca-borde transform hover:scale-105 active:scale-95 transition-all uppercase tracking-widest text-sm"
                    >
                        Configurar mi equipo y empezar
                    </button>
                    
                    <p className="text-[9px] text-tinta-tenue font-bold uppercase">Podrás añadir más trabajadores y productos desde el menú principal.</p>
                </form>
            </div>
        </div>
    );
};
