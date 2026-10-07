/**
 * tests/navegador/recorrido.mjs — La app en un navegador DE VERDAD, en celular
 * ===========================================================================
 * Hasta el 7-oct-2026 nada se había probado tocando la pantalla: las suites
 * prueban funciones y manejadores por dentro. Esto abre la app compilada en
 * Chromium, del tamaño de un celular, contra un Supabase FALSO
 * (`falso-supabase.mjs`) —nunca la base real—, hace lo que haría Juli y revisa
 * lo que la app MANDÓ al servidor.
 *
 * No entra en `npm run test` porque necesita Chromium y `playwright-core`:
 *
 *   npm i --prefix /tmp/pw playwright-core@1.56.0
 *   VITE_SUPABASE_URL=http://supabase.falso VITE_SUPABASE_ANON_KEY=x \
 *     npx vite build --outDir /tmp/dist-falso
 *   PW=/tmp/pw/node_modules/playwright-core node tests/navegador/recorrido.mjs /tmp/dist-falso /tmp/capturas
 *
 * Sale con código 1 si algo falla. Deja una captura por paso.
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { montarSupabaseFalso } from './falso-supabase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ?? 'playwright-core');
const [DIST, CAPTURAS = '/tmp/capturas'] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(CAPTURAS, { recursive: true });

// ── Servidor estático de la app compilada ──
const TIPOS = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const servidor = http.createServer((q, r) => {
    let f = path.join(DIST, decodeURIComponent(new URL(q.url, 'http://x').pathname));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
    r.writeHead(200, { 'content-type': TIPOS[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
}).listen(4321);

// ── Resultados ──
let fallas = 0, paso = 0;
const ok = (cond, que) => { console.log(`  ${cond ? '✓' : '✗'} ${que}`); if (!cond) fallas++; };
const igual = (a, b, que) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(s, que); if (!s) console.log(`      esperaba ${JSON.stringify(b)}\n      obtuvo   ${JSON.stringify(a)}`); };

const browser = await chromium.launch({ executablePath: CHROME });
/** Una sesión limpia: celular, Bogotá, sin service worker, con el Supabase falso. */
const abrir = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-CO', timezoneId: 'America/Bogota' });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(String(e)));
    const est = await montarSupabaseFalso(page);
    const foto = async (nombre) => { await page.screenshot({ path: path.join(CAPTURAS, `${String(++paso).padStart(2, '0')}-${nombre}.png`), fullPage: false }); };
    return { ctx, page, est, errores, foto };
};
const entrar = async ({ page, foto }) => {
    await page.goto('http://localhost:4321/');
    await page.getByText('Bodeguero').click();
    await page.getByText('Administrador maestro').click();
    const clave = page.locator('input[type=password]').first();
    await clave.fill('clave-de-prueba');
    await clave.press('Enter');
    await page.getByText('Resumen').first().waitFor({ timeout: 10000 });
    await foto('adentro');
};
const abrirBloque = async ({ page, foto }, texto) => {
    await page.getByLabel('Abrir asistente').click();
    await page.getByText('📋 Bloque').click();
    await page.locator('textarea').last().fill(texto);
    await foto('bloque-pegado');
    await page.getByText('Leer el bloque').click();
    await page.waitForTimeout(600);
};
/** Lo último que se mandó a registrar, como lo vio el servidor. */
const despachos = (est) => est.rpc.filter(x => x.fn === 'log_movements_and_update_stock').flatMap(x => x.args.p_movements);

// ─────────────────────────────────────────────────────────────────────────
console.log('\n1. Entrada');
{
    const s = await abrir();
    await s.page.goto('http://localhost:4321/');
    igual([await s.page.getAttribute('html', 'lang'), await s.page.getAttribute('html', 'translate')], ['es', 'no'], 'la página está en español y sin traductor');
    await s.page.getByText('Bodeguero').click();
    await s.foto('quien-eres');
    const texto = await s.page.innerText('body');
    ok(['Administrador maestro', 'Camilo', 'Kate'].every(n => texto.includes(n)), 'las 3 tarjetas: Administrador maestro, Camilo y Kate');
    ok(!/Julio/.test(texto), 'ninguna dice «Julio»');
    ok((texto.match(/Primera vez/g) ?? []).length === 2, 'Camilo y Kate dicen «Primera vez»');
    await s.page.getByText('Administrador maestro').click();
    const clave = s.page.locator('input[type=password]').first();
    await clave.fill('una-clave-mala'); await clave.press('Enter');
    await s.page.waitForTimeout(1500);
    ok(await clave.isVisible(), 'con una clave mala NO entra');
    await s.foto('clave-mala');
    await clave.fill('clave-de-prueba'); await clave.press('Enter');
    await s.page.locator('input[type=password]').first().waitFor({ state: 'detached', timeout: 10000 });
    ok(true, 'con la clave buena entra');
    await s.page.waitForTimeout(800);
    await s.foto('al-entrar');
    const menu = await s.page.locator('aside').first().boundingBox();
    ok(!!menu && menu.x + menu.width <= 1, 'en el celular el menú arranca cerrado: no tapa la pantalla');
    ok(s.errores.length === 0, `sin errores de página${s.errores.length ? ': ' + s.errores.join(' | ') : ''}`);
    await s.ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n2. 📋 Bloque nuevo: la mañana del 3-oct, con FECHA');
const MANANA = `=== ENTREGA ===
TRABAJADOR: Adrián Echeverry
PROYECTO: CRISTO
FECHA: 03/10/2026
HORA: 08:04
LUGAR: contenedor

[CONSUMIBLES]
- 2 Soudal
- 1 Brocha 2"
- 10 kg Lechada veige

[HERRAMIENTAS MANUALES]
- 1 Almadana
=== FIN ===

=== ENTREGA ===
TRABAJADOR: Jorman
PROYECTO: ZONA GENERAL
FECHA: 03/10/2026
HORA: 09:07

[HERRAMIENTAS ELÉCTRICAS]
- 1 Taladro Inhalambrico Amarillo Stanley

[CONSUMIBLES]
- 5 Lija 180
=== FIN ===`;
{
    const s = await abrir();
    await entrar(s);
    await abrirBloque(s, MANANA);
    await s.foto('bloque-leido');
    const texto = await s.page.innerText('body');
    ok(texto.includes('Adrián Echeverry') && texto.includes('Jorman'), 'las dos entregas se leyeron');
    ok(texto.includes('Sí, crear «Soudal»'), 'Soudal no existe: pregunta si lo crea');
    ok(texto.includes('Sí, crear «Lija 180»'), 'Lija 180 no existe: ofrece crearla con su nombre entero, y no la cambia por la 240');
    ok(texto.includes('CRISTO · 03/10/2026 · 08:04 · contenedor'), 'el renglón dice la obra, la FECHA y la hora de su entrega');
    await s.page.getByText('Sí, crear «Soudal»').click();
    await s.page.getByText('Sí, crear «Lija 180»').click();
    await s.page.waitForTimeout(400);
    await s.foto('creados');
    const confirmar = s.page.getByText(/✓ Pedido correcto \(\d+\)/);
    const n = await confirmar.count();
    ok(n === 2, `hay un «✓ Pedido correcto» por trabajador (${n})`);
    for (let k = 0; k < n; k++) { await s.page.getByText(/✓ Pedido correcto \(\d+\)/).first().click(); await s.page.waitForTimeout(300); }
    await s.foto('confirmados');
    const tarjetas = await s.page.innerText('body');
    ok(tarjetas.includes('03/10/2026 · 08:04'), 'la tarjeta de Adrián dice la fecha y la hora del bloque');
    ok(/Consumibles[\s\S]*Herramientas manuales/i.test(tarjetas), 'la tarjeta agrupa por categoría, como el bloque');
    await s.page.getByText(/Registrar \d+ listo/).click();
    await s.page.waitForTimeout(1500);
    await s.foto('registrado');

    const llamadas = s.est.rpc.filter(x => x.fn === 'log_movements_and_update_stock').length;
    igual(llamadas, 1, 'el despacho sube UNA vez (antes la fila lo mandaba dos)');
    const movs = despachos(s.est);
    const creados = s.est.escrituras.filter(e => e.tabla === 'items' && e.metodo === 'POST').map(e => e.fila);
    const nombreDe = (id) => s.est.db.items.find(i => i.id === id)?.name ?? id;
    console.log('     enviados:', movs.map(m => `${m.type} ${m.quantity} ${nombreDe(m.item_id)} ${m.timestamp} ${m.project_id ?? '-'} ${m.is_loan ? 'préstamo' : ''}`).join(' | '));
    igual(creados.length, 2, 'cada ítem nuevo se crea UNA vez');
    igual(creados.map(c => [c.name, c.inventory_type, Number(c.quantity)]).sort(),
        [['Lija 180', 'Material de Consumo', 0], ['Soudal', 'Material de Consumo', 0]], 'nacen Soudal y Lija 180, consumibles, en cero');
    const salidas = movs.filter(m => m.type === 'Salida');
    igual(salidas.map(m => nombreDe(m.item_id)).sort(),
        ['Almadana', 'Brocha 2"', 'Lechada veige', 'Lija 180', 'Soudal', 'Taladro Inhalambrico (Amarillo · Stanley)'], 'salen las 6 cosas, con los ítems correctos');
    const deAdrian = salidas.filter(m => m.personnel_id === 'p-adrian');
    ok(deAdrian.length === 4 && deAdrian.every(m => m.timestamp === '2026-10-03T13:04:00.000Z' && m.project_id === 'o-cristo'),
        'lo de Adrián: 3-oct 08:04 en Bogotá, obra CRISTO');
    ok(salidas.filter(m => m.personnel_id === 'p-jorman').every(m => m.timestamp === '2026-10-03T14:07:00.000Z' && m.project_id === 'o-zona'),
        'lo de Jorman: 3-oct 09:07, ZONA GENERAL');
    igual(salidas.filter(m => m.is_loan).map(m => nombreDe(m.item_id)).sort(), ['Almadana', 'Taladro Inhalambrico (Amarillo · Stanley)'],
        'préstamo solo la almadana y el taladro; lo demás es gasto');
    igual(Number(salidas.find(m => nombreDe(m.item_id) === 'Lechada veige')?.quantity), 10, 'la lechada sale por 10 (kg)');
    const entradas = movs.filter(m => m.type === 'Entrada');
    igual(entradas.map(m => [nombreDe(m.item_id), Number(m.quantity)]).sort(), [['Lija 180', 5], ['Soudal', 2]],
        'lo que no había entra antes de salir («lo que no haya, cargalo»)');
    ok(s.est.desconocidas.length === 0, `la app no pidió nada que el servidor falso no conozca ${s.est.desconocidas.join(', ')}`);
    ok(s.errores.length === 0, `sin errores de página${s.errores.length ? ': ' + s.errores.join(' | ') : ''}`);
    await s.ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n3. FECHA futura: avisa en la tarjeta y no manda nada');
{
    const s = await abrir();
    await entrar(s);
    await abrirBloque(s, `=== ENTREGA ===\nTRABAJADOR: William\nPROYECTO: CRISTO\nFECHA: 01/01/2099\n\n[HERRAMIENTAS MANUALES]\n- 1 Pala\n=== FIN ===`);
    await s.foto('fecha-futura');
    const texto = await s.page.innerText('body');
    ok(texto.includes('La FECHA 01/01/2099 es futura'), 'la tarjeta dice que la fecha es futura');
    ok(await s.page.getByText('Nada listo todavía').isVisible(), 'el botón de registrar dice «Nada listo todavía»');
    igual(despachos(s.est).length, 0, 'no se mandó nada al servidor');
    await s.ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n4. El formato viejo sigue registrando');
{
    const s = await abrir();
    await entrar(s);
    await abrirBloque(s, `@ CRISTO · 07:30 · contenedor\nWilliam: 2 codos de 2, 1 pala`);
    await s.foto('formato-viejo');
    const n = await s.page.getByText(/✓ Pedido correcto \(\d+\)/).count();
    ok(n === 1, 'una tarjeta para William');
    await s.page.getByText(/✓ Pedido correcto \(\d+\)/).first().click();
    await s.page.getByText(/Registrar \d+ listo/).click();
    await s.page.waitForTimeout(1200);
    const movs = despachos(s.est);
    const nombre = (id) => s.est.db.items.find(i => i.id === id)?.name;
    igual(movs.map(m => [m.type, nombre(m.item_id), Number(m.quantity), m.project_id, m.is_loan]).sort(),
        [['Salida', 'Codos 2"', 2, 'o-cristo', false], ['Salida', 'Pala', 1, 'o-cristo', true]], '«codos de 2» es Codos 2"; la pala, préstamo; obra CRISTO');
    ok(movs.every(m => m.personnel_id === 'p-william'), 'a nombre de William');
    ok(s.errores.length === 0, 'sin errores de página');
    await s.ctx.close();
}

await browser.close();
servidor.close();
console.log(fallas ? `\n✗ ${fallas} falla(s)` : '\n✓ todo bien');
process.exit(fallas ? 1 : 0);
