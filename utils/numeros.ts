/**
 * utils/numeros.ts — Leer una cantidad de un campo de texto
 * =========================================================
 * Existe porque toda la app usaba `parseInt`, y `parseInt` NO ES PARA ESTO.
 *
 * En esta bodega no todo se cuenta entero: la manguera va en metros, el cemento
 * en kilos, la pintura en galones. `parseInt('1.5')` devuelve `1`. Medio metro
 * de manguera se perdía al teclearlo, sin aviso y sin forma de notarlo después
 * —el número que queda guardado se ve perfectamente correcto—.
 *
 * El mismo `parseInt` estaba en once campos distintos de seis pantallas. Lo que
 * se arregla acá es la lectura, en un solo sitio, para que no vuelva a
 * divergir.
 */

/**
 * Lee una cantidad escrita a mano, con coma o con punto.
 *
 * La coma cuenta: en Colombia se escribe «1,5», y el teclado numérico del
 * celular pone coma. `Number('1,5')` es `NaN`, así que sin esto un decimal
 * tecleado normal caería al mínimo.
 *
 * `minimo` es el piso: 0 para un stock que puede quedar vacío, 1 para una
 * cantidad que se está pidiendo. Vacío o ilegible devuelve el piso, que es lo
 * mismo que hacía el `|| 0` de antes.
 */
export const cantidadDeTexto = (texto: string, minimo = 0): number => {
    const n = Number(String(texto ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) ? Math.max(minimo, n) : minimo;
};
