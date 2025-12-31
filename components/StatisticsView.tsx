
import React, { useMemo, useState } from 'react';
import { Item, Movement, MovementType, InventoryType } from '../types';
import { AlertTriangleIcon } from './icons/AlertTriangleIcon';
import { InventoryIcon } from './icons/InventoryIcon';
import { TrashIcon } from './icons/TrashIcon';
import { generateRotationAnalysis } from '../services/geminiService';
import { SparklesIcon } from './icons/SparklesIcon';

interface StatisticsViewProps {
    items: Item[];
    movements: Movement[];
}

const StatisticsView: React.FC<StatisticsViewProps> = ({ items, movements }) => {
    const [loadingRecommendations, setLoadingRecommendations] = useState(false);
    const [aiRecommendations, setAiRecommendations] = useState<{ [key: string]: { recommendation: string; severity: string } }>({});

    const formatCOP = (val: number) => `$${val.toLocaleString('es-CO')}`;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentMovements = useMemo(() => {
        return movements.filter(m => new Date(m.timestamp) > thirtyDaysAgo);
    }, [movements]);
    
    const kpis = useMemo(() => {
        // Valor de Activos (Herramientas)
        const assetsValue = items.reduce((sum, item) => {
            if (item.inventoryType === InventoryType.HAND_TOOL || item.inventoryType === InventoryType.ELECTRICAL_TOOL) {
                return sum + item.quantity * item.price;
            }
            return sum;
        }, 0);

        // Valor de Gastos (Materiales en bodega)
        const inventoryValue = items.reduce((sum, item) => {
            if (item.inventoryType === InventoryType.SINGLE_USE || item.inventoryType === InventoryType.PPE) {
                return sum + item.quantity * item.price;
            }
            return sum;
        }, 0);

        const lowStockItems = items.filter(item => item.quantity <= item.minStock && item.minStock > 0).length;

        const wasteValue = recentMovements
            .filter(m => m.type === MovementType.WASTE)
            .reduce((sum, m) => {
                const item = items.find(i => i.id === m.itemId);
                return sum + (item ? item.price * m.quantity : 0);
            }, 0);

        return { assetsValue, inventoryValue, lowStockItems, wasteValue };
    }, [items, recentMovements]);

    const subCategoryRotation = useMemo(() => {
        const stats: { [key: string]: { category: string, totalOut: number, frequency: number } } = {};
        recentMovements.forEach(movement => {
            if (movement.type === MovementType.CHECK_OUT) {
                const item = items.find(i => i.id === movement.itemId);
                if (item) {
                    if (!stats[item.subCategory]) stats[item.subCategory] = { category: item.category, totalOut: 0, frequency: 0 };
                    stats[item.subCategory].totalOut += movement.quantity;
                    stats[item.subCategory].frequency += 1;
                }
            }
        });
        return Object.entries(stats)
            .map(([subCategory, data]) => ({ subCategory, ...data, recommendation: 'Esperando IA...', badgeColor: 'bg-gray-100 text-gray-600' }))
            .sort((a, b) => b.totalOut - a.totalOut);
    }, [items, recentMovements]);

    const handleGenerateRecommendations = async () => {
        setLoadingRecommendations(true);
        try {
            const recommendations = await generateRotationAnalysis(subCategoryRotation);
            setAiRecommendations(recommendations);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingRecommendations(false);
        }
    };

    return (
        <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-md border-b-4 border-blue-500">
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Activos (Herramientas)</p>
                    <p className="text-2xl font-black text-gray-800">{formatCOP(kpis.assetsValue)}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-md border-b-4 border-green-500">
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Gasto en Materiales</p>
                    <p className="text-2xl font-black text-gray-800">{formatCOP(kpis.inventoryValue)}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-md border-b-4 border-yellow-500">
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Críticos Stock Bajo</p>
                    <p className="text-2xl font-black text-gray-800">{kpis.lowStockItems} Items</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-md border-b-4 border-red-500">
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Mermas (30d)</p>
                    <p className="text-2xl font-black text-gray-800">{formatCOP(kpis.wasteValue)}</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                    <div>
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Análisis de Rotación IA</h2>
                        <p className="text-xs text-gray-400 font-bold">Últimos 30 días de operación</p>
                    </div>
                    <button
                        onClick={handleGenerateRecommendations}
                        disabled={loadingRecommendations || subCategoryRotation.length === 0}
                        className="flex items-center bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-6 rounded-xl text-xs uppercase tracking-widest shadow-lg disabled:opacity-50"
                    >
                         {loadingRecommendations ? 'Analizando Datos...' : 'Consultar Asistente IA'}
                    </button>
                </div>
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Sub-Clasificación</th>
                                <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase">Salidas</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Recomendación Estratégica</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                             {subCategoryRotation.map(row => (
                                <tr key={row.subCategory} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-sm font-bold text-gray-800">{row.subCategory}</td>
                                    <td className="px-4 py-3 text-center text-sm font-black text-gray-600">{row.totalOut}</td>
                                    <td className="px-4 py-3">
                                        {loadingRecommendations ? (
                                            <div className="h-4 bg-gray-100 rounded-full animate-pulse w-48"></div>
                                        ) : (
                                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${aiRecommendations[row.subCategory] ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                                {aiRecommendations[row.subCategory]?.recommendation || 'Sin analizar'}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                             ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default StatisticsView;
