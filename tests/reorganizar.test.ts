/**
 * Reorganizar NO toca la cantidad, aunque la copia que llega sea vieja.
 *
 * «Organizar bodega» guardaba la copia de su vista previa, cantidad incluida:
 * si entre la vista previa y «Guardar» salía un despacho, volvía la cantidad
 * vieja y nacía un ajuste falso en el Kardex. Corre `handleReorganizar` REAL,
 * sacado de App.tsx con el AST.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { Item, InventoryType } from '../types';
import { describirCambios } from '../utils/cambios';
import { igual, grupo, cerrar } from './correr';

const ARCHIVO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx');

const sacar = <T,>(nombre: string, contexto: Record<string, unknown>): T => {
    const texto = fs.readFileSync(ARCHIVO, 'utf8');
    const sf = ts.createSourceFile(ARCHIVO, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let hallada = '';
    const visitar = (n: ts.Node): void => {
        if (ts.isVariableDeclaration(n) && n.name.getText(sf) === nombre) hallada = `const ${n.getText(sf)};`;
        ts.forEachChild(n, visitar);
    };
    visitar(sf);
    if (!hallada) throw new Error(`No encontré "${nombre}" en App.tsx: si la moviste, actualizá esta prueba.`);
    const cuerpo = ts.transpileModule(`(() => {\n${hallada}\nreturn ${nombre};\n})()`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const claves = Object.keys(contexto);
    // eslint-disable-next-line no-new-func
    return new Function(...claves, `return ${cuerpo};`)(...claves.map(k => contexto[k])) as T;
};

grupo('reorganizar con una copia VIEJA no devuelve la cantidad vieja', () => {
    // En el espejo hay 7 (salieron 3 después de la vista previa, que decía 10).
    const vigente: Item = { id: 'c2', name: 'Codo 2"', quantity: 7, inventoryType: InventoryType.SINGLE_USE,
        category: 'Materiales', subCategory: '', minStock: 0, unit: 'und' };
    let estado: Item[] = [vigente];
    const escrituras: Array<{ tipo: string; args: unknown[] }> = [];
    const handleReorganizar = sacar<(i: Item) => void>('handleReorganizar', {
        itemActual: (id: string) => estado.find(i => i.id === id),
        itemsRef: { current: estado },
        setItems: (f: (p: Item[]) => Item[]) => { estado = f(estado); },
        withSync: (tipo: string, args: unknown[]) => { escrituras.push({ tipo, args }); return Promise.resolve(); },
        describirCambios, ETIQUETAS_ITEM: { name: 'nombre', familia: 'familia', ruta: 'género' },
        addAuditLog: () => {},
    });
    handleReorganizar({ ...vigente, quantity: 10, name: 'Codos 2"', familia: 'Codos', ruta: 'Tubería / Accesorios' });
    igual(estado[0].quantity, 7, 'la cantidad vigente se queda');
    igual(estado[0].name, 'Codos 2"', 'el nombre sí cambia');
    igual(escrituras.map(e => e.tipo), ['reclasificarItem'], 'una sola escritura, la que no lleva cantidad');
    igual(JSON.stringify(escrituras[0].args[1]).includes('quantity'), false, 'y no manda cantidad a la nube');
});

await cerrar();
