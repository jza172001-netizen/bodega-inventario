import React, { useState, useMemo, useCallback } from 'react';
import { Personnel, UserRole, Movement, Item, Project } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { TrashIcon } from './icons/TrashIcon';
import { EditIcon } from './icons/EditIcon';
import { PersonnelDetailModal } from './PersonnelDetailModal';
import { EditPersonnelModal } from './EditPersonnelModal';
interface PersonnelViewProps {
    personnel: Personnel[];
    movements: Movement[];
    items: Item[];
    projects: Project[];
    openAddPersonnelModal: () => void;
    onGoBack: () => void;
    onEditPersonnel?: (person: Personnel) => void;
    onDeletePersonnel?: (id: string) => void;
    onReturnLoan?: (movementId: string) => void;
    onMarkPendingPickup?: (movementId: string, pending: boolean) => void;
    onAssignProject?: (movementId: string, projectId: string) => void;
    onCreateProject?: (name: string) => Project;
    onTransferLoan?: (movementId: string, newPersonnelId: string) => void;
    userRole?: UserRole;
    onBehaviorLog?: (action: string, detail: string) => void;
}

export const PersonnelView: React.FC<PersonnelViewProps> = ({
    personnel,
    movements,
    items,
    projects,
    openAddPersonnelModal,
    onGoBack,
    onEditPersonnel,
    onDeletePersonnel,
    onReturnLoan,
    onMarkPendingPickup,
    onAssignProject,
    onCreateProject,
    onTransferLoan,
    userRole,
    onBehaviorLog,
}) => {
    const [detailPerson, setDetailPerson] = useState<Personnel | null>(null);
    const [editPerson, setEditPerson] = useState<Personnel | null>(null);

    const isOwner = userRole !== UserRole.VISITOR;

    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const sortedPersonnel = useMemo(
        () => [...personnel].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        [personnel],
    );
    const activeLetters = useMemo(() => {
        const s = new Set<string>();
        for (const p of sortedPersonnel) s.add(p.name.charAt(0).toUpperCase());
        return s;
    }, [sortedPersonnel]);
    const jumpToLetter = useCallback((letter: string) => {
        const el = document.querySelector(`[data-person-letter="${letter}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const handleDelete = (e: React.MouseEvent, p: Personnel) => {
        e.stopPropagation();
        const hasLoans = movements.some(m => m.personnelId === p.id && m.isLoan && !m.isReturned);
        if (hasLoans) {
            alert(`${p.name} tiene herramientas activas en préstamo. Márcalas como devueltas antes de eliminar.`);
            return;
        }
        // La confirmación + credenciales las pide el PinConfirmModal (App.handleDeletePersonnel)
        onBehaviorLog?.('ACTION', `Eliminó trabajador: ${p.name}`);
        onDeletePersonnel?.(p.id);
    };

    const openEdit = (e: React.MouseEvent, p: Personnel) => {
        e.stopPropagation();
        onBehaviorLog?.('BUTTON', `Editó trabajador: ${p.name}`);
        setEditPerson(p);
    };

    const seenLetters = new Set<string>();

    return (
        <>
            <div className="relative">
            <div className="bg-papel p-6 rounded-xl shadow-md pr-10">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center">
                        <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-papel-hondo">
                            <ArrowLeftIcon className="w-6 h-6 text-tinta-suave" />
                        </button>
                        <h2 className="text-xl font-semibold text-tinta">Personal</h2>
                    </div>
                    {isOwner && (
                        <button onClick={openAddPersonnelModal} className="flex items-center bg-marca hover:bg-marca-fuerte text-tinta font-bold py-2 px-4 rounded-lg">
                            <PlusIcon className="w-5 h-5 mr-2" />
                            Añadir
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {sortedPersonnel.map(p => {
                        const letter = p.name.charAt(0).toUpperCase();
                        const isFirst = !seenLetters.has(letter);
                        if (isFirst) seenLetters.add(letter);
                        const subWorkers = p.isTeamLeader ? personnel.filter(w => w.teamLeaderId === p.id) : [];
                        // Un oficial no saca herramienta: la saca su gente. Su tarjeta
                        // decía siempre cero mientras su cuadrilla tenía media bodega
                        // afuera — Alex, con Jhon jader y Rafael, mostraba 0.
                        const enFoco = new Set([p.id, ...subWorkers.map(w => w.id)]);
                        const activeLoans = movements.filter(m => m.personnelId && enFoco.has(m.personnelId) && m.isLoan && !m.isReturned);
                        const activeItems = activeLoans.map(m => items.find(i => i.id === m.itemId)).filter(Boolean) as Item[];
                        const visibleChips = activeItems.slice(0, 3);
                        const extra = activeItems.length - visibleChips.length;

                        return (
                            <div
                                key={p.id}
                                onClick={() => { onBehaviorLog?.('NAV', `Abrió detalle: ${p.name}`); setDetailPerson(p); }}
                                className="p-4 border rounded-xl bg-papel-hondo hover:bg-marca-suave hover:border-marca-borde cursor-pointer transition-all"
                                {...(isFirst ? { 'data-person-letter': letter } : {})}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                                        <div className="w-10 h-10 rounded-full bg-marca-suave text-marca-oscuro flex items-center justify-center font-bold text-lg flex-shrink-0">
                                            {p.name.charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <span className="font-medium text-tinta-suave truncate block" title={p.name}>{p.name}</span>
                                            {p.phone ? (
                                                <span className="text-[10px] text-tinta-tenue truncate block" translate="no">{p.phone}</span>
                                            ) : (
                                                <span className="text-[10px] text-tinta-tenue block">Sin teléfono</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action buttons — always visible for owner */}
                                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                        {isOwner && (
                                            <>
                                                <button
                                                    onClick={e => openEdit(e, p)}
                                                    className="p-1.5 text-tinta-tenue hover:text-marca-oscuro hover:bg-marca-suave rounded-lg transition-colors"
                                                    title="Editar"
                                                >
                                                    <EditIcon className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={e => handleDelete(e, p)}
                                                    className="p-1.5 text-tinta-tenue hover:text-alerta hover:bg-alerta-suave rounded-lg transition-colors"
                                                    title="Eliminar"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {subWorkers.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        <span className="text-[9px] font-bold bg-marca-suave text-marca-oscuro px-1.5 py-0.5 rounded-full">
                                            Oficial · {subWorkers.length} trabajador{subWorkers.length !== 1 ? 'es' : ''}
                                        </span>
                                        {/* Clicables: desde el oficial se llega a la ficha
                                            de cada uno de los suyos sin buscarlo en la lista. */}
                                        {subWorkers.slice(0, 2).map(w => (
                                            <button key={w.id} type="button"
                                                onClick={e => { e.stopPropagation(); setDetailPerson(w); }}
                                                className="text-[9px] bg-papel-hondo hover:bg-marca-suave text-tinta-suave hover:text-marca-oscuro px-1.5 py-0.5 rounded-full truncate max-w-[80px] transition-colors">
                                                {w.name.split(' ')[0]}
                                            </button>
                                        ))}
                                        {subWorkers.length > 2 && <span className="text-[9px] bg-papel-hondo text-tinta-suave px-1.5 py-0.5 rounded-full">+{subWorkers.length - 2}</span>}
                                    </div>
                                )}
                                {activeItems.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {visibleChips.map((item, i) => (
                                            <span key={i} className="text-[10px] font-semibold bg-atencion-suave text-atencion border border-atencion px-1.5 py-0.5 rounded-full truncate max-w-[120px]" title={item.name}>{item.name}</span>
                                        ))}
                                        {extra > 0 && (
                                            <span className="text-[10px] font-semibold bg-papel-borde text-tinta-suave px-1.5 py-0.5 rounded-full">+{extra} más</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {personnel.length === 0 && (
                    <div className="text-center py-10 text-tinta-tenue">
                        <p>No hay personal registrado.</p>
                    </div>
                )}
            </div>

            {/* Índice A-Z lateral derecho */}
            <div translate="no" aria-hidden="true" className="fixed right-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-[60] bg-papel rounded-l-lg py-1 px-1 shadow-md border-l border-papel-borde overflow-hidden">
                {ALPHABET.map(letter => {
                    const active = activeLetters.has(letter);
                    return (
                        <button
                            key={letter}
                            data-nosnippet
                            onClick={() => active && jumpToLetter(letter)}
                            disabled={!active}
                            className={`w-5 h-5 flex items-center justify-center text-[10px] font-black rounded-full transition-all ${
                                active
                                    ? 'text-marca-oscuro hover:text-tinta hover:bg-marca cursor-pointer'
                                    : 'text-tinta-tenue cursor-default'
                            }`}
                        >
                            {letter}
                        </button>
                    );
                })}
            </div>
            </div>

            {detailPerson && (
                <PersonnelDetailModal
                    person={detailPerson}
                    movements={movements}
                    items={items}
                    projects={projects}
                    allPersonnel={personnel}
                    onReturnLoan={onReturnLoan}
                    onMarkPendingPickup={onMarkPendingPickup}
                    onAssignProject={onAssignProject}
                    onCreateProject={onCreateProject}
                    onTransferLoan={onTransferLoan}
                    onClose={() => setDetailPerson(null)}
                />
            )}

            <EditPersonnelModal
                isOpen={!!editPerson}
                person={editPerson}
                onClose={() => setEditPerson(null)}
                onSave={p => { onEditPersonnel?.(p); setEditPerson(null); }}
                allPersonnel={personnel}
            />
        </>
    );
};
