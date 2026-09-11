/**
 * El identificador que impide el doble registro.
 *
 * Es la pieza que hace seguro que un asistente de IA mande el bloque: un bot
 * reintenta cuando se le pierde la respuesta, y un dedo toca dos veces. Sin
 * esto, cada reintento despacha otra vez y la bodega pierde material de verdad.
 *
 * La función está adentro de `api/despacho.ts` porque es su regla, no una
 * utilidad general. Acá se reproduce la misma fórmula para poder probarla sin
 * levantar un servidor ni tener claves.
 */
import { createHash } from 'node:crypto';
import { igual, esCierto, grupo, cerrar } from './correr';

const idDeterminista = (operacionId: string, indice: number): string => {
    const h = createHash('sha256').update(`${operacionId}:${indice}`).digest('hex');
    const v = (parseInt(h[16], 16) & 0x3 | 0x8).toString(16);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

grupo('el mismo envío da el mismo identificador', () => {
    // Mandar el bloque dos veces con la misma operación produce las mismas
    // filas; la base rechaza la repetida por clave primaria y no hay duplicado.
    igual(idDeterminista('lunes-7am', 0), idDeterminista('lunes-7am', 0), 'reintento idéntico');
    igual(idDeterminista('lunes-7am', 3), idDeterminista('lunes-7am', 3), 'renglón cuatro también');
});

grupo('envíos distintos NO chocan', () => {
    esCierto(idDeterminista('lunes-7am', 0) !== idDeterminista('lunes-8am', 0), 'otra operación, otro id');
    esCierto(idDeterminista('lunes-7am', 0) !== idDeterminista('lunes-7am', 1), 'otro renglón, otro id');
});

grupo('es un UUID válido de verdad', () => {
    // Si no lo fuera, Postgres rechaza la fila y el despacho falla entero.
    for (const [op, i] of [['a', 0], ['operacion-larga-con-guiones', 12], ['ñ', 3]] as const) {
        esCierto(UUID.test(idDeterminista(op, i)), `versión y variante correctas: ${op}:${i}`);
    }
});

grupo('no se repite en un lote grande', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 200; i++) vistos.add(idDeterminista('un-bloque-de-60-cosas', i));
    igual(vistos.size, 200, '200 renglones, 200 identificadores');
});

cerrar();
