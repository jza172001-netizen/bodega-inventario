
import React, { useState } from 'react';
import { Personnel } from '../types';
import { XIcon } from './icons/XIcon';

interface AddPersonnelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddPersonnel: (person: Omit<Personnel, 'id'>) => void;
}

export const AddPersonnelModal: React.FC<AddPersonnelModalProps> = ({ isOpen, onClose, onAddPersonnel }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            alert('El nombre es requerido.');
            return;
        }
        onAddPersonnel({ name: name.trim(), phone: phone.trim() || undefined });
        setName('');
        setPhone('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-papel rounded-xl shadow-2xl p-8 w-full max-w-md m-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-tinta">Añadir Personal</h2>
                    <button onClick={onClose} className="text-tinta-tenue hover:text-tinta-suave"><XIcon className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="personnelName" className="block text-sm font-medium text-tinta-suave mb-1">Nombre Completo</label>
                        <input
                            id="personnelName"
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-papel-borde rounded-md shadow-sm focus:outline-none focus:ring-marca focus:border-marca"
                            placeholder="Ej: Juan Pérez"
                        />
                    </div>
                    <div>
                        <label htmlFor="personnelPhone" className="block text-sm font-medium text-tinta-suave mb-1">
                            Teléfono <span className="text-tinta-tenue font-normal">(opcional — para recordatorios WhatsApp)</span>
                        </label>
                        <input
                            id="personnelPhone"
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            className="w-full px-3 py-2 border border-papel-borde rounded-md shadow-sm focus:outline-none focus:ring-marca focus:border-marca"
                            placeholder="Ej: 3001234567"
                        />
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-papel-borde text-tinta rounded-md hover:bg-papel-borde">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-marca text-tinta rounded-md hover:bg-marca-fuerte">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
