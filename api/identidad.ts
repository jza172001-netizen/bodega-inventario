/**
 * api/identidad.ts — El identificador que impide el doble registro
 * ================================================================
 * Vive aparte de `api/despacho.ts` por una razón concreta y aprendida: la
 * prueba que lo cubría **copiaba la fórmula** en vez de importarla, porque el
 * endpoint arrastra `@supabase/supabase-js` y no se puede cargar sin claves.
 * Esa copia pasaba en verde mientras la fórmula de verdad tenía un defecto que
 * reportaba registros falsos. Una prueba contra una copia no prueba nada.
 *
 * Acá no hay red ni claves ni React: se puede importar desde una prueba tal
 * cual se despliega.
 */

import { createHash } from 'node:crypto';
import { Movement } from '../types';

/** Un UUID válido deducido de una semilla, con versión y variante en su sitio. */
export const uuidDe = (semilla: string): string => {
    const h = createHash('sha256').update(semilla).digest('hex');
    const v = (parseInt(h[16], 16) & 0x3 | 0x8).toString(16);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/**
 * El identificador se deriva de LO QUE NO CAMBIA ENTRE REINTENTOS.
 *
 * Antes salía del índice del plan **después de filtrar los rechazos**, y ese
 * índice se corre. Reproducción real: hay una pala y tres martillos, se pide
 * «Alex: 1 pala, 1 martillo», la pala se guarda y el martillo falla. Al
 * reintentar, la pala ya no tiene stock y se rechaza, el martillo pasa a ocupar
 * el índice cero —que era el de la pala— y su identificador choca con el
 * movimiento de la pala. El endpoint leía «clave repetida» como «ya estaba
 * guardado» y respondía que registró el martillo. **En la base no había
 * martillo.**
 *
 * O sea: la pieza que existía para impedir el doble registro se había vuelto
 * una máquina de reportar registros falsos.
 *
 * Ahora la semilla es la operación más la identidad del movimiento: ítem,
 * persona, tipo y cantidad. Eso no se mueve porque otro renglón se caiga. El
 * sufijo `repeticion` distingue una misma cosa pedida dos veces en el mismo
 * bloque, y por eso se cuenta por firma y no por posición.
 */
export const idDeterminista = (
    operacionId: string,
    m: Omit<Movement, 'id'>,
    repeticion: number,
): string =>
    uuidDe([
        operacionId,
        m.itemId,
        m.personnelId ?? '',
        m.type,
        String(m.quantity),
        String(repeticion),
    ].join('|'));

/** La firma con la que se cuentan las repeticiones dentro de un mismo bloque. */
export const firmaDe = (m: Omit<Movement, 'id'>): string =>
    `${m.itemId}|${m.personnelId ?? ''}|${m.type}|${m.quantity}`;
