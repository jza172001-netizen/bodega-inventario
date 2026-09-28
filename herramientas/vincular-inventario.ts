/**
 * herramientas/vincular-inventario.ts — Tu inventario definitivo contra la app
 * ============================================================================
 * EN SECO. No escribe nada: lee la lista (inventario-definitivo.json) y una
 * foto de producción, y dice renglón por renglón qué haría. Se aplica solo
 * cuando este informe esté revisado.
 *
 *   npx tsx herramientas/vincular-inventario.ts <foto-produccion.json> > INFORME.md
 *
 * Las reglas del HANDOFF que no se negocian:
 *  · La lista manda, pero NADA se borra: lo que la app tiene de más se marca
 *    para revisar.
 *  · Lo que entra, entra con su entrada de apertura: el Kardex sigue cuadrando.
 *  · Lo confirmado (B.4) entra como préstamo; lo de B.5 como asignación
 *    pendiente, NUNCA como préstamo a la persona «posible».
 *  · Lo que ya está registrado no se duplica.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Movement, Personnel } from '../types';
import { getActiveLoans } from '../utils/inventory';
import { rankMatches } from '../utils/search';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const lista = JSON.parse(fs.readFileSync(path.join(AQUI, 'inventario-definitivo.json'), 'utf8'));
const foto = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const items: Array<{ id: string; name: string; inventoryType: string; quantity: number }> = foto.items;
const personal: Personnel[] = foto.personnel;
const movs: Movement[] = (foto.movements as Movement[]).map(m => ({ ...m, quantity: Number(m.quantity) }));
const activos = getActiveLoans(movs);
const nombreItem = (id: string) => items.find(i => i.id === id)?.name ?? id;
const nombrePersona = (id?: string) => personal.find(p => p.id === id)?.name ?? 'Sin asignar';

/** La persona de la lista en el personal de la app, con la regla del bloque. */
const persona = (texto: string): Personnel | undefined => {
    const r = rankMatches(personal, texto, p => [p.name], 2);
    return r[0] && r[0].score >= 500 ? r[0].value : undefined;
};

/** Las personas que nombra un «posibles: …» de la lista, ya reconocidas. */
const posiblesIds = (texto?: string): Set<string> => new Set(
    (texto ?? '').split(/[,/()]| y |→/).map(t => t.replace(/\b(kardex|planilla|truper gris|da vinci|y otros hist[oó]ricos|verificar tambi[eé]n a|el oficial)\b/gi, '').trim())
        .filter(t => t.length >= 3).map(t => persona(t)?.id).filter((x): x is string => !!x));

const out: string[] = [];
const p = (s = '') => out.push(s);
let aperturas = 0, prestamos = 0, asignaciones = 0, revisar = 0, yaEsta = 0;

p('# Informe en seco — inventario definitivo contra la app');
p();
p(`Foto de producción: ${foto.tomada}. Lista: ${lista.procedencia}.`);
p();
p('**Nada de esto se ha aplicado.** Es lo que se haría. ➕ = se agregaría (con entrada de apertura), ✓ = ya está, ⚠ = revisar a mano, 📍 = asignación por verificar.');
p();
p('## Herramientas eléctricas (Apéndice B)');

