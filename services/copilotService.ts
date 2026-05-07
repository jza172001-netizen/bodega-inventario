// copilotService.ts
import { Item, Movement, InventoryType, MovementType, Personnel, PurchaseOrder, PurchaseOrderStatus } from '../types';

export interface CopilotMessage { role: 'user' | 'assistant'; content: string; timestamp: Date; }
export interface WarehouseContext { items: Item[]; movements: Movement[]; personnel: Personnel[]; purchaseOrders: PurchaseOrder[]; }

let transformersPipeline: any = null;
let modelLoading = false;
let modelLoaded = false;
let modelError: string | null = null;

export const getModelStatus = () => ({ modelLoading, modelLoaded, modelError });

export const initModel = async (onProgress?: (msg: string) => void): Promise<boolean> => {
    if (modelLoaded) return true;
    if (modelLoading) return false;
    modelLoading = true;
    try {
        onProgress?.('Cargando motor IA open-source...');
        // @ts-ignore — CDN import, no types available
        const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        onProgress?.('Descargando modelo (primera vez ~250MB)...');
        transformersPipeline = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M', {
            progress_callback: (info: any) => { if (info.status === 'downloading') onProgress?.('Descargando: ' + Math.round(info.progress || 0) + '%'); }
        });
        modelLoaded = true; modelLoading = false;
        onProgress?.('Modelo listo.');
        return true;
    } catch (e: any) { modelError = e.message; modelLoading = false; return false; }
};

const fmt = (n: number) => new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',minimumFractionDigits:0}).format(n);
const days = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const ASSETS = [InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL];

const detectIntent = (msg: string): string => {
    if (/stock\s*bajo|agotad|falta|reponer/i.test(msg)) return 'stock_bajo';
    if (/pr[eé]stamo|prestado|quién.*tiene/i.test(msg)) return 'prestamos';
    if (/merma|p[eé]rdida|desperdicio/i.test(msg)) return 'mermas';
    if (/gasto|inversi[oó]n|costo|cuánto.*vale/i.test(msg)) return 'gastos';
    if (/movimiento|historial|[úu]ltimo/i.test(msg)) return 'movimientos';
    if (/más\s*usado|mayor.*consumo|top/i.test(msg)) return 'mas_usado';
    if (/compra|orden|proveedor/i.test(msg)) return 'compras';
    return 'general';
};

const algorithmicResponse = (message: string, ctx: WarehouseContext): string => {
    const intent = detectIntent(message);
    if (intent === 'stock_bajo') {
        const bajos = ctx.items.filter(i => i.quantity <= i.minStock);
        if (bajos.length === 0) return 'Todo el inventario esta por encima del stock minimo.';
        return '**Items bajo stock:**\n' + bajos.slice(0,8).map(i => '- **' + i.name + '**: ' + i.quantity + '/' + i.minStock + ' ' + i.unit + (i.quantity === 0 ? ' AGOTADO' : '')).join('\n');
    }
    if (intent === 'prestamos') {
        const loans = ctx.movements.filter(m => m.isLoan && !m.isReturned);
        if (loans.length === 0) return 'No hay prestamos pendientes.';
        return '**Prestamos activos:**\n' + loans.slice(0,8).map(m => { const item = ctx.items.find(i => i.id === m.itemId); const p = ctx.personnel.find(p => p.id === m.personnelId); return '- ' + (item?.name||'?') + ' -> ' + (p?.name||'Sin asignar') + ' (hace ' + days(m.timestamp) + ' dias)'; }).join('\n');
    }
    if (intent === 'gastos') {
        const exp = ctx.items.filter(i => !ASSETS.includes(i.inventoryType));
        const act = ctx.items.filter(i => ASSETS.includes(i.inventoryType));
        return '**Resumen financiero:**\n- Materiales en stock: **' + fmt(exp.reduce((s,i)=>s+i.quantity*i.price,0)) + '**\n- Herramientas: ' + fmt(act.reduce((s,i)=>s+i.quantity*i.price,0)) + '\n- Total: **' + fmt(ctx.items.reduce((s,i)=>s+i.quantity*i.price,0)) + '**';
    }
    if (intent === 'movimientos') {
        const recientes = [...ctx.movements].sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime()).slice(0,8);
        return '**Ultimos movimientos:**\n' + recientes.map(m => { const item = ctx.items.find(i=>i.id===m.itemId); return '- ' + m.type + ' | ' + (item?.name||'?') + ' | ' + m.quantity + ' | ' + new Date(m.timestamp).toLocaleDateString('es-CO'); }).join('\n');
    }
    if (intent === 'mermas') {
        const mermas = ctx.movements.filter(m => m.type === MovementType.WASTE);
        if (mermas.length === 0) return 'No se han registrado mermas.';
        const total = mermas.filter(m=>days(m.timestamp)<=30).reduce((s,m)=>{const item=ctx.items.find(i=>i.id===m.itemId);return s+(item?m.quantity*item.price:0);},0);
        return '**Mermas:** ' + mermas.length + ' eventos\n**Costo ultimos 30 dias:** ' + fmt(total);
    }
    if (intent === 'mas_usado') {
        const cuentas: Record<string,number> = {};
        ctx.movements.filter(m=>days(m.timestamp)<=30&&m.type===MovementType.CHECK_OUT).forEach(m=>{cuentas[m.itemId]=(cuentas[m.itemId]||0)+m.quantity;});
        const top = Object.entries(cuentas).sort((a,b)=>b[1]-a[1]).slice(0,5);
        if (top.length===0) return 'Sin salidas en los ultimos 30 dias.';
        return '**Top consumidos (30 dias):**\n' + top.map(([id,cant],i)=>{ const item=ctx.items.find(x=>x.id===id); return (i+1)+'. **'+(item?.name||'?')+'** — '+cant+' '+(item?.unit||'uds'); }).join('\n');
    }
    if (intent === 'compras') {
        const pend = ctx.purchaseOrders.filter(o=>o.status===PurchaseOrderStatus.ORDERED||o.status===PurchaseOrderStatus.SHIPPED);
        return '**Ordenes de compra pendientes:** ' + pend.length + '\n' + pend.slice(0,5).map(o=>'- '+o.supplier+' | '+o.status).join('\n');
    }
    return 'Puedo ayudarte con: stock bajo, prestamos, gastos, movimientos, mermas, mas usado, compras. Pregunta lo que necesites.';
};

export const askCopilot = async (message: string, ctx: WarehouseContext): Promise<string> => {
    if (!message.trim()) return 'En que te puedo ayudar?';
    return algorithmicResponse(message, ctx);
};

export const SUGGESTED_PROMPTS = ['Que materiales tienen stock bajo?','Cuanto hemos gastado?','Que herramientas estan prestadas?','Cuales son los mas consumidos?','Muestra los ultimos movimientos','Hay mermas este mes?','Ordenes de compra pendientes?'];
