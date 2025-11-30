
import React, { useState } from 'react';
import { AppUser, UserRole } from '../types';
import { XIcon } from './icons/XIcon';
import { TrashIcon } from './icons/TrashIcon';
import { EditIcon } from './icons/EditIcon';

interface UserManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    users: AppUser[];
    onAddUser: (user: AppUser) => void;
    onDeleteUser: (id: string) => void;
    onEditUser: (user: AppUser) => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose, users, onAddUser, onDeleteUser, onEditUser }) => {
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState<UserRole>(UserRole.EMPLOYEE);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!newUsername.trim() || !newPassword.trim() || !newName.trim()) {
            alert("Todos los campos son obligatorios");
            return;
        }

        // Si estamos creando uno nuevo, verificar duplicados
        if (!editingUserId && users.some(u => u.username === newUsername)) {
            alert("El nombre de usuario ya existe.");
            return;
        }

        if (editingUserId) {
            // Modo Edición
            const updatedUser: AppUser = {
                id: editingUserId,
                username: newUsername,
                password: newPassword,
                name: newName,
                role: newRole
            };
            onEditUser(updatedUser);
            setEditingUserId(null); // Salir de modo edición
        } else {
            // Modo Creación
            const newUser: AppUser = {
                id: `user-${Date.now()}`,
                username: newUsername,
                password: newPassword,
                name: newName,
                role: newRole
            };
            onAddUser(newUser);
        }

        // Resetear formulario
        setNewUsername('');
        setNewPassword('');
        setNewName('');
        setNewRole(UserRole.EMPLOYEE);
    };

    const handleEditClick = (user: AppUser) => {
        setEditingUserId(user.id);
        setNewUsername(user.username);
        setNewPassword(user.password);
        setNewName(user.name);
        setNewRole(user.role);
    };

    const handleCancelEdit = () => {
        setEditingUserId(null);
        setNewUsername('');
        setNewPassword('');
        setNewName('');
        setNewRole(UserRole.EMPLOYEE);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-6 h-6" /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Formulario Crear/Editar */}
                    <div className="bg-gray-50 p-4 rounded-lg h-fit">
                        <h3 className="font-semibold text-lg mb-4 text-blue-700">
                            {editingUserId ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-500">Nombre Real</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Carlos"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Usuario Login</label>
                                <input
                                    type="text"
                                    placeholder="Ej: carlos"
                                    value={newUsername}
                                    onChange={e => setNewUsername(e.target.value)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Contraseña</label>
                                <input
                                    type="password"
                                    placeholder="••••••"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Rol</label>
                                <select 
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value as UserRole)}
                                    className="w-full p-2 border rounded"
                                >
                                    <option value={UserRole.EMPLOYEE}>Empleado</option>
                                    <option value={UserRole.OWNER}>Administrador</option>
                                </select>
                            </div>
                            
                            <div className="flex space-x-2">
                                {editingUserId && (
                                    <button type="button" onClick={handleCancelEdit} className="flex-1 bg-gray-300 text-gray-800 py-2 rounded hover:bg-gray-400 font-medium">
                                        Cancelar
                                    </button>
                                )}
                                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 font-medium">
                                    {editingUserId ? 'Actualizar' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Lista de Usuarios */}
                    <div>
                        <h3 className="font-semibold text-lg mb-4 text-gray-700">Usuarios Existentes</h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {users.map(user => (
                                <div key={user.id} className={`flex justify-between items-center border p-3 rounded shadow-sm ${editingUserId === user.id ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}>
                                    <div>
                                        <p className="font-bold text-gray-800">{user.username}</p>
                                        <p className="text-xs text-gray-500">{user.name} - {user.role === UserRole.OWNER ? 'Admin' : 'Empleado'}</p>
                                    </div>
                                    <div className="flex space-x-1">
                                        <button 
                                            onClick={() => handleEditClick(user)}
                                            className="text-blue-500 hover:bg-blue-50 p-2 rounded"
                                            title="Editar"
                                        >
                                            <EditIcon className="w-4 h-4"/>
                                        </button>
                                        {user.username !== 'juli' && (
                                            <button 
                                                onClick={() => {
                                                    if(window.confirm(`¿Borrar usuario ${user.username}?`)) onDeleteUser(user.id);
                                                }}
                                                className="text-red-500 hover:bg-red-50 p-2 rounded"
                                                title="Eliminar"
                                            >
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
