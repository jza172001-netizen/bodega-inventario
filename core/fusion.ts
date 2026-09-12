/**
 * core/fusion.ts — Qué gana cuando el teléfono y la nube no dicen lo mismo
 * =======================================================================
 * Esta decisión vivía adentro de un `useEffect` de 300 líneas en `App.tsx`, y
 * ahí no se podía probar: corre al arrancar la app, con la red de por medio.
 * Dos fallos vivieron años ahí porque nadie los podía ejercitar.
 *
 * Está afuera por lo mismo que `core/despacho.ts`: es una regla, no una
 * pantalla. Recibe las dos listas y devuelve la que queda. No lee, no escribe,
 * no sincroniza.
 *
 * LAS DOS PREGUNTAS QUE NO SON LA MISMA
 *
 *  · **¿Existe?** — la decide la nube, que es lo compartido entre los dos
 *    celulares. Si allá no está, acá tampoco debería.
 *  · **¿Cómo está?** — la decide la fecha. Una corrección hecha hace un minuto
 *    en el teléfono le gana a la fila vieja de la nube.
 *
 * Confundirlas fue el fallo original: la app elegía un bando fijo, y bandos
 * OPUESTOS para ítems y para movimientos.
 */

import { Item } from '../types';

export interface OpcionesFusion {
    /**
     * **La nube CONTESTÓ.** No es lo mismo que «la nube trajo cosas».
     *
     * Antes cada consulta era un `.catch(() => [])`, y con eso «no hay señal» y
     * «la nube está vacía» llegaban como la misma lista vacía. Son lo contrario:
     * sin señal hay que conservar lo local a toda costa; con la nube vacía, lo
     * local que sobra es basura que ya se borró en otro lado.
     *
     * De confundirlas salía que borrar el último ítem en un celular lo dejara
     * visible **para siempre** en el otro.
     */
    nubeContesto: boolean;
    /**
     * Este dispositivo no tiene nada: instalación nueva, o alguien limpió el
     * navegador. Ahí la nube es todo lo que hay y no hay nada que conservar.
     */
    localVacio: boolean;
}

/** Gana la versión con fecha más nueva. Sin fecha, gana la local. */
export const masReciente = <T extends { id: string; updatedAt?: Date }>(a: T, b?: T): T => {
    if (!b) return a;
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb > ta ? b : a;
};

const claveNombreTipo = (i: Item): string => `${i.name.trim().toLowerCase()}::${i.inventoryType}`;

/**
 * Fusiona los ítems del teléfono con los de la nube.
 *
 * `local` tiene que venir YA SIN LO QUE TIENE LÁPIDA. Eso es lo que hace
 * correcta la regla de abajo: si un ítem llegó hasta acá y no está en la nube,
 * no es un borrado —ese ya se fue— sino uno que nunca alcanzó a subir.
 */
export const fusionarItems = (local: Item[], nube: Item[], opciones: OpcionesFusion): Item[] => {
    if (opciones.localVacio) return nube;

    const idsNube = new Set(nube.map(i => i.id));

    if (opciones.nubeContesto) {
        const localPorId = new Map(local.map(i => [i.id, i]));
        return [
            // La nube manda sobre QUÉ existe; la fecha manda sobre CÓMO está cada
            // uno. Así un ítem borrado sigue borrado y una corrección recién hecha
            // acá deja de perderse.
            ...nube.map(i => masReciente(i, localPorId.get(i.id))),
            /**
             * Lo que está acá y no allá SE CONSERVA.
             *
             * Acá había una condición que solo conservaba los ítems con
             * identificador «temporal», pensada para los creados sin señal. No
             * protegía nada: la normalización previa ya les había puesto un UUID
             * de verdad a todos, así que la condición era siempre falsa y **el
             * ítem creado sin conexión se perdía en la siguiente
             * sincronización**. De dos quedaba uno.
             */
            ...local.filter(i => !idsNube.has(i.id)),
        ];
    }

    /**
     * La nube no contestó: manda el teléfono.
     *
     * Lo de la nube que llegó de antes se agrega solo si no choca por id **ni
     * por nombre y tipo**: sin esa segunda condición, una pala creada acá y otra
     * pala que ya estaba allá quedaban las dos, y el inventario se duplicaba
     * solo cada vez que se abría la app sin señal.
     */
    const idsLocal = new Set(local.map(i => i.id));
    const clavesLocal = new Set(local.map(claveNombreTipo));
    return [
        ...local,
        ...nube.filter(i => !idsLocal.has(i.id) && !clavesLocal.has(claveNombreTipo(i))),
    ];
};

/**
 * ¿Hay que aplicar la lista fusionada, aunque venga vacía?
 *
 * Antes la condición era «que tenga elementos», y con eso borrar el último ítem
 * en un celular lo dejaba visible para siempre en el otro: la lápida lo sacaba
 * de lo local, la fusión quedaba vacía, y una lista vacía no se aplicaba nunca.
 * El dato borrado seguía en pantalla sin forma de quitarlo.
 *
 * Que la nube haya CONTESTADO es lo que vuelve creíble una lista vacía.
 */
export const hayQueAplicar = (fusionada: unknown[], nubeContesto: boolean, huboRemapeos = false): boolean =>
    nubeContesto || fusionada.length > 0 || huboRemapeos;
