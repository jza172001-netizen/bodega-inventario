
/**
 * De un nombre de la bodega saca el MATERIAL y la MEDIDA.
 *
 * Los clavos no se compran "por clavos": se compran de acero o de hierro, y de
 * dos, tres o cuatro pulgadas. Ver "Clavos: 500 unidades" no sirve para pedir
 * nada; ver "Clavos → acero → 2\" : 300" sí.
 *
 * El número del nombre es la MEDIDA, no la cantidad — que es justo la confusión
 * que había: "Clavos acero 1" no es un clavo, es un clavo de una pulgada.
 */
const MATERIALES = [
    'acero', 'hierro', 'galvanizado', 'inoxidable', 'cobre', 'aluminio',
    'bronce', 'plástico', 'plastico', 'pvc', 'madera', 'concreto', 'nylon',
];

export const materialDe = (nombre: string): string | null => {
    const n = nombre.toLowerCase();
    return MATERIALES.find(m => n.includes(m)) ?? null;
};

/**
 * La medida en pulgadas, si el nombre trae un número suelto.
 *
 * Se ignoran los números pegados a una unidad ("500g", "2kg", "3m") y los que
 * van dentro del paréntesis de color y marca, que no son medidas.
 */
export const medidaDe = (nombre: string): string | null => {
    const sinParentesis = nombre.replace(/\s*\([^)]*\)\s*/g, ' ');
    const m = sinParentesis.match(/(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(?:"|''|pulg\w*)?(?![\w.,])/i);
    if (!m) return null;
    const num = m[1].replace(',', '.');
    // Un número pegado a una unidad de peso o largo no es una medida en pulgadas.
    const despues = sinParentesis.slice(m.index! + m[0].length).trimStart().toLowerCase();
    if (/^(kg|g|gr|ml|l|lt|m|cm|mm|km)\b/.test(despues)) return null;
    return `${num}"`;
};
