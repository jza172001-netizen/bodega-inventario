/**
 * Las medidas: fracciones, decimales y lo que NO es una medida.
 *
 * Esto existe porque un codo de 3/4 entraba archivado como codo de 3 pulgadas,
 * y el error se propagaba solo: la lista de medidas que el asistente ofrece se
 * construye leyendo esta misma función.
 */
import { medidaDe, valorDeMedida, denominacionesDe, seMideEnPulgadas, nombreCompuesto, materialDe, todasLasMedidas, medidasPrestadas } from '../utils/medida';
import { igual, esCierto, grupo, cerrar } from './correr';

grupo('medidaDe — fracciones de tubería', () => {
    igual(medidaDe('Tubo PVC 1/2'), '1/2"', 'media pulgada');
    igual(medidaDe('Codo PVC 3/4'), '3/4"', 'tres cuartos');
    igual(medidaDe('Tubo 1 1/2'), '1 1/2"', 'una y media');
    igual(medidaDe('Codo 1 1/4'), '1 1/4"', 'una y cuarto');
    igual(medidaDe('Tubo 3 / 4'), '3/4"', 'con espacios adentro de la fracción');
    igual(medidaDe('Union 1/2"'), '1/2"', 'con comillas ya puestas');
});

grupo('medidaDe — enteros y decimales', () => {
    igual(medidaDe('Tee PVC 4'), '4"', 'entero');
    igual(medidaDe('Tubo 2.5'), '2.5"', 'decimal con punto');
    igual(medidaDe('Clavos acero 2'), '2"', 'clavos de dos pulgadas');
});

grupo('medidaDe — lo que NO es medida', () => {
    igual(medidaDe('Clavos 2 libras'), null, 'libras son peso, no pulgadas');
    igual(medidaDe('Cinta 500g'), null, 'gramos');
    igual(medidaDe('Manguera 3m'), null, 'metros');
    igual(medidaDe('Lechada gris claro'), null, 'sin número');
    igual(medidaDe('Guantes (Negro · Nn)'), null, 'el paréntesis es color y marca');
    // Una reducción trae DOS medidas y ninguna sola describe la pieza. Antes se
    // quedaba con la primera y la reducción de 2 a 1 entraba como pieza de 2".
    igual(medidaDe('Reduccion 2 a 1'), null, 'reducción: no se adivina');
    igual(medidaDe('Buje 2 x 1'), null, 'reducción con equis');
});

grupo('nombres reales que engañaban', () => {
    // Los tres salieron de correr esto contra los 121 ítems de producción.
    // Ninguno rompía la pantalla: los tres ensuciaban el dato en silencio.
    igual(medidaDe('Lija #2000'), null, 'la almohadilla es referencia, no pulgadas');
    igual(medidaDe('Lija #1500'), null, 'una lija de 1500 pulgadas no existe');
    igual(medidaDe('Galón 3 en 1'), null, '"3 en 1" es el nombre del aceite');
    igual(medidaDe('Tornillos 1½"'), '1 1/2"', 'la fracción en símbolo también cuenta');
    igual(medidaDe('Tornillos ½"'), '1/2"', 'y sola, sin entero delante');
});

grupo('valorDeMedida — para poder ordenarlas', () => {
    igual(valorDeMedida('1/2"'), 0.5, 'media');
    igual(valorDeMedida('3/4"'), 0.75, 'tres cuartos');
    igual(valorDeMedida('1 1/2"'), 1.5, 'una y media');
    igual(valorDeMedida('2"'), 2, 'entera');
});

grupo('denominacionesDe — orden y escalera', () => {
    const familia = [{ name: 'Codo 1' }, { name: 'Codo 1/2' }, { name: 'Codo 3/4' }, { name: 'Codo 2' }];
    igual(denominacionesDe(familia), ['1/2"', '3/4"', '1"', '2"'], 'ordena por valor, no alfabético');

    const conEscalera = denominacionesDe([], undefined, 'Codo');
    esCierto(conEscalera.includes('3/4"'), 'familia de tubería vacía ofrece la escalera');
    igual(denominacionesDe([], undefined, 'Palas'), [], 'una familia que no se mide en pulgadas no ofrece nada');
});

grupo('seMideEnPulgadas', () => {
    esCierto(seMideEnPulgadas('Tubo'), 'tubo sí');
    esCierto(seMideEnPulgadas('Codo'), 'codo sí');
    esCierto(seMideEnPulgadas('Reduccion'), 'reducción sí');
    igual(seMideEnPulgadas('Pala'), false, 'pala no');
    igual(seMideEnPulgadas('Martillo'), false, 'martillo no');
});

grupo('las medidas cruzan familias', () => {
    // "Tres pulgadas" es la misma medida así sea un clavo, un tubo o un codo:
    // es vocabulario de toda la bodega, no propiedad de cada familia.
    const bodega = [
        { name: 'Clavos acero 3"' }, { name: 'Clavos hierro 2"' },
        { name: 'Tubo PVC 1/2' }, { name: 'Pala' }, { name: 'Martillo' },
    ];
    igual(todasLasMedidas(bodega), ['1/2"', '2"', '3"'], 'todas las que la bodega usa, ordenadas');
    igual(todasLasMedidas([{ name: 'Pala' }]), [], 'una bodega sin medidas no inventa ninguna');

    // Las prestadas son las que existen en la bodega y ESTA familia no tiene.
    // Van aparte para no hacer creer que ya hubo un codo de 3".
    igual(medidasPrestadas(bodega, ['1/2"']), ['2"', '3"'], 'no repite la que ya se ofrece');
    igual(medidasPrestadas(bodega, ['1/2"', '2"', '3"']), [], 'si ya están todas, no sobra ninguna');
});

grupo('nombreCompuesto y materialDe', () => {
    igual(nombreCompuesto('Clavos', 'hierro', '2"'), 'Clavos hierro 2"', 'las tres piezas');
    igual(nombreCompuesto('Polvo enchape', '', ''), 'Polvo enchape', 'sin género ni medida');
    igual(materialDe('Clavos acero 2'), 'acero', 'el género sale del nombre');
    igual(materialDe('Pala'), null, 'sin género');
});

await cerrar();
