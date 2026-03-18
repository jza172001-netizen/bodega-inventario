// analyticsService.ts
// Reporte de inventario 100% algoritmico — sin API key, sin dependencias externas
// Reemplaza geminiService.ts con logica pura TypeScript

import { Item, Movement, InventoryType, MovementType } from '../types';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

const pct = (a: number, b: number) =>
    b === 0 ? '0%' : `${Math.round((a / b) * 100)}%`;

const days = (d: Date) => {
    const diff = Date.now() - new Date(d).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const ASSETS = [InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL];
const EXPENSES = [InventoryType.PPE, InventoryType.SINGLE_USE];

// ─── ANALISIS PRINCIPAL ──────────────────────────────────────────────────────

export const generateInventoryAnalysis = async (
    items: Item[],
    movements: Movement[]
): Promise<string> => {

    const now = new Date();
    const last30 = movements.filter(m => days(m.timestamp) <= 30);
    const last7  = movements.filter(m => days(m.timestamp) <= 7);

    // ── 1. Resumen de Inversión ──────────────────────────────────────────────
    const expenseItems = items.filter(i => EXPENSES.includes(i.inventoryType));
    const assetItems   = items.filter(i => ASSETS.includes(i.inventoryType));

    const totalInversion = expenseItems.reduce((s, i) => s + i.quantity * i.price, 0);
    const totalActivos   = assetItems.reduce((s, i) => s + i.quantity * i.price, 0);

    const compras30 = last30
        .filter(m => m.type === MovementType.PURCHASE)
        .reduce((s, m) => {
            const item = items.find(i => i.id === m.itemId);
            return s + (item ? m.quantity * item.price : 0);
        }, 0);

    const mermas30 = last30
        .filter(m => m.type === MovementType.WASTE)
        .reduce((s, m) => {
            const item = items.find(i => i.id === m.itemId);
            return s + (item ? m.quantity * item.price : 0);
        }, 0);

    // ── 2. Control de Activos ────────────────────────────────────────────────
    const herramientas = assetItems.map(item => {
        const outs = movements.filter(m => m.itemId === item.id && m.type === MovementType.CHECK_OUT);
        const loans = movements.filter(m => m.itemId === item.id && m.isLoan && !m.isReturned);
        const lastMov = movements
            .filter(m => m.itemId === item.id)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
        return {
            ...item,
            salidas: outs.length,
            prestamos: loans.length,
            diasSinMov: lastMov ? days(lastMov.timestamp) : 999,
            valorTotal: item.quantity * item.price,
        };
    });

    const herramientasRiesgo = herramientas
        .filter(h => h.prestamos > 0)
        .sort((a, b) => b.prestamos - a.prestamos);

    const herramientasDormidas = herramientas
        .filter(h => h.diasSinMov > 30 && h.quantity > 0)
        .sort((a, b) => b.diasSinMov - a.diasSinMov)
        .slice(0, 5);

    // ── 3. Alertas de Reabastecimiento ───────────────────────────────────────
    const alertas = items
        .filter(i => i.quantity <= i.minStock)
        .map(i => {
            const consumo7 = last7
                .filter(m => m.itemId === i.id && m.type === MovementType.CHECK_OUT)
                .reduce((s, m) => s + m.quantity, 0);
            const diasRestantes = consumo7 > 0 ? Math.floor((i.quantity / (consumo7 / 7))) : null;
            return { ...i, consumo7, diasRestantes };
        })
        .sort((a, b) => {
            if (a.quantity === 0 && b.quantity > 0) return -1;
            if (b.quantity === 0 && a.quantity > 0) return 1;
            return (a.quantity / Math.max(a.minStock, 1)) - (b.quantity / Math.max(b.minStock, 1));
        })
        .slice(0, 8);

    // ── 4. Top movimientos ────────────────────────────────────────────────────
    const movPorItem = items.map(i => ({
        ...i,
        totalMovs: movements.filter(m => m.itemId === i.id).length,
        salidas30: last30.filter(m => m.itemId === i.id && m.type === MovementType.CHECK_OUT).reduce((s, m) => s + m.quantity, 0),
    })).sort((a, b) => b.salidas30 - a.salidas30).slice(0, 5);

    // ── 5. Categorías por gasto ──────────────────────────────────────────────
    const gastoPorCat: Record<string, number> = {};
    expenseItems.forEach(i => {
        gastoPorCat[i.category] = (gastoPorCat[i.category] || 0) + i.quantity * i.price;
    });
    const topCats = Object.entries(gastoPorCat)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // ── GENERAR MARKDOWN ──────────────────────────────────────────────────────
    let md = `# 📊 Reporte de Inventario\n`;
    md += `**Generado:** ${now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
    md += `---\n\n`;

    // Bloque de KPIs
    md += `## 💰 Resumen de Inversión\n\n`;
    md += `| Concepto | Valor |\n|---|---|\n`;
    md += `| **Materiales en stock** (consumo + EPP) | **${fmt(totalInversion)}** |\n`;
    md += `| Herramientas en inventario | ${fmt(totalActivos)} |\n`;
    md += `| Compras últimos 30 días | ${fmt(compras30)} |\n`;
    md += `| Mermas últimos 30 días | ${mermas30 > 0 ? `⚠️ ${fmt(mermas30)}` : `✅ ${fmt(0)}`} |\n`;
    md += `| Ítems bajo stock mínimo | ${alertas.length === 0 ? '✅ Ninguno' : `🔴 **${alertas.length} ítems**`} |\n\n`;

    if (topCats.length > 0) {
        md += `**Inversión por categoría:**\n`;
        topCats.forEach(([cat, val]) => {
            const bar = '█'.repeat(Math.round((val / totalInversion) * 20));
            md += `- ${cat}: ${fmt(val)} ${bar}\n`;
        });
        md += '\n';
    }

    // Control de activos
    md += `---\n\n## 🛠️ Control de Activos (Herramientas)\n\n`;
    md += `| Tipo | Cantidad | Valor Total | En préstamo | Riesgo |\n|---|---|---|---|---|\n`;
    [InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL].forEach(tipo => {
        const grupo = herramientas.filter(h => h.inventoryType === tipo);
        const total = grupo.reduce((s, h) => s + h.quantity, 0);
        const valor = grupo.reduce((s, h) => s + h.valorTotal, 0);
        const prestados = grupo.reduce((s, h) => s + h.prestamos, 0);
        const riesgo = prestados > 3 ? '🔴 Alto' : prestados > 0 ? '🟡 Medio' : '🟢 OK';
        md += `| ${tipo} | ${total} uds | ${fmt(valor)} | ${prestados} | ${riesgo} |\n`;
    });

    if (herramientasRiesgo.length > 0) {
        md += `\n**⚠️ Herramientas con préstamos pendientes:**\n`;
        herramientasRiesgo.slice(0, 5).forEach(h => {
            md += `- **${h.name}**: ${h.prestamos} préstamo(s) sin retornar — stock actual: ${h.quantity}\n`;
        });
        md += '\n';
    }

    if (herramientasDormidas.length > 0) {
        md += `**💤 Herramientas sin movimiento +30 días:**\n`;
        herramientasDormidas.forEach(h => {
            md += `- ${h.name}: ${h.diasSinMov} días inactiva (${h.quantity} en stock)\n`;
        });
        md += '\n';
    }

    // Alertas de reabastecimiento
    md += `---\n\n## 🚨 Alertas de Reabastecimiento\n\n`;
    if (alertas.length === 0) {
        md += `✅ **Todo el inventario está por encima del stock mínimo.**\n\n`;
    } else {
        md += `| # | Ítem | Stock actual | Mínimo | Estado | Consumo/semana |\n|---|---|---|---|---|---|\n`;
        alertas.forEach((a, i) => {
            const estado = a.quantity === 0 ? '🔴 AGOTADO' : '🟠 BAJO';
            const consumo = a.consumo7 > 0 ? `${a.consumo7} ${a.unit}` : '—';
            md += `| ${i + 1} | ${a.name} | ${a.quantity} ${a.unit} | ${a.minStock} ${a.unit} | ${estado} | ${consumo} |\n`;
        });
        md += '\n';

        const agotados = alertas.filter(a => a.quantity === 0);
        if (agotados.length > 0) {
            md += `> 🔴 **URGENTE:** ${agotados.map(a => a.name).join(', ')} — stock en cero.\n\n`;
        }
    }

    // Top materiales consumidos
    md += `---\n\n## 📈 Top Materiales Consumidos (últimos 30 días)\n\n`;
    if (movPorItem.filter(m => m.salidas30 > 0).length === 0) {
        md += `Sin movimientos de salida en los últimos 30 días.\n\n`;
    } else {
        md += `| Ítem | Tipo | Salidas (30d) |\n|---|---|---|\n`;
        movPorItem.filter(m => m.salidas30 > 0).forEach(m => {
            md += `| ${m.name} | ${m.inventoryType} | ${m.salidas30} ${m.unit} |\n`;
        });
        md += '\n';
    }

    // Recomendaciones basadas en datos reales
    md += `---\n\n## 💡 Recomendaciones\n\n`;
    const recs: string[] = [];

    if (mermas30 > 0) recs.push(`⚠️ Se registraron **${fmt(mermas30)}** en mermas este mes. Implementa control doble en despachos de materiales de alto costo.`);
    if (herramientasRiesgo.length > 2) recs.push(`🔑 Hay **${herramientasRiesgo.length} herramientas** con préstamos sin retorno. Considera un sistema de fianza o registro de responsabilidad firmado.`);
    if (herramientasDormidas.length > 0) recs.push(`💤 **${herramientasDormidas.length} herramientas** llevan más de 30 días sin uso. Evalúa si están siendo utilizadas en campo sin registro formal.`);
    if (alertas.filter(a => a.quantity === 0).length > 0) recs.push(`🛒 Hay ítems **agotados** que pueden estar bloqueando la operación. Genera orden de compra inmediata.`);
    if (compras30 > totalInversion * 0.3) recs.push(`📦 Las compras del último mes representan el ${pct(compras30, totalInversion)} de tu stock actual. Revisa si los pedidos están bien calibrados.`);
    if (recs.length === 0) recs.push(`✅ El inventario está en buen estado. Continúa con los controles actuales.`);

    recs.forEach(r => { md += `${r}\n\n`; });

    md += `---\n*Reporte generado automáticamente | ${items.length} ítems | ${movements.length} movimientos totales*`;
    return md;
};

// ─── ANÁLISIS DE ROTACIÓN ────────────────────────────────────────────────────

export const generateRotationAnalysis = async (
    rotationData: { subCategory: string; totalOut: number; frequency: number }[]
): Promise<{ [key: string]: { recommendation: string; severity: string } }> => {

    const result: { [key: string]: { recommendation: string; severity: string } } = {};

    if (!rotationData || rotationData.length === 0) return result;

    const maxOut = Math.max(...rotationData.map(r => r.totalOut), 1);
    const maxFreq = Math.max(...rotationData.map(r => r.frequency), 1);

    rotationData.forEach(({ subCategory, totalOut, frequency }) => {
        const rotScore = (totalOut / maxOut) * 0.6 + (frequency / maxFreq) * 0.4;

        let recommendation: string;
        let severity: string;

        if (rotScore >= 0.7) {
            severity = 'CRITICAL';
            recommendation = 'Alta demanda. Mantener stock doble y revisar proveedor.';
        } else if (rotScore >= 0.45) {
            severity = 'HIGH';
            recommendation = 'Rotación alta. Reabastecer semanalmente.';
        } else if (rotScore >= 0.2) {
            severity = 'MEDIUM';
            recommendation = 'Rotación moderada. Revisar stock cada 15 días.';
        } else if (totalOut === 0) {
            severity = 'LOW';
            recommendation = 'Sin movimiento. Verificar necesidad real en obra.';
        } else {
            severity = 'LOW';
            recommendation = 'Baja rotación. Mantener stock mínimo.';
        }

        result[subCategory] = { recommendation, severity };
    });

    return result;
};
