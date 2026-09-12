/**
 * tests/fusion.test.ts — Qué gana cuando el teléfono y la nube no coinciden
 * ========================================================================
 * Los dos fallos que cubre esta prueba vivían adentro de un `useEffect` de 300
 * líneas que corre al arrancar la app, con la red de por medio. Ahí no se
 * podían ejercitar, y por eso duraron: ninguno se ve hasta que ya perdiste el
 * dato.
 */
import { Item, InventoryType } from '../types';
import { fusionarItems, masReciente, hayQueAplicar } from '../core/fusion';
import { igual, esCierto, grupo, cerrar } from './correr';

/**
 * Los identificadores son UUID DE VERDAD, y eso no es decorado.
 *
 * La primera versión de esta prueba usaba nombres como `'uuid-creado-sin-senal'`
 * y pasaba igual con el fallo adentro: la condición vieja miraba el FORMATO del
 * identificador, y con un id que no parece UUID esa condición daba el resultado
 * correcto por accidente. Reintroduciendo el fallo a propósito, la prueba seguía
 * en verde. Con UUID de verdad —que es lo que la normalización le pone a todo
 * antes de llegar acá— sí falla.
 */
const UUID = (n: number): string => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;

const I = (id: string, name: string, quantity = 1, updatedAt?: string): Item => ({
    id, name, quantity,
    inventoryType: InventoryType.HAND_TOOL,
    category: 'Prueba', subCategory: '', minStock: 0, unit: 'und',
    ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
});

const nombres = (items: Item[]): string[] => items.map(i => i.name).sort();

grupo('un ítem creado SIN CONEXIÓN no se pierde al reconectar', () => {
    /**
     * El fallo: la condición que lo protegía miraba el FORMATO del
     * identificador —buscaba los «temporales»— pero la normalización previa ya
     * les había puesto un UUID de verdad a todos. La condición era siempre
     * falsa, así que no protegía nada: de dos ítems quedaba uno.
     *
     * La regla correcta no necesita mirar el identificador. Las lápidas ya se
     * aplicaron antes de llegar acá, así que un ítem que está en el teléfono y
     * no en la nube NO es un borrado: es uno que nunca alcanzó a subir.
     */
    const local = [I(UUID(1), 'Pala'), I(UUID(2), 'Palín')];
    const nube = [I(UUID(1), 'Pala')];
    const r = fusionarItems(local, nube, { nubeContesto: true, localVacio: false });

    igual(nombres(r), ['Pala', 'Palín'], 'los dos quedan');
    esCierto(r.some(i => i.id === UUID(2)), 'el creado sin señal sobrevive');
});

grupo('lo que se borró en el otro celular SÍ se va', () => {
    // `local` llega ya sin lápidas: eso es lo que hace correcta la regla de
    // arriba. Si el ítem borrado no llega, no hay nada que conservar.
    const local = [I(UUID(3), 'Pala')];
    const nube = [I(UUID(3), 'Pala')];
    const r = fusionarItems(local, nube, { nubeContesto: true, localVacio: false });
    igual(nombres(r), ['Pala'], 'queda solo lo vivo');
});

grupo('borrar el ÚLTIMO ítem no lo deja pegado en el otro celular', () => {
    /**
     * La lápida lo saca de lo local, la fusión queda vacía, y antes una lista
     * vacía no se aplicaba nunca: el ítem borrado seguía en pantalla sin forma
     * de quitarlo.
     */
    const r = fusionarItems([], [], { nubeContesto: true, localVacio: true });
    igual(r.length, 0, 'la fusión queda vacía');
    igual(hayQueAplicar(r, true), true, 'Y SE APLICA, porque la nube contestó');
});

grupo('sin señal NO se borra nada', () => {
    // Lo contrario del caso anterior, y por eso los dos tienen que estar: una
    // lista vacía sin acuse es falta de señal, no un borrado.
    const local = [I(UUID(4), 'Pala'), I(UUID(5), 'Pica')];
    const r = fusionarItems(local, [], { nubeContesto: false, localVacio: false });
    igual(nombres(r), ['Pala', 'Pica'], 'se conserva todo lo local');
    igual(hayQueAplicar([], false), false, 'y una lista vacía sin acuse NO se aplica');
});

grupo('sin señal tampoco se duplica el inventario', () => {
    // Sin la regla de nombre+tipo, la pala de acá y la pala de allá quedaban las
    // dos, y el inventario se duplicaba solo cada vez que se abría sin señal.
    const local = [I(UUID(6), 'Pala')];
    const nube = [I(UUID(7), 'Pala'), I(UUID(8), 'Pica')];
    const r = fusionarItems(local, nube, { nubeContesto: false, localVacio: false });
    igual(nombres(r), ['Pala', 'Pica'], 'una pala, no dos');
});

grupo('el contenido lo decide la FECHA, no el bando', () => {
    /**
     * Existencia y contenido son preguntas distintas. La nube manda sobre qué
     * existe; la fecha manda sobre cómo está cada cosa. Elegir un bando fijo
     * para las dos fue el fallo original: con los ítems ganaba siempre la nube,
     * así que una corrección hecha en el teléfono se borraba sola al siguiente
     * arranque.
     */
    const local = [I(UUID(9), 'Pala', 9, '2026-09-12T10:00:00Z')];
    const nube = [I(UUID(9), 'Pala', 3, '2026-09-11T10:00:00Z')];
    const r = fusionarItems(local, nube, { nubeContesto: true, localVacio: false });
    igual(r[0].quantity, 9, 'gana la corrección del teléfono, que es más nueva');

    const viejoLocal = [I(UUID(9), 'Pala', 9, '2026-09-10T10:00:00Z')];
    const r2 = fusionarItems(viejoLocal, nube, { nubeContesto: true, localVacio: false });
    igual(r2[0].quantity, 3, 'y al revés también: gana la nube si es más nueva');
});

grupo('masReciente — los bordes', () => {
    const a = I(UUID(9), 'A', 1, '2026-09-12T10:00:00Z');
    igual(masReciente(a, undefined).quantity, 1, 'sin contraparte, gana el que hay');
    igual(masReciente(a, I(UUID(9), 'B', 2)).name, 'A', 'el que no tiene fecha pierde');
    igual(masReciente(I(UUID(9), 'A', 1), I(UUID(9), 'B', 2)).name, 'A', 'sin fechas, gana el local');
});

grupo('dispositivo nuevo: la nube es todo lo que hay', () => {
    const nube = [I(UUID(4), 'Pala'), I(UUID(5), 'Pica')];
    igual(nombres(fusionarItems([], nube, { nubeContesto: true, localVacio: true })), ['Pala', 'Pica'], 'llega todo');
});

cerrar();
