
import { GoogleGenAI, Type } from "@google/genai";
import { Item, Movement } from "../types";

// Parche para TypeScript en Vercel
declare const process: any;

// Genera un análisis profundo del inventario utilizando Gemini 3 Pro
export const generateInventoryAnalysis = async (items: Item[], movements: Movement[]): Promise<string> => {
    if (!process.env.API_KEY) {
        return "Error: La clave de API de Gemini no está configurada.";
    }

    // Always create a new instance right before use to ensure the latest API key from process.env is used.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const movementData = movements.map(m => {
        const item = items.find(i => i.id === m.itemId);
        return {
            item_nombre: item?.name || 'Desconocido',
            item_tipo: item?.inventoryType || 'Desconocido',
            tipo_mov: m.type,
            cantidad: m.quantity,
            fecha: m.timestamp.toLocaleDateString()
        };
    });

    const prompt = `
    Analiza el inventario de una bodega de construcción en Colombia.
    
    **Reglas de Negocio Importantes:**
    1. Las herramientas (Manuales y Eléctricas) son ACTIVOS. No son gastos directos, sino préstamos.
    2. Los materiales de consumo y EPP son GASTOS. Generan el costo real de la obra.
    3. La moneda es el Peso Colombiano (COP).
    4. Tu objetivo es ayudar al bodeguero a saber qué se está gastando y qué herramientas están en riesgo de pérdida.

    **Datos Actuales:**
    Items: ${JSON.stringify(items.map(i => ({ nombre: i.name, tipo: i.inventoryType, cant: i.quantity, precio: i.price })), null, 2)}
    Movimientos: ${JSON.stringify(movementData, null, 2)}

    **Genera un reporte Markdown con:**
    1. Resumen de Inversión (en COP): Solo suma el valor de materiales de consumo y EPP.
    2. Control de Activos: Cuántas herramientas hay en stock vs qué tanto se mueven.
    3. Alertas de Reabastecimiento: Top 5 materiales urgentes por comprar.
    4. Recomendaciones: Consejos para evitar mermas en materiales y robo de herramientas.
    
    Responde en español con un tono profesional y directo.
  `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
        });
        return response.text || "No se pudo generar el reporte.";
    } catch (error) {
        console.error("Error generating inventory analysis:", error);
        return "Error al generar análisis con IA.";
    }
};

// Genera recomendaciones de rotación de stock utilizando Gemini 3 Pro con salida JSON
export const generateRotationAnalysis = async (
    rotationData: { subCategory: string; totalOut: number; frequency: number }[]
): Promise<{ [key: string]: { recommendation: string; severity: string } }> => {
    if (!process.env.API_KEY) {
        throw new Error("Clave de API no configurada.");
    }

    // Always create a new instance right before use to ensure the latest API key from process.env is used.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
        Analiza la rotación de materiales de construcción en Colombia. 
        Datos: ${JSON.stringify(rotationData, null, 2)}
        Genera recomendaciones breves de compra o control para cada sub-categoría.
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                subCategory: { type: Type.STRING },
                recommendation: { type: Type.STRING, description: "Máximo 12 palabras." },
                severity: { 
                    type: Type.STRING,
                    enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
                },
            },
            required: ["subCategory", "recommendation", "severity"]
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
        
        const parsedResponse = JSON.parse(response.text || "[]");
        const recommendationsMap: { [key: string]: { recommendation: string; severity: string } } = {};
        if (Array.isArray(parsedResponse)) {
            parsedResponse.forEach(item => {
                if(item.subCategory) recommendationsMap[item.subCategory] = { recommendation: item.recommendation, severity: item.severity };
            });
        }
        return recommendationsMap;
    } catch (error) {
        console.error("Error generating rotation analysis:", error);
        return {};
    }
};
