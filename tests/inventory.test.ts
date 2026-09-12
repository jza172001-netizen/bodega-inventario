/**
 * Las reglas de negocio de la bodega.
 *
 * El encabezado de `utils/inventory.ts` cuenta por qué existe este archivo: el
 * filtro de préstamo activo llegó a estar reescrito a mano en ~21 sitios, y eso
 * hizo que el informe mostrara UN responsable donde el Kardex mostraba DOS.
 * Estas pruebas fijan el comportamiento para que la próxima copia no pueda
 * diverger en silencio.
 */
import {
    isAsset, isConsumable, isAccessory, esRetiro, alcanzaStock, adivinarTipo,
    getActiveLoans, getActiveLoansByItem, getLoansByPerson, summarizeLoanItems,
} from '../utils/inventory';
import { InventoryType, MovementType, Item, Movement } from '../types';
import { igual, esCierto, grupo, cerrar } from './correr';

const I = (id: string, t: InventoryType) =>
    ({ id, name: id, category: 'x', subCategory: 'x', inventoryType: t, quantity: 5, minStock: 0, unit: 'und' }) as Item;

const mov = (p: Partial<Movement>): Movement => ({
    id: p.id ?? 'm', itemId: p.itemId ?? 'i', type: p.type ?? MovementType.CHECK_OUT,
    quantity: p.quantity ?? 1, timestamp: new Date(), ...p,
}) as Movement;

grupo('activo vs. gasto — se presta o se entrega', () => {
    esCierto(isAsset(I('a', InventoryType.HAND_TOOL)), 'herramienta manual se presta');
    esCierto(isAsset(I('b', InventoryType.ELECTRICAL_TOOL)), 'herramienta eléctrica se presta');
    igual(isAsset(I('c', InventoryType.SINGLE_USE)), false, 'el consumible no se presta');
    igual(isAsset(I('d', InventoryType.PPE)), false, 'el EPP no se presta');

    esCierto(isConsumable(I('c', InventoryType.SINGLE_USE)), 'consumible es gasto');
    esCierto(isConsumable(I('d', InventoryType.PPE)), 'EPP es gasto');
    // Un disco se gasta como cualquier consumible; lo que lo separa es dónde
    // vive y a quién se le engancha, no cómo se contabiliza.
    esCierto(isConsumable(I('e', InventoryType.ACCESSORY)), 'el accesorio es gasto');
    esCierto(isAccessory(I('e', InventoryType.ACCESSORY)), 'y además es accesorio');

    igual(isAsset(undefined), false, 'sin ítem no truena');
    igual(isConsumable(undefined), false, 'sin ítem no truena');
});

grupo('adivinarTipo — propone, y calla cuando no sabe', () => {
    // Existe por un bug callado: la lista de pedidos creaba TODO como consumible,
    // así que una pulidora comprada nunca se podía prestar.
    igual(adivinarTipo('Pulidora grande'), InventoryType.ELECTRICAL_TOOL, 'pulidora');
    igual(adivinarTipo('Taladro percutor Bosch'), InventoryType.ELECTRICAL_TOOL, 'taladro');
    igual(adivinarTipo('Guantes naranjas'), InventoryType.PPE, 'guantes');
    igual(adivinarTipo('Cascos de seguridad'), InventoryType.PPE, 'cascos');
    igual(adivinarTipo('Clavos de acero 3"'), InventoryType.SINGLE_USE, 'clavos');
    igual(adivinarTipo('Tornillos 1½"'), InventoryType.SINGLE_USE, 'tornillos');
});

grupo('el adjetivo vale en cualquier posición', () => {
    // "Extensión" sola no dice nada; "eléctrica" sí, y va de segunda.
    igual(adivinarTipo('Extensión eléctrica'), InventoryType.ELECTRICAL_TOOL, 'extensión eléctrica');
    igual(adivinarTipo('Pesa eléctrica'), InventoryType.ELECTRICAL_TOOL, 'pesa eléctrica');
    igual(adivinarTipo('Nivel láser'), InventoryType.ELECTRICAL_TOOL, 'nivel láser');
});

grupo('el sustantivo SOLO vale de primero', () => {
    // Tres nombres reales de Montecielo que antes caían mal: el contexto le
    // ganaba a la cosa. "Rastrillo de cemento" es herramienta, no cemento.
    igual(adivinarTipo('Rastrillo de cemento'), null, 'el cemento es para qué sirve');
    igual(adivinarTipo('Cepillo de alambre'), null, 'el alambre es de qué está hecho');
    igual(adivinarTipo('Mezclador para taladro'), null, 'el taladro es dónde se monta');
});

