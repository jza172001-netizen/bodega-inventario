import React, { useState, useRef, useCallback } from 'react';
import { Item, Movement, Personnel, PurchaseOrder } from '../types';
import { askCopilot, SUGGESTED_PROMPTS, CopilotMessage, WarehouseContext } from '../services/copilotService';

const BotIcon = () => (<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='w-5 h-5'><rect x='3' y='11' width='18' height='10' rx='2'/><circle cx='12' cy='5' r='2'/><path d='M12 7v4'/><line x1='8' y1='15' x2='8' y2='17'/><line x1='16' y1='15' x2='16' y2='17'/></svg>);
const SendIcon = () => (<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='w-5 h-5'><line x1='22' y1='2' x2='11' y2='13'/><polygon points='22 2 15 22 11 13 2 9 22 2'/></svg>);

interface Props { items: Item[]; movements: Movement[]; personnel: Personnel[]; purchaseOrders: PurchaseOrder[]; }

const CopilotView: React.FC<Props> = ({ items, movements, personnel, purchaseOrders }) => {
    const [messages, setMessages] = useState<CopilotMessage[]>([{ role: 'assistant', content: 'Hola! Soy tu **Copiloto de Bodega**. Estoy conectado a tu inventario en tiempo real. Preguntame sobre stock, movimientos, prestamos, gastos y mas.', timestamp: new Date() }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const ctx: WarehouseContext = { items, movements, personnel, purchaseOrders };

    React.useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;
        setInput(''); setLoading(true);
        setMessages(prev => [...prev, { role: 'user', content: trimmed, timestamp: new Date() }]);
        try {
            const response = await askCopilot(trimmed, ctx);
            setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }]);
        } catch { setMessages(prev => [...prev, { role: 'assistant', content: 'Error procesando consulta.', timestamp: new Date() }]); }
        finally { setLoading(false); }
    }, [loading, ctx]);

    const renderContent = (text: string) => text.split('\n').map((line, i) => {
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className='font-bold text-gray-800 mt-1'>{line.slice(2,-2)}</p>;
        if (line.startsWith('- ')) return <div key={i} className='flex gap-1 text-sm'><span className='text-indigo-500'>•</span><span dangerouslySetInnerHTML={{__html: line.slice(2).replace(/\*\*([^*]+)\*\*/g,'<strong></strong>')}} /></div>;
        if (!line.trim()) return <div key={i} className='h-1'/>;
        return <p key={i} className='text-sm' dangerouslySetInnerHTML={{__html: line.replace(/\*\*([^*]+)\*\*/g,'<strong></strong>')}} />;
    });

    return (
        <div className='flex flex-col h-full bg-gray-50'>
            <div className='bg-white border-b px-6 py-4 flex items-center gap-3'>
                <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white'><BotIcon /></div>
                <div><h2 className='font-bold text-gray-800'>Copiloto de Bodega</h2><p className='text-xs text-gray-500'>IA open-source · Sin API key · Datos locales</p></div>
                <div className='ml-auto flex items-center gap-2'><div className='flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-full'><div className='w-2 h-2 bg-emerald-500 rounded-full animate-pulse'/><span className='text-xs font-medium text-emerald-600'>En linea</span></div></div>
            </div>
            <div className='flex-1 overflow-y-auto px-4 pt-4 pb-2'>
                {messages.map((msg, i) => (
                    <div key={i} className={'flex gap-3 ' + (msg.role === 'user' ? 'flex-row-reverse' : 'flex-row') + ' mb-3'}>
                        <div className={'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ' + (msg.role === 'user' ? 'bg-blue-500' : 'bg-gradient-to-br from-violet-500 to-indigo-600')}>{msg.role === 'user' ? 'Tu' : <BotIcon />}</div>
                        <div className={'max-w-xs md:max-w-md rounded-2xl px-4 py-3 ' + (msg.role === 'user' ? 'bg-blue-500 text-white rounded-tr-sm' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm shadow-sm')}>
                            <div className='space-y-0.5'>{renderContent(msg.content)}</div>
                            <p className={'text-xs mt-1 ' + (msg.role === 'user' ? 'text-blue-200 text-right' : 'text-gray-400')}>{msg.timestamp.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</p>
                        </div>
                    </div>
                ))}
                {loading && (<div className='flex gap-3 mb-3'><div className='w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white'><BotIcon /></div><div className='bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border'><div className='flex gap-1'><div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{animationDelay:'0ms'}}/><div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{animationDelay:'150ms'}}/><div className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{animationDelay:'300ms'}}/></div></div></div>)}
                {messages.length === 1 && (<div className='mb-3'><p className='text-xs text-gray-400 mb-2 uppercase tracking-wide'>Preguntas frecuentes</p><div className='flex flex-wrap gap-2'>{SUGGESTED_PROMPTS.map((p,i)=>(<button key={i} onClick={()=>sendMessage(p)} className='px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm'>{p}</button>))}</div></div>)}
                <div ref={messagesEndRef}/>
            </div>
            <div className='px-4 pb-4 pt-2'>
                <div className='bg-white border border-gray-200 rounded-2xl flex items-center gap-2 px-4 py-2 focus-within:border-indigo-400 transition-all'>
                    <input type='text' value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();sendMessage(input);}}} placeholder='Pregunta sobre tu inventario...' disabled={loading} className='flex-1 outline-none text-sm text-gray-700 bg-transparent placeholder-gray-400'/>
                    <button onClick={()=>sendMessage(input)} disabled={!input.trim()||loading} className='w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center hover:bg-indigo-600 disabled:opacity-40 transition-all'><SendIcon /></button>
                </div>
            </div>
        </div>
    );
};

export default CopilotView;
