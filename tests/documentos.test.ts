/**
 * tests/documentos.test.ts — Los documentos del asistente y la app dicen lo mismo
 * ============================================================================
 * `asistente/INSTRUCCIONES.md` le enseña al asistente el formato del bloque, y
 * `asistente/BODEGA-MONTECIELO.md` trae ejemplos. Si alguien cambia el lector
 * o el documento y no el otro, el asistente entrega bloques que la app no lee
 * —y eso se descubre una mañana con diez trabajadores esperando—. Acá se leen
 * los bloques TAL CUAL están escritos en los documentos.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InventoryType, Item, Personnel, Project } from '../types';
import { leerLote } from '../utils/lote';
import { igual, esCierto, grupo, cerrar } from './correr';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const leer = (f: string) => fs.readFileSync(path.join(AQUI, '..', 'asistente', f), 'utf8');

/**
 * Lo que va de la primera ENTREGA al último FIN de cada bloque de código. En
 * INSTRUCCIONES el ejemplo está DENTRO del prompt, rodeado de reglas.
 */
const bloquesDe = (texto: string): string[] =>
    [...texto.matchAll(/```\n([\s\S]*?)```/g)].map(m => m[1])
        .filter(b => /^=== ENTREGA ===/m.test(b))
        .map(b => b.slice(b.indexOf('=== ENTREGA ==='), b.lastIndexOf('=== FIN ===') + '=== FIN ==='.length));

// Nombres reales de producción (5-oct), tal cual.
const it = (id: string, name: string, t: InventoryType): Item =>
    ({ id, name, quantity: 5, inventoryType: t, category: 'x', subCategory: '', minStock: 0, unit: 'und' });
const ITEMS = [
    it('brocha', 'Brocha 2"', InventoryType.SINGLE_USE),
    it('brocha3', 'Brocha 3"', InventoryType.SINGLE_USE),
    it('brocha4', 'Brocha 4"', InventoryType.SINGLE_USE),
    it('almadana', 'Almadana', InventoryType.HAND_TOOL),
    it('tal-stanley', 'Taladro Inhalambrico (Amarillo · Stanley)', InventoryType.ELECTRICAL_TOOL),
    it('tal-dwalt', 'Taladro inhalambrico (Amarillo · Dwalt)', InventoryType.ELECTRICAL_TOOL),
    it('tal-bauker', 'Taladro Inhalambrico (Verde · Bauker)', InventoryType.ELECTRICAL_TOOL),
    it('lija240', 'Lija 240', InventoryType.SINGLE_USE),
];
const GENTE: Personnel[] = [{ id: 'adrian', name: 'Adrián Echeverry' }, { id: 'jorman', name: 'Jorman' }, { id: 'alex', name: 'Alex', isTeamLeader: true }];
const OBRAS = ['CRISTO', 'ZONA GENERAL', 'Mantenimiento General', 'HELIPUERTO'].map((name, k) => ({ id: `o${k}`, name, status: 'active' }) as Project);

grupo('el system prompt cabe en cualquier asistente (menos de 8.000 caracteres)', () => {
    const doc = leer('INSTRUCCIONES.md');
    const prompt = doc.slice(doc.indexOf('```\n') + 4, doc.lastIndexOf('```'));
    esCierto(prompt.length > 3000 && prompt.length < 8000, `mide ${prompt.length}`);
    // La fecha va EN el bloque: el aviso de ponerla a mano en la app sobra.
    esCierto(!/poné la fecha/i.test(prompt), 'ya no le pide a Juli poner la fecha en la app');
    esCierto(/FECHA: DD\/MM\/AAAA/.test(prompt), 'y le dice el formato de FECHA');
    // Las decisiones de Juli del 19-oct siguen ahí (14-nov).
    esCierto(/NUNCA se pregunta/.test(prompt) && /sin esperar «CONFIRMADO»/.test(prompt), 'no pregunta el proyecto y entrega de una vez');
    esCierto(!/decí CONFIRMADO/.test(prompt) && !/solo después de/i.test(prompt), 'sin restos del «CONFIRMADO» que se contradecían');
    esCierto(/verde, rojo, amarillo, azul/.test(prompt) && /12 m = 2/.test(prompt), 'pregunta el color del tubo y pasa metros a tubos');
});

grupo('cada bloque escrito en los documentos lo lee la app, completo', () => {
    const bloques = [...bloquesDe(leer('INSTRUCCIONES.md')), ...bloquesDe(leer('BODEGA-MONTECIELO.md'))];
    esCierto(bloques.length >= 3, `hay ${bloques.length} bloques de ejemplo`);
    for (const b of bloques) {
        const r = leerLote(b, GENTE, ITEMS, OBRAS);
        igual(r.ignoradas, [], 'nada se queda sin leer');
        esCierto(r.lineas.length > 0 && r.lineas.every(l => l.persona && l.obraId), 'cada entrega con su trabajador y su obra');
        esCierto(r.lineas.every(l => l.items.every(x => x.categoria)), 'cada elemento con su categoría');
        esCierto(r.lineas.every(l => l.encabezado?.fecha === '2026-10-03'), 'cada entrega con su FECHA, leída como fecha');
    }
});

grupo('el ejemplo del 3-oct: lo que existe se reconoce, lo que no, no se adivina', () => {
    const b = bloquesDe(leer('BODEGA-MONTECIELO.md')).find(x => x.includes('Jorman'))!;
    const r = leerLote(b, GENTE, ITEMS, OBRAS);
    const porNombre = new Map(r.lineas.flatMap(l => l.items).map(x => [x.nombre, x]));
    igual(porNombre.get('Taladro Inhalambrico Amarillo Stanley')?.item?.id, 'tal-stanley', 'el taladro es el Stanley, no otro inalámbrico');
    igual(porNombre.get('Taladro Inhalambrico Amarillo Stanley')?.dudoso, false, 'y sin duda');
    // Desde el 14-nov hay tres brochas: sin medida, la app NO escoge sola.
    const brocha = porNombre.get('Brocha');
    esCierto(!!brocha && (!brocha.item || brocha.dudoso), 'la brocha sin medida queda para escoger, no se adivina la de 2"');
    esCierto(porNombre.has('Lija 180'), 'el ejemplo trae la lija 180');
    igual(porNombre.get('Lija 180')?.item, undefined, 'y NO se cambia por la 240');
    igual(r.lineas.map(l => l.obraId), ['o0', 'o1'], 'CRISTO y ZONA GENERAL');
});

await cerrar();
