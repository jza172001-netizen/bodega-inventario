/**
 * core/cola.ts — Lo que todavía no llegó al servidor
 * ==================================================
 * LA PROMESA: **nada de lo que se hace en la app se pierde en silencio.**
 *
 * Hasta hoy cada escritura se soltaba y se olvidaba. Si fallaba —sin señal, el
 * servidor caído, un error de red a mitad de la mañana— lo único que pasaba era
 * que el indicador se ponía rojo ocho segundos. La operación no quedaba anotada
 * en ninguna parte y no se volvía a intentar nunca: el movimiento estaba en el
 * teléfono y **no estaba en la bodega compartida**, y nadie se enteraba hasta
 * que los dos celulares mostraban cosas distintas.
 *
 * Acá cada operación queda anotada ANTES de intentarla, sobrevive a cerrar la
 * app, y se reintenta hasta que el servidor la confirme.
 *
 * POR QUÉ SE GUARDA EL NOMBRE DE LA OPERACIÓN Y NO LA PROMESA
 *
 * La versión anterior recibía una promesa **ya lanzada**. Una promesa lanzada no
 * se puede reintentar —ya corrió— ni guardar —no es un dato—. Por eso se guarda
 * QUÉ se quiso hacer (`tipo`) y CON QUÉ (`args`): eso sí es un dato, cabe en el
 * almacenamiento del navegador, y se puede volver a ejecutar mañana.
 *
 * Este archivo no sabe de Supabase ni de React. Recibe y devuelve datos; quien
 * llama decide qué función corresponde a cada `tipo`.
 */

/** Una operación anotada, esperando que el servidor la confirme. */
export interface Operacion {
    /** Identidad estable. Se mantiene entre reintentos, así que no se duplica. */
    id: string;
    /** El nombre de la operación: `addItem`, `logMovementsWithStock`, etc. */
    tipo: string;
    /** Los argumentos, tal como se pasarían a la función. Serializables. */
    args: unknown[];
    /** En cristiano, para que la bandeja lo muestre sin jerga. */
    descripcion: string;
    creadaEn: string;
    intentos: number;
    ultimoError?: string;
    /**
     * Se intentó tantas veces que dejó de intentarse sola.
     *
     * No se borra: se queda a la vista para que un humano decida. Una operación
     * que falla para siempre y desaparece sola es exactamente el fallo que esta
     * cola existe para no repetir.
     */
    bloqueada?: boolean;
}

/**
 * Cuántas veces se reintenta sola antes de pedir ayuda.
 *
 * Cinco y no infinito: una operación rota de verdad —un ítem que ya no existe,
 * una cantidad que la base rechaza— no se arregla insistiendo, y reintentarla
 * cada vez que vuelve la señal tapa las que sí se podrían salvar.
 */
export const LIMITE_INTENTOS = 5;

export const CLAVE_COLA = 'bodega-cola-pendientes';

/**
 * Las fechas vuelven a ser fechas al leerlas.
 *
 * `JSON.stringify` convierte un `Date` en texto y `JSON.parse` lo deja en texto.
 * Si se reintentara así, un movimiento saldría con la marca de tiempo como
 * cadena y el servidor lo rechazaría o lo guardaría mal.
 *
 * El reconocedor es estricto a propósito: exige la forma completa con `T`, hora
 * y `Z`. Ningún nombre de herramienta ni nota de bodega se parece a eso.
 */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const revivir = (_clave: string, valor: unknown): unknown =>
    typeof valor === 'string' && FECHA_ISO.test(valor) ? new Date(valor) : valor;

export interface Almacen {
    getItem: (clave: string) => string | null;
    setItem: (clave: string, valor: string) => void;
}

/** Lee la cola. Si el almacenamiento está roto o vacío, devuelve una vacía. */
export const leerCola = (almacen: Almacen): Operacion[] => {
    try {
        const crudo = almacen.getItem(CLAVE_COLA);
        if (!crudo) return [];
        const datos = JSON.parse(crudo, revivir);
        return Array.isArray(datos) ? datos as Operacion[] : [];
    } catch {
        // Un almacenamiento ilegible no puede tumbar la app. Se empieza vacío.
        return [];
    }
};

/**
 * Guarda la cola.
 *
 * Si el almacenamiento está lleno o bloqueado —ventana privada, cuota
 * agotada— no se revienta: se sigue trabajando en memoria. Perder la cola es
 * malo; perder la app es peor.
 */
export const guardarCola = (almacen: Almacen, cola: Operacion[]): void => {
    try {
        almacen.setItem(CLAVE_COLA, JSON.stringify(cola));
    } catch {
        console.warn('[cola] No se pudo guardar la cola de pendientes');
    }
};

/** Anota una operación al final de la fila. El orden importa y se respeta. */
export const encolar = (
    cola: Operacion[],
    op: { id: string; tipo: string; args: unknown[]; descripcion: string },
    ahora = new Date(),
): Operacion[] => [
    ...cola,
    { ...op, creadaEn: ahora.toISOString(), intentos: 0 },
];

/** El servidor la confirmó: se va de la fila. */
export const confirmar = (cola: Operacion[], id: string): Operacion[] =>
    cola.filter(o => o.id !== id);

/**
 * Falló: se cuenta el intento y se guarda el motivo.
 *
 * Pasado el límite queda BLOQUEADA, no borrada. Deja de intentarse sola y pasa
 * a ser algo que una persona tiene que mirar.
 */
export const marcarFallo = (cola: Operacion[], id: string, error: string): Operacion[] =>
    cola.map(o => {
        if (o.id !== id) return o;
        const intentos = o.intentos + 1;
        return { ...o, intentos, ultimoError: error, bloqueada: intentos >= LIMITE_INTENTOS };
    });

/** Un humano decidió que esta no va. Se va, pero quien llama debe dejar el motivo. */
export const descartar = (cola: Operacion[], id: string): Operacion[] =>
    cola.filter(o => o.id !== id);

/** Un humano la desbloquea para que se vuelva a intentar. */
export const reintentar = (cola: Operacion[], id: string): Operacion[] =>
    cola.map(o => o.id === id ? { ...o, intentos: 0, bloqueada: false, ultimoError: undefined } : o);

/**
 * Las que toca intentar ahora: las no bloqueadas, **en orden**.
 *
 * El orden no es capricho. Un movimiento sobre un ítem recién creado necesita
 * que el ítem haya subido primero, o la base lo rechaza por clave foránea.
 */
export const porIntentar = (cola: Operacion[]): Operacion[] =>
    cola.filter(o => !o.bloqueada);

/** Las que ya nadie va a reintentar solo: lo que la bandeja tiene que gritar. */
export const bloqueadas = (cola: Operacion[]): Operacion[] =>
    cola.filter(o => o.bloqueada);
