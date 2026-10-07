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
let pgcrypto;
{
    const { createRequire } = require('node:module');
    const candidatos = [__filename, path.join(repo, 'x.js'), path.join(process.cwd(), 'x.js')];
    for (const desde of candidatos) {
        try {
            const r = createRequire(desde);
            ({ PGlite } = r('@electric-sql/pglite'));
            // Sin pgcrypto, `crypt()` no existe y las funciones de accesos no se
            // pueden EJECUTAR acá: solo se creaban. Así se escapó el tope de
            // intentos que no contaba.
            ({ pgcrypto } = r('@electric-sql/pglite/contrib/pgcrypto'));
            break;
        } catch { /* sigue */ }
    }
    if (!PGlite) {
        console.error('Falta @electric-sql/pglite. Instalalo sin guardarlo en package.json:\n'
            + '  npm i --no-save @electric-sql/pglite');
        process.exit(2);
    }
}

const COMO_SUPABASE = `grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`;

(async () => {
  const dir = path.join(repo, 'supabase/migrations');
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec('create extension if not exists pgcrypto');
  const resultados = [];
  for (const f of archivos) {
    try {
      await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      // Supabase le da TODO a `anon` y `authenticated` sobre las tablas de
      // `public`; un PostgreSQL pelado no. Sin imitarlo, «la llave pública no
      // lee» pasaría aunque ninguna migración la cerrara.
      if (f.startsWith('00000000000000')) {
        await pg.exec(COMO_SUPABASE);
      }
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

    // Un traslado: la devolución que salda el préstamo anterior y el préstamo
    // nuevo que dice de cuál viene, en UN lote. El stock no se mueve y la
    // cadena de custodia llega completa al servidor.
    const antes = Number((await pg.query('select quantity from items')).rows[0].quantity);
    await pg.query(`select log_movements_and_update_stock($1::jsonb)`, [JSON.stringify([
      { id: '99999999-9999-4999-8999-999999999993', item_id: '11111111-1111-4111-8111-111111111111',
        type: 'Entrada', quantity: 1, timestamp: '2026-09-12T14:00:00Z',
        devuelve_a: '99999999-9999-4999-8999-999999999991', es_traslado: true },
      { id: '99999999-9999-4999-8999-999999999994', item_id: '11111111-1111-4111-8111-111111111111',
        type: 'Salida', quantity: 1, timestamp: '2026-09-12T14:00:01Z', is_loan: true,
        personnel_id: '44444444-4444-4444-8444-444444444444',
        viene_de: '99999999-9999-4999-8999-999999999991', es_traslado: true,
        entregado_por: 'Kate', responsable_anterior: 'Alex' },
    ])]);
    const despues = Number((await pg.query('select quantity from items')).rows[0].quantity);
    const t = (await pg.query(`select viene_de, es_traslado, entregado_por, responsable_anterior
                               from movements where id = '99999999-9999-4999-8999-999999999994'`)).rows[0];
    await pg.query(`insert into asignaciones (descripcion, cantidad, estado, posible_responsable, procedencia)
                    values ('Nivel láser Total', 1, 'posible', 'Jesús', 'Apéndice B.5')`);
    const a = (await pg.query(`select condicion, desde, desde_desconocido from asignaciones`)).rows[0];
    const ok = despues === antes && t.es_traslado && t.entregado_por === 'Kate' && t.responsable_anterior === 'Alex'
      && t.viene_de === '99999999-9999-4999-8999-999999999991'
      && a.condicion === 'no_especificado' && a.desde === null && a.desde_desconocido === true;
    console.log(`Traslado: stock ${antes}→${despues} (no se mueve), custodia completa ${t.es_traslado && !!t.viene_de ? 'sí' : 'NO'}; `
      + `asignación sin datos inventados ${a.desde === null && a.condicion === 'no_especificado' ? 'sí' : 'NO'} ${ok ? '✓' : '✗'}`);
    if (!ok) process.exitCode = 1;
    if (!(await accesos(pg))) process.exitCode = 1;
    if (!(await kardex(pg))) process.exitCode = 1;
    if (!(await aplicarDeUnaVez(dir, archivos))) process.exitCode = 1;
  } else {
    process.exitCode = 1;
  }
  await pg.close();
})();

/**
 * Los accesos, EJECUTADOS: el alta con su tope de intentos, y que la llave
 * pública ni una identidad cualquiera puedan volverse administrador ni revivir
 * un acceso borrado. `auth.users` lo trae Supabase; acá se arma lo mínimo.
 */
const authMinimo = (pg) => pg.exec(`
    create table if not exists auth.users (
      instance_id uuid, id uuid primary key, aud text, role text, email text,
      encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb,
      raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
      confirmation_token text, recovery_token text, email_change_token_new text,
      email_change text, banned_until timestamptz, last_sign_in_at timestamptz);
    create table if not exists auth.identities (
      provider_id text, user_id uuid, identity_data jsonb, provider text,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
    grant usage on schema auth to anon, authenticated;`);

async function accesos(pg) {
  await authMinimo(pg);
  const JULI = 'aaaaaaaa-0000-4000-8000-000000000001';
  const KATE = 'aaaaaaaa-0000-4000-8000-000000000002';
  await pg.query(`insert into app_users (id, name, role, setup_complete, password, auth_uid)
                  values ($1, 'Juli', 'owner', true, '', $1), ($2, 'Kate', 'employee', true, '', $2)`, [JULI, KATE]);
  const como = async (rol, uid, sql, params = []) => {
    // El rol va también en el pedido, como lo manda Supabase: `es_de_la_bodega()` lo lee de ahí.
    await pg.exec(`set request.jwt.claim.sub = '${uid ?? ''}'; set request.jwt.claim.role = '${rol}'; set role ${rol};`);
    try { return await pg.query(sql, params); }
    finally { await pg.exec('reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;'); }
  };
  const falla = async (f) => { try { await f(); return false; } catch { return true; } };
  const filas = [];

  // 1. Una identidad cualquiera NO se sube a dueño editando la tabla.
  await como('authenticated', KATE, `update app_users set role = 'owner' where auth_uid = $1`, [KATE]).catch(() => {});
  const rolKate = (await pg.query('select role::text r from app_users where id = $1', [KATE])).rows[0].r;
  filas.push(['identidad cualquiera no se vuelve dueño', rolKate === 'employee']);
  filas.push(['la llave pública no inserta accesos', await falla(() => como('anon', null,
    `insert into app_users (id, name, role, setup_complete, password) values (gen_random_uuid(), 'X', 'owner', true, 'x')`))
    || (await pg.query(`select 1 from app_users where name = 'X'`)).rows.length === 0]);

  // 2. El administrador crea el acceso; el código malo CUENTA.
  const { acceso_id: id, codigo } = (await como('authenticated', JULI, `select * from crear_acceso('Camilo', 'owner')`)).rows[0];
  for (let k = 0; k < 3; k++) await como('anon', null, `select * from dar_de_alta($1, 'ZZZZZZ', 'secreto1')`, [id]).catch(() => {});
  const intentos = (await pg.query('select intentos_alta n from app_users where id = $1', [id])).rows[0].n;
  filas.push([`código malo cuenta (3 errados → ${intentos})`, intentos === 3]);
  const alta = (await como('anon', null, `select * from dar_de_alta($1, $2, 'secreto1')`, [id, codigo.toLowerCase()])).rows[0];
  const ident = (await pg.query(`select count(*)::int n from auth.users where email = 'camilo@bodega.montecielo'`)).rows[0].n;
  filas.push(['el código bueno da de alta y crea la identidad', alta?.user_username === 'camilo' && ident === 1]);

  // 3. Diez errados matan el código.
  const { acceso_id: id2 } = (await como('authenticated', JULI, `select * from crear_acceso('Pedro', 'employee')`)).rows[0];
  for (let k = 0; k < 10; k++) await como('anon', null, `select * from dar_de_alta($1, 'ZZZZZZ', 'secreto1')`, [id2]).catch(() => {});
  filas.push(['diez errados → «Demasiados intentos»', await falla(() => como('anon', null, `select * from dar_de_alta($1, 'ZZZZZZ', 'secreto1')`, [id2]))]);

  // 4. Revivir un acceso borrado: solo un administrador.
  await como('authenticated', JULI, `select borrar_acceso($1, 'Juli')`, [KATE]);
  filas.push(['la llave pública no revive accesos', await falla(() => como('anon', null, 'select restore_user($1)', [KATE]))]);
  filas.push(['una identidad no-admin no revive accesos', await falla(() => como('authenticated', id2, 'select restore_user($1)', [KATE]))]);
  await como('authenticated', JULI, 'select restore_user($1)', [KATE]);
  const viva = (await pg.query('select deleted_at is null v from app_users where id = $1', [KATE])).rows[0].v;
  filas.push(['el administrador sí lo revive', viva === true]);

  // 5. Solo la gente de la bodega toca la bodega (20261003130000).
  const FORASTERO = 'aaaaaaaa-0000-4000-8000-0000000000ff';
  const lote = (id) => JSON.stringify([{ id, item_id: '11111111-1111-4111-8111-111111111111',
    type: 'Entrada', quantity: 1, timestamp: '2026-10-03T12:00:00Z' }]);
  const cuantos = async (rol, uid) => {
    try { return (await como(rol, uid, 'select count(*)::int n from items')).rows[0].n; } catch { return 0; }
  };
  filas.push(['la llave pública no lee el inventario', (await cuantos('anon', null)) === 0]);
  filas.push(['una identidad ajena a la bodega no lo lee', (await cuantos('authenticated', FORASTERO)) === 0]);
  filas.push(['la gente de la bodega sí lo lee', (await cuantos('authenticated', JULI)) > 0]);
  filas.push(['la llave pública no mueve stock', await falla(() => como('anon', null,
    'select log_movements_and_update_stock($1::jsonb)', [lote('99999999-9999-4999-8999-0000000000a1')]))]);
  filas.push(['una identidad ajena no mueve stock', await falla(() => como('authenticated', FORASTERO,
    'select log_movements_and_update_stock($1::jsonb)', [lote('99999999-9999-4999-8999-0000000000a2')]))]);
  const stock = async () => Number((await pg.query('select quantity q from items')).rows[0].q);
  const antes = await stock();
  await como('authenticated', JULI, 'select log_movements_and_update_stock($1::jsonb)', [lote('99999999-9999-4999-8999-0000000000a3')]);
  filas.push(['la gente de la bodega sí mueve stock', (await stock()) === antes + 1]);
  filas.push(['la entrada vieja (authenticate_user) ya no existe',
    (await pg.query(`select to_regprocedure('authenticate_user(text,text)') is null r`)).rows[0].r === true]);

  // 6. Kate como la primera vez: se corre el bloque de la migración sobre una
  // Kate como la de producción (clave de dos letras, identidad sin estrenar).
  const KATE2 = 'aaaaaaaa-0000-4000-8000-000000000022';
  await pg.query(`update app_users set username = 'kate_prueba' where id = $1`, [KATE]);
  await pg.query(`insert into auth.users (id, email, encrypted_password) values ($1, 'kate@x', crypt('ab', gen_salt('bf')))`, [KATE2]);
  await pg.query(`insert into app_users (id, name, username, role, setup_complete, password, auth_uid, debe_cambiar_clave)
                  values ($1, 'Kate', 'kate', 'employee', true, 'ab', $1, true)`, [KATE2]);
  const migracion = fs.readFileSync(path.join(repo, 'supabase/migrations/20261003130000_solo_la_bodega.sql'), 'utf8');
  const bloque = migracion.match(/do \$kate\$[\s\S]*?end \$kate\$;/);
  if (bloque) await pg.exec(bloque[0]);
  const k = (await pg.query(`select u.setup_complete s, au.encrypted_password = crypt('ab', au.encrypted_password) vieja
                             from app_users u join auth.users au on au.id = u.auth_uid where u.id = $1`, [KATE2])).rows[0];
  filas.push(['Kate queda esperando código y su clave vieja ya no sirve', !!bloque && k.s === false && k.vieja === false]);

  let bien = true;
  console.log('\nAccesos:');
  for (const [que, ok] of filas) { console.log(`  ${ok ? '✓' : '✗'} ${que}`); bien = bien && ok; }
  return bien;
}

/**
 * El Kardex en cero (20261003140000): una devolución de antes del 28-sep, que
 * repuso el stock sin dejar entrada, recibe su entrada enlazada — y el stock
 * NO se mueve. Correrla dos veces no duplica nada.
 */
async function kardex(pg) {
  const K = 'cccccccc-0000-4000-8000-000000000001';
  const P = 'cccccccc-0000-4000-8000-000000000002';
  await pg.query(`insert into items (id, name, category, inventory_type, quantity, unit)
                  values ($1, 'Pulidora vieja', 'Herramientas', 'Herramienta Eléctrica', 4, 'und')`, [K]);
  await pg.query(`insert into movements (id, item_id, type, quantity, timestamp) values (gen_random_uuid(), $1, 'Entrada', 4, '2026-09-01')`, [K]);
  await pg.query(`insert into movements (id, item_id, type, quantity, timestamp, is_loan, is_returned, returned_at)
                  values ($2, $1, 'Salida', 1, '2026-09-07', true, true, '2026-09-08')`, [K, P]);
  const cuadre = async () => (await pg.query(`
      select i.quantity - coalesce(sum(case when m.type in ('Entrada','Compra') then m.quantity
                                            when m.type in ('Salida','Merma') then -m.quantity end), 0) d
      from items i left join movements m on m.item_id = i.id and m.deleted_at is null
      where i.id = $1 group by i.id, i.quantity`, [K])).rows[0].d;
  const antes = Number(await cuadre());
  const sql = fs.readFileSync(path.join(repo, 'supabase/migrations/20261003140000_kardex_en_cero.sql'), 'utf8');
  await pg.exec(sql);
  await pg.exec(sql);
  const despues = Number(await cuadre());
  const stock = Number((await pg.query('select quantity q from items where id = $1', [K])).rows[0].q);
  const entradas = (await pg.query('select count(*)::int n from movements where devuelve_a = $1', [P])).rows[0].n;
  const filas = [
    [`descuadraba antes (${antes})`, antes === 1],
    ['cuadra después', despues === 0],
    ['el stock no se movió', stock === 4],
    ['una sola entrada aunque corra dos veces', entradas === 1],
  ];
  let bien = true;
  console.log('\nKardex:');
  for (const [que, ok] of filas) { console.log(`  ${ok ? '✓' : '✗'} ${que}`); bien = bien && ok; }
  return bien;
}

/**
 * `supabase/APLICAR-3-OCT.sql`, el archivo que se pega en el editor SQL de
 * producción: trae las tres migraciones del 3-oct LETRA POR LETRA y, sobre una
 * base como la de producción antes del 3-oct, o queda todo o no queda nada.
 */
async function aplicarDeUnaVez(dir, archivos) {
  const archivo = fs.readFileSync(path.join(repo, 'supabase/APLICAR-3-OCT.sql'), 'utf8');
  const del3 = archivos.filter(f => f.startsWith('20261003'));
  const filas = [[`trae las ${del3.length} migraciones del 3-oct letra por letra`,
    del3.length === 3 && del3.every(f => archivo.includes(fs.readFileSync(path.join(dir, f), 'utf8')))]];

  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec('create extension if not exists pgcrypto');
  for (const f of archivos.filter(f => f < '20261003')) {
    await pg.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (f.startsWith('00000000000000')) await pg.exec(COMO_SUPABASE);
  }
  await authMinimo(pg);
  await pg.exec(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text);`);

  // Como producción el 7-oct: claves en texto plano, Kate sin estrenar y una devolución vieja sin su entrada.
  const JULI = 'dddddddd-0000-4000-8000-000000000001';
  const KATE = 'dddddddd-0000-4000-8000-000000000002';
  const K = 'dddddddd-0000-4000-8000-000000000003';
  const ROTO = 'dddddddd-0000-4000-8000-000000000004';
  await pg.query(`insert into auth.users (id, email, encrypted_password, last_sign_in_at)
                  values ($1, 'juli@x', crypt('x', gen_salt('bf')), now()), ($2, 'kate@x', crypt('ab', gen_salt('bf')), null)`, [JULI, KATE]);
  await pg.query(`insert into app_users (id, name, username, role, setup_complete, password, auth_uid)
                  values ($1, 'Juli', 'juli', 'owner', true, 'clave', $1), ($2, 'Kate', 'kate', 'employee', true, 'ab', $2)`, [JULI, KATE]);
  await pg.query(`insert into items (id, name, category, inventory_type, quantity, unit) values
                  ($1, 'Pulidora vieja', 'Herramientas', 'Herramienta Eléctrica', 4, 'und'),
                  ($2, 'Roto', 'Materiales', 'Material de Consumo', 5, 'und')`, [K, ROTO]);
  await pg.query(`insert into movements (id, item_id, type, quantity, timestamp) values (gen_random_uuid(), $1, 'Entrada', 4, '2026-09-01')`, [K]);
  await pg.query(`insert into movements (id, item_id, type, quantity, timestamp, is_loan, is_returned, returned_at)
                  values (gen_random_uuid(), $1, 'Salida', 1, '2026-09-07', true, true, '2026-09-08')`, [K]);

  const estado = async () => (await pg.query(`select to_regprocedure('authenticate_user(text,text)') is not null vieja,
      (select count(*)::int from app_users where password <> '') claves,
      (select count(*)::int from supabase_migrations.schema_migrations) historial,
      (select count(*)::int from movements) movs,
      (select count(*)::int from pg_policies where policyname = 'solo_la_bodega') politicas,
      (select setup_complete from app_users where id = '${KATE}') kate`)).rows[0];

  // 1. Un descuadre que ninguna migración explica: aborta y NO QUEDA NADA.
  const antes = await estado();
  let msg = '';
  try { await pg.exec(archivo); } catch (e) { msg = String(e.message); await pg.exec('rollback').catch(() => {}); }
  const tras = await estado();
  filas.push(['con el Kardex descuadrado aborta y dice dónde', msg.includes('NO SE APLICÓ NADA') && msg.includes('Roto')]);
  filas.push(['…y no queda nada aplicado', JSON.stringify(tras) === JSON.stringify(antes) && tras.vieja && tras.claves === 2]);

  // 2. Explicado el descuadre, aplica todo y lo dice.
  await pg.query(`insert into movements (id, item_id, type, quantity, timestamp) values (gen_random_uuid(), $1, 'Entrada', 5, '2026-09-01')`, [ROTO]);
  const res = await pg.exec(archivo);
  const fin = res[res.length - 1]?.rows?.[0];
  const e = await estado();
  filas.push(['aplica y termina en «LISTO»', String(fin?.resultado ?? '').startsWith('LISTO')]);
  filas.push(['entrada vieja fuera, cero claves, 11 políticas, Kate esperando código',
    !e.vieja && e.claves === 0 && e.politicas === 11 && e.kate === false]);
  filas.push(['deja las 3 en el historial', e.historial === 3]);

  // 3. Pegarlo otra vez no duplica nada.
  await pg.exec(archivo);
  const otra = await estado();
  filas.push(['correrlo dos veces no duplica nada', otra.movs === e.movs && otra.historial === 3]);
  await pg.close();

  let bien = true;
  console.log('\nAPLICAR-3-OCT.sql:');
  for (const [que, ok] of filas) { console.log(`  ${ok ? '✓' : '✗'} ${que}`); bien = bien && ok; }
  return bien;
}
