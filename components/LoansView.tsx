
import React, { useMemo } from 'react';
import { Movement, Item, Personnel } from '../types';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { ClockIcon } from './icons/ClockIcon';

interface LoansViewProps {
    movements: Movement[];
    items: Item[];
    personnel: Personnel[];
    onReturnItem: (movementId: string) => void;
    onGoBack: () => void;
}

export const LoansView: React.FC<LoansViewProps> = ({ movements, items, personnel, onReturnItem, onGoBack }) => {
    
    // Filter active loans (Movements that are LOANS and NOT RETURNED)
    const activeLoans = useMemo(() => {
        return movements.filter(m => m.isLoan && !m.isReturned);
    }, [movements]);

    const getItemName = (itemId: string) => items.find(i => i.id === itemId)?.name || 'Desconocido';
    const getPersonnelName = (personnelId?: string) => personnel.find(p => p.id === personnelId)?.name || 'Sin Asignar';

    const getDaysElapsed = (date: Date) => {
        const diffTime = Math.abs(new Date().getTime() - date.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
             <div className="flex items-center mb-6">
                <button onClick={onGoBack} className="mr-4 p-2 rounded-full hover:bg-gray-100">
                    <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
                </button>
                <div>
                    <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                        <ClockIcon className="w-8 h-8 mr-2 text-indigo-600"/>
                        Préstamos Activos
                    </h2>
                    <p className="text-sm text-gray-500">Herramientas en poder del personal</p>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Artículo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Personal</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Préstamo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Días Transcurridos</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {activeLoans.map(loan => (
                            <tr key={loan.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {getItemName(loan.itemId)} <span className="text-gray-500 text-xs">x{loan.quantity}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {getPersonnelName(loan.personnelId)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {new Date(loan.timestamp).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getDaysElapsed(new Date(loan.timestamp)) > 7 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                        {getDaysElapsed(new Date(loan.timestamp))} días
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button 
                                        onClick={() => onReturnItem(loan.id)}
                                        className="text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded-md text-xs"
                                    >
                                        Marcar Devuelto
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {activeLoans.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        <p>No hay herramientas prestadas actualmente. ¡Todo está en bodega!</p>
                    </div>
                )}
            </div>
        </div>
    );
};