for (const f of lista.electricas) {
    const re = new RegExp(f.patron);
    const suyos = items.filter(i => re.test(norm(i.name)));
    const ids = new Set(suyos.map(i => i.id));
    const bodegaApp = suyos.reduce((s, i) => s + Number(i.quantity), 0);
    const prestadosApp = activos.filter(m => ids.has(m.itemId));
    const afueraApp = prestadosApp.reduce((s, m) => s + m.quantity, 0);
    const confirmadas = f.confirmadas.reduce((s: number, c: { cantidad: number }) => s + c.cantidad, 0);
    const verificar = f.porVerificar.reduce((s: number, v: { cantidad: number }) => s + v.cantidad, 0);
    const sumaLista = f.bodegaBuenas + f.bodegaMalas + confirmadas + verificar;

    p();
    p(`### ${f.familia} — lista ${f.total}, app ${bodegaApp + afueraApp} (${bodegaApp} en bodega + ${afueraApp} prestadas)`);
    if (suyos.length === 0) p('- ⚠ La app no tiene NINGÚN ítem de esta familia. Habría que crearlo (nombre, marca y color los dice quien lo tiene en la mano).');
    else p(`- Ítems en la app: ${suyos.map(i => `${i.name} (${i.quantity})`).join(' · ')}`);
    if (sumaLista !== f.total) {
        p(`- ⚠ **La lista no cuadra consigo misma:** bodega ${f.bodegaBuenas + f.bodegaMalas} + confirmadas ${confirmadas} + por verificar ${verificar} = ${sumaLista}, y el total dice ${f.total}. Pendiente documental: decidir cuál número manda.`);
        revisar++;
    }

    // Préstamos confirmados (B.4)
    const usados = new Set<string>();
    for (const c of f.confirmadas) {
        const quien = persona(c.persona);
        const suyo = quien ? prestadosApp.filter(m => m.personnelId === quien.id && !usados.has(m.id)) : [];
        const cubre = suyo.reduce((s, m) => s + m.quantity, 0);
        suyo.forEach(m => usados.add(m.id));
        if (!quien) { p(`- ⚠ «${c.persona}» no está en el personal de la app. Crear la persona antes de registrarle el préstamo.`); revisar++; continue; }
        if (cubre >= c.cantidad) { p(`- ✓ ${c.cantidad} con ${quien.name}: ya registrado (${suyo.map(m => nombreItem(m.itemId)).join(', ')}). No se toca.`); yaEsta++; continue; }
        const falta = c.cantidad - cubre;
        p(`- ➕ Préstamo confirmado: ${falta} a ${quien.name}${c.detalle ? ` (${c.detalle})` : ''} — entrada de apertura + salida. Ítem a elegir entre: ${suyos.map(i => i.name).join(' / ') || 'crear uno'}.`);
        aperturas++; prestamos++;
    }
    // Préstamos en la app que la lista NO trae como confirmados
    for (const m of prestadosApp.filter(x => !usados.has(x.id))) {
        const nombre = nombrePersona(m.personnelId);
        const enPosibles = f.porVerificar.some((v: { posibles?: string }) => posiblesIds(v.posibles).has(m.personnelId ?? ''));
        p(`- ${enPosibles ? '✓' : '⚠'} La app tiene ${m.quantity} × ${nombreItem(m.itemId)} con ${nombre}${enPosibles
            ? ' — la lista lo tenía como POSIBLE; en la app ya está confirmado. Se resta de lo por verificar.'
            : ' — la lista no lo menciona. No se borra: revisar si sigue con esa persona.'}`);
        if (enPosibles) yaEsta++; else revisar++;
    }

    // Bodega
    const bodegaLista = f.bodegaBuenas + f.bodegaMalas;
    if (bodegaApp < bodegaLista) { p(`- ➕ Bodega: la lista dice ${bodegaLista}, la app ${bodegaApp}. Entrada de apertura por ${bodegaLista - bodegaApp}.`); aperturas++; }
    else if (bodegaApp > bodegaLista) { p(`- ⚠ Bodega: la app tiene ${bodegaApp} y la lista ${bodegaLista}. **No se borra nada**: contar en la bodega; puede ser una prestada que se devolvió sin registrar.`); revisar++; }
    else p(`- ✓ Bodega: ${bodegaApp}, igual en los dos.`);
    if (f.bodegaMalas > 0) p(`- 🔧 ${f.bodegaMalas} en mal estado (B.3${f.malasDetalle ? `: ${f.malasDetalle.join(' ')}` : ''}): se marcaría «dañada» en el ítem que corresponda. Sigue en el inventario.`);

    // Por verificar (B.5) — menos lo que ya se confirmó en la app
    for (const v of f.porVerificar) {
        const ids = posiblesIds(v.posibles);
        const confirmadasDesde = prestadosApp.filter(m => !usados.has(m.id) && ids.has(m.personnelId ?? ''))
            .reduce((s, m) => s + m.quantity, 0);
        const quedan = Math.max(0, v.cantidad - confirmadasDesde);
        if (quedan === 0) { p(`- ✓ «${v.descripcion}»: lo por verificar ya quedó confirmado en la app.`); continue; }
        p(`- 📍 Asignación «${v.estado === 'posible' ? 'posible' : 'falta por verificar'}»: ${quedan} × ${v.descripcion}${v.posibles ? ` → posibles: ${v.posibles} → verificar` : ''}${confirmadasDesde ? ` (se restan ${confirmadasDesde} ya confirmadas en la app)` : ''}. NO entra como préstamo.`);
        asignaciones++;
    }
}

p();
p('## Herramientas manuales por trabajador (Apéndice C)');
p();
p('> Decisión pendiente tuya: ¿la Lista 5 es lo que cada uno TIENE HOY (→ préstamo confirmado) o lo que tuvo alguna vez (→ posible, verificar)? Abajo se propone como préstamo confirmado para lo concreto, porque así lo dejaste escrito el 11-sep («cargar con su trabajador responsable»). Lo vago no se carga.');
const manuales = items.filter(i => i.inventoryType === 'Herramienta Manual');
for (const m of lista.manuales) {
    const quien = persona(m.trabajador.split('/')[0]);
    p();
    p(`### ${m.trabajador}${quien ? '' : ' — ⚠ no está en el personal de la app'}`);
    const suyos = quien ? activos.filter(x => x.personnelId === quien.id && manuales.some(i => i.id === x.itemId)) : [];
    for (const h of m.herramientas as string[]) {
        const raiz = norm(h).split(' ')[0].replace(/s$/, '').slice(0, 5);
        const ya = suyos.find(x => norm(nombreItem(x.itemId)).startsWith(raiz));
        const itemApp = manuales.find(i => norm(i.name).startsWith(raiz));
        if (ya) { p(`- ✓ ${h}: ya registrado (${nombreItem(ya.itemId)}).`); yaEsta++; }
        else { p(`- ➕ ${h}: préstamo a ${quien?.name ?? m.trabajador} — ${itemApp ? `ítem existente «${itemApp.name}»` : 'ítem nuevo'}, con entrada de apertura.`); aperturas++; prestamos++; }
    }
    if (m.vago) { p(`- 📄 «${m.vago}»: no se carga nada. Pendiente documental: preguntarle qué tiene.`); revisar++; }
}

p();
p('## Resumen');
p();
p(`- ✓ Ya registrado, no se toca: **${yaEsta}**`);
p(`- ➕ Entradas de apertura propuestas: **${aperturas}** (de ellas, préstamos confirmados: **${prestamos}**)`);
p(`- 📍 Asignaciones por verificar propuestas: **${asignaciones}**`);
p(`- ⚠ / 📄 Para revisar a mano: **${revisar}**`);
p();
p('Nada se borra. Nada se aplica hasta que este informe esté revisado.');

process.stdout.write(out.join('\n') + '\n');
