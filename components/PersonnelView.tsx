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
        if (window.confirm(`¿Eliminar a ${p.name}? Su historial de movimientos se conserva.`)) {
            onBehaviorLog?.('ACTION', `Eliminó trabajador: ${p.name}`);
            onDeletePersonnel?.(p.id);
        }
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
            <div className="bg-white p-6 rounded-xl shadow-md pr-10">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center">
                        <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                        </button>
                        <h2 className="text-xl font-semibold text-gray-800">Personal</h2>
                    </div>
                    {isOwner && (
                        <button onClick={openAddPersonnelModal} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
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
                        const activeLoans = movements.filter(m => m.personnelId === p.id && m.isLoan && !m.isReturned);
                        const activeItems = activeLoans.map(m => items.find(i => i.id === m.itemId)).filter(Boolean) as Item[];
                        const visibleChips = activeItems.slice(0, 3);
                        const extra = activeItems.length - visibleChips.length;
                        const subWorkers = p.isTeamLeader ? personnel.filter(w => w.teamLeaderId === p.id) : [];

                        return (
                            <div
                                key={p.id}
                                onClick={() => { onBehaviorLog?.('NAV', `Abrió detalle: ${p.name}`); setDetailPerson(p); }}
                                className="p-4 border rounded-xl bg-gray-50 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all"
                                {...(isFirst ? { 'data-person-letter': letter } : {})}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                                        <div className="w-10 h-10 rounded-full bg-blue-200 text-blue-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                                            {p.name.charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <span className="font-medium text-gray-700 truncate block" title={p.name}>{p.name}</span>
                                            {p.phone ? (
                                                <span className="text-[10px] text-gray-400 truncate block" translate="no">{p.phone}</span>
                                            ) : (
                                                <span className="text-[10px] text-gray-300 block">Sin teléfono</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action buttons — always visible for owner */}
                                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                        {isOwner && (
                                            <>
                                                <button
                                                    onClick={e => openEdit(e, p)}
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Editar"
                                                >
                                                    <EditIcon className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={e => handleDelete(e, p)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                                        <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                                            Oficial · {subWorkers.length} trabajador{subWorkers.length !== 1 ? 'es' : ''}
                                        </span>
                                        {subWorkers.slice(0, 2).map(w => (
                                            <span key={w.id} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full truncate max-w-[80px]">{w.name.split(' ')[0]}</span>
                                        ))}
                                        {subWorkers.length > 2 && <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">+{subWorkers.length - 2}</span>}
                                    </div>
                                )}
                                {activeItems.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {visibleChips.map((item, i) => (
                                            <span key={i} className="text-[10px] font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200 px-1.5 py-0.5 rounded-full truncate max-w-[120px]" title={item.name}>{item.name}</span>
                                        ))}
                                        {extra > 0 && (
                                            <span className="text-[10px] font-semibold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">+{extra} más</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {personnel.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        <p>No hay personal registrado.</p>
                    </div>
                )}
            </div>

            {/* Índice A-Z lateral derecho */}
            <div translate="no" aria-hidden="true" className="fixed right-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-[60] bg-white rounded-l-lg py-1 px-1 shadow-md border-l border-gray-100 overflow-hidden">
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
                                    ? 'text-blue-600 hover:text-white hover:bg-blue-500 cursor-pointer'
                                    : 'text-gray-300 cursor-default'
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
            />
        </>
    );
};
