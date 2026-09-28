/**
 * core/identidad.ts — Cómo se llama cada acceso para el servidor
 * ==============================================================
 * El servidor de Supabase identifica a la gente por CORREO, y en esta bodega
 * nadie tiene correo de trabajo: entran escribiendo su nombre. Así que cada
 * acceso lleva un correo **derivado de su usuario**, que nadie ve ni escribe
 * nunca: la pantalla de entrada se queda exactamente igual y la app traduce por
 * debajo.
 *
 * ESTO VIVE ACÁ, SOLO, Y NO ES CAPRICHO
 *
 * La misma fórmula la usan dos sitios que no se hablan: el SQL que crea los
 * usuarios en el servidor y el navegador que después intenta entrar. Si los dos
 * no producen **exactamente** la misma cadena, nadie entra y el motivo es
 * invisible —«contraseña incorrecta» cuando la contraseña está bien—. Una sola
 * fórmula, probada, y el SQL de la migración copia esta misma regla con un
 * comentario que apunta acá.
 *
 * El dominio es inventado a propósito: `.montecielo` no existe como dominio de
 * internet, así que estos correos no pueden recibir nada ni chocar con el correo
 * de verdad de nadie.
 */

export const DOMINIO_INTERNO = 'bodega.montecielo';

/**
 * El correo interno de un acceso, a partir de su usuario.
 *
 * Se quitan tildes y todo lo que no sea letra o número, y se pasa a minúscula.
 * «Kate» y «KATE» caen en el mismo correo a propósito: son la misma persona con
 * el acceso duplicado, y que colisionen lo pone en evidencia en vez de crear dos
 * identidades para la misma señora.
 */
export const correoInterno = (usuario: string): string => {
    const limpio = usuario
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')   // las tildes
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
    return `${limpio}@${DOMINIO_INTERNO}`;
};
