
import React, { useState } from 'react';
import { AppUser, UserRole } from '../types';
import { XIcon } from './icons/XIcon';
import { TrashIcon } from './icons/TrashIcon';

interface UserManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    users: AppUser[];
    onAddUser: (user: AppUser) => void;
    onDeleteUser: (id: string) => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose, users, onAddUser, onDeleteUser }) => {
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState<UserRole>(UserRole.EMPLOYEE);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validación básica
        if (!newUsername.trim() || !newPassword.trim() || !newName.trim()) {
            alert("Todos los campos son obligatorios");
            return;
        }

        // Verificar duplicados
        if (users.some(u => u.username === newUsername)) {
            alert("El nombre de usuario ya existe.");
            return;
        }

        const newUser: AppUser = {
            id: `user-${Date.now()}`,
            username: newUsername,
            password: newPassword,
            name: newName,
            role: newRole
        };

        onAddUser(newUser);
        setNewUsername('');
        setNewPassword('');
        setNewName('');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-6 h-6" /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Crear Usuario */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-lg mb-4 text-blue-700">Crear Nuevo Usuario</h3>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <input
                                type="text"
                                placeholder="Nombre Real (ej: Carlos)"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="w-full p-2 border rounded"
                            />
                            <input
                                type="text"
                                placeholder="Usuario para Login (ej: carlos)"
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                                className="w-full p-2 border rounded"
                            />
                            <input
                                type="text"
                                placeholder="Contraseña"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="w-full p-2 border rounded"
                            />
                            <select 
                                value={newRole}
                                onChange={e => setNewRole(e.target.value as UserRole)}
                                className="w-full p-2 border rounded"
                            >
                                <option value={UserRole.EMPLOYEE}>Empleado</option>
                                <option value={UserRole.OWNER}>Administrador</option>
                            </select>
                            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 font-medium">
                                Guardar Usuario
                            </button>
                        </form>
                    </div>

                    {/* Lista de Usuarios */}
                    <div>
                        <h3 className="font-semibold text-lg mb-4 text-gray-700">Usuarios Existentes</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {users.map(user => (
                                <div key={user.id} className="flex justify-between items-center bg-white border p-3 rounded shadow-sm">
                                    <div>
                                        <p className="font-bold text-gray-800">{user.username}</p>
                                        <p className="text-xs text-gray-500">{user.name} - {user.role === UserRole.OWNER ? 'Admin' : 'Empleado'}</p>
                                        <p className="text-xs text-gray-400">Clave: {user.password}</p>
                                    </div>
                                    {user.username !== 'juli' && (
                                        <button 
                                            onClick={() => {
                                                if(window.confirm(`¿Borrar usuario ${user.username}?`)) onDeleteUser(user.id);
                                            }}
                                            className="text-red-500 hover:bg-red-50 p-2 rounded"
                                        >
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
