
import React, { useState, useEffect } from 'react';
import { Personnel } from '../types';
import { XIcon } from './icons/XIcon';

interface EditPersonnelModalProps {
    isOpen: boolean;
    person: Personnel | null;
    onClose: () => void;
    onSave: (updated: Personnel) => void;
}

export const EditPersonnelModal: React.FC<EditPersonnelModalProps> = ({ isOpen, person, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isTeamLeader, setIsTeamLeader] = useState(false);

    useEffect(() => {
        if (person) {
            setName(person.name);
            setPhone(person.phone ?? '');
            setIsTeamLeader(person.isTeamLeader ?? false);
        }
    }, [person]);

    if (!isOpen || !person) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { alert('El nombre es requerido.'); return; }
        onSave({ ...person, name: name.trim(), phone: phone.trim() || undefined, isTeamLeader: isTeamLeader ? true : undefined });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md m-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Editar Personal</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                    <div>
                        <label htmlFor="editName" className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                        <input
                            id="editName"
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            autoComplete="off"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Ej: Juan Pérez"
                        />
                    </div>
                    <div>
                        <label htmlFor="editPhone" className="block text-sm font-medium text-gray-700 mb-1">
                            Teléfono <span className="text-gray-400 font-normal">(para recordatorios WhatsApp)</span>
                        </label>
                        <input
                            id="editPhone"
                            type="text"
                            inputMode="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            autoComplete="off"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Ej: 3001234567"
                        />
                    </div>
                    <div>
                        <button
                            type="button"
                            onClick={() => setIsTeamLeader(v => !v)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                                isTeamLeader
                                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-amber-300'
                            }`}
                        >
                            <span className="text-xl">{isTeamLeader ? '👷' : '👤'}</span>
                            <div>
                                <p className="text-sm font-bold">{isTeamLeader ? 'Es oficial (tiene cuadrilla)' : 'Marcar como oficial'}</p>
                                <p className="text-xs opacity-70">{isTeamLeader ? 'El chatbot pedirá elegir trabajador de su cuadrilla' : 'Activar para registrar trabajadores a su cargo'}</p>
                            </div>
                            <span className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isTeamLeader ? 'bg-amber-400 border-amber-400' : 'border-gray-300'}`}>
                                {isTeamLeader && <span className="text-white text-xs">✓</span>}
                            </span>
                        </button>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
