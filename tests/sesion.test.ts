/**
 * Sin sesión con el servidor, la cola ESPERA: no intenta y no gasta intentos.
 *
 * Desde el 3-oct-2026 la base solo deja escribir a la gente de la bodega con
 * sesión. Se puede estar adentro sin ella (se entró sin señal). Si la cola
 * intentara igual, cada operación sumaría fallos hasta bloquearse —cinco y a
 * «Pendientes»— sin tener nada malo. Corre `withSync` y `procesarCola` REALES,
 * sacados de App.tsx con el AST, como `pantalla.test.ts` hace con el chat.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { encolar, confirmar, marcarFallo, porIntentar, Operacion } from '../core/cola';
import { igual, grupo, cerrar } from './correr';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO = path.join(AQUI, '..', 'App.tsx');

const sacar = <T,>(nombres: string[], contexto: Record<string, unknown>): T => {
    const texto = fs.readFileSync(ARCHIVO, 'utf8');
    const sf = ts.createSourceFile(ARCHIVO, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const halladas = new Map<string, string>();
    const visitar = (n: ts.Node): void => {
        if (ts.isVariableDeclaration(n) && nombres.includes(n.name.getText(sf))) halladas.set(n.name.getText(sf), `const ${n.getText(sf)};`);
        ts.forEachChild(n, visitar);
    };
    visitar(sf);
    for (const n of nombres) if (!halladas.has(n)) throw new Error(`No encontré "${n}" en App.tsx: si la moviste, actualizá esta prueba.`);
    const cuerpo = ts.transpileModule(`(() => {\n${nombres.map(n => halladas.get(n)).join('\n')}\nreturn { ${nombres.join(', ')} };\n})()`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const claves = Object.keys(contexto);
    // eslint-disable-next-line no-new-func
    return new Function(...claves, `return ${cuerpo};`)(...claves.map(k => contexto[k])) as T;
};

const montar = (conSesion: boolean) => {
    const visto = { intentos: 0 };
    const c: Record<string, unknown> = {
        sesionRef: { current: conSesion },
        colaRef: { current: [] as Operacion[] },
        procesando: { current: false },
        syncTimer: { current: null },
        encolar, confirmar, marcarFallo, porIntentar,
        setSyncStatus: () => {},
        // La base sin sesión rechaza todo: si se intenta, falla.
        ejecutarOperacion: async () => {
            visto.intentos++;
            if (!(c.sesionRef as { current: boolean }).current) throw new Error('permiso denegado');
        },
    };
    c.fijarCola = (cola: Operacion[]) => { (c.colaRef as { current: Operacion[] }).current = cola; };
    const fn = sacar<{ withSync: (t: string, a: unknown[], d: string) => Promise<unknown>; procesarCola: () => Promise<void> }>(
        ['withSync', 'procesarCola'], c);
    c.procesarCola = fn.procesarCola;
    return { c, fn, visto, cola: () => (c.colaRef as { current: Operacion[] }).current };
};

grupo('sin sesión: se anota, no se intenta, no gasta intentos', async () => {
    const m = montar(false);
    await m.fn.withSync('logMovementsWithStock', [[]], 'una salida');
    for (let k = 0; k < 7; k++) await m.fn.procesarCola();
    igual(m.visto.intentos, 0, 'ni un intento contra la base');
    igual(m.cola().length, 1, 'la operación sigue anotada');
    igual(m.cola()[0].intentos, 0, 'sin fallos sumados: no se bloquea');
});

grupo('al abrir la sesión, sube', async () => {
    const m = montar(false);
    await m.fn.withSync('logMovementsWithStock', [[]], 'una salida');
    // Se abre la sesión: los manejadores leen la referencia viva.
    (m.c.sesionRef as { current: boolean }).current = true;
    await m.fn.procesarCola();
    igual(m.cola().length, 0, 'la cola quedó vacía');
});

await cerrar();
