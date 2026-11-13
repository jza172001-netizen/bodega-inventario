/**
 * La bodega se agrupa sola (13-nov-2026).
 *
 * Juli: «Tubería y accesorios → Tubos (por color) | Accesorios (codos, T, Y,
 * bujes…) → la pulgada → la cantidad. Y que todo se agrupe solo.» Los nombres
 * de abajo son los de PRODUCCIÓN leídos el 13-nov, no inventados.
 */
import { InventoryType, Item } from '../types';
import { clasificar, normalizarMedidas, sugerenciasDeOrden, RUTA_TUBOS, RUTA_ACCESORIOS, UNIDAD_TUBO } from '../core/taxonomia';
import { fichaDelBloque } from '../core/crearItem';
import { medidaDicha, sinLargo } from '../utils/lote';
import { denominacionesDe } from '../utils/medida';
import { igual, esCierto, grupo, cerrar } from './correr';

const it = (id: string, name: string, familia?: string, extra: Partial<Item> = {}): Item =>
    ({ id, name, familia, quantity: 3, inventoryType: InventoryType.SINGLE_USE, category: 'Materiales', subCategory: '', minStock: 0, price: 1500, unit: 'unidades', ...extra });

const C = InventoryType.SINGLE_USE;
const lugar = (n: string) => clasificar({ name: n, inventoryType: C });

grupo('los tubos van por color, y el nombre queda limpio', () => {
    igual(lugar('Tubos amarillo sanitario 2" enteros 6 m'),
        { ruta: RUTA_TUBOS, familia: 'Tubería amarilla', nombre: 'Tubería amarilla 2"', unidad: UNIDAD_TUBO },
        'el tubo del 13-nov: la amarilla ES la sanitaria, y el largo no es el nombre');
    igual(lugar('Tubos Naranja 2"')?.nombre, 'Tubería naranja 2"', 'naranja');
    igual(lugar('Tubería blanca 1/2"')?.familia, 'Tubería blanca', 'blanca');
    igual(lugar('tubo verde 4"')?.familia, 'Tubería verde', 'verde');
    igual(lugar('Tubo gris 3"')?.familia, 'Tubería gris', 'gris');
    igual(lugar('Tubos 2"')?.familia, 'Tubería', 'sin color: la familia Tubería, no se inventa uno');
});

grupo('los accesorios van a su familia, y la medida se escribe una sola vez', () => {
    igual(lugar('Codos 2"'), { ruta: RUTA_ACCESORIOS, familia: 'Codos', nombre: 'Codos 2"' }, 'codo');
    igual(lugar('Y 4_4')?.nombre, 'Y 4"', '«4_4» es 4"');
    igual(lugar('Y 4-2')?.nombre, 'Y 4"-2"', 'la reducción queda reducción');
    igual(lugar('Y 6"-6" 6"-6"')?.nombre, 'Y 6"', 'la familia rota de producción se arregla');
    igual(lugar('Codos 4"-2"')?.nombre, 'Codos 4"-2"', 'la reducción con comillas no se daña');
    igual(lugar('Unión 2"')?.nombre, 'Uniones 2"', 'unión');
    igual(lugar('Sifón 2"')?.familia, 'Sifones', 'sifón');
    igual(lugar('T 2"')?.familia, 'T', 'T');
    igual(lugar('Semicodos 6"')?.familia, 'Semicodos', 'semicodo');
    igual(lugar('Bujes pvc')?.nombre, 'Bujes pvc', 'sin medida no se inventa una');
    igual(lugar('Codos 1 1/2')?.nombre, 'Codos 1 1/2"', 'la fracción va junta');
    igual(normalizarMedidas('2 1/2'), '2 1/2"', 'dos y media');
});

grupo('lo que no es tubería NO se toca', () => {
    for (const n of ['Pega pvc', 'Lija 180', 'Pala', 'Estuco tipo 3', 'Brocha 2"'])
        igual(lugar(n), null, `${n}: sin lugar adivinado`);
    igual(clasificar({ name: 'Llave 2"', inventoryType: InventoryType.HAND_TOOL }), null, 'una herramienta nunca entra al árbol de tubería');
    igual(clasificar({ name: 'Codos 2"', inventoryType: InventoryType.ACCESSORY }), null, 'solo material de consumo');
});

