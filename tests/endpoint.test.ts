/**
 * El identificador que impide el doble registro.
 *
 * Es la pieza que hace seguro que un asistente de IA mande el bloque: un bot
 * reintenta cuando se le pierde la respuesta, y un dedo toca dos veces. Sin
 * esto, cada reintento despacha otra vez y la bodega pierde material de verdad.
 *
 * ESTA PRUEBA IMPORTA LA FUNCIÓN DE VERDAD, y eso es el punto.
 *
 * La versión anterior copiaba la fórmula acá adentro para no arrastrar el
 * endpoint con sus claves. Pasaba en verde mientras la fórmula desplegada tenía
 * el defecto que reportaba registros falsos: probaba la copia, no el código. Por
 * eso la identidad vive ahora en `api/identidad.ts`, que no toca red ni React.
 */
import { idDeterminista, firmaDe, uuidDe } from '../api/identidad';
import { Movement, MovementType } from '../types';
import { igual, esCierto, grupo, cerrar } from './correr';

const AHORA = new Date('2026-09-12T12:00:00Z');
const PALA = '11111111-1111-4111-8111-111111111111';
const MARTILLO = '22222222-2222-4222-8222-222222222222';
const ALEX = '44444444-4444-4444-8444-444444444444';
const JUAN = '55555555-5555-4555-8555-555555555555';

const salida = (itemId: string, quantity = 1, personnelId = ALEX): Omit<Movement, 'id'> => ({
    itemId, quantity, personnelId,
    type: MovementType.CHECK_OUT,
    timestamp: AHORA,
    isLoan: true,
    isReturned: false,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

grupo('el mismo envío da el mismo identificador', () => {
    // Mandar el bloque dos veces con la misma operación produce las mismas
    // filas; la base rechaza la repetida por clave primaria y no hay duplicado.
    igual(
        idDeterminista('lunes-7am', salida(PALA), 0),
        idDeterminista('lunes-7am', salida(PALA), 0),
        'reintento idéntico',
    );
});

grupo('EL REINTENTO CON RENGLONES CAÍDOS — el fallo que reportaba registros falsos', () => {
    /**
     * El caso exacto: hay una pala y tres martillos, se pide «Alex: 1 pala, 1
     * martillo». La pala se guarda, el martillo falla. Al reintentar, la pala ya
     * no tiene stock y se cae del plan, así que el martillo queda de primero.
     *
     * Con el identificador por POSICIÓN, el martillo heredaba el de la pala, la
     * base decía «clave repetida» y el endpoint lo leía como «ya estaba
     * guardado». Respondía que registró el martillo sin martillo en la base.
     */
    const primerIntento = [salida(PALA), salida(MARTILLO)];
    const reintento = [salida(MARTILLO)];                       // la pala se cayó

    igual(
        idDeterminista('mismo-bloque', reintento[0], 0),
        idDeterminista('mismo-bloque', primerIntento[1], 0),
        'el martillo conserva SU identificador aunque cambie de posición',
    );
    esCierto(
        idDeterminista('mismo-bloque', reintento[0], 0)
        !== idDeterminista('mismo-bloque', primerIntento[0], 0),
        'y NUNCA choca con el de la pala',
    );
});

grupo('qué cosas hacen un identificador distinto', () => {
    const base = idDeterminista('op', salida(PALA, 1, ALEX), 0);
    esCierto(base !== idDeterminista('otra-op', salida(PALA, 1, ALEX), 0), 'otra operación');
    esCierto(base !== idDeterminista('op', salida(MARTILLO, 1, ALEX), 0), 'otro ítem');
    esCierto(base !== idDeterminista('op', salida(PALA, 2, ALEX), 0), 'otra cantidad');
    esCierto(base !== idDeterminista('op', salida(PALA, 1, JUAN), 0), 'otra persona');
    esCierto(base !== idDeterminista('op', salida(PALA, 1, ALEX), 1), 'la misma cosa pedida dos veces');
});

grupo('la misma cosa dos veces en un bloque NO colapsa', () => {
    // «Alex: 1 pala, 1 pala» son dos salidas de verdad, no una repetida.
    const firma = firmaDe(salida(PALA));
    igual(firma, firmaDe(salida(PALA)), 'la firma agrupa lo idéntico');
    esCierto(firma !== firmaDe(salida(PALA, 1, JUAN)), 'y separa por persona');
    const vistos = new Set([
        idDeterminista('op', salida(PALA), 0),
        idDeterminista('op', salida(PALA), 1),
    ]);
    igual(vistos.size, 2, 'dos palas, dos identificadores');
});

grupo('es un UUID válido de verdad', () => {
    // Si no lo fuera, Postgres rechaza la fila y el despacho falla entero.
    esCierto(UUID.test(idDeterminista('a', salida(PALA), 0)), 'caso simple');
    esCierto(UUID.test(idDeterminista('ñ-con-tilde', salida(MARTILLO, 12), 3)), 'con tilde y cantidades');
    esCierto(UUID.test(uuidDe('')), 'hasta con semilla vacía');
});

grupo('no se repite en un lote grande', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 200; i++) vistos.add(idDeterminista('un-bloque-de-60-cosas', salida(PALA, i + 1), 0));
    igual(vistos.size, 200, '200 renglones, 200 identificadores');
});

cerrar();
