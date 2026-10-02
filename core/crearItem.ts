/**
 * core/crearItem.ts — Cómo nace un ítem que la bodega no conocía
 * ==============================================================
 * El bloque creaba el ítem con el nombre tal cual se dictó: «codos de 5» nacía
 * llamado «codos de 5», sin familia, sin medida, sin el género de sus hermanos.
 * El chat hace mucho más (familia canónica, nombre corregido, familia + género
 * + medida en consumibles, hereda la subcategoría del hermano). Esto trae al
 * bloque lo mismo, como funciones puras y probadas.
 *
 * Fase B (después de la prueba del viernes): el «+ Crear nuevo» del chat pasa a
 * usar estas mismas funciones, y queda UNA sola manera de crear.
 */

import { InventoryType, Item } from '../types.js';
import { familiaCanonica, familiaDe, nombreCorregido, normStr, raizDeFamilia } from '../utils/genus.js';
import { nombreCompuesto } from '../utils/medida.js';
import { medidaDicha } from '../utils/lote.js';

export interface Piezas { genero?: string; denominacion?: string }

const conMayuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/**
 * El nombre con que nace, a partir de lo dicho: «codos de 5» → «Codos 5"».
 * La medida dicha se separa y vuelve como denominación; lo que se elija en
 * pantalla (género, medida) manda sobre lo dicho.
 */
export const nombreDelDicho = (dicho: string, piezas: Piezas = {}): string => {
    const d = medidaDicha(dicho);
    const base = (d?.base ?? dicho).trim();
    const denominacion = piezas.denominacion?.trim() || d?.medida || '';
    return nombreCompuesto(conMayuscula(base), piezas.genero?.trim(), denominacion);
};

/** Lo que se dijo, sin la medida: la familia que se le ofrece a `PasosDeNombre`. */
export const baseDelDicho = (dicho: string): string => conMayuscula((medidaDicha(dicho)?.base ?? dicho).trim());

const ES_HERRAMIENTA = new Set<InventoryType>([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL]);

/**
 * La ficha del ítem nuevo, con las reglas del chat:
 *  · la familia se escribe como YA está en la bodega («codos» → «Codos»);
 *  · el nombre se corrige a esa familia;
 *  · hereda la subcategoría, la unidad y la `ruta` (Tubería › Accesorios) del
 *    hermano, para caer donde están los suyos.
 * Nace con cantidad CERO: la entrada la pone después «lo que no haya, cargalo».
 */
export const fichaDelBloque = (dicho: string, tipo: InventoryType, items: Item[], piezas: Piezas = {}): Omit<Item, 'id'> => {
    const crudo = nombreDelDicho(dicho, piezas);
    const familia = familiaCanonica(familiaDe(crudo), items);
    const hermano = items.find(i => raizDeFamilia(i.familia?.trim() || familiaDe(i.name)) === raizDeFamilia(familia));
    return {
        name: nombreCorregido(crudo, familia),
        familia,
        ...(hermano?.ruta ? { ruta: hermano.ruta } : {}),
        category: ES_HERRAMIENTA.has(tipo) ? 'Herramientas' : 'Materiales',
        subCategory: hermano?.subCategory ?? '',
        inventoryType: tipo,
        quantity: 0,
        minStock: 0,
        price: 0,
        unit: hermano?.unit ?? 'unidades',
    };
};

/**
 * El que ya existe y es EXACTAMENTE este: mismo tipo y mismo nombre. Si existe,
 * no se crea otro — así nacieron los dos «Bisturi» el 7 de septiembre.
 */
export const identicoDe = (ficha: Pick<Item, 'name' | 'inventoryType'>, items: Item[]): Item | undefined =>
    items.find(i => i.inventoryType === ficha.inventoryType && normStr(i.name) === normStr(ficha.name));
