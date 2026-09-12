/**
 * tests/correr.ts — El corredor de pruebas
 * ========================================
 * La app no tenía una sola prueba automática. Por eso cada arreglo podía romper
 * otra cosa y el único que lo detectaba era Juli, a mano, «estresando» la app
 * una y otra vez. Eso es lo que lo tenía mamado, y es la causa —no el síntoma—
 * de que varios hallazgos fueran efectos secundarios de arreglos del mismo día.
 *
 * POR QUÉ NO VITEST NI JEST
 * `npm install` no corre en el entorno donde se trabaja esto: la dependencia
 * `xlsx` se baja de `cdn.sheetjs.com`, que está bloqueado por política de red.
 * Meter un marco de pruebas que no se puede ejecutar acá significaría escribir
 * pruebas que nadie corrió — y una prueba que no se corrió no vale nada, solo
 * da una sensación falsa de seguridad.
 *
 * Entonces: `tsx` (que sí corre) más este corredor de treinta líneas. Cero
 * dependencias nuevas. Si mañana se quiere Vitest, las pruebas se migran casi
 * tal cual porque son `igual(a, b, 'nombre')` y nada más.
 */

let pasadas = 0;
const fallas: string[] = [];

const muestra = (v: unknown): string =>
    typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(muestra).join(', ')}]` : String(v);

/** Compara por valor. Para objetos y arreglos compara su JSON, que alcanza acá. */
export const igual = (obtenido: unknown, esperado: unknown, nombre: string): void => {
    const a = typeof obtenido === 'object' ? JSON.stringify(obtenido) : obtenido;
    const b = typeof esperado === 'object' ? JSON.stringify(esperado) : esperado;
    if (a === b) { pasadas++; return; }
    fallas.push(`  ✗ ${nombre}\n      esperaba: ${muestra(esperado)}\n      obtuvo:   ${muestra(obtenido)}`);
};

export const esCierto = (cond: boolean, nombre: string): void => igual(cond, true, nombre);

/**
 * La fila de grupos. TODOS pasan por acá, incluidos los que no esperan nada.
 *
 * Existe por una prueba que pasaba SIN COMPROBAR NADA. Un grupo con cuerpo
 * asíncrono devolvía una promesa, `grupo` la ignoraba, y el conteo se hacía
 * cuando todavía no había corrido una sola comprobación: salía «✓ todo bien» y
 * el total ni se movía. Cuatro grupos enteros de la prueba del ingreso eran
 * decorado.
 *
 * La fila los corre UNO DETRÁS DE OTRO, no todos al tiempo. No es manía de
 * orden: el reporte de cada grupo es «qué fallas se agregaron desde que
 * empecé», y si dos corren encima, cada uno reporta las del otro.
 */
let fila: Promise<void> = Promise.resolve();

export const grupo = (nombre: string, cuerpo: () => void | Promise<void>): void => {
    fila = fila.then(async () => {
        console.log(`\n${nombre}`);
        const antes = fallas.length;
        try {
            await cuerpo();
        } catch (e) {
            fallas.push(`  ✗ ${nombre} — reventó: ${e}`);
        }
        if (fallas.length === antes) console.log('  ✓ todo bien');
        else console.log(fallas.slice(antes).join('\n'));
    });
};

/**
 * Se llama al final de cada archivo de pruebas. **Va con `await`.**
 *
 * Sin el `await`, los grupos de la fila todavía no terminaron y el conteo sale
 * en cero — que es exactamente el fallo que hizo escribir todo esto.
 */
export const cerrar = async (): Promise<void> => {
    await fila;
    console.log(`\n${pasadas} pasaron · ${fallas.length} fallaron`);
    if (fallas.length > 0) process.exit(1);
};
