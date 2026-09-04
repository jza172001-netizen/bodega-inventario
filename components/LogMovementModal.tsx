import React, { useState, useMemo } from 'react';
import { Item, Movement, Personnel, UserRole, InventoryType, Project } from '../types';
import { MovementType } from '../types';
import { XIcon } from './icons/XIcon';
import { ConfirmDialog } from './ConfirmDialog';
import { AddItemModal } from './AddItemModal';

interface LogMovementModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogMovement: (movement: Omit<Movement, 'id'>) => void;
    items: Item[];
    movements?: Movement[];
    personnel: Personnel[];
    projects: Project[];
    userRole: UserRole;
    filterInventoryType?: InventoryType;
    /** Permite crear el artículo sin salir de aquí. Devuelve el ítem ya creado
     *  para poder dejarlo elegido. */
    onCreateItem?: (item: Omit<Item, 'id'>) => Item;
}

/** Valor centinela del desplegable: no es un id de ítem, abre el formulario de creación. */
const NUEVO_ITEM = '__crear_articulo__';

export const LogMovementModal: React.FC<LogMovementModalProps> = ({ isOpen, onClose, onLogMovement, items, movements, personnel, projects, userRole, filterInventoryType, onCreateItem }) => {
    const [itemId, setItemId] = useState('');
    const [type, setType] = useState<MovementType>(MovementType.CHECK_OUT);
    const [quantity, setQuantity] = useState(1);
    const [personnelId, setPersonnelId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [isLoan, setIsLoan] = useState(false);
    // El usuario puede forzar el valor (ej: prestar un arnés caro, que es EPP pero vuelve).
    // Mientras no lo toque, manda el default por tipo.
    const [isLoanTocado, setIsLoanTocado] = useState(false);
    const [notes, setNotes] = useState('');
    const [movDate, setMovDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [loanWarning, setLoanWarning] = useState<string | null>(null);
    // Si el artículo no existe todavía, había que cerrar todo, irse a Inventario,
    // crearlo y volver a empezar el movimiento desde cero.
    const [creandoItem, setCreandoItem] = useState(false);

    // Regla de negocio en el sistema, no en la memoria del bodeguero:
    // una herramienta se presta (vuelve) y un consumible/EPP es gasto definitivo.
    // Antes el checkbox arrancaba SIEMPRE apagado, así que un martillo se
    // despachaba como gasto y nadie lo reclamaba: sin error, sin alerta.
    const VUELVE_POR_DEFECTO = new Set<InventoryType>([
        InventoryType.HAND_TOOL,
        InventoryType.ELECTRICAL_TOOL,
    ]);

    const filteredItems = useMemo(() => {
        const base = filterInventoryType ? items.filter(i => i.inventoryType === filterInventoryType) : items;
        // El recién creado puede ser de otro tipo que el del filtro: sin esto
        // quedaría elegido pero fuera de la lista, y el select se vería vacío.
        const elegido = items.find(i => i.id === itemId);
        return elegido && !base.some(i => i.id === elegido.id) ? [...base, elegido] : base;
    }, [items, filterInventoryType, itemId]);

    if (!isOpen) return null;

    const selectedItem = items.find(i => i.id === itemId);
    const puedeCrear = !!onCreateItem && userRole !== UserRole.VISITOR;
    const isWithdrawal = type === MovementType.CHECK_OUT || type === MovementType.WASTE;
    const vuelvePorTipo = selectedItem ? VUELVE_POR_DEFECTO.has(selectedItem.inventoryType) : false;
    const esPrestamo = isLoanTocado ? isLoan : vuelvePorTipo;

    const doLogMovement = () => {
        // Si la fecha es hoy, usar hora real para preservar el orden intradiario del kardex;
        // para fechas pasadas, mediodía (evita saltos de día por zona horaria).
        const today = new Date().toISOString().slice(0, 10);
        const timestamp = movDate === today ? new Date() : new Date(movDate + 'T12:00:00');
        onLogMovement({
            itemId,
            type,
            quantity,
            timestamp,
            personnelId: personnelId || undefined,
            projectId: projectId || undefined,
            isLoan: type === MovementType.CHECK_OUT ? esPrestamo : false,
            isReturned: false,
            notes
        });
        // Reset form
        setItemId('');
        setType(MovementType.CHECK_OUT);
        setQuantity(1);
        setPersonnelId('');
        setProjectId('');
        setIsLoan(false);
        setIsLoanTocado(false);
        setNotes('');
        setMovDate(new Date().toISOString().slice(0, 10));
        onClose();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!itemId || quantity <= 0) {
            alert('Por favor, seleccione un artículo y una cantidad válida.');
            return;
        }
        if (isWithdrawal && selectedItem && quantity > selectedItem.quantity) {
            alert(`Stock insuficiente. Disponible: ${selectedItem.quantity} ${selectedItem.unit}`);
            return;
        }
        if (type === MovementType.CHECK_OUT && esPrestamo && movements) {
            const activeLoan = movements.find(m => m.itemId === itemId && m.isLoan && !m.isReturned);
            if (activeLoan) {
                const owner = personnel.find(p => p.id === activeLoan.personnelId)?.name ?? 'alguien';
                const date = new Date(activeLoan.timestamp).toLocaleDateString('es-CO');
                setLoanWarning(
                    `Esta herramienta ya está con ${owner} desde el ${date}.\n\nRegistrar un nuevo préstamo NO cancela el anterior — la herramienta quedará asignada a dos personas a la vez.\n\n¿Continuar de todas formas?`
                );
                return;
            }
        }
        doLogMovement();
    };
    
    const allowedMovementTypes = userRole !== UserRole.VISITOR 
        ? Object.values(MovementType)
        : [MovementType.CHECK_IN, MovementType.CHECK_OUT];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg m-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Registrar Movimiento</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del movimiento</label>
                        <input
                            type="date"
                            value={movDate}
                            onChange={e => setMovDate(e.target.value)}
                            className="w-full input-style"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Artículo</label>
                            <select
                                value={itemId}
                                onChange={e => {
                                    if (e.target.value === NUEVO_ITEM) { setCreandoItem(true); return; }
                                    setItemId(e.target.value);
                                    setIsLoanTocado(false);
                                }}
                                required
                                className="w-full input-style"
                            >
                                <option value="" disabled>Seleccionar artículo...</option>
                                {filteredItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                {puedeCrear && <option value={NUEVO_ITEM}>➕ Crear artículo nuevo…</option>}
                            </select>
                            {selectedItem && isWithdrawal && (
                                <p className={`text-xs mt-1 font-medium ${selectedItem.quantity === 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                    Disponible: {selectedItem.quantity} {selectedItem.unit}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Movimiento</label>
                            <select value={type} onChange={e => setType(e.target.value as MovementType)} className="w-full input-style">
                                {allowedMovementTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                            <input type="number" value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} min="1" required className="w-full input-style"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Personal (Opcional)</label>
                            <select value={personnelId} onChange={e => setPersonnelId(e.target.value)} className="w-full input-style">
                                <option value="">N/A</option>
                                {[...personnel].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    {/* Campos adicionales para SALIDAS */}
                    {(type === MovementType.CHECK_OUT || type === MovementType.WASTE) && (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto (Opcional)</label>
                                <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full input-style">
                                    <option value="">Ninguno / General</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            {type === MovementType.CHECK_OUT && (
                                <div className="mt-6">
                                    <div className="flex items-center">
                                        <input
                                            id="isLoan"
                                            type="checkbox"
                                            checked={esPrestamo}
                                            onChange={e => { setIsLoan(e.target.checked); setIsLoanTocado(true); }}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                        />
                                        <label htmlFor="isLoan" className="ml-2 block text-sm text-gray-900">
                                            ¿Es un préstamo? (Requiere devolución)
                                        </label>
                                    </div>
                                    {selectedItem && !isLoanTocado && (
                                        <p className="text-[11px] text-gray-500 mt-1 ml-6">
                                            {vuelvePorTipo
                                                ? '🔧 Es herramienta: se marca como préstamo y debe volver. Desmárcalo si se entrega definitivamente.'
                                                : '📦 Es consumible/EPP: sale como gasto definitivo. Márcalo si sí debe devolverse (ej: arnés, careta).'}
                                        </p>
                                    )}
                                    {selectedItem && isLoanTocado && (
                                        <p className="text-[11px] text-amber-600 font-semibold mt-1 ml-6">
                                            ⚠️ Cambiaste el valor por defecto de este tipo de ítem.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notas (Opcional)</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full input-style" placeholder="Ej: Para el proyecto Edificio Central" />
                    </div>
                    {/* Pegada abajo: es la única acción que, si no se alcanza, deja
                        el formulario lleno y el trabajo perdido. En el celular quedaba
                        debajo de "Notas", fuera de la pantalla. */}
                    <div className="sticky bottom-0 -mx-8 -mb-8 px-8 pt-4 pb-8 bg-white border-t border-gray-100 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar Movimiento</button>
                    </div>
                </form>
            </div>
            {creandoItem && onCreateItem && (
                <AddItemModal
                    isOpen
                    userRole={userRole}
                    onClose={() => setCreandoItem(false)}
                    onAddItem={nuevo => {
                        // Queda elegido de una: crear el ítem y tener que buscarlo
                        // otra vez en la lista sería la mitad del favor.
                        const creado = onCreateItem(nuevo);
                        setItemId(creado.id);
                        setIsLoanTocado(false);
                        setCreandoItem(false);
                    }}
                />
            )}
            {loanWarning && (
                <ConfirmDialog
                    title="Préstamo duplicado"
                    message={loanWarning}
                    onConfirm={doLogMovement}
                    onClose={() => setLoanWarning(null)}
                />
            )}
        </div>
    );
};