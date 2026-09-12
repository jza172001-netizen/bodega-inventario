/**
 * El núcleo del despacho: la aritmética del stock sin React.
 *
 * Los dos bugs que esto arregla los encontró una auditoría externa y los dos
 * son de los que no se ven: no rompen la pantalla, dejan el inventario mal.
 */
import { planearLote } from '../core/despacho';
import { InventoryType, MovementType, Item, Movement } from '../types';
import { igual, esCierto, grupo, cerrar } from './correr';

const I = (id: string, name: string, quantity: number, t = InventoryType.ELECTRICAL_TOOL, accessories?: any[]) =>
    ({ id, name, category: 'x', subCategory: 'x', inventoryType: t, quantity, minStock: 0, unit: 'und', accessories }) as Item;

const salida = (itemId: string, quantity: number): Omit<Movement, 'id'> =>
    ({ itemId, type: MovementType.CHECK_OUT, quantity, timestamp: new Date(), isLoan: true, isReturned: false });

const entrada = (itemId: string, quantity: number): Omit<Movement, 'id'> =>
    ({ itemId, type: MovementType.CHECK_IN, quantity, timestamp: new Date() });

grupo('lo básico', () => {
    const items = [I('pala', 'Pala', 5, InventoryType.HAND_TOOL)];
    const p = planearLote([salida('pala', 3)], items);
    igual(p.aplicar.length, 1, 'una aplicación');
    igual(p.aplicar[0].nuevaCantidad, 2, '5 - 3 = 2');
    igual(p.rechazos.length, 0, 'sin rechazos');

    const e = planearLote([entrada('pala', 4)], items);
    igual(e.aplicar[0].nuevaCantidad, 9, 'la entrada suma');
});

grupo('el saldo se descuenta dentro del mismo lote', () => {
    // Sin esto, dos salidas de tres se aprueban las dos contra el saldo inicial.
    const items = [I('pala', 'Pala', 5, InventoryType.HAND_TOOL)];
    const p = planearLote([salida('pala', 3), salida('pala', 3)], items);
    igual(p.aplicar.length, 1, 'solo pasa la primera');
    igual(p.rechazos.length, 1, 'la segunda se rechaza');
    igual(p.rechazos[0].hay, 2, 'contra lo que quedaba, no contra los 5 del inicio');
});

grupo('EL BUG DEL ACCESORIO — no sale el disco de una herramienta rechazada', () => {
    // Con cero pulidoras y cinco discos, antes se rechazaba la pulidora y el
    // disco se consumía igual: el inventario perdía un disco que nadie usó.
    const items = [
        I('pulidora', 'Pulidora grande', 0, InventoryType.ELECTRICAL_TOOL, [{ nombre: 'Disco', itemId: 'disco', cantidad: 1 }]),
        I('disco', 'Disco', 5, InventoryType.SINGLE_USE),
    ];
    const p = planearLote([salida('pulidora', 1)], items);
    igual(p.aplicar.length, 0, 'NADA se aplica');
    igual(p.rechazos.length, 1, 'un rechazo');
    igual(p.rechazos[0].nombre, 'Pulidora grande', 'y dice qué faltó');
    esCierto(!p.aplicar.some(a => a.item.id === 'disco'), 'el disco NO se gastó');
});

grupo('EL BUG AL REVÉS — si falta el accesorio, tampoco sale la herramienta', () => {
    // Hay pulidora pero no hay disco. Despachar la herramienta sin su disco es
    // mandar al trabajador a la obra con algo que no puede usar.
    const items = [
        I('pulidora', 'Pulidora grande', 3, InventoryType.ELECTRICAL_TOOL, [{ nombre: 'Disco', itemId: 'disco', cantidad: 1 }]),
        I('disco', 'Disco', 0, InventoryType.SINGLE_USE),
    ];
    const p = planearLote([salida('pulidora', 1)], items);
    igual(p.aplicar.length, 0, 'el grupo entero se queda');
    igual(p.rechazos[0].nombre, 'Disco', 'el rechazo nombra lo que se acabó');
    // Para reponer hay que saber QUÉ falta, pero al reintentar hay que volver a
    // armar el grupo: por eso el rechazo se lleva la línea original.
    igual(p.rechazos[0].movimiento.itemId, 'pulidora', 'y se lleva la línea de la herramienta');
});

