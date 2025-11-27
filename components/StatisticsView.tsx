import React, { useMemo, useState } from 'react';
import { Item, Movement, MovementType } from '../types';
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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentMovements = useMemo(() => {
        return movements.filter(m => new Date(m.timestamp) > thirtyDaysAgo);
    }, [movements]);
    
    const kpis = useMemo(() => {
        const totalValue = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
        const lowStockItems = items.filter(item => item.quantity <= item.minStock && item.minStock > 0).length;
        const wasteValue = recentMovements
            .filter(m => m.type === MovementType.WASTE)
            .reduce((sum, m) => {
                const item = items.find(i => i.id === m.itemId);
                return sum + (item ? item.price * m.quantity : 0);
            }, 0);
        return { totalValue, lowStockItems, wasteValue };
    }, [items, recentMovements]);

    const subCategoryRotation = useMemo(() => {
        const stats: { [key: string]: { category: string, totalOut: number, frequency: number } } = {};

        recentMovements.forEach(movement => {
            if (movement.type === MovementType.CHECK_OUT) {
                const item = items.find(i => i.id === movement.itemId);
                if (item) {
                    if (!stats[item.subCategory]) {
                        stats[item.subCategory] = { category: item.category, totalOut: 0, frequency: 0 };
                    }
                    stats[item.subCategory].totalOut += movement.quantity;
                    stats[item.subCategory].frequency += 1;
                }
            }
        });
        
        return Object.entries(stats)
            .map(([subCategory, data]) => {
                let recommendation = 'Esperando análisis IA...';
                let badgeColor = 'bg-gray-100 text-gray-600';

                return { subCategory, ...data, recommendation, badgeColor };
            })
            .sort((a, b) => b.totalOut - a.totalOut);

    }, [items, recentMovements]);
    
    const chartData = useMemo(() => {
        const categoryValue: { [key: string]: number } = {};
        items.forEach(item => {
            if (!categoryValue[item.category]) categoryValue[item.category] = 0;
            categoryValue[item.category] += item.quantity * item.price;
        });
        const sortedCategoryValue = Object.entries(categoryValue).sort((a, b) => b[1] - a[1]);
        const totalValue = sortedCategoryValue.reduce((acc, [, val]) => acc + val, 0);

        const movementTrends = subCategoryRotation.slice(0, 5).map(sc => {
             const ins = recentMovements.filter(m => {
                const item = items.find(i => i.id === m.itemId);
                return item && item.subCategory === sc.subCategory && (m.type === MovementType.CHECK_IN || m.type === MovementType.PURCHASE);
            }).reduce((acc, m) => acc + m.quantity, 0);
            return { name: sc.subCategory, in: ins, out: sc.totalOut };
        });
        const maxMovement = Math.max(...movementTrends.map(m => m.in), ...movementTrends.map(m => m.out), 1);
        
        return {
            donut: {
                data: sortedCategoryValue,
                total: totalValue,
            },
            bars: {
                data: movementTrends,
                max: maxMovement
            }
        };
    }, [items, recentMovements, subCategoryRotation]);

    const formatCurrency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const handleGenerateRecommendations = async () => {
        setLoadingRecommendations(true);
        setAiRecommendations({});
        const rotationDataForAI = subCategoryRotation.map(({ subCategory, totalOut, frequency }) => ({
            subCategory,
            totalOut,
            frequency,
        }));
        
        try {
            const recommendations = await generateRotationAnalysis(rotationDataForAI);
            setAiRecommendations(recommendations);
        } catch (error) {
            console.error(error);
            alert('Hubo un error al generar las recomendaciones de IA.');
        } finally {
            setLoadingRecommendations(false);
        }
    };

    const getBadgeColorForSeverity = (severity: string = 'MEDIUM') => {
        switch (severity.toUpperCase()) {
            case 'CRITICAL': return 'bg-red-200 text-red-800';
            case 'HIGH': return 'bg-yellow-200 text-yellow-800';
            case 'MEDIUM': return 'bg-blue-200 text-blue-800';
            case 'LOW': return 'bg-gray-200 text-gray-800';
            default: return 'bg-gray-200 text-gray-800';
        }
    };


    const donutColors = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#6366f1'];
    let cumulativePercent = 0;
    const conicGradient = chartData.donut.data.map(([_, value], i) => {
        const percent = (value / chartData.donut.total) * 100;
        const start = cumulativePercent;
        cumulativePercent += percent;
        return `${donutColors[i % donutColors.length]} ${start}% ${cumulativePercent}%`;
    }).join(', ');

    return (
        <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-md flex items-center space-x-4">
                    <div className="bg-green-100 p-3 rounded-full"><InventoryIcon className="w-8 h-8 text-green-600" /></div>
                    <div>
                        <p className="text-sm text-gray-500">Valor Total del Inventario</p>
                        <p className="text-2xl font-bold text-gray-800">{formatCurrency(kpis.totalValue)}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md flex items-center space-x-4">
                    <div className="bg-yellow-100 p-3 rounded-full"><AlertTriangleIcon className="w-8 h-8 text-yellow-600" /></div>
                    <div>
                        <p className="text-sm text-gray-500">Artículos con Stock Bajo</p>
                        <p className="text-2xl font-bold text-gray-800">{kpis.lowStockItems}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md flex items-center space-x-4">
                    <div className="bg-red-100 p-3 rounded-full"><TrashIcon className="w-8 h-8 text-red-600" /></div>
                    <div>
                        <p className="text-sm text-gray-500">Valor de Mermas (30d)</p>
                        <p className="text-2xl font-bold text-gray-800">{formatCurrency(kpis.wasteValue)}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-md">
                     <h2 className="text-xl font-semibold text-gray-800 mb-4">Valor de Inventario por Categoría</h2>
                     {chartData.donut.data.length > 0 ? (
                         <div className="flex flex-col sm:flex-row items-center gap-6">
                            <div className="relative w-40 h-40 flex-shrink-0">
                                <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${conicGradient})` }}></div>
                                <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center">
                                    <span className="text-center">
                                        <div className="text-xs text-gray-500">Total</div>
                                        <div className="font-bold text-lg">{formatCurrency(chartData.donut.total)}</div>
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 space-y-2 text-sm w-full">
                                {chartData.donut.data.map(([name, value], i) => (
                                    <div key={name} className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: donutColors[i % donutColors.length] }}></span>
                                            <span>{name}</span>
                                        </div>
                                        <span className="font-medium">{formatCurrency(value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                     ) : <p className="text-center text-gray-500 py-4">No hay datos de inventario.</p>}
                </div>
                 <div className="bg-white p-6 rounded-xl shadow-md">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">Entradas vs. Salidas (Top 5 Sub-Clasificaciones)</h2>
                    {chartData.bars.data.length > 0 ? (
                        <div className="space-y-3">
                            {chartData.bars.data.map(d => (
                                <div key={d.name}>
                                    <p className="text-sm font-medium text-gray-700">{d.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-green-600 w-10 text-right">{d.in}</span>
                                        <div className="flex-1 bg-gray-200 rounded h-4">
                                            <div className="bg-green-500 h-4 rounded" style={{ width: `${(d.in / chartData.bars.max) * 100}%`}}></div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                         <span className="text-xs text-yellow-600 w-10 text-right">{d.out}</span>
                                        <div className="flex-1 bg-gray-200 rounded h-4">
                                            <div className="bg-yellow-500 h-4 rounded" style={{ width: `${(d.out / chartData.bars.max) * 100}%`}}></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-center text-gray-500 py-4">No hay movimientos de salida recientes.</p>}
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-800 mb-2 md:mb-0">Análisis de Rotación por Sub-Clasificación (Últimos 30 días)</h2>
                    <button
                        onClick={handleGenerateRecommendations}
                        disabled={loadingRecommendations || subCategoryRotation.length === 0}
                        className="flex items-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg text-sm disabled:bg-indigo-300 disabled:cursor-not-allowed"
                    >
                         {loadingRecommendations ? (
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <SparklesIcon className="w-5 h-5 mr-2"/>
                        )}
                        {loadingRecommendations ? 'Analizando...' : 'Generar Recomendaciones con IA'}
                    </button>
                </div>
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sub-Clasificación</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Salidas (Cantidad)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frecuencia de Salida</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recomendación IA</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                             {subCategoryRotation.map(row => {
                                const aiRec = aiRecommendations[row.subCategory];
                                const recommendationText = aiRec ? aiRec.recommendation : row.recommendation;
                                const badgeColor = aiRec ? getBadgeColorForSeverity(aiRec.severity) : row.badgeColor;

                                return (
                                    <tr key={row.subCategory}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.subCategory}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.category}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold">{row.totalOut}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.frequency}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {loadingRecommendations ? (
                                                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                                            ) : (
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeColor}`}>
                                                    {recommendationText}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                     {subCategoryRotation.length === 0 && <p className="text-center text-gray-500 py-10">No hay suficientes datos de movimientos para generar un análisis.</p>}
                </div>
            </div>
        </div>
    );
};

export default StatisticsView;