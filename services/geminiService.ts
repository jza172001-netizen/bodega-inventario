import { GoogleGenAI, Type } from "@google/genai";
import { Item, Movement } from "../types";

declare const process: any;

// Clave con fallback directo para AI Studio
const getApiKey = (): string => {
    if (process?.env?.API_KEY) return process.env.API_KEY;
    if ((window as any).__GEMINI_KEY__) return (window as any).__GEMINI_KEY__;
    return "AIzaSyB-dcPYxSD2K7F8RztjHTo2rldI5k0ZlD0";
};

export const generateInventoryAnalysis = async (items: Item[], movements: Movement[]): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) return "Error: La clave de API de Gemini no esta configurada.";

    const ai = new GoogleGenAI({ apiKey });

    const movementData = movements.map(m => {
        const item = items.find(i => i.id === m.itemId);
        return {
            item_nombre: item?.name || 'Desconocido',
            item_tipo: item?.inventoryType || 'Desconocido',
            tipo_mov: m.type,
            cantidad: m.quantity,
            fecha: m.timestamp instanceof Date ? m.timestamp.toLocaleDateString() : String(m.timestamp)
        };
    });

    const prompt = `
    Analiza el inventario de una bodega de construccion en Colombia.

    **Reglas de Negocio Importantes:**
    1. Las herramientas (Manuales y Electricas) son ACTIVOS. No son gastos directos, sino prestamos.
    2. Los materiales de consumo y EPP son GASTOS. Generan el costo real de la obra.
    3. La moneda es el Peso Colombiano (COP).
    4. Tu objetivo es ayudar al bodeguero a saber que se esta gastando y que herramientas estan en riesgo de perdida.

    **Datos Actuales:**
    Items: ${JSON.stringify(items.map(i => ({ nombre: i.name, tipo: i.inventoryType, cant: i.quantity, precio: i.price })), null, 2)}
    Movimientos: ${JSON.stringify(movementData, null, 2)}

    **Genera un reporte Markdown con:**
    1. Resumen de Inversion (en COP): Solo suma el valor de materiales de consumo y EPP.
    2. Control de Activos: Cuantas herramientas hay en stock vs que tanto se mueven.
    3. Alertas de Reabastecimiento: Top 5 materiales urgentes por comprar.
    4. Recomendaciones: Consejos para evitar mermas en materiales y robo de herramientas.

    Responde en espanol con un tono profesional y directo.
  `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text || "No se pudo generar el reporte.";
    } catch (error) {
        console.error("Error generating inventory analysis:", error);
        return `Error al generar analisis con IA: ${error}`;
    }
};

export const generateRotationAnalysis = async (
    rotationData: { subCategory: string; totalOut: number; frequency: number }[]
): Promise<{ [key: string]: { recommendation: string; severity: string } }> => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Clave de API no configurada.");

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
        Analiza la rotacion de materiales de construccion en Colombia.
        Datos: ${JSON.stringify(rotationData, null, 2)}
        Genera recomendaciones breves de compra o control para cada sub-categoria.
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                subCategory: { type: Type.STRING },
                recommendation: { type: Type.STRING, description: "Maximo 12 palabras." },
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
            model: 'gemini-2.5-flash',
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
                if (item.subCategory) recommendationsMap[item.subCategory] = { recommendation: item.recommendation, severity: item.severity };
            });
        }
        return recommendationsMap;
    } catch (error) {
        console.error("Error generating rotation analysis:", error);
        return {};
    }
};