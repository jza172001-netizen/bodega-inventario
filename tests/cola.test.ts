/**
 * tests/cola.test.ts — Que nada se pierda en silencio
 * ===================================================
 * El fallo que cubre esta prueba no rompía nada a la vista: una escritura
 * fallaba, el indicador se ponía rojo ocho segundos, y la operación no quedaba
 * anotada en ninguna parte ni se volvía a intentar nunca. El movimiento estaba
 * en el teléfono y NO estaba en la bodega compartida, y eso solo se descubría
 * cuando los dos celulares mostraban cosas distintas.
 *
 * Un rojo de ocho segundos a las siete de la mañana no lo ve nadie.
 */
import {
    Operacion, LIMITE_INTENTOS, CLAVE_COLA,
    leerCola, guardarCola, encolar, confirmar, marcarFallo,
    descartar, reintentar, porIntentar, bloqueadas,
} from '../core/cola';
import { igual, esCierto, grupo, cerrar } from './correr';

/** Un almacenamiento de mentira, para no depender del navegador. */
const almacen = (inicial: Record<string, string> = {}) => {
    const datos = new Map(Object.entries(inicial));
    return {
        getItem: (k: string) => datos.get(k) ?? null,
        setItem: (k: string, v: string) => { datos.set(k, v); },
        ver: () => Object.fromEntries(datos),
    };
};

const op = (id: string, tipo = 'addItem', descripcion = 'Crear algo') =>
    ({ id, tipo, args: [{ name: 'Pala' }, id], descripcion });

grupo('una operación se anota ANTES de intentarla', () => {
    // Ese orden es todo el punto: si la app se cierra con la escritura en vuelo,
    // la operación ya está guardada. Anotarla solo al fallar pierde justo el
    // caso que más duele, que es el corte a mitad.
    const cola = encolar([], op('a'));
    igual(cola.length, 1, 'quedó anotada');
    igual(cola[0].intentos, 0, 'sin intentos todavía');
    esCierto(!!cola[0].creadaEn, 'con su hora');
});

grupo('sobrevive a cerrar la app', () => {
    const a = almacen();
    guardarCola(a, encolar([], op('a', 'addItem', 'Crear la pala')));
    // Otro arranque: otra lectura del mismo almacenamiento.
    const recuperada = leerCola(a);
    igual(recuperada.length, 1, 'sigue ahí');
    igual(recuperada[0].descripcion, 'Crear la pala', 'con lo que decía');
});

grupo('las FECHAS vuelven a ser fechas', () => {
    /**
     * `JSON.stringify` convierte un `Date` en texto y `JSON.parse` lo deja en
     * texto. Reintentando así, un movimiento saldría con la marca de tiempo
     * como cadena y el servidor lo rechazaría o lo guardaría mal.
     */
    const a = almacen();
    const cuando = new Date('2026-09-12T12:00:00.000Z');
    guardarCola(a, encolar([], { id: 'm', tipo: 'addMovement', args: [{ timestamp: cuando }], descripcion: 'Un movimiento' }));
    const vuelta = leerCola(a);
    const arg = (vuelta[0].args[0] as { timestamp: unknown }).timestamp;
    esCierto(arg instanceof Date, 'volvió como Date, no como texto');
    igual((arg as Date).getTime(), cuando.getTime(), 'y con el mismo instante');
});

grupo('un nombre de herramienta NO se convierte en fecha', () => {
    // El reconocedor es estricto a propósito. Si fuera flojo, cualquier texto
    // que se le parezca se volvería un `Date` y ensuciaría el dato.
    const a = almacen();
    guardarCola(a, encolar([], { id: 'x', tipo: 'addItem', args: [{ name: 'Pala 2026', nota: '2026-09-12' }], descripcion: 'x' }));
    const arg = leerCola(a)[0].args[0] as { name: unknown; nota: unknown };
    igual(typeof arg.name, 'string', 'el nombre sigue siendo texto');
    igual(typeof arg.nota, 'string', 'y una fecha suelta sin hora también');
});

