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
  } else {
    process.exitCode = 1;
  }
  await pg.close();
})();