grupo('accesorios que sí alcanzan', () => {
    const items = [
        I('pulidora', 'Pulidora grande', 3, InventoryType.ELECTRICAL_TOOL, [{ nombre: 'Disco', itemId: 'disco', cantidad: 2 }]),
        I('disco', 'Disco', 10, InventoryType.SINGLE_USE),
    ];
    const p = planearLote([salida('pulidora', 2)], items);
    igual(p.aplicar.length, 2, 'herramienta y disco');
    igual(p.aplicar[0].nuevaCantidad, 1, '3 - 2 pulidoras');
    igual(p.aplicar[1].nuevaCantidad, 6, '2 pulidoras × 2 discos = 4; 10 - 4 = 6');
    igual(p.aplicar[1].movimiento.isLoan, false, 'el disco se gasta, no se presta');
});

grupo('el accesorio retornable no mueve stock', () => {
    // La maleta o el cargador salen y vuelven CON la herramienta: no son
    // movimiento de nada. Se distinguen porque no tienen itemId.
    const items = [I('laser', 'Nivel láser', 2, InventoryType.ELECTRICAL_TOOL, [{ nombre: 'Maleta' }])];
    const p = planearLote([salida('laser', 1)], items);
    igual(p.aplicar.length, 1, 'solo la herramienta');
});

grupo('movimientos sin ítem', () => {
    // No se botan: el historial no puede perder nada. Pero no mueven stock.
    const p = planearLote([salida('fantasma', 1)], [I('pala', 'Pala', 5)]);
    igual(p.aplicar.length, 0, 'no aplica stock');
    igual(p.huerfanos.length, 1, 'pero queda registrado');
});

grupo('la entrada nunca se rechaza', () => {
    const items = [I('pala', 'Pala', 0, InventoryType.HAND_TOOL)];
    const p = planearLote([entrada('pala', 5)], items);
    igual(p.rechazos.length, 0, 'entrar siempre se puede');
    igual(p.aplicar[0].nuevaCantidad, 5, 'y suma');
});

grupo('completarFaltante — lo que se saca y no estaba registrado', () => {
    // La regla de Juli: casi nada del inventario está cargado, así que lo que
    // sale se agrega y se despacha de una. Lo que decide NO es el texto que se
    // pegó: es la existencia.
    const vacia = [I('pala', 'Pala', 0, InventoryType.HAND_TOOL)];
    const p = planearLote([salida('pala', 3)], vacia, { completarFaltante: true });
    igual(p.rechazos.length, 0, 'no se rechaza');
    igual(p.aplicar.length, 2, 'una entrada y una salida');
    igual(p.aplicar[0].movimiento.type, MovementType.CHECK_IN, 'la ENTRADA va primero');
    igual(p.aplicar[0].movimiento.quantity, 3, 'entran las 3 que faltaban');
    igual(p.aplicar[1].movimiento.type, MovementType.CHECK_OUT, 'y después la salida');
    igual(p.aplicar[1].nuevaCantidad, 0, 'queda en cero: entró lo justo y salió todo');
    igual(p.completados[0].motivo, 'vacio', 'no había ni una');
    igual(p.completados[0].faltaban, 3, 'y se dice cuántas hubo que dar por existentes');
});

