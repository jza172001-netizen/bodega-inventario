/*
 * ¿El repositorio alcanza para reconstruir el servidor?
 * =====================================================
 * Aplica la migración base sobre PostgreSQL EN BLANCO y luego todas las
 * migraciones con fecha, en orden. Si alguna revienta, el repo no sirve para
 * reconstruir y hay que arreglarla ANTES de necesitarla.
 *
 *     npm i --no-save @electric-sql/pglite
 *     node supabase/verificar-baseline.cjs
 *
 * CORRERLO CADA VEZ QUE SE AGREGUE UNA MIGRACIÓN. Una migración que solo
 * funciona sobre la base que ya existe rompe la reconstrucción en silencio, y
 * eso no se descubre hasta el día que hace falta.
 *
 * No toca Supabase ni la red: PostgreSQL embebido, todo local.
 */
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));

/**
 * Se busca en varios sitios a propósito: instalado en el repo, instalado donde
 * uno esté parado, o junto a este archivo. `require` a secas resuelve desde la
 * carpeta del script y nada más, así que un `npm i` hecho en la raíz no lo
 * encontraba y el mensaje de ayuda decía instalá lo que ya estaba instalado.
 */
let PGlite;
{
    const { createRequire } = require('node:module');
    const candidatos = [__filename, path.join(repo, 'x.js'), path.join(process.cwd(), 'x.js')];
    for (const desde of candidatos) {
        try { ({ PGlite } = createRequire(desde)('@electric-sql/pglite')); break; } catch { /* sigue */ }
    }
    if (!PGlite) {
        console.error('Falta @electric-sql/pglite. Instalalo sin guardarlo en package.json:\n'
            + '  npm i --no-save @electric-sql/pglite');
        process.exit(2);
    }
}

(async () => {
  const dir = path.join(repo, 'supabase/migrations');
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const pg = new PGlite();
  const resultados = [];
  for (const f of archivos) {
    try {
      await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      resultados.push({ archivo: f, estado: 'ok' });
    } catch (e) {
      resultados.push({ archivo: f, estado: 'FALLÓ', error: String(e.message).split('\n')[0] });
    }
  }
  for (const r of resultados) {
    console.log(`${r.estado === 'ok' ? '✓' : '✗'} ${r.archivo}${r.error ? '  → ' + r.error : ''}`);
  }
  const malas = resultados.filter(r => r.estado !== 'ok');
  console.log(`\n${resultados.length - malas.length}/${resultados.length} migraciones corrieron`);

  if (malas.length === 0) {
    // No basta con que corran: la base tiene que quedar USABLE.
    await pg.query(`insert into items (id, name, category, inventory_type, quantity, unit)
                    values ('11111111-1111-4111-8111-111111111111','Pala','Herramientas','Herramienta Manual',5,'und')`);
    await pg.query(`insert into personnel (id, name) values ('44444444-4444-4444-8444-444444444444','Alex')`);
    await pg.query(`select log_movements_and_update_stock($1::jsonb)`, [JSON.stringify([
      { id: '99999999-9999-4999-8999-999999999991', item_id: '11111111-1111-4111-8111-111111111111',
        type: 'Salida', quantity: 2, timestamp: '2026-09-12T12:00:00Z',
        personnel_id: '44444444-4444-4444-8444-444444444444', is_loan: true },
    ])]);
    const q = Number((await pg.query('select quantity from items')).rows[0].quantity);
    const n = (await pg.query('select count(*)::int as n from movements')).rows[0].n;
    console.log(`\nBase en blanco reconstruida y usable: stock ${q} (esperado 3), movimientos ${n} (esperado 1)`);
    if (q !== 3 || n !== 1) process.exitCode = 1;

    // Una devolución PARCIAL tiene que llegar entera: con su enlace al préstamo,
    // su estado y su fecha. Si el lote botara `devuelve_a`, el préstamo seguiría
    // figurando completo afuera y el siguiente reintento repondría otra vez.
    // Se manda DOS veces a propósito: el reintento no puede reponer dos veces.
    const devolucion = {
      id: '99999999-9999-4999-8999-999999999992', item_id: '11111111-1111-4111-8111-111111111111',
      type: 'Entrada', quantity: 1, timestamp: '2026-09-12T13:00:00Z',
      personnel_id: '44444444-4444-4444-8444-444444444444',
      devuelve_a: '99999999-9999-4999-8999-999999999991',
      return_condition: 'worn', return_notes: 'mango flojo', returned_at: '2026-09-12T13:00:00Z',
    };
    for (let i = 0; i < 2; i++) {
      await pg.query(`select log_movements_and_update_stock($1::jsonb)`, [JSON.stringify([devolucion])]);
    }
    const q2 = Number((await pg.query('select quantity from items')).rows[0].quantity);
    const d = (await pg.query(`select devuelve_a, return_condition, returned_at is not null as fecha
                               from movements where devuelve_a is not null`)).rows;
    const p = (await pg.query(`select quantity, is_returned from movements
                               where id = '99999999-9999-4999-8999-999999999991'`)).rows[0];
    const bien = q2 === 4 && d.length === 1 && d[0].return_condition === 'worn' && d[0].fecha
      && Number(p.quantity) === 2 && !p.is_returned;
    console.log(`Devolución parcial: stock ${q2} (esperado 4), devoluciones ${d.length} (esperado 1), `
      + `préstamo ${Number(p.quantity)} sin cerrar (esperado 2) ${bien ? '✓' : '✗'}`);
    if (!bien) process.exitCode = 1;
  } else {
    process.exitCode = 1;
  }
  await pg.close();
})();
