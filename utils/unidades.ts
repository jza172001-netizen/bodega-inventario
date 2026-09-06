
/**
 * Las unidades con las que se mide en la bodega, en el orden en que se usan.
 *
 * Primero las de todos los días. Los clavos van por LIBRA: una caja puede traer
 * 50 clavos, pero sacar una caja es sacar una libra — la pulgada del nombre es
 * el tamaño, no la cantidad.
 *
 * Estaba escrita a mano y distinta en cada formulario, y en el chat ni siquiera
 * era una lista: se escribía a mano. Así aparecían "und", "Und" y "unidades"
 * como si fueran tres cosas.
 */
export const UNIDADES = [
    'unidades', 'libras', 'kilos', 'gramos', 'litros', 'mililitros',
    'caja', 'bolsa', 'pares', 'rollo', 'pliego', 'galón', 'ton',
    'm', 'cm', 'mm', 'km', 'm²', 'm³', 'yarda',
];

/**
 * La lista para un ítem concreto. Si el ítem trae una unidad que no está —un
 * "Kg" de antes, por ejemplo—, va primera: si no, el select saldría vacío y
 * guardar se la borraría sin avisar.
 */
export const unidadesCon = (actual?: string): string[] =>
    actual && !UNIDADES.includes(actual) ? [actual, ...UNIDADES] : UNIDADES;