grupo('LA GUARDA — si hay existencia, no se crea ni entra nada', () => {
    // «a no ser de que haya existencia en bodega». Si la app ya sabía que la
    // pala estaba, inventar una entrada sería inflar el inventario.
    const hay = [I('pala', 'Pala', 10, InventoryType.HAND_TOOL)];
    const p = planearLote([salida('pala', 3)], hay, { completarFaltante: true });
    igual(p.aplicar.length, 1, 'SOLO la salida');
    igual(p.completados.length, 0, 'nada que completar');
    igual(p.aplicar[0].nuevaCantidad, 7, '10 - 3');
});

grupo('completa solo el HUECO, nunca de más', () => {
    // Había 1 y se piden 3: entran 2, no 3. El techo es lo que falta.
    const corta = [I('pala', 'Pala', 1, InventoryType.HAND_TOOL)];
    const p = planearLote([salida('pala', 3)], corta, { completarFaltante: true });
    igual(p.aplicar[0].movimiento.quantity, 2, 'entran 2, que es lo que faltaba');
    igual(p.completados[0].motivo, 'corto', 'había pero no alcanzaba');
    igual(p.aplicar[1].nuevaCantidad, 0, '1 + 2 - 3 = 0');
});

grupo('la entrada dice POR QUÉ existe', () => {
    // Sin la nota, esa entrada parece inventada. Con ella es un registro que
    // llegó tarde, que es lo que de verdad es.
    const p = planearLote([salida('pala', 1)], [I('pala', 'Pala', 0, InventoryType.HAND_TOOL)], { completarFaltante: true });
    esCierto(String(p.aplicar[0].movimiento.notes).includes('No estaba registrado'), 'lleva su explicación');

    const conNota = planearLote([salida('pala', 1)], [I('pala', 'Pala', 0, InventoryType.HAND_TOOL)],
        { completarFaltante: true, notaDeCompletado: 'Cargado desde el bloque de Abel' });
    igual(conNota.aplicar[0].movimiento.notes, 'Cargado desde el bloque de Abel', 'y se puede decir otra cosa');
});

grupo('completar también cubre los accesorios', () => {
    // Sale la pulidora con su disco y no hay ninguno de los dos: entran los dos
    // y salen los dos, sin que el grupo se rompa.
    const items = [
        I('pulidora', 'Pulidora grande', 0, InventoryType.ELECTRICAL_TOOL, [{ nombre: 'Disco', itemId: 'disco', cantidad: 1 }]),
        I('disco', 'Disco', 0, InventoryType.SINGLE_USE),
    ];
    const p = planearLote([salida('pulidora', 1)], items, { completarFaltante: true });
    igual(p.rechazos.length, 0, 'no se rechaza');
    igual(p.completados.length, 2, 'se completan la herramienta y su disco');
    igual(p.aplicar.filter(a => a.movimiento.type === MovementType.CHECK_IN).length, 2, 'dos entradas');
    igual(p.aplicar.filter(a => a.movimiento.type === MovementType.CHECK_OUT).length, 2, 'dos salidas');
});

grupo('apagado por defecto', () => {
    // El despacho normal de la pantalla sigue frenando: ahí la falta de stock
    // sí es señal de que algo está mal.
    const p = planearLote([salida('pala', 3)], [I('pala', 'Pala', 0, InventoryType.HAND_TOOL)]);
    igual(p.rechazos.length, 1, 'sin la opción, rechaza como siempre');
    igual(p.aplicar.length, 0, 'y no entra nada');
});

grupo('varias personas, un lote', () => {
    const items = [I('pala', 'Pala', 10, InventoryType.HAND_TOOL), I('pica', 'Pica', 1, InventoryType.HAND_TOOL)];
    const p = planearLote(
        [salida('pala', 3), salida('pala', 2), salida('pica', 1), salida('pica', 1)],
        items,
    );
    igual(p.aplicar.length, 3, 'tres pasan');
    igual(p.rechazos.length, 1, 'la segunda pica no alcanza');
    // Un renglón malo no frena la fila: los buenos entran igual.
    igual(p.aplicar[1].nuevaCantidad, 5, '10 - 3 - 2 = 5');
});

cerrar();
