
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
    /**
     * El código de alta recién creado, para mostrárselo UNA vez a quien lo creó.
     *
     * No se vuelve a mostrar y no se guarda en ninguna pantalla: si se pierde
     * antes de dárselo a la persona, el acceso se borra y se crea otro. Eso es a
     * propósito — un código que se puede consultar cuando sea es una contraseña
     * más, no un código de un solo uso.
     */
    const [codigoNuevo, setCodigoNuevo] = useState<{ nombre: string; codigo: string } | null>(null);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState<UserRole>(UserRole.EMPLOYEE);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!newName.trim()) {
            alert("Falta el nombre de la persona.");
            return;
        }

        if (editingUserId) {
            // Editar NO toca la contraseña: es de la persona, no del administrador.
            const previo = users.find(u => u.id === editingUserId);
            const updatedUser: AppUser = {
                ...(previo as AppUser),
                id: editingUserId,
                name: newName.trim(),
                role: newRole,
            };
            onEditUser(updatedUser);
            setEditingUserId(null);
        } else {
            if (users.some(u => u.name.trim().toLowerCase() === newName.trim().toLowerCase())) {
                alert("Ya hay alguien con ese nombre.");
                return;
            }
            /**
             * El acceso nace con un CÓDIGO DE ALTA, no vacío.
             *
             * La intención original era buena: que el administrador no sepa la
             * contraseña de nadie. La tarjeta quedaba esperando y la persona
             * ponía su clave la primera vez que entraba.
             *
             * El problema es que esa tarjeta **la podía reclamar cualquiera**.
             * Quien abriera la dirección de la app veía la lista, elegía la
             * tarjeta en espera, le ponía la contraseña que quisiera y entraba.
             * Con un acceso de dueño esperando, eso era **regalarle la bodega al
             * primero que pasara** — sin claves, sin saber nada, solo abriendo la
             * página. Estaba así en producción.
             *
             * El código de alta lo cierra sin perder la intención: son seis
             * caracteres que el administrador le pasa a la persona (por WhatsApp,
             * de viva voz, como sea). Sin ese código no hay primer ingreso. El
             * administrador conoce el código temporal, NO la contraseña que la
             * persona elija después.
             *
             * Sin letras confundibles a propósito: se dicta por teléfono.
             */
            const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            const codigo = Array.from(crypto.getRandomValues(new Uint32Array(6)))
                .map(n => alfabeto[n % alfabeto.length]).join('');
            const newUser: AppUser = {
                id: crypto.randomUUID(),
                username: '',
                password: codigo,
                name: newName.trim(),
                role: newRole,
                setupComplete: false,
            };
            onAddUser(newUser);
            setCodigoNuevo({ nombre: newName.trim(), codigo });
        }

        setNewName('');
        setNewRole(UserRole.EMPLOYEE);
    };

    const handleEditClick = (user: AppUser) => {
        setEditingUserId(user.id);
        setNewName(user.name);
        setNewRole(user.role);
    };

    const handleCancelEdit = () => {
        setEditingUserId(null);
        setNewName('');
        setNewRole(UserRole.EMPLOYEE);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
            <div className="bg-papel rounded-3xl shadow-2xl p-8 w-full max-w-4xl m-4 max-h-[90vh] overflow-hidden flex flex-col border border-papel-borde">
                {/* El código de alta, una sola vez. Si se pierde, el acceso se
                    borra y se crea otro: un código que se puede volver a mirar
                    es una contraseña más, no un código de un solo uso. */}
                {codigoNuevo && (
                    <div className="mb-6 rounded-2xl border-2 border-marca bg-marca-suave p-4">
                        <p className="text-sm font-black text-tinta">
                            Código de alta para {codigoNuevo.nombre}
                        </p>
                        <p className="text-3xl font-black tracking-[0.3em] text-tinta my-2 select-all">
                            {codigoNuevo.codigo}
                        </p>
                        <p className="text-[11px] text-tinta-tenue">
                            Pasáselo a {codigoNuevo.nombre} — sin este código no puede entrar la primera vez.
                            <strong> No se vuelve a mostrar.</strong> Si se pierde, borrá el acceso y creá otro.
                        </p>
                        <button
                            onClick={() => setCodigoNuevo(null)}
                            className="mt-3 text-[11px] font-black px-3 py-1.5 rounded-lg bg-marca text-tinta">
                            Ya lo anoté
                        </button>
                    </div>
                )}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-3xl font-black text-tinta tracking-tighter uppercase">Gestión de Accesos</h2>
                        <p className="text-xs text-tinta-tenue font-bold uppercase tracking-widest">Configuración de Usuarios y Permisos</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-papel-hondo rounded-full text-tinta-tenue hover:text-tinta-suave transition-colors">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* Formulario */}
                    <div className="bg-papel-hondo p-6 rounded-3xl border border-papel-borde h-fit">
                        <h3 className="font-black text-xs mb-6 text-marca-oscuro uppercase tracking-widest border-b pb-2">
                            {editingUserId ? 'ACTUALIZAR DATOS DE ACCESO' : 'REGISTRAR NUEVO ACCESO'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-1 block">Nombre Real Completo</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="Ej: Andres Felipe"
                                    className="w-full p-3 bg-papel border-2 border-papel-borde rounded-xl focus:border-marca outline-none font-bold text-tinta-suave transition-colors"
                                    required
                                />
                            </div>
                            {/* Ni usuario ni contraseña: los pone la persona la
                                primera vez que entra. Acá solo se crea la tarjeta. */}
                            {!editingUserId && (
                                <div className="rounded-xl bg-marca-suave border border-marca-borde p-3">
                                    <p className="text-xs font-bold text-marca-oscuro">
                                        El acceso queda esperando a esa persona. La primera vez que
                                        toque su tarjeta, la app le pide que ponga su usuario y su
                                        contraseña — vos no la vas a saber, y no la necesitás:
                                        todo lo que haga queda en Trazabilidad con su nombre.
                                    </p>
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-black text-tinta-tenue uppercase tracking-widest mb-1 block">Nivel de Seguridad</label>
                                <select 
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value as UserRole)}
                                    className="w-full p-3 bg-papel border-2 border-papel-borde rounded-xl focus:border-marca outline-none font-bold text-tinta-suave transition-colors cursor-pointer"
                                >
                                    {/* Los tres roles que existen. Faltaba Visitante,
                                        que es el que solo mira: sin él no había cómo
                                        crear un acceso de consulta. */}
                                    <option value={UserRole.VISITOR}>Visitante / Solo mirar</option>
                                    <option value={UserRole.EMPLOYEE}>Bodeguero / Operativo</option>
                                    <option value={UserRole.OWNER}>Administrador Supremo</option>
                                </select>
                            </div>
                            
                            <div className="flex space-x-3 pt-4">
                                {editingUserId && (
                                    <button type="button" onClick={handleCancelEdit} className="flex-1 bg-papel-borde text-tinta-suave py-3 rounded-xl hover:bg-papel-borde font-black uppercase text-xs transition-all">
                                        Cancelar
                                    </button>
                                )}
                                <button type="submit" className="flex-1 bg-marca text-tinta py-3 rounded-xl hover:bg-marca-fuerte font-black uppercase text-xs shadow-lg transition-all transform hover:scale-[1.02]">
                                    {editingUserId ? 'GUARDAR CAMBIOS' : 'CREAR ACCESO'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Lista de Usuarios */}
                    <div className="space-y-4 h-fit">
                        <h3 className="font-black text-[10px] text-tinta-tenue uppercase tracking-widest px-2">Usuarios con Acceso Autorizado</h3>
                        <div className="space-y-3">
                            {users.map(user => (
                                <div key={user.id} className={`group flex justify-between items-center border-2 p-4 rounded-3xl transition-all ${editingUserId === user.id ? 'bg-marca-suave border-marca-borde' : 'bg-papel border-papel-borde hover:border-papel-borde'}`}>
                                    <div className="flex items-center space-x-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${user.role === UserRole.OWNER ? 'bg-marca-suave text-marca-oscuro' : 'bg-marca-suave text-marca-oscuro'}`}>
                                            {(user.username || user.name).charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-black text-tinta uppercase text-xs tracking-tighter">{user.name}</p>
                                            {/* Un acceso recién creado no tiene usuario todavía
                                                —lo elige la persona al entrar—, y salía un «@»
                                                solo. Mejor decir en qué estado está. */}
                                            <p className="text-[10px] text-tinta-tenue font-bold tracking-widest lowercase">
                                                {user.username ? `@${user.username}` : 'sin entrar todavía'}
                                            </p>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase inline-block mt-1 ${user.role === UserRole.OWNER ? 'bg-marca text-tinta' : 'bg-papel-hondo text-tinta-suave'}`}>
                                                {user.role === UserRole.OWNER ? 'Admin Supremo'
                                                    : user.role === UserRole.VISITOR ? 'Visitante'
                                                    : 'Bodeguero'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => handleEditClick(user)}
                                            className="p-2 text-marca-oscuro hover:bg-marca-suave rounded-full transition-colors"
                                            title="Editar Acceso"
                                        >
                                            <EditIcon className="w-5 h-5"/>
                                        </button>
                                        {/* El usuario juli es el maestro y no se puede borrar */}
                                        {user.username !== 'juli' && (
                                            <button 
                                                onClick={() => onDeleteUser(user.id)}
                                                className="p-2 text-alerta hover:bg-alerta-suave rounded-full transition-colors"
                                                title="Eliminar Acceso"
                                            >
                                                <TrashIcon className="w-5 h-5"/>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {users.length === 0 && <p className="text-center py-10 text-tinta-tenue font-bold uppercase text-xs italic">No hay usuarios configurados.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};
