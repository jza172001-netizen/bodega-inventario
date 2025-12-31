
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

        if (!editingUserId && users.some(u => u.username === newUsername)) {
            alert("El nombre de usuario ya existe.");
            return;
        }

        if (editingUserId) {
            const updatedUser: AppUser = {
                id: editingUserId,
                username: newUsername,
                password: newPassword,
                name: newName,
                role: newRole
            };
            onEditUser(updatedUser);
            setEditingUserId(null);
        } else {
            const newUser: AppUser = {
                id: `user-${Date.now()}`,
                username: newUsername,
                password: newPassword,
                name: newName,
                role: newRole
            };
            onAddUser(newUser);
        }

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
                    <h2 className="text-2xl font-bold text-gray-800">Seguridad y Usuarios</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-6 h-6" /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-gray-50 p-6 rounded-2xl h-fit border border-gray-100">
                        <h3 className="font-black text-sm mb-4 text-blue-700 uppercase tracking-widest">
                            {editingUserId ? 'Editar Acceso' : 'Nuevo Usuario'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase">Nombre Completo</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase">Usuario para Login</label>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={e => setNewUsername(e.target.value)}
                                    className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase">Contraseña</label>
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase">Nivel de Permisos</label>
                                <select 
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value as UserRole)}
                                    className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none font-bold"
                                >
                                    <option value={UserRole.EMPLOYEE}>Bodeguero / Empleado</option>
                                    <option value={UserRole.OWNER}>Administrador Supremo</option>
                                </select>
                            </div>
                            
                            <div className="flex space-x-2 pt-2">
                                {editingUserId && (
                                    <button type="button" onClick={handleCancelEdit} className="flex-1 bg-gray-200 text-gray-600 py-3 rounded-xl hover:bg-gray-300 font-bold uppercase text-xs transition-colors">
                                        Cancelar
                                    </button>
                                )}
                                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 font-bold uppercase text-xs shadow-md">
                                    {editingUserId ? 'Actualizar' : 'Guardar Acceso'}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div>
                        <h3 className="font-black text-sm mb-4 text-gray-400 uppercase tracking-widest">Personal con Acceso</h3>
                        <div className="space-y-3">
                            {users.map(user => (
                                <div key={user.id} className={`flex justify-between items-center border-2 p-4 rounded-2xl transition-all ${editingUserId === user.id ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-50'}`}>
                                    <div>
                                        <p className="font-black text-gray-800 uppercase text-xs">{user.username}</p>
                                        <p className="text-[10px] text-gray-400 font-bold">{user.name}</p>
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${user.role === UserRole.OWNER ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {user.role === UserRole.OWNER ? 'Admin Supremo' : 'Bodeguero'}
                                        </span>
                                    </div>
                                    <div className="flex space-x-1">
                                        <button 
                                            onClick={() => handleEditClick(user)}
                                            className="p-2 text-blue-500 hover:bg-blue-100 rounded-full transition-colors"
                                            title="Editar"
                                        >
                                            <EditIcon className="w-5 h-5"/>
                                        </button>
                                        {user.username !== 'juli' && (
                                            <button 
                                                onClick={() => {
                                                    if(window.confirm(`¿Seguro que desea eliminar el acceso de ${user.username}?`)) onDeleteUser(user.id);
                                                }}
                                                className="p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                                                title="Eliminar"
                                            >
                                                <TrashIcon className="w-5 h-5"/>
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
