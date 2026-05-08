

import React, { useState, useCallback } from 'react';
import { Item, Movement } from '../types';
import { generateInventoryAnalysis } from '../services/geminiService';

interface ReportViewProps {
    items: Item[];
    movements: Movement[];
}

export const ReportView: React.FC<ReportViewProps> = ({ items, movements }) => {
    const [report, setReport] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    const handleGenerateReport = useCallback(async () => {
        setIsLoading(true);
        setError('');
        setReport('');
        try {
            const analysis = await generateInventoryAnalysis(items, movements);
            setReport(analysis);
        } catch (err: any) {
            setError('Failed to generate report. ' + err.message);
        } finally {
            setIsLoading(false);
        }
    }, [items, movements]);

    // FIX: Replaced buggy regex-based markdown parser with a more robust, line-by-line processor
    // to correctly render headings, bold text, and lists from the AI's response.
    const formattedReport = React.useMemo(() => {
        if (!report) return '';

        const lines = report.split('\n');
        let html = '';
        let inList = false;

        const applyBold = (text: string) => text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        for (const line of lines) {
            const processedLine = line.trim();

            if (processedLine.startsWith('## ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h3 class="text-xl font-semibold mt-4 mb-2 text-gray-700">${applyBold(processedLine.substring(3))}</h3>`;
            } else if (processedLine.startsWith('### ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h4 class="text-lg font-semibold mt-3 mb-1 text-gray-600">${applyBold(processedLine.substring(4))}</h4>`;
            } else if (processedLine.startsWith('* ')) {
                if (!inList) {
                    html += '<ul class="list-disc ml-5">';
                    inList = true;
                }
                html += `<li>${applyBold(processedLine.substring(2))}</li>`;
            } else if (processedLine) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<p>${applyBold(processedLine)}</p>`;
            } else {
                if (!inList) {
                    html += '<br />';
                }
            }
        }

        if (inList) {
            html += '</ul>';
        }

        return html;
    }, [report]);

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">Análisis de Inventario</h2>
                    <button
                        onClick={handleGenerateReport}
                        disabled={isLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-indigo-300 disabled:cursor-not-allowed flex items-center"
                    >
                        {isLoading ? (
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : null}
                        {isLoading ? 'Generando...' : 'Generar Reporte Completo'}
                    </button>
                </div>
                <p className="text-gray-600">
                    Análisis automático de su inventario: tendencias de consumo, alertas de stock, herramientas en préstamo y recomendaciones de reabastecimiento.
                </p>
            </div>
            
            {isLoading && (
                <div className="bg-white p-6 rounded-xl shadow-md text-center">
                    <p className="text-gray-600">El asistente de IA está analizando los datos. Esto puede tardar unos segundos...</p>
                </div>
            )}

            {error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md" role="alert">
                    <p className="font-bold">Error</p>
                    <p>{error}</p>
                </div>
            )}

            {report && (
                 <div className="bg-white p-6 rounded-xl shadow-md prose max-w-none">
                    <h2 className="text-2xl font-bold mb-4 text-gray-800">Reporte de Análisis de Inventario</h2>
                    <div dangerouslySetInnerHTML={{ __html: formattedReport }} />
                </div>
            )}
        </div>
    );
};