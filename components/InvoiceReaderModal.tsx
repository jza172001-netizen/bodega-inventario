import React, { useState, useRef, useCallback } from 'react';
import { parseDocument, parseTextContent, ParsedRow, ParseResult } from '../services/documentParserService';
import { Item, InventoryType } from '../types';

interface InvoiceReaderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (rows: Array<Omit<Item, 'id'>>, inventoryType?: InventoryType) => void;
}

type Step = 'upload' | 'review' | 'done';
type InputMode = 'file' | 'text';

const ACCEPTED = '.pdf,.docx,.jpg,.jpeg,.png,.webp,.bmp,.txt,.csv,.xlsx,.xls';

const TYPE_LABELS: Record<InventoryType, string> = {
    [InventoryType.ELECTRICAL_TOOL]: 'Herramienta Eléctrica',
    [InventoryType.HAND_TOOL]: 'Herramienta Manual',
    [InventoryType.PPE]: 'Elementos de Seguridad (EPP)',
    [InventoryType.SINGLE_USE]: 'Material de Consumo / Un solo uso',
};

export const InvoiceReaderModal: React.FC<InvoiceReaderModalProps> = ({ isOpen, onClose, onImport }) => {
    const [step, setStep] = useState<Step>('upload');
    const [inputMode, setInputMode] = useState<InputMode>('file');
    const [pasteText, setPasteText] = useState('');
    const [progress, setProgress] = useState(0);
    const [progressMsg, setProgressMsg] = useState('');
    const [rawText, setRawText] = useState('');
    const [rows, setRows] = useState<Array<ParsedRow & { selected: boolean }>>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState('');
    const [selectedType, setSelectedType] = useState<InventoryType | ''>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setStep('upload');
        setProgress(0);
        setProgressMsg('');
        setRawText('');
        setRows([]);
        setError('');
        setSelectedType('');
        setPasteText('');
    };

    const handleClose = () => { reset(); onClose(); };

    const applyResult = (result: ParseResult) => {
        setRawText(result.rawText);
        setRows(result.rows.map(r => ({ ...r, selected: true })));
        setProgress(100);
        setProgressMsg('Completado');
        if (result.detectedInventoryType) setSelectedType(result.detectedInventoryType);
    };

    const processFile = useCallback(async (file: File) => {
        setError('');
        setStep('review');
        setProgress(0);
        setProgressMsg('Iniciando…');
        try {
            const result = await parseDocument(file, (pct, msg) => {
                setProgress(pct);
                setProgressMsg(msg);
            });
            applyResult(result);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error al procesar el archivo');
            setStep('upload');
        }
    }, []);

    const handlePasteProcess = () => {
        if (!pasteText.trim()) return;
        setError('');
        setStep('review');
        const result = parseTextContent(pasteText);
        applyResult(result);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const updateRow = (idx: number, field: keyof ParsedRow, value: string | number) => {
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    };
    const toggleRow = (idx: number) => {
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
    };

    const handleImport = () => {
        const selected = rows.filter(r => r.selected && r.name.trim());
        const invType = selectedType || InventoryType.SINGLE_USE;
        const items: Array<Omit<Item, 'id'>> = selected.map(r => ({
            name: r.name.trim(),
            quantity: r.quantity,
            unit: r.unit || 'und',
            category: 'Sin clasificar',
            subCategory: 'General',
            inventoryType: invType,
            minStock: 0,
            price: 0,
        }));
        onImport(items, invType);
        setStep('done');
    };

    const selectedCount = rows.filter(r => r.selected && r.name.trim()).length;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Leer Factura / Documento</h2>
                        <p className="text-sm text-gray-500 mt-0.5">PDF, imagen, Excel, Word o texto — sin conexión a internet</p>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    {/* STEP: UPLOAD */}
                    {step === 'upload' && (
                        <div className="flex flex-col items-center h-full min-h-[300px]">
                            {/* Tab switcher */}
                            <div className="flex bg-gray-100 rounded-xl p-1 mb-6 w-full max-w-sm">
                                {(['file', 'text'] as InputMode[]).map(m => (
                                    <button key={m} onClick={() => setInputMode(m)}
                                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${inputMode === m ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                                        {m === 'file' ? '📎 Subir archivo' : '📝 Pegar texto'}
                                    </button>
                                ))}
                            </div>

                            {inputMode === 'file' ? (
                                <div
                                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
                                >
                                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                    </svg>
                                    <p className="text-lg font-semibold text-gray-700 mb-1">Arrastra tu archivo aquí</p>
                                    <p className="text-sm text-gray-500 mb-3">o haz clic para seleccionar</p>
                                    <div className="flex flex-wrap gap-1.5 justify-center">
                                        {['PDF', 'DOCX', 'JPG/PNG', 'Excel', 'CSV', 'TXT'].map(fmt => (
                                            <span key={fmt} className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full">{fmt}</span>
                                        ))}
                                    </div>
                                    <input ref={fileInputRef} type="file" accept={ACCEPTED} onChange={handleFileInput} className="hidden" />
                                </div>
                            ) : (
                                <div className="w-full max-w-xl space-y-3">
                                    <textarea
                                        value={pasteText}
                                        onChange={e => setPasteText(e.target.value)}
                                        placeholder={"Pega aquí el listado de materiales:\n\nEjemplo:\nInventario EPP — Marzo 2025\n5 cascos de seguridad\n10 guantes de cuero\n3 arnés altura\n\nO con cantidades al inicio:\n50 tornillos 2 pulgadas\n20 metros cable 10mm"}
                                        rows={10}
                                        className="w-full border border-gray-200 rounded-xl p-4 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    />
                                    <button
                                        onClick={handlePasteProcess}
                                        disabled={!pasteText.trim()}
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-all"
                                    >
                                        Procesar texto →
                                    </button>
                                </div>
                            )}

                            {error && (
                                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl max-w-xl w-full">{error}</div>
                            )}
                            <div className="mt-4 text-xs text-gray-400 max-w-md text-center">
                                Pon en el título del documento el tipo de inventario (ej. "Inventario EPP", "Herramienta Eléctrica") para que el sistema lo detecte automáticamente.
                            </div>
                        </div>
                    )}

                    {/* STEP: REVIEW */}
                    {step === 'review' && (
                        <div className="flex flex-col gap-4 h-full">
                            {progress < 100 && (
                                <div className="bg-blue-50 rounded-xl p-4">
                                    <div className="flex justify-between text-sm font-medium text-blue-700 mb-2">
                                        <span>{progressMsg}</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="w-full bg-blue-200 rounded-full h-2">
                                        <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}

                            {progress === 100 && (
                                <>
                                    {/* Selector de categoría */}
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
                                        <div className="flex-1 min-w-[200px]">
                                            <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1">Tipo de inventario detectado</p>
                                            <p className="text-xs text-gray-500">Todos los productos importados se asignarán a esta categoría</p>
                                        </div>
                                        <select
                                            value={selectedType}
                                            onChange={e => setSelectedType(e.target.value as InventoryType | '')}
                                            className="px-3 py-2 border border-blue-300 bg-white text-sm font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
                                        >
                                            <option value="">— Sin clasificar —</option>
                                            {Object.entries(TYPE_LABELS).map(([val, label]) => (
                                                <option key={val} value={val}>{label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4 flex-1 min-h-0">
                                        {/* Texto extraído */}
                                        <div className="flex flex-col min-h-0">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="font-semibold text-gray-700 text-sm">Texto extraído</h3>
                                                <span className="text-xs text-gray-400">{rawText.split('\n').length} líneas</span>
                                            </div>
                                            <div className="flex-1 overflow-auto border border-gray-200 rounded-xl p-3 bg-gray-50 font-mono text-xs text-gray-600 whitespace-pre-wrap min-h-[200px] max-h-[350px]">
                                                {rawText || <span className="text-gray-400 italic">Sin texto extraído</span>}
                                            </div>
                                        </div>

                                        {/* Productos detectados */}
                                        <div className="flex flex-col min-h-0">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="font-semibold text-gray-700 text-sm">Productos detectados</h3>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setRows(prev => prev.map(r => ({ ...r, selected: true })))} className="text-xs text-blue-600 hover:underline">Todos</button>
                                                    <button onClick={() => setRows(prev => prev.map(r => ({ ...r, selected: false })))} className="text-xs text-gray-400 hover:underline">Ninguno</button>
                                                    <button onClick={() => setRows(prev => [...prev, { name: '', quantity: 0, unit: 'und', selected: true }])} className="text-xs text-green-600 hover:underline">+ Agregar</button>
                                                </div>
                                            </div>

                                            {rows.length === 0 ? (
                                                <div className="flex-1 border border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 p-6 text-center">
                                                    <p className="text-gray-500 text-sm">No se detectaron productos automáticamente.</p>
                                                    <p className="text-gray-400 text-xs">Puedes agregar manualmente con el botón "+ Agregar"</p>
                                                </div>
                                            ) : (
                                                <div className="flex-1 overflow-auto border border-gray-200 rounded-xl min-h-[200px] max-h-[350px]">
                                                    <table className="w-full text-sm">
                                                        <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                                                            <tr>
                                                                <th className="w-8 px-3 py-2"></th>
                                                                <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Nombre</th>
                                                                <th className="w-20 px-2 py-2 text-left font-semibold text-gray-600 text-xs">Cant.</th>
                                                                <th className="w-20 px-2 py-2 text-left font-semibold text-gray-600 text-xs">Unidad</th>
                                                                <th className="w-8"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {rows.map((row, idx) => (
                                                                <tr key={idx} className={`border-b border-gray-100 ${!row.selected ? 'opacity-40' : ''}`}>
                                                                    <td className="px-3 py-1.5">
                                                                        <input type="checkbox" checked={row.selected} onChange={() => toggleRow(idx)} className="w-3.5 h-3.5 accent-blue-600" />
                                                                    </td>
                                                                    <td className="px-3 py-1.5">
                                                                        <input value={row.name} onChange={e => updateRow(idx, 'name', e.target.value)}
                                                                            className="w-full text-xs border-0 bg-transparent focus:bg-blue-50 rounded px-1 py-0.5 outline-none focus:outline-blue-300" />
                                                                    </td>
                                                                    <td className="px-2 py-1.5">
                                                                        <input type="number" value={row.quantity} onChange={e => updateRow(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                                                            className="w-full text-xs border-0 bg-transparent focus:bg-blue-50 rounded px-1 py-0.5 outline-none focus:outline-blue-300" min="0" />
                                                                    </td>
                                                                    <td className="px-2 py-1.5">
                                                                        <input value={row.unit} onChange={e => updateRow(idx, 'unit', e.target.value)}
                                                                            className="w-full text-xs border-0 bg-transparent focus:bg-blue-50 rounded px-1 py-0.5 outline-none focus:outline-blue-300" />
                                                                    </td>
                                                                    <td className="pr-2">
                                                                        <button onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 p-1">
                                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* STEP: DONE */}
                    {step === 'done' && (
                        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Productos importados</h3>
                            <p className="text-gray-500 text-sm mb-6">Los artículos ya aparecen en el inventario. Puedes editarlos para ajustar stock mínimo, precio y subcategoría.</p>
                            <div className="flex gap-3">
                                <button onClick={reset} className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50">Leer otro archivo</button>
                                <button onClick={handleClose} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">Cerrar</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 'review' && progress === 100 && (
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                        <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 font-medium">← Subir otro archivo</button>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">{selectedCount} productos seleccionados</span>
                            <button
                                onClick={handleImport}
                                disabled={selectedCount === 0}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-all"
                            >
                                Agregar {selectedCount > 0 ? selectedCount : ''} al inventario
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
