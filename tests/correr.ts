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

export const grupo = (nombre: string, cuerpo: () => void): void => {
    console.log(`\n${nombre}`);
    const antes = fallas.length;
    cuerpo();
    if (fallas.length === antes) console.log('  ✓ todo bien');
    else console.log(fallas.slice(antes).join('\n'));
};

/** Se llama al final de cada archivo de pruebas. Sale con código 1 si algo falló. */
export const cerrar = (): void => {
    console.log(`\n${pasadas} pasaron · ${fallas.length} fallaron`);
    if (fallas.length > 0) process.exit(1);
};