grupo('confirmada por el servidor, se va', () => {
    const cola = encolar(encolar([], op('a')), op('b'));
    igual(confirmar(cola, 'a').map(o => o.id), ['b'], 'solo se va la confirmada');
});

grupo('el orden se respeta', () => {
    /**
     * Un movimiento sobre un ítem recién creado necesita que el ítem haya
     * subido primero, o la base lo rechaza por clave foránea. Si la cola
     * reordenara, ese despacho fallaría para siempre.
     */
    let cola: Operacion[] = [];
    for (const id of ['1', '2', '3']) cola = encolar(cola, op(id));
    igual(porIntentar(cola).map(o => o.id), ['1', '2', '3'], 'entran en el orden en que se hicieron');
});

grupo('falla, se cuenta, y se dice por qué', () => {
    const cola = marcarFallo(encolar([], op('a')), 'a', 'sin conexión');
    igual(cola[0].intentos, 1, 'cuenta el intento');
    igual(cola[0].ultimoError, 'sin conexión', 'y guarda el motivo');
    igual(cola[0].bloqueada, false, 'todavía se sigue intentando');
});

grupo('después de tanto insistir, deja de insistir — pero NO se borra', () => {
    /**
     * Cinco y no infinito: una operación rota de verdad no se arregla
     * insistiendo, y reintentarla cada vez que vuelve la señal tapa las que sí
     * se podrían salvar. Pero borrarla sola sería exactamente el fallo que esta
     * cola existe para no repetir.
     */
    let cola = encolar([], op('a'));
    for (let i = 0; i < LIMITE_INTENTOS; i++) cola = marcarFallo(cola, 'a', 'el servidor dice que no');
    igual(cola.length, 1, 'SIGUE AHÍ');
    igual(cola[0].bloqueada, true, 'pero ya no se intenta sola');
    igual(porIntentar(cola).length, 0, 'no entra en la siguiente pasada');
    igual(bloqueadas(cola).length, 1, 'y sale en la bandeja para que alguien decida');
});

grupo('una bloqueada no frena a las demás', () => {
    let cola = encolar(encolar([], op('rota')), op('buena'));
    for (let i = 0; i < LIMITE_INTENTOS; i++) cola = marcarFallo(cola, 'rota', 'no');
    igual(porIntentar(cola).map(o => o.id), ['buena'], 'la sana sigue su camino');
});

grupo('un humano la desbloquea y vuelve a la fila', () => {
    let cola = encolar([], op('a'));
    for (let i = 0; i < LIMITE_INTENTOS; i++) cola = marcarFallo(cola, 'a', 'no');
    cola = reintentar(cola, 'a');
    igual(cola[0].bloqueada, false, 'desbloqueada');
    igual(cola[0].intentos, 0, 'con la cuenta en cero');
    igual(cola[0].ultimoError, undefined, 'y sin el error viejo pegado');
    igual(porIntentar(cola).length, 1, 'vuelve a la fila');
});

grupo('un humano la descarta y se va', () => {
    const cola = descartar(encolar(encolar([], op('a')), op('b')), 'a');
    igual(cola.map(o => o.id), ['b'], 'solo se fue la descartada');
});

grupo('un almacenamiento roto NO tumba la app', () => {
    /**
     * En una ventana privada, con la cuota llena o con las cookies bloqueadas,
     * `localStorage` lanza al tocarlo. Perder la cola es malo; perder la app es
     * peor.
     */
    const roto = {
        getItem: () => { throw new Error('bloqueado'); },
        setItem: () => { throw new Error('bloqueado'); },
    };
    igual(leerCola(roto), [], 'leer devuelve vacío en vez de reventar');
    guardarCola(roto, [op('a') as unknown as Operacion]);
    esCierto(true, 'guardar tampoco revienta');
});

grupo('basura en el almacenamiento tampoco', () => {
    igual(leerCola(almacen({ [CLAVE_COLA]: 'esto no es JSON' })), [], 'texto cualquiera');
    igual(leerCola(almacen({ [CLAVE_COLA]: '{"no":"es un arreglo"}' })), [], 'JSON que no es lista');
    igual(leerCola(almacen()), [], 'vacío');
});

await cerrar();
