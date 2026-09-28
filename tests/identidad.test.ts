/**
 * tests/identidad.test.ts — El correo interno de cada acceso
 * =========================================================
 * Esta prueba existe porque la fórmula la usan DOS sitios que no se hablan: el
 * SQL que crea los usuarios en el servidor y el navegador que intenta entrar.
 * Si producen cadenas distintas, nadie entra y el mensaje que sale es
 * «contraseña incorrecta» — con la contraseña bien puesta. Un fallo así se
 * tarda horas en encontrar porque el síntoma miente.
 */
import { correoInterno, DOMINIO_INTERNO } from '../core/identidad';
import { igual, esCierto, grupo, cerrar } from './correr';

grupo('un usuario normal', () => {
    igual(correoInterno('kate'), `kate@${DOMINIO_INTERNO}`, 'minúsculas tal cual');
    igual(correoInterno('juli'), `juli@${DOMINIO_INTERNO}`, 'otro');
});

grupo('las mayúsculas NO hacen dos personas', () => {
    // «Kate» y «KATE» son el acceso duplicado que hay que unificar. Que caigan
    // en el mismo correo lo pone en evidencia, en vez de crear dos identidades
    // para la misma señora.
    igual(correoInterno('KATE'), correoInterno('kate'), 'mismo correo');
    igual(correoInterno('Kate'), correoInterno('kate'), 'y con la inicial también');
});

grupo('las tildes y la ñ no rompen el correo', () => {
    // Un correo con tilde lo rechaza el servidor. Acá entran nombres como
    // «Jesús» o «Duván» sin pensarlo dos veces.
    igual(correoInterno('Jesús'), `jesus@${DOMINIO_INTERNO}`, 'tilde fuera');
    igual(correoInterno('Duván'), `duvan@${DOMINIO_INTERNO}`, 'otra tilde');
    esCierto(!correoInterno('Muñoz').includes('ñ'), 'la eñe tampoco queda');
});

grupo('los espacios y los signos se van', () => {
    igual(correoInterno('Alex Ferreira'), `alexferreira@${DOMINIO_INTERNO}`, 'el espacio');
    igual(correoInterno('juan.puerta'), `juanpuerta@${DOMINIO_INTERNO}`, 'el punto');
    igual(correoInterno('abel-oficial'), `abeloficial@${DOMINIO_INTERNO}`, 'el guion');
});

grupo('el resultado SIEMPRE es un correo válido', () => {
    const VALIDO = /^[a-z0-9]+@[a-z.]+$/;
    for (const u of ['kate', 'Jesús Vásquez', 'ABEL/Oficial', 'j.u_l-i']) {
        esCierto(VALIDO.test(correoInterno(u)), `"${u}" da un correo que el servidor acepta`);
    }
});

await cerrar();
