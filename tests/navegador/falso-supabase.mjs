/**
 * tests/navegador/falso-supabase.mjs — Un Supabase de mentiras, en memoria
 * ========================================================================
 * El recorrido en navegador real (`recorrido.mjs`) no puede escribir en la base
 * de verdad: los datos de la bodega son reales. Esto contesta lo que la app le
 * pide a Supabase —entrar, leer tablas, registrar— con una copia pequeña del
 * catálogo, y GUARDA todo lo que la app manda para revisarlo después.
 *
 * No es PostgREST completo: entiende lo que la app usa (select con `eq`/`is`,
 * insertar, actualizar, las funciones `rpc`). Lo que no entiende lo anota en
 * `desconocidas` para que la prueba lo diga, en vez de contestar cualquier cosa.
 */

const JULI_AUTH = 'ab0b1220-0692-4452-82f1-90ab3183484d';
const JULI_ID = 'u-juli';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub, role: 'authenticated', aud: 'authenticated', email: 'juli@bodega.montecielo',
    exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
})}.firma`;
const usuarioAuth = () => ({
    id: JULI_AUTH, aud: 'authenticated', role: 'authenticated', email: 'juli@bodega.montecielo',
    app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-09-28T00:00:00Z',
});

const ahora = '2026-10-01T12:00:00Z';
const item = (id, name, inventory_type, quantity, extra = {}) => ({
    id, name, category: inventory_type.startsWith('Herramienta') ? 'Herramientas' : 'Materiales', sub_category: '',
    inventory_type, quantity, min_stock: 0, price: 0, unit: 'unidades', color: null, brand: null,
    requires_return_note: false, accessories: [], familia: null, ruta: null, reparacion: null,
    created_at: ahora, updated_at: ahora, deleted_at: null, ...extra,
});
const M = 'Material de Consumo', HM = 'Herramienta Manual', HE = 'Herramienta Eléctrica', EPP = 'Equipo de Protección Personal';

/** Nombres reales de producción (5-oct), con cantidades de juguete. */
export const datosIniciales = () => ({
    app_users: [
        { id: JULI_ID, username: 'juli', name: 'Administrador maestro', role: 'owner', setup_complete: true, auth_uid: JULI_AUTH, debe_cambiar_clave: false, password: '', deleted_at: null },
        { id: 'u-camilo', username: null, name: 'Camilo', role: 'owner', setup_complete: false, auth_uid: null, debe_cambiar_clave: false, password: '', deleted_at: null },
        { id: 'u-kate', username: 'kate', name: 'Kate', role: 'employee', setup_complete: false, auth_uid: null, debe_cambiar_clave: false, password: '', deleted_at: null },
    ],
    items: [
        item('i-brocha', 'Brocha 2"', M, 5, { familia: 'Brocha' }),
        item('i-lechada', 'Lechada veige', M, 20, { familia: 'Lechada', unit: 'Kg' }),
        item('i-estopa', 'Estopa', M, 3, { familia: 'Estopa' }),
        item('i-lija240', 'Lija 240', M, 10, { familia: 'Lija' }),
        item('i-codo2', 'Codos 2"', M, 30, { familia: 'Codos', ruta: 'Tubería / Accesorios' }),
        item('i-codo4', 'Codos 4"', M, 10, { familia: 'Codos', ruta: 'Tubería / Accesorios' }),
        item('i-cemento', 'Cemento', M, 0, { familia: 'Cemento', unit: 'bultos' }),
        item('i-almadana', 'Almadana', HM, 2, { familia: 'Almadana' }),
        item('i-pala', 'Pala', HM, 5, { familia: 'Pala' }),
        item('i-espatula', 'Espátula pequeña', HM, 2, { familia: 'Espátula' }),
        item('i-tal-stanley', 'Taladro Inhalambrico (Amarillo · Stanley)', HE, 1, { familia: 'Taladro', color: 'Amarillo', brand: 'Stanley' }),
        item('i-tal-dwalt', 'Taladro inhalambrico (Amarillo · Dwalt)', HE, 1, { familia: 'Taladro', color: 'Amarillo', brand: 'Dwalt' }),
        item('i-guantes', 'Guantes', EPP, 20, { familia: 'Guantes' }),
    ],
    personnel: [
        { id: 'p-adrian', name: 'Adrián Echeverry', phone: null, is_team_leader: false, team_leader_id: null, deleted_at: null, updated_at: ahora },
        { id: 'p-jorman', name: 'Jorman', phone: null, is_team_leader: false, team_leader_id: null, deleted_at: null, updated_at: ahora },
        { id: 'p-william', name: 'William', phone: null, is_team_leader: false, team_leader_id: null, deleted_at: null, updated_at: ahora },
        { id: 'p-alex', name: 'Alex', phone: null, is_team_leader: true, team_leader_id: null, deleted_at: null, updated_at: ahora },
    ],
    projects: [
        { id: 'o-cristo', name: 'CRISTO', description: 'MONTECIELO', status: 'active', created_at: ahora, deleted_at: null, updated_at: ahora },
        { id: 'o-zona', name: 'ZONA GENERAL', description: null, status: 'active', created_at: ahora, deleted_at: null, updated_at: ahora },
    ],
    movements: [], asignaciones: [], audit_logs: [], behavior_logs: [], order_list: [],
    purchase_orders: [], purchase_order_items: [],
});

/** Aplica los filtros de PostgREST que la app usa: `col=eq.x`, `col=is.null`, `col=in.(a,b)`. */
const filtrar = (filas, params) => filas.filter(f => {
    for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
        if (v.startsWith('eq.')) { if (String(f[k]) !== v.slice(3)) return false; }
        else if (v === 'is.null') { if (f[k] != null) return false; }
        else if (v === 'not.is.null') { if (f[k] == null) return false; }
        else if (v.startsWith('in.(')) { if (!v.slice(4, -1).split(',').includes(String(f[k]))) return false; }
        else if (v.startsWith('gte.') || v.startsWith('lte.') || v.startsWith('gt.') || v.startsWith('lt.')) continue;
    }
    return true;
});

/**
 * Engancha el Supabase falso a una página de Playwright. Devuelve el estado:
 * `db` (las tablas), `rpc` (cada llamada a función, con sus argumentos),
 * `escrituras` y `desconocidas`.
 */
export const montarSupabaseFalso = async (page, base = 'http://supabase.falso') => {
    const estado = { db: datosIniciales(), rpc: [], escrituras: [], desconocidas: [], sinRed: false };
    await page.route(`${base}/**`, async route => {
        const req = route.request();
        const url = new URL(req.url());
        const metodo = req.method();
        const cuerpo = req.postData() ? (() => { try { return JSON.parse(req.postData()); } catch { return req.postData(); } })() : undefined;
        const json = (status, data, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: data === undefined ? '' : JSON.stringify(data) });
        if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        if (estado.sinRed) return route.abort('internetdisconnected');

        const ruta = url.pathname;
        // ── Auth ──
        if (ruta === '/auth/v1/token') {
            if (cuerpo?.email === 'juli@bodega.montecielo' && cuerpo?.password === 'clave-de-prueba') {
                return json(200, { access_token: jwt(JULI_AUTH), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: usuarioAuth() });
            }
            return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
        }
        if (ruta === '/auth/v1/user') return json(200, usuarioAuth());
        if (ruta === '/auth/v1/logout') return route.fulfill({ status: 204 });
        // ── Funciones ──
        if (ruta.startsWith('/rest/v1/rpc/')) {
            const fn = ruta.slice('/rest/v1/rpc/'.length);
            estado.rpc.push({ fn, args: cuerpo });
            if (fn === 'get_users_safe') {
                return json(200, estado.db.app_users.filter(u => !u.deleted_at).map(u => ({
                    user_id: u.id, user_username: u.username, user_role: u.role, user_name: u.name, user_setup_complete: u.setup_complete,
                })));
            }
            if (fn === 'log_movements_and_update_stock') {
                for (const m of cuerpo.p_movements) {
                    if (estado.db.movements.some(x => x.id === m.id)) continue;
                    estado.db.movements.push({ deleted_at: null, ...m });
                    const it = estado.db.items.find(i => i.id === m.item_id);
                    if (it) it.quantity = Number(it.quantity) + ((m.type === 'Salida' || m.type === 'Merma') ? -m.quantity : m.quantity);
                }
                return json(200, null);
            }
            if (['get_deleted_users_safe'].includes(fn)) return json(200, []);
            if (['ya_cambie_mi_clave'].includes(fn)) return json(200, null);
            estado.desconocidas.push(`rpc ${fn}`);
            return json(200, null);
        }
        // ── Tablas ──
        const tabla = ruta.replace('/rest/v1/', '');
        if (!(tabla in estado.db)) { estado.desconocidas.push(`${metodo} ${tabla}`); return json(200, []); }
        const filas = estado.db[tabla];
        const unica = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
        if (metodo === 'GET' || metodo === 'HEAD') {
            const r = filtrar(filas, url.searchParams);
            return unica ? (r.length ? json(200, r[0]) : json(406, { code: 'PGRST116', message: 'no rows' })) : json(200, r);
        }
        if (metodo === 'POST') {
            const nuevas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
            for (const n of nuevas) {
                const i = filas.findIndex(f => f.id === n.id);
                if (i >= 0) filas[i] = { ...filas[i], ...n }; else filas.push({ deleted_at: null, ...n });
                estado.escrituras.push({ tabla, metodo, fila: n });
            }
            return unica ? json(201, nuevas[0]) : json(201, nuevas);
        }
        if (metodo === 'PATCH') {
            const r = filtrar(filas, url.searchParams);
            for (const f of r) Object.assign(f, cuerpo);
            estado.escrituras.push({ tabla, metodo, filtro: url.search, cambio: cuerpo });
            return unica ? json(200, r[0] ?? null) : json(200, r);
        }
        if (metodo === 'DELETE') { estado.escrituras.push({ tabla, metodo, filtro: url.search }); return json(204); }
        estado.desconocidas.push(`${metodo} ${tabla}`);
        return json(200, []);
    });
    return estado;
};
