/**
 * El bloque pegado: lo que la app entiende del texto que produce el asistente.
 *
 * Esta es la puerta por donde entra todo lo de la mañana, así que lo que se
 * prueba acá no es «que funcione» sino las dos cosas que si se rompen duelen:
 * que NO invente (personas, ítems, cantidades) y que NO pierda renglones.
 */
import { leerLote, partirCantidad, contarDudas } from '../utils/lote';
import { InventoryType, Personnel, Item } from '../types';
import { igual, esCierto, grupo, cerrar } from './correr';

const P = (id: string, name: string) => ({ id, name }) as Personnel;
const I = (id: string, name: string, t = InventoryType.HAND_TOOL) =>
    ({ id, name, category: 'x', subCategory: 'x', inventoryType: t, quantity: 10, minStock: 0, unit: 'und' }) as Item;

const gente = [P('1', 'Alex Ferreira'), P('2', 'Juan Puerta'), P('3', 'Duván'), P('4', 'Héctor Quiceno')];
const cosas = [
    I('a', 'Pala'), I('b', 'Martillo'), I('c', 'Pica'), I('d', 'Almádana'),
    I('e', 'Pulidora grande', InventoryType.ELECTRICAL_TOOL),
    I('f', 'Pulidora pequeña', InventoryType.ELECTRICAL_TOOL),
    I('g', 'Manguera', InventoryType.SINGLE_USE),
];

grupo('partirCantidad — números y palabras', () => {
    igual(partirCantidad('3 palas'), { cantidad: 3, nombre: 'palas' }, 'dígito');
    igual(partirCantidad('un martillo'), { cantidad: 1, nombre: 'martillo' }, 'un');
    igual(partirCantidad('una pica'), { cantidad: 1, nombre: 'pica' }, 'una');
    igual(partirCantidad('dos palas'), { cantidad: 2, nombre: 'palas' }, 'dos');
    igual(partirCantidad('quince clavos'), { cantidad: 15, nombre: 'clavos' }, 'quince');
    igual(partirCantidad('palas'), { cantidad: 1, nombre: 'palas' }, 'sin cantidad es una');
    igual(partirCantidad('unas rodilleras'), { cantidad: 1, nombre: 'rodilleras' }, 'artículo suelto');
});

grupo('partirCantidad — decimales', () => {
    // No todo se cuenta entero: la manguera va en metros y el cemento en kilos.
    igual(partirCantidad('1,5 metros de manguera'), { cantidad: 1.5, nombre: 'metros de manguera' }, 'coma decimal');
    igual(partirCantidad('2.5 kilos de clavos'), { cantidad: 2.5, nombre: 'kilos de clavos' }, 'punto decimal');
});

grupo('la coma decimal NO parte el renglón', () => {
    // El bug que encontró la auditoría: "1,5" se partía en "1" y "5 metros...".
    const r = leerLote('Alex: 1,5 manguera, 2 palas', gente, cosas);
    igual(r.lineas.length, 1, 'un renglón');
    igual(r.lineas[0].items.length, 2, 'DOS ítems, no tres');
    igual(r.lineas[0].items[0].cantidad, 1.5, 'el decimal sobrevive');
    igual(r.lineas[0].items[1].cantidad, 2, 'la segunda cantidad es correcta');
});

grupo('varias personas de un pegue', () => {
    const r = leerLote(
        'Alex: 3 palas, 1 martillo y una pica\nJuan Puerta: 2 palas\nDuvan: una almadana',
        gente, cosas,
    );
    igual(r.lineas.length, 3, 'tres personas');
    igual(r.lineas[0].persona?.name, 'Alex Ferreira', 'nombre corto encuentra al largo');
    igual(r.lineas[0].items.length, 3, 'la "y" también separa');
    igual(r.lineas[2].persona?.name, 'Duván', 'sin tilde encuentra con tilde');
    igual(r.lineas[2].items[0].item?.name, 'Almádana', 'el ítem sin tilde también');
});

grupo('plurales — lo más pedido de la bodega', () => {
    // "palas" contra "Pala" no le pega a ninguna capa del buscador; hace falta
    // la segunda pasada por la raíz. Si esto se rompe, no encuentra casi nada.
    const r = leerLote('Alex: 3 palas, 2 picas', gente, cosas);
    igual(r.lineas[0].items[0].item?.name, 'Pala', 'palas → Pala');
    igual(r.lineas[0].items[1].item?.name, 'Pica', 'picas → Pica');
});

grupo('NO inventa', () => {
    const r = leerLote('Fulano Desconocido: 2 palas', gente, cosas);
    igual(r.lineas[0].persona, undefined, 'no crea trabajadores');
    esCierto(r.lineas[0].dudosa, 'y lo marca para revisar');

    // Dos candidatos igual de parecidos: elegir al azar deja el error con cara
    // de correcto, que es peor que no elegir.
    const amb = leerLote('Alex: una pulidora', gente, cosas);
    esCierto(amb.lineas[0].items[0].dudoso, 'pulidora grande vs pequeña: se abstiene');
    esCierto(amb.lineas[0].items[0].candidatos.length >= 2, 'y ofrece las dos');

    const raro = leerLote('Alex: 1 taladro de plasma', gente, cosas);
    igual(raro.lineas[0].items[0].item, undefined, 'no crea ítems');
});

grupo('NO pierde renglones', () => {
    const r = leerLote('Alex: 3 palas\nesto no tiene formato\nJuan Puerta: 1 pica', gente, cosas);
    igual(r.lineas.length, 2, 'los dos que sí se entienden');
    igual(r.ignoradas, ['esto no tiene formato'], 'el ilegible se devuelve, no se bota');
});

grupo('formas de escribir el renglón', () => {
    igual(leerLote('Alex - 3 palas', gente, cosas).lineas[0].persona?.name, 'Alex Ferreira', 'guion como separador');
    igual(leerLote('  Alex:  3 palas  ', gente, cosas).lineas[0].items[0].cantidad, 3, 'espacios de sobra');
    igual(leerLote('', gente, cosas).lineas.length, 0, 'texto vacío no rompe');
    igual(leerLote('Alex: 3 palas; 1 pica', gente, cosas).lineas[0].items.length, 2, 'punto y coma');
});

grupo('contarDudas', () => {
    const r = leerLote('Alex: 3 palas\nFulano: 1 pica\nbasura', gente, cosas);
    igual(contarDudas(r), 2, 'la persona sin resolver y el renglón ilegible');
});

cerrar();
