/**
 * tests/accesos.test.ts — El correo interno: una sola fórmula en dos lenguajes
 * ===========================================================================
 * `dar_de_alta` (SQL, en el servidor) crea la identidad con un correo; la app
 * (`correoInterno`, core/identidad.ts) entra con otro calculado por su cuenta.
 * Si no dan EXACTAMENTE lo mismo, nadie entra y el mensaje miente: «contraseña
 * incorrecta» con la contraseña bien puesta.
 *
 * Acá se lee la fórmula SQL del archivo de la migración —el `translate` y el
 * dominio tal cual están escritos— y se compara contra la de la app, nombre por
 * nombre. Además se comprueba lo que el archivo debe cerrar: que las funciones
 * de administrador no queden ejecutables por la llave pública.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { correoInterno } from '../core/identidad';
import { igual, esCierto, grupo, cerrar } from './correr';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SQL = fs.readFileSync(path.join(AQUI, '..', 'supabase', 'migrations', '20261002120000_accesos_por_el_servidor.sql'), 'utf8');

const funcion = (nombre: string): string => {
    const i = SQL.indexOf(`create or replace function ${nombre}(`);
    if (i < 0) throw new Error(`No encontré ${nombre} en la migración`);
    return SQL.slice(i, SQL.indexOf('$$;', SQL.indexOf('$$', i) + 2));
};

/** El `translate(x, 'desde', 'hacia')` de la función SQL, emulado. */
const traductor = (cuerpo: string) => {
    const m = cuerpo.match(/translate\([\s\S]*?'([^']{5,})',\s*'([^']+)'\)/);
    if (!m) throw new Error('No encontré el translate');
    const [desde, hacia] = [[...m[1]], [...m[2]]];
    return (t: string) => [...t].map(ch => { const k = desde.indexOf(ch); return k < 0 ? ch : (hacia[k] ?? ''); }).join('');
};

const correoSQL = (usuario: string): string => {
    const cuerpo = funcion('correo_interno');
    const dominio = cuerpo.match(/\|\|\s*'(@[^']+)'/)![1];
    return traductor(cuerpo)(usuario).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + dominio;
};
const usuarioSQL = (nombre: string): string =>
    traductor(funcion('usuario_de_nombre'))(nombre).trim().toLowerCase().replace(/\s+/g, '_');

grupo('el correo del servidor es el MISMO que el de la app', () => {
    for (const n of ['Camilo', 'Kate', 'Administrador maestro', 'José Ñandú', 'Brian Sánchez', 'Duván', 'Jorge / Germán', 'MÜLLER ç', 'ÇAÑO Ñ']) {
        const usuario = usuarioSQL(n);
        igual(correoSQL(usuario), correoInterno(usuario), `«${n}» → ${correoInterno(usuario)}`);
    }
    // Y directo sobre usuarios crudos: `crear-identidades.sql` llama al correo
    // con el usuario tal como está guardado, sin pasar por `usuario_de_nombre`.
    for (const u of ['juli', 'Kate', 'ÇAÑO', 'josé_ñandú'])
        igual(correoSQL(u), correoInterno(u), `usuario «${u}»`);
    igual(usuarioSQL('  Juan   Pablo '), 'juan_pablo', 'el usuario: minúscula, sin tildes, espacios como _');
});

grupo('las funciones de administrador NO las ejecuta la llave pública', () => {
    const revoca = SQL.match(/revoke execute on function([\s\S]*?)from public, anon;/);
    esCierto(!!revoca, 'hay un revoke a public y anon');
    for (const f of ['crear_acceso', 'nuevo_codigo_de_alta', 'editar_acceso', 'borrar_acceso', 'ya_cambie_mi_clave'])
        esCierto(!!revoca && revoca[1].includes(f), `${f} revocada a la llave pública`);
    esCierto(/grant execute on function dar_de_alta\(uuid, text, text\) to anon/.test(SQL), 'el alta sí (la persona aún no tiene sesión)');
});

grupo('la entrada vieja no acepta una clave vacía', () => {
    const cuerpo = funcion('authenticate_user');
    esCierto(/coalesce\(p_password, ''\) = ''\s*then return/.test(cuerpo), 'clave vacía → nada');
    esCierto(/coalesce\(password, ''\) <> ''/.test(cuerpo), 'ni un acceso sin clave en la tabla');
});

grupo('el alta no guarda la clave en la tabla', () => {
    const cuerpo = funcion('dar_de_alta');
    esCierto(/password = ''/.test(cuerpo), 'la deja vacía');
    esCierto(!/password = p_clave/.test(cuerpo), 'nunca la copia');
    esCierto(/auth_uid = v_uid and id <> p_id/.test(cuerpo), 'no reutiliza la identidad de otra persona activa');
});

await cerrar();
