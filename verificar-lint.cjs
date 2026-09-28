/*
 * verificar-lint.cjs — `npm run lint` que se puede creer
 * ======================================================
 * POR QUÉ EXISTE
 *
 * `npm run lint` es `tsc --noEmit`, y en este repositorio **siempre sale con
 * código 2**, pase lo que pase: `pdfjs-dist`, `tesseract.js`, `mammoth`, `docx`,
 * `dompurify` y `xlsx` no se pueden instalar en los entornos donde se escribe
 * este código —`xlsx` se baja de un CDN bloqueado y tumba cualquier
 * `npm install`—. Con el código de salida siempre en rojo, es humano empezar a
 * mirar la salida «a ojo»… y ahí fue donde se coló un modal roto a producción:
 * `tsc` estaba abortando sin revisar NI UN ARCHIVO y la salida filtrada se veía
 * limpia.
 *
 * Esto separa las dos cosas:
 *   · errores del ENTORNO (módulos que no están) → se cuentan y se ignoran;
 *   · errores del CÓDIGO → hacen fallar con código 1.
 *
 * Y comprueba lo que de verdad importa: que `tsc` **esté revisando**. Si aborta
 * por TS2688 —el tipo `vite/client` que falta cuando `vite` no está instalado—
 * no revisa nada, y eso acá es un fallo, no un silencio.
 */
const { execFileSync } = require('node:child_process');

/** Módulos que este entorno no puede instalar. No son errores del código. */
const DEL_ENTORNO = [
    "Cannot find module 'dompurify'", "Cannot find module '@huggingface/transformers'",
    "Cannot find module 'pdfjs-dist'", "Cannot find module 'tesseract.js'",
    "Cannot find module 'mammoth'", "Cannot find module 'xlsx'",
    "Cannot find module 'docx'", "Cannot find module '@vitejs/plugin-react'",
    'TS2347',
];

let salida = '';
try {
    salida = execFileSync('npx', ['--yes', 'tsc', '--noEmit'], { encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
    salida = `${e.stdout ?? ''}${e.stderr ?? ''}`;
}

const lineas = salida.split('\n').filter(l => l.includes('error TS'));

// TS2688 = falta un tipo del `types` de tsconfig. Con eso `tsc` ABORTA y no
// revisa un solo archivo: la salida sale vacía y parece que todo está bien.
if (lineas.some(l => l.includes('TS2688'))) {
    console.error('✗ `tsc` ABORTÓ sin revisar nada (TS2688: falta un tipo de los declarados en tsconfig).');
    console.error('  Una salida vacía acá NO significa que esté limpio. Instalá los paquetes con tipos:');
    console.error('    mkdir -p /tmp/tipos && cd /tmp/tipos && npm init -y');
    console.error('    npm i vite react react-dom @types/react @types/react-dom @supabase/supabase-js');
    console.error('    cp -rn /tmp/tipos/node_modules/* <repo>/node_modules/');
    process.exit(1);
}

const delCodigo = lineas.filter(l => !DEL_ENTORNO.some(p => l.includes(p)));
const delEntorno = lineas.length - delCodigo.length;

if (delCodigo.length > 0) {
    console.error(delCodigo.join('\n'));
    console.error(`\n✗ ${delCodigo.length} error(es) de TIPOS en el código.`);
    process.exit(1);
}

console.log(`✓ Tipos limpios. (${delEntorno} error(es) por módulos que este entorno no puede instalar, ignorados a propósito.)`);
