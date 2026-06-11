
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
            alert("Todos los campos son obligatorios para crear un acceso.");
            return;
        }

        if (!editingUserId && users.some(u => u.username === newUsername)) {
            alert("El nombre de usuario ya está ocupado. Intente con otro.");
            return;
        }

        if (editingUserId) {
            const updatedUser: AppUser = {
                id: editingUserId,
                username: newUsername.trim(),
                password: newPassword,
                name: newName.trim(),
                role: newRole
            };
            onEditUser(updatedUser);
            setEditingUserId(null);
        } else {
            const newUser: AppUser = {
                id: crypto.randomUUID(),
                username: newUsername.trim(),
                password: newPassword,
                name: newName.trim(),
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-4xl m-4 max-h-[90vh] overflow-hidden flex flex-col border border-gray-100">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Gestión de Accesos</h2>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Configuración de Usuarios y Permisos</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* Formulario */}
                    <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 h-fit">
                        <h3 className="font-black text-xs mb-6 text-blue-600 uppercase tracking-widest border-b pb-2">
                            {editingUserId ? 'ACTUALIZAR DATOS DE ACCESO' : 'REGISTRAR NUEVO ACCESO'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Nombre Real Completo</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="Ej: Andres Felipe"
                                    className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-700 transition-colors"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Usuario Login</label>
                                    <input
                                        type="text"
                                        value={newUsername}
                                        onChange={e => setNewUsername(e.target.value)}
                                        placeholder="ej: andres_bodega"
                                        className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-700 transition-colors"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Contraseña</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-700 transition-colors"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Nivel de Seguridad</label>
                                <select 
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value as UserRole)}
                                    className="w-full p-3 bg-white border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-700 transition-colors cursor-pointer"
                                >
                                    <option value={UserRole.EMPLOYEE}>Bodeguero / Operativo</option>
                                    <option value={UserRole.OWNER}>Administrador Supremo</option>
                                </select>
                            </div>
                            
                            <div className="flex space-x-3 pt-4">
                                {editingUserId && (
                                    <button type="button" onClick={handleCancelEdit} className="flex-1 bg-gray-200 text-gray-600 py-3 rounded-xl hover:bg-gray-300 font-black uppercase text-xs transition-all">
                                        Cancelar
                                    </button>
                                )}
                                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 font-black uppercase text-xs shadow-lg transition-all transform hover:scale-[1.02]">
                                    {editingUserId ? 'GUARDAR CAMBIOS' : 'CREAR ACCESO'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Lista de Usuarios */}
                    <div className="space-y-4 h-fit">
                        <h3 className="font-black text-[10px] text-gray-400 uppercase tracking-widest px-2">Usuarios con Acceso Autorizado</h3>
                        <div className="space-y-3">
                            {users.map(user => (
                                <div key={user.id} className={`group flex justify-between items-center border-2 p-4 rounded-3xl transition-all ${editingUserId === user.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-gray-300'}`}>
                                    <div className="flex items-center space-x-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${user.role === UserRole.OWNER ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {user.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-black text-gray-900 uppercase text-xs tracking-tighter">{user.name}</p>
                                            <p className="text-[10px] text-gray-400 font-bold tracking-widest lowercase">@{user.username}</p>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase inline-block mt-1 ${user.role === UserRole.OWNER ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                {user.role === UserRole.OWNER ? 'Admin Supremo' : 'Bodeguero'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => handleEditClick(user)}
                                            className="p-2 text-blue-500 hover:bg-blue-100 rounded-full transition-colors"
                                            title="Editar Acceso"
                                        >
                                            <EditIcon className="w-5 h-5"/>
                                        </button>
                                        {/* El usuario juli es el maestro y no se puede borrar */}
                                        {user.username !== 'juli' && (
                                            <button 
                                                onClick={() => onDeleteUser(user.id)}
                                                className="p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                                                title="Eliminar Acceso"
                                            >
                                                <TrashIcon className="w-5 h-5"/>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {users.length === 0 && <p className="text-center py-10 text-gray-400 font-bold uppercase text-xs italic">No hay usuarios configurados.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};