grupo('callar es mejor que adivinar mal', () => {
    // Un tipo equivocado no truena: se esconde meses y se descubre el día que
    // alguien pregunta quién tiene la pulidora. Antes que adivinar, se pregunta.
    igual(adivinarTipo('Bichiroqui'), null, 'palabra de la bodega que nadie más usa');
    igual(adivinarTipo('Falustre'), null, 'ni siquiera bien escrita');
    igual(adivinarTipo(''), null, 'vacío');
    igual(adivinarTipo('   '), null, 'solo espacios');
});

grupo('no confunde palabras parecidas', () => {
    // "brocha" y "broca" son una letra de diferencia y son cosas distintas;
    // las dos son consumible, pero por su propia pista, no por contagio.
    igual(adivinarTipo('Brocha 3"'), InventoryType.SINGLE_USE, 'brocha');
    igual(adivinarTipo('Martillo'), null, 'martillo no está en ninguna lista, y no se inventa');
});

grupo('esRetiro — qué resta del stock', () => {
    esCierto(esRetiro(MovementType.CHECK_OUT), 'la salida resta');
    esCierto(esRetiro(MovementType.WASTE), 'la merma resta');
    igual(esRetiro(MovementType.CHECK_IN), false, 'la entrada suma');
    igual(esRetiro(MovementType.PURCHASE), false, 'la compra suma');
});

grupo('alcanzaStock', () => {
    esCierto(alcanzaStock(5, 3), 'hay de sobra');
    esCierto(alcanzaStock(3, 3), 'justo alcanza');
    igual(alcanzaStock(2, 3), false, 'no alcanza');
    igual(alcanzaStock(0, 1), false, 'sin nada en bodega');
});

grupo('préstamos activos', () => {
    const ms = [
        mov({ id: '1', itemId: 'pala', isLoan: true, isReturned: false, personnelId: 'abel' }),
        mov({ id: '2', itemId: 'pala', isLoan: true, isReturned: true, personnelId: 'abel' }),
        mov({ id: '3', itemId: 'pica', isLoan: false, personnelId: 'abel' }),
    ];
    igual(getActiveLoans(ms).map(m => m.id), ['1'], 'solo lo que salió y no ha vuelto');

    // Un préstamo devuelto NO crea movimiento de devolución: voltea is_returned.
    // Cualquier fórmula que asuma lo contrario reporta descuadres falsos.
    igual(getActiveLoans(ms).length, 1, 'el devuelto no cuenta');
});

grupo('un ítem con dos tenedores', () => {
    // El bug real: con `find()` en vez de agrupar, un palustre repartido entre
    // Abel y Alexander solo reportaba a Abel y el segundo desaparecía.
    const ms = [
        mov({ id: '1', itemId: 'palustre', isLoan: true, personnelId: 'abel' }),
        mov({ id: '2', itemId: 'palustre', isLoan: true, personnelId: 'alexander' }),
    ];
    igual(getActiveLoansByItem(ms).get('palustre')?.length, 2, 'los DOS tenedores');
});

grupo('préstamos por persona — unidades, no movimientos', () => {
    // Contar movimientos en vez de unidades hacía que el informe dijera
    // "Martillo" cuando Adrián tenía 2.
    const ms = [
        mov({ id: '1', itemId: 'martillo', quantity: 2, isLoan: true, personnelId: 'adrian' }),
        mov({ id: '2', itemId: 'canguro', quantity: 1, isLoan: true, personnelId: 'adrian' }),
    ];
    const porPersona = getLoansByPerson(ms, () => 'Adrián');
    igual(porPersona[0].unidades, 3, '2 martillos + 1 canguro = 3 unidades');

    // Un préstamo sin persona no se bota: es lo que permitirá que una unidad
    // "pendiente de verificar ubicación" tenga dónde vivir.
    const huerfano = getLoansByPerson([mov({ id: '9', isLoan: true })], () => 'x');
    igual(huerfano[0].nombre, 'Sin asignar', 'el préstamo sin dueño aparece igual');
});

grupo('resumen de una línea', () => {
    const ms = [
        mov({ id: '1', itemId: 'martillo', quantity: 2, isLoan: true }),
        mov({ id: '2', itemId: 'martillo', quantity: 1, isLoan: true }),
    ];
    igual(summarizeLoanItems(ms, () => 'Martillo'), 'Martillo ×3', 'suma el mismo ítem');
});

cerrar();
