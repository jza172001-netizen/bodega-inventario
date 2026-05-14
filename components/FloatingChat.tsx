import React, { useState, useRef, useEffect } from 'react';
import { Item, Movement, Personnel, PurchaseOrder } from '../types';
import { askCopilot } from '../services/copilotService';

interface FloatingChatProps {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    purchaseOrders: PurchaseOrder[];
}

type Msg = { id: string; role: 'user' | 'bot'; text: string };

const uid = () => Math.random().toString(36).slice(2);

const QUICK = [
    { label: '📦 Stock bajo', q: '¿Qué materiales tienen stock bajo?' },
    { label: '🔑 Préstamos activos', q: '¿Qué herramientas están prestadas?' },
    { label: '🔥 Más consumidos', q: '¿Cuáles son los más consumidos?' },
    { label: '🕒 Últimos movimientos', q: 'Muestra los últimos movimientos' },
    { label: '🛒 Órdenes pendientes', q: '¿Órdenes de compra pendientes?' },
];

const WELCOME = '¡Hola! 👋 Soy tu asistente de bodega. Selecciona una consulta rápida o escribe tu pregunta.';

export const FloatingChat: React.FC<FloatingChatProps> = ({ items, movements, personnel, purchaseOrders }) => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Msg[]>([{ id: uid(), role: 'bot', text: WELCOME }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasNew, setHasNew] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setHasNew(false);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, open]);

    const addBot = (text: string) => {
        setMessages(prev => [...prev, { id: uid(), role: 'bot', text }]);
        if (!open) setHasNew(true);
    };

    const handleSend = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        setMessages(prev => [...prev, { id: uid(), role: 'user', text: trimmed }]);
        setInput('');
        setLoading(true);
        try {
            const resp = await askCopilot(trimmed, { items, movements, personnel, purchaseOrders });
            addBot(resp);
        } catch {
            addBot('Error al consultar. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); }
    };

    return (
        <>
            {/* Panel de chat */}
            {open && (
                <div
                    className="fixed bottom-24 right-4 sm:right-6 z-50 w-[340px] sm:w-[380px] flex flex-col rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
                    style={{ maxHeight: 'min(540px, calc(100vh - 120px))' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-600">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🤖</span>
                            <div>
                                <p className="text-white font-bold text-sm leading-tight">Asistente de Bodega</p>
                                <p className="text-blue-200 text-[10px]">Consultas rápidas de inventario</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setOpen(false)}
                            className="text-blue-200 hover:text-white transition-colors p-1 rounded-lg hover:bg-blue-700"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Quick buttons */}
                    <div className="bg-gray-50 px-3 py-2 flex flex-wrap gap-1.5 border-b border-gray-200">
                        {QUICK.map(q => (
                            <button
                                key={q.q}
                                onClick={() => handleSend(q.q)}
                                disabled={loading}
                                className="px-2.5 py-1 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded-full text-[11px] font-semibold transition-all disabled:opacity-50"
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto bg-white px-3 py-3 space-y-3 min-h-[180px]">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                                    msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm'
                                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                                }`}>
                                    {msg.text.replace(/\*\*(.+?)\*\*/g, '$1')}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                                    {[0, 1, 2].map(i => (
                                        <span key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div className="bg-white border-t border-gray-200 px-3 py-2 flex gap-2 items-end">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKey}
                            placeholder="Escribe tu pregunta..."
                            rows={1}
                            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            style={{ maxHeight: '80px' }}
                        />
                        <button
                            onClick={() => handleSend(input)}
                            disabled={!input.trim() || loading}
                            className="h-9 w-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl transition-all flex-shrink-0"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Botón flotante */}
            <button
                onClick={() => setOpen(v => !v)}
                className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-xl flex items-center justify-center transition-all duration-200"
                aria-label="Abrir asistente"
            >
                {open ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                    </svg>
                )}
                {hasNew && !open && (
                    <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                )}
            </button>
        </>
    );
};
