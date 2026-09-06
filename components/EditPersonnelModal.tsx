
import React, { useState, useEffect } from 'react';
import { Personnel } from '../types';
import { XIcon } from './icons/XIcon';

interface EditPersonnelModalProps {
    isOpen: boolean;
    person: Personnel | null;
    onClose: () => void;
    onSave: (updated: Personnel) => void;
    /** Todo el personal: de acá salen los oficiales a los que se puede asignar. */
    allPersonnel?: Personnel[];
}

export const EditPersonnelModal: React.FC<EditPersonnelModalProps> = ({ isOpen, person, onClose, onSave, allPersonnel = [] }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isTeamLeader, setIsTeamLeader] = useState(false);
    // Se podía marcar a alguien COMO oficial, pero no decir de qué oficial es un
    // trabajador — ni quitárselo. Por eso Jhon jader y Rafael quedaron en la
    // cuadrilla de Alex (asignados solos por la app) sin forma de sacarlos.
    const [teamLeaderId, setTeamLeaderId] = useState('');

    useEffect(() => {
        if (person) {
            setName(person.name);
            setPhone(person.phone ?? '');
            setIsTeamLeader(person.isTeamLeader ?? false);
            setTeamLeaderId(person.teamLeaderId ?? '');
        }
    }, [person]);

    if (!isOpen || !person) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { alert('El nombre es requerido.'); return; }
        onSave({
            ...person,
            name: name.trim(),
            phone: phone.trim() || undefined,
            isTeamLeader: isTeamLeader ? true : undefined,
            // Un oficial no puede ser de la cuadrilla de otro.
            teamLeaderId: isTeamLeader ? undefined : (teamLeaderId || undefined),
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-papel rounded-xl shadow-2xl p-8 w-full max-w-md m-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-tinta">Editar Personal</h2>
                    <button onClick={onClose} className="text-tinta-tenue hover:text-tinta-suave">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                    <div>
                        <label htmlFor="editName" className="block text-sm font-medium text-tinta-suave mb-1">Nombre Completo</label>
                        <input
                            id="editName"
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            autoComplete="off"
                            className="w-full px-3 py-2 border border-papel-borde rounded-md shadow-sm focus:outline-none focus:ring-marca focus:border-marca"
                            placeholder="Ej: Juan Pérez"
                        />
                    </div>
                    <div>
                        <label htmlFor="editPhone" className="block text-sm font-medium text-tinta-suave mb-1">
                            Teléfono <span className="text-tinta-tenue font-normal">(para recordatorios WhatsApp)</span>
                        </label>
                        <input
                            id="editPhone"
                            type="text"
                            inputMode="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            autoComplete="off"
                            className="w-full px-3 py-2 border border-papel-borde rounded-md shadow-sm focus:outline-none focus:ring-marca focus:border-marca"
                            placeholder="Ej: 3001234567"
                        />
                    </div>
                    <div>
                        <button
                            type="button"
                            onClick={() => setIsTeamLeader(v => !v)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                                isTeamLeader
                                    ? 'bg-atencion-suave border-atencion text-atencion'
                                    : 'bg-papel-hondo border-papel-borde text-tinta-tenue hover:border-atencion'
                            }`}
                        >
                            <span className="text-xl">{isTeamLeader ? '👷' : '👤'}</span>
                            <div>
                                <p className="text-sm font-bold">{isTeamLeader ? 'Es oficial (tiene cuadrilla)' : 'Marcar como oficial'}</p>
                                <p className="text-xs opacity-70">{isTeamLeader ? 'El chatbot pedirá elegir trabajador de su cuadrilla' : 'Activar para registrar trabajadores a su cargo'}</p>
                            </div>
                            <span className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isTeamLeader ? 'bg-atencion border-atencion' : 'border-papel-borde'}`}>
                                {isTeamLeader && <span className="text-papel text-xs">✓</span>}
                            </span>
                        </button>
                    </div>
                    {!isTeamLeader && (
                        <div>
                            <label htmlFor="editLeader" className="block text-sm font-medium text-tinta-suave mb-1">
                                ¿De qué oficial es?
                                <span className="block text-xs font-normal text-tinta-tenue">
                                    Sus salidas se ven también en la ficha del oficial.
                                </span>
                            </label>
                            <select
                                id="editLeader"
                                value={teamLeaderId}
                                onChange={e => setTeamLeaderId(e.target.value)}
                                className="w-full px-3 py-2 border border-papel-borde rounded-md shadow-sm focus:outline-none focus:ring-marca focus:border-marca bg-papel"
                            >
                                <option value="">— De ninguno —</option>
                                {allPersonnel
                                    .filter(p => p.isTeamLeader && p.id !== person.id)
                                    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                                    .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-papel-borde text-tinta rounded-md hover:bg-papel-borde">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-marca text-tinta rounded-md hover:bg-marca-fuerte">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
