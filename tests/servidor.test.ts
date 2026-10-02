/**
 * tests/servidor.test.ts — Que las ventanillas ARRANQUEN como en Vercel
 * =====================================================================
 * EL FALLO QUE ATRAPA, y estuvo en producción desde el PR #76:
 *
 * `/api/despacho`, `/api/consulta` y `/api/registro` respondían
 * `FUNCTION_INVOCATION_FAILED` a TODO, sin llegar a mirar el token. Vercel
 * compila cada archivo por separado y los corre como módulos ES (porque
 * `package.json` dice `"type": "module"`), y en Node un módulo ES exige la
 * extensión en cada import: `'../core/despacho'` no existe, `'../core/despacho.js'`
 * sí. Toda la suite pasaba en verde porque `tsx` perdona la extensión que falta.
 *
 * Esta prueba hace lo que hace Vercel: transpila CADA archivo que alcanzan las
 * ventanillas, uno por uno, a una carpeta aparte, y los carga con el `import`
 * de Node de verdad. Si un import no tiene extensión, revienta acá con el mismo
 * `ERR_MODULE_NOT_FOUND` que en producción.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import { igual, esCierto, grupo, cerrar } from './correr';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Dentro del repo, para que `@supabase/supabase-js` se resuelva desde node_modules.
const SALIDA = path.join(RAIZ, 'node_modules', '.prueba-servidor');
const VENTANILLAS = ['api/despacho.ts', 'api/consulta.ts', 'api/registro.ts', 'api/latido.ts'];

/** Transpila un archivo y los que importa, siguiendo SOLO los imports relativos. */
const transpilarGrafo = (): string[] => {
    fs.rmSync(SALIDA, { recursive: true, force: true });
    fs.mkdirSync(SALIDA, { recursive: true });
    fs.writeFileSync(path.join(SALIDA, 'package.json'), JSON.stringify({ type: 'module' }));
    const vistos = new Set<string>();
    const pendientes = VENTANILLAS.map(v => path.join(RAIZ, v));
    while (pendientes.length) {
        const archivo = pendientes.pop()!;
        if (vistos.has(archivo)) continue;
        vistos.add(archivo);
        const fuente = fs.readFileSync(archivo, 'utf8');
        const js = ts.transpileModule(fuente, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
        }).outputText;
        const destino = path.join(SALIDA, path.relative(RAIZ, archivo)).replace(/\.tsx?$/, '.js');
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, js);
        for (const m of fuente.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
            const base = path.resolve(path.dirname(archivo), m[1].replace(/\.js$/, ''));
            const real = ['.ts', '.tsx'].map(e => base + e).find(f => fs.existsSync(f));
            if (real) pendientes.push(real);
        }
    }
    return [...vistos].map(f => path.relative(RAIZ, f));
};

/**
 * Se carga en un `node` APARTE, sin nada más. Esta prueba corre dentro de
 * `tsx`, y `tsx` engancha su propio resolvedor a todo el proceso: completa la
 * extensión que falta. La primera versión de esta prueba pasó en verde con el
 * defecto adentro por eso — el mismo engaño que la escondió en producción.
 */
const nodePuro = (codigo: string) => spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    cwd: RAIZ, encoding: 'utf8', env: { PATH: process.env.PATH, BODEGA_API_TOKEN: 'prueba', SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'x' },
});

grupo('las tres ventanillas CARGAN con los módulos ES de Node, como en Vercel', () => {
    const archivos = transpilarGrafo();
    esCierto(archivos.length > 5, `se siguió el grafo de imports (${archivos.length} archivos)`);
    for (const v of VENTANILLAS) {
        const url = pathToFileURL(path.join(SALIDA, v.replace(/\.ts$/, '.js'))).href;
        const r = nodePuro(`const m = await import(${JSON.stringify(url)}); if (typeof m.default !== 'function') throw new Error('sin manejador');`);
        const error = (r.stderr.match(/Error[^\n]*/)?.[0] ?? '').slice(0, 160);
        igual(r.status === 0 ? '' : error || `salió con ${r.status}`, '', `${v} arranca sin ERR_MODULE_NOT_FOUND`);
    }
});

grupo('y responden: sin token no pasa nadie, pero SÍ contestan', () => {
    const url = pathToFileURL(path.join(SALIDA, 'api/consulta.js')).href;
    const r = nodePuro(`
        const { default: h } = await import(${JSON.stringify(url)});
        const cods = [];
        const res = { status: c => { cods.push(c); return res; }, json: () => {} };
        await h({ method: 'POST', headers: {}, body: {} }, res);
        await h({ method: 'GET', headers: {} }, res);
        console.log(JSON.stringify(cods));`);
    igual(r.status, 0, 'el proceso terminó bien');
    igual((r.stdout.trim().split('\n').pop() ?? ''), '[401,405]', 'sin token: 401; GET: 405 — respuestas, no una caída');
});

await cerrar();
