import { GoogleGenAI, Type } from "@google/genai";
import { Item, Movement } from "../types";

// FIX: Conditionally initialize GoogleGenAI to prevent crashing when API_KEY is not set.
let ai: GoogleGenAI | undefined;
// FIX: Use process.env.API_KEY directly in initialization as per guidelines.
if (process.env.API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} else {
  console.warn("API_KEY environment variable not set. AI features will be disabled.");
}

export const generateInventoryAnalysis = async (items: Item[], movements: Movement[]): Promise<string> => {
    // FIX: Check for the initialized 'ai' instance instead of the API_KEY string.
    if(!ai) {
        return "Error: La clave de API de Gemini no está configurada. Por favor, configure la variable de entorno API_KEY.";
    }

  // FIX: Enriched movement data with item name and category for better AI analysis.
  const movementData = movements.map(m => {
    const item = items.find(i => i.id === m.itemId);
    return {
        item_nombre: item?.name || 'Desconocido',
        item_categoria: item?.category || 'Desconocida',
        tipo: m.type,
        cantidad: m.quantity,
        fecha: m.timestamp.toLocaleDateString()
    };
  });

  const prompt = `
    Analiza el siguiente estado de inventario y movimientos de una bodega de materiales de construcción y genera un resumen ejecutivo.

    **Contexto:**
    Eres un asistente de gestión de inventarios experto (impulsado por Gemini 3 Pro). Tu objetivo es proporcionar un análisis estratégico, claro y conciso que ayude a la toma de decisiones operativa.

    **Datos de Inventario Actual (Items):**
    ${JSON.stringify(items.map(i => ({nombre: i.name, categoria: i.category, cantidad: i.quantity, stock_minimo: i.minStock, precio_unitario: i.price})), null, 2)}

    **Historial de Movimientos Recientes (Movimientos):**
    ${JSON.stringify(movementData, null, 2)}

    **Tu Tarea:**
    Genera un informe en formato Markdown con las siguientes secciones:
    1.  **Resumen General:** Un párrafo breve sobre el estado de salud del inventario.
    2.  **Alertas de Stock Bajo:** Lista de los 5 artículos más urgentes que están por debajo o cerca de su stock mínimo. Incluye el nombre, la cantidad actual y el stock mínimo.
    3.  **Análisis de Gastos:** Calcula el valor total del inventario actual y el gasto total en compras (movimientos de tipo "Compra") y mermas (movimientos de tipo "Merma").
    4.  **Tendencias de Uso:** Identifica las 3 categorías de materiales con más salidas (movimientos de tipo "Salida").
    5.  **Recomendaciones Estratégicas:** Proporciona 2 recomendaciones accionables para optimizar el inventario, como sugerencias de compra o revisión de stock mínimo.
    
    El informe debe ser en español.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
    });
    return response.text || "No se pudo generar el reporte.";
  } catch (error) {
    console.error("Error generating inventory analysis:", error);
    return "Se produjo un error al generar el análisis. Por favor, revisa la consola para más detalles.";
  }
};

export const generateRotationAnalysis = async (
    rotationData: { subCategory: string; totalOut: number; frequency: number }[]
): Promise<{ [key: string]: { recommendation: string; severity: string } }> => {
    if (!ai) {
        throw new Error("La clave de API de Gemini no está configurada.");
    }
    
    const prompt = `
        Analiza los siguientes datos de rotación de inventario de sub-categorías de una bodega de construcción. 
        Para cada sub-categoría, proporciona una recomendación concisa y accionable y un nivel de severidad.

        Datos de Rotación (últimos 30 días):
        ${JSON.stringify(rotationData.map(d => ({ sub_categoria: d.subCategory, total_salidas: d.totalOut, frecuencia_salidas: d.frequency })), null, 2)}

        Tu Tarea:
        Genera una respuesta en formato JSON que sea un array de objetos según el esquema proporcionado.
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                subCategory: { type: Type.STRING },
                recommendation: { type: Type.STRING, description: "Recomendación en español (máx 15 palabras)." },
                severity: { 
                    type: Type.STRING,
                    enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
                    description: "Nivel de severidad: CRITICAL, HIGH, MEDIUM, o LOW."
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
        
        const text = response.text;
        if (!text) return {};

        const parsedResponse = JSON.parse(text);

        const recommendationsMap: { [key: string]: { recommendation: string; severity: string } } = {};
        if (Array.isArray(parsedResponse)) {
            for (const item of parsedResponse) {
                if(item.subCategory) {
                    recommendationsMap[item.subCategory] = {
                        recommendation: item.recommendation,
                        severity: item.severity,
                    };
                }
            }
        }
        return recommendationsMap;

    } catch (error) {
        console.error("Error generating rotation analysis:", error);
        throw new Error("Se produjo un error al generar el análisis de rotación.");
    }
};