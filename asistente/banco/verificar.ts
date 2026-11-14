/**
 * asistente/banco/verificar.ts — ¿Lo que entrega el asistente lo registra bien la app?
 * ====================================================================================
 * El banco de pruebas del 14-nov: un agente hace de asistente con
 * `INSTRUCCIONES.md` + `BODEGA-MONTECIELO.md` y responde los escenarios de
 * `ESCENARIOS.md`. Este script lee cada respuesta (`out-E01.md`…), saca el
 * bloque, lo lee con el lector REAL de la app (`leerLote`) contra el catálogo
 * del MISMO documento de conocimiento y revisa lo que tiene que pasar.
 *
 *   npx tsx asistente/banco/verificar.ts <carpeta-con-out-E*.md>
 *
 * No es parte de `npm run test`: las respuestas las produce un modelo, cambian
 * cada vez, y no viven en el repo. Lo que sí vive acá es QUÉ se exige.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InventoryType, Item, Personnel, Project } from '../../types';
import { leerLote, LoteParseado } from '../../utils/lote';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const conocimiento = fs.readFileSync(path.join(AQUI, '..', 'BODEGA-MONTECIELO.md'), 'utf8');

// ── El catálogo del documento, tal cual lo ve el asistente ──
const TIPOS: Record<string, InventoryType> = {
    'CONSUMIBLES': InventoryType.SINGLE_USE, 'HERRAMIENTAS MANUALES': InventoryType.HAND_TOOL,
    'HERRAMIENTAS ELÉCTRICAS': InventoryType.ELECTRICAL_TOOL, 'EPP': InventoryType.PPE,
};
const ITEMS: Item[] = [];
let tipo: InventoryType | undefined;
for (const linea of conocimiento.slice(conocimiento.indexOf('## 9.'), conocimiento.indexOf('## 10.')).split('\n')) {
    const t = linea.match(/^### (.+)$/); if (t) { tipo = TIPOS[t[1].trim()]; continue; }
    const f = linea.match(/^- \*\*[^*]+\*\*[^:]*:\s*(.+)$/);
    if (!f || !tipo) continue;
    // « · » separa ítems, pero NO dentro de «(Verde · Siata)», que es color · marca.
    for (const crudo of f[1].split(/ · (?![^(]*\))/)) {
        const name = crudo.replace(/\[[^\]]*\]/g, '').replace(/⚠.*$/, '').replace(/\((?:catapis)\)/, '').trim();
        if (name) ITEMS.push({ id: `i${ITEMS.length}`, name, quantity: 5, inventoryType: tipo, category: 'x', subCategory: '', minStock: 0, unit: 'unidades' });
    }
}
const GENTE: Personnel[] = conocimiento.slice(conocimiento.indexOf('## 10.'), conocimiento.indexOf('- **Alex es'))
    .split('\n').slice(1).join(' ').split(' · ').map(n => n.replace(/\*\*/g, '').replace(/\(OFICIAL\)/, '').trim()).filter(Boolean)
    .map((name, k) => ({ id: `p${k}`, name, ...(name === 'Alex' ? { isTeamLeader: true } : {}) }));
const OBRAS: Project[] = conocimiento.slice(conocimiento.indexOf('## 12.'), conocimiento.indexOf('## 13.'))
    .split('\n').slice(1).join(' ').split(' · ').map(n => n.replace(/\*\*/g, '').trim()).filter(Boolean)
    .map((name, k) => ({ id: `o${k}`, name, status: 'active' }) as Project);

// ── Lo que se exige en cada escenario ──
type Chequeo = (r: LoteParseado, texto: string) => Array<[boolean, string]>;
const nombres = (r: LoteParseado) => r.lineas.map(l => l.persona?.name ?? l.personaTexto);
const elementos = (r: LoteParseado) => r.lineas.flatMap(l => l.items.map(i => `${i.cantidad} ${i.nombre}`));
const tiene = (r: LoteParseado, re: RegExp) => elementos(r).some(e => re.test(e));
const cierre = (t: string): [boolean, string] => [/Si está malo, decime qué le modificamos\. Si está bueno, dejalo así, Juli\./.test(t), 'cierra con la frase de Juli'];
const fechas = (r: LoteParseado, f: string): [boolean, string] => [r.lineas.length > 0 && r.lineas.every(l => l.encabezado?.fecha === f), `cada entrega con FECHA ${f}`];

const CHEQUEOS: Record<string, Chequeo> = {
    E01: (r, t) => [
        [!nombres(r).some(n => /Ricardo/.test(n)), 'Ricardo «nuevo» NO está en el bloque (pregunta pendiente)'],
        [/Lo que falta/.test(t) && /Ricardo/.test(t.slice(t.indexOf('Lo que falta'))), 'pregunta por Ricardo nuevo'],
        [!/[¿?][^\n]*proyecto/i.test(t), 'no pregunta el proyecto'],
        [tiene(r, /Silicona negra/) && tiene(r, /poliuretano/i), 'corrige silicomas y polibreta'],
        [!tiene(r, /Brocha 2"/), 'la brocha NO se supone de 2" (hay tres)'],
        [tiene(r, /Lija 180/) && !tiene(r, /Lija 180"/), 'Lija 180 sin "'],
        [r.ignoradas.length === 0, 'la app lee todo, sin «no leídos»'],
        fechas(r, '2026-10-03'), cierre(t),
    ],
    E02: (r, t) => [
        [!nombres(r).some(n => /Diego/.test(n)), 'la entrega de Diego espera el color'],
        [/verde, rojo, amarillo, azul/i.test(t), 'pregunta el color'],
        cierre(t),
    ],
    E03: (r, t) => [[r.lineas[0]?.items.some(i => i.cantidad === 2 && /tub/i.test(i.nombre) && !!i.item) ?? false, '12 m = 2 tubos y la app los encuentra'], fechas(r, '2026-11-14'), cierre(t)],
    E04: (r, t) => [[/tub/i.test(t) && !/\b8 Tub/i.test(t), 'no despacha 8 tubos por 8 metros'], cierre(t)],
    E05: (r, t) => [[tiene(r, /^3 .*tub.*el[eé]ctric/i), '6 m de eléctrico = 3 tubos'], cierre(t)],
    E06: (r, t) => [[r.lineas.length === 2 && r.lineas.every(l => OBRAS.find(o => o.id === l.obraId)?.name === 'CRISTO'), 'los dos a CRISTO'], cierre(t)],
    E07: (r, t) => [[r.lineas[0]?.items.length === 2, 'radial y pulidora, sin preguntar cuál'], [!/Lo que falta/.test(t), 'no pregunta cuál'], cierre(t)],
    E08: (r, t) => [[tiene(r, /Clavos.*hierro.*2/i) && tiene(r, /Clavos.*hierro.*3/i), 'hierro como encabezado: clavos de hierro'], [tiene(r, /Clavos acero 1\.5"/), '1 acero 1-1/2 → Clavos acero 1.5"'], cierre(t)],
    E09: (r, t) => [[!nombres(r).some(n => /Jes[uú]s/.test(n)), 'la devolución no va en el bloque'], [/Renglones sueltos/.test(t), 'el pendiente va como renglón suelto'], [nombres(r).some(n => /Ra[uú]l/.test(n)), 'Raúl sí sale'], cierre(t)],
    E10: (r, t) => [[r.lineas.length === 2 && r.lineas.map(l => l.encabezado?.fecha).join() === '2026-11-12,2026-11-13', 'dos días = dos entregas, cada una en su FECHA'], cierre(t)],
    E11: (r, t) => [[nombres(r).includes('Alex'), 'Alex sale como Alex (la app pregunta la cuadrilla)'], [r.lineas.length === 2, 'dos entregas'], cierre(t)],
    E12: (r, t) => [[!r.lineas.some(l => l.encabezado?.fecha && l.encabezado.fecha > '2026-11-14'), 'ninguna FECHA futura en el bloque'], cierre(t)],
    E13: (r, t) => [[r.lineas.length === 1 && !r.lineas[0].encabezado?.hora, 'sin hora inventada'], [tiene(r, /Brocha 3"/), 'Brocha 3"'], cierre(t)],
    E14: (r, t) => [[/----- TURNO 2 -----/.test(t) && /registraste/i.test(t.split('----- TURNO 2 -----')[1] ?? ''), 'en el turno 2 pregunta si ya registró la anterior'], cierre(t)],
    E15: (r, t) => [[!nombres(r).some(n => /Ricardo/.test(n)), 'Ricardo nuevo espera'], [r.lineas.every(l => OBRAS.some(o => o.id === l.obraId)), 'el consumible no sale SIN PROYECTO'], cierre(t)],
    E16: (r, t) => [[/repetid|dos entregas/i.test(t), 'pregunta si está repetido'], cierre(t)],
    E17: (r, t) => [[tiene(r, /Codos 1 1\/2"|1-1\/2"|1\.5"/), 'uno y media = 1 1/2"'], [tiene(r, /Semicodos 6"/), 'semicodo de 6'], cierre(t)],
    E18: (r, t) => [[r.lineas[0]?.items.length === 3, 'los tres, aunque no existan'], [r.ignoradas.length === 0, 'sin «no leídos»'], cierre(t)],
    E19: (r, t) => [[tiene(r, /Lechada gris/), 'lechada gris'], [tiene(r, /Hiperciclyl/), 'hiperciclil → Hiperciclyl'], cierre(t)],
    E20: (r, t) => [[tiene(r, /^3 .*[Tt]ub.*verde.*4"/), '3 tubos verdes de 4"'], [tiene(r, /^2 Y 4"/), '2 Y de 4"'], cierre(t)],
};

if (process.env.DEBUG) console.log(ITEMS.length, 'ítems ·', GENTE.length, 'personas ·', OBRAS.map(o => o.name).join(', '));
const carpeta = process.argv[2];
if (!carpeta) { console.error('Uso: npx tsx asistente/banco/verificar.ts <carpeta>'); process.exit(2); }
let fallas = 0, total = 0;
for (const [id, chequeo] of Object.entries(CHEQUEOS)) {
    const archivo = path.join(carpeta, `out-${id}.md`);
    if (!fs.existsSync(archivo)) { console.log(`${id}: (sin respuesta)`); continue; }
    const texto = fs.readFileSync(archivo, 'utf8');
    // El último bloque de código que traiga ENTREGA (en E14, el del turno 2 si lo hay).
    const bloques = [...texto.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m => m[1]).filter(b => /=== ENTREGA ===/.test(b));
    const r = leerLote(bloques.join('\n'), GENTE, ITEMS, OBRAS);
    const res = chequeo(r, texto);
    const malos = res.filter(([ok]) => !ok);
    total += res.length; fallas += malos.length;
    console.log(`${malos.length ? '✗' : '✓'} ${id}  ${res.length - malos.length}/${res.length}${malos.map(([, d]) => `\n     ✗ ${d}`).join('')}`);
}
console.log(`\n${total - fallas}/${total} exigencias cumplidas`);
process.exit(fallas ? 1 : 0);