grupo('«Agrupar solo»: cambia lugar y nombre, NUNCA cantidad', () => {
    const bodega = [
        it('a', 'Tubos amarillo sanitario 2" enteros 6 m', 'Tubos'),
        it('b', 'Codos 2"', 'Codos', { quantity: 7 }),
        it('c', 'Y 4_4', 'Y'),
        it('d', 'Pala', 'Pala', { inventoryType: InventoryType.HAND_TOOL }),
        it('e', 'Pega pvc', 'Pega'),
    ];
    const cambios = sugerenciasDeOrden(bodega);
    igual(cambios.map(c => c.id).sort(), ['a', 'b', 'c'], 'solo la tubería');
    for (const c of cambios) {
        const antes = bodega.find(i => i.id === c.id)!;
        igual([c.quantity, c.price, c.unit, c.inventoryType], [antes.quantity, antes.price, antes.unit, antes.inventoryType], `${antes.name}: cantidad, precio y tipo intactos`);
    }
    igual(cambios.find(c => c.id === 'b')?.ruta, RUTA_ACCESORIOS, 'el codo queda en Accesorios');
    const aplicado = bodega.map(i => cambios.find(c => c.id === i.id) ?? i);
    igual(sugerenciasDeOrden(aplicado), [], 'aplicado una vez, no queda nada por hacer');
});

grupo('«Agrupar solo» no fabrica gemelos', () => {
    // «Y 4_4» y «Y 4"» quedarían los dos «Y 4"»: se ubican, pero no se renombran.
    const bodega = [it('x', 'Y 4_4', 'Y'), it('y', 'Y 4"', 'Y')];
    const cambios = sugerenciasDeOrden(bodega);
    igual(cambios.find(c => c.id === 'x')?.name, 'Y 4_4', 'no se renombra al choque');
    igual(cambios.find(c => c.id === 'x')?.ruta, RUTA_ACCESORIOS, 'pero sí se ubica');
    // Y contra un ítem que no es tubería y ya tiene ese nombre, tampoco.
    const otro = [it('p', 'Unión 2"', 'Unión'), it('q', 'Uniones 2"', 'Uniones', { inventoryType: InventoryType.ACCESSORY })];
    igual(sugerenciasDeOrden(otro).find(c => c.id === 'p')?.name, 'Unión 2"', 'no choca con lo que ya existe');
});

grupo('lo dictado: el largo no es el nombre, y «y media» es media pulgada', () => {
    igual(medidaDicha('tubo amarillo sanitario de 2 pulgadas que mide 6 m'), { base: 'tubo amarillo sanitario', medida: '2"' }, 'el 13-nov salía null');
    igual(medidaDicha('codo de uno y media'), { base: 'codo', medida: '1 1/2"' }, 'uno y media');
    igual(medidaDicha('codo de una y media'), { base: 'codo', medida: '1 1/2"' }, 'una y media');
    igual(medidaDicha('codo de 2 y medio'), { base: 'codo', medida: '2 1/2"' }, 'dos y medio en número');
    igual(medidaDicha('codo de tres y media'), { base: 'codo', medida: '3 1/2"' }, 'tres y media');
    igual(medidaDicha('codo de 3 1/2'), { base: 'codo', medida: '3 1/2"' }, '3 1/2');
    igual(sinLargo('tubos naranja de 4 enteros de 6 metros'), 'tubos naranja de 4', 'enteros y metros se sueltan');
    igual(sinLargo('6 m'), '6 m', 'si no queda nada, era el nombre');
    esCierto(denominacionesDe([], undefined, 'Codos').includes('3 1/2"'), 'la escalera trae 3 1/2"');
});

grupo('el ítem que nace en el bloque cae solo en su lugar', () => {
    const f = fichaDelBloque('tubo amarillo sanitario de 2 pulgadas que mide 6 m', C, []);
    igual([f.name, f.familia, f.ruta, f.unit, f.quantity], ['Tubería amarilla 2"', 'Tubería amarilla', RUTA_TUBOS, UNIDAD_TUBO, 0], 'tubo');
    const c = fichaDelBloque('codo de uno y media', C, []);
    igual([c.name, c.familia, c.ruta], ['Codos 1 1/2"', 'Codos', RUTA_ACCESORIOS], 'codo');
    const l = fichaDelBloque('lija 180', C, [it('l', 'Lija 240', 'Lija', { ruta: 'Pintura' })]);
    igual([l.name, l.ruta], ['Lija 180', 'Pintura'], 'lo demás sigue al hermano, como antes');
    // Si la familia ya tiene hermanos, mandan ellos: lo que Juli organizó a mano no se pisa.
    const h = fichaDelBloque('codo de 3', C, [it('k', 'Codo 2"', 'Codo', { ruta: 'Mi tubería' })]);
    igual([h.name, h.familia, h.ruta], ['Codo 3"', 'Codo', 'Mi tubería'], 'el hermano manda sobre la regla');
});

await cerrar();
