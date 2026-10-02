/**
 * tests/entrada.test.ts — Leer lo que la persona tecleó, y quién puede entrar
 * ===========================================================================
 * Dos cosas distintas que tienen la misma forma de fallar: se confunden dos
 * situaciones que no son la misma, y la app sigue andando como si nada.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// `typescript` es CommonJS: en módulo ES la forma que trae las APIs es la default.
import ts from 'typescript';
import { cantidadDeTexto } from '../utils/numeros';
import { AppUser, UserRole } from '../types';
import { igual, esCierto, grupo, cerrar } from './correr';

grupo('una cantidad con decimales NO se redondea', () => {
    /**
     * `parseInt('1.5')` devuelve `1`. Estaba en once campos de seis pantallas.
     * Medio metro de manguera se perdía al teclearlo, sin aviso, y el número que
     * quedaba guardado se veía perfectamente correcto.
     */
    igual(cantidadDeTexto('1.5'), 1.5, 'con punto');
    igual(cantidadDeTexto('1,5'), 1.5, 'con coma, que es como se escribe acá');
    igual(cantidadDeTexto('2,75'), 2.75, 'dos decimales');
    igual(cantidadDeTexto('12'), 12, 'un entero sigue siendo un entero');
});

grupo('el piso se respeta', () => {
    igual(cantidadDeTexto('-3', 0), 0, 'un stock no baja de cero');
    igual(cantidadDeTexto('0', 0.1), 0.1, 'una cantidad pedida no puede ser cero');
    igual(cantidadDeTexto('0', 0), 0, 'pero un stock sí puede quedar en cero');
});

grupo('lo que no es un número cae al piso, no rompe', () => {
    // El campo vacío pasa por acá en cada tecla que se borra.
    igual(cantidadDeTexto(''), 0, 'vacío');
    igual(cantidadDeTexto('   '), 0, 'espacios');
    igual(cantidadDeTexto('abc', 1), 1, 'letras');
    igual(cantidadDeTexto('abc'), 0, 'letras con piso cero');
});

grupo('los casos de teclear a medias', () => {
    // Mientras alguien escribe "1,5" pasa por "1," y por "1". Ninguno puede
    // romper el campo ni saltar a un número raro.
    igual(cantidadDeTexto('1'), 1, 'a mitad de camino');
    igual(cantidadDeTexto('1,'), 1, 'con la coma recién puesta');
    igual(cantidadDeTexto('1.'), 1, 'con el punto recién puesto');
    esCierto(Number.isFinite(cantidadDeTexto('1,5,5')), 'algo imposible no devuelve NaN');
});

/**
 * Quién puede entrar — y quién ya no.
 *
 * El manejador vive en `components/LoginView.tsx`, atado a React. Se saca con el
 * compilador de TypeScript y se corre con las dependencias puestas a mano, igual
 * que en `tests/pantalla.test.ts` y `tests/kardex.test.ts`.
 */
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIN = path.join(AQUI, '..', 'components', 'LoginView.tsx');

const sacarDeLogin = <T,>(nombres: string[], contexto: Record<string, unknown>): T => {
    const texto = fs.readFileSync(LOGIN, 'utf8');
    const sf = ts.createSourceFile(LOGIN, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const encontradas = new Map<string, string>();
    const visitar = (nodo: ts.Node): void => {
        if ((ts.isVariableDeclaration(nodo) || ts.isFunctionDeclaration(nodo))
            && nodo.name && nombres.includes(nodo.name.getText(sf))) {
            encontradas.set(nodo.name.getText(sf),
                ts.isVariableDeclaration(nodo) ? `const ${nodo.getText(sf)};` : nodo.getText(sf).replace(/^export\s+/, ''));
        }
        ts.forEachChild(nodo, visitar);
    };
    visitar(sf);
    for (const n of nombres) {
        if (!encontradas.has(n)) {
            throw new Error(`No encontré "${n}" en LoginView.tsx. Si la renombraste o la moviste, actualizá esta prueba.`);
        }
    }
    const cuerpo = ts.transpileModule(
        `(() => {\n${nombres.map(n => encontradas.get(n)).join('\n')}\nreturn { ${nombres.join(', ')} };\n})()`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
    ).outputText;
    const claves = Object.keys(contexto);
    // eslint-disable-next-line no-new-func
    return new Function(...claves, `return ${cuerpo};`)(...claves.map(k => contexto[k])) as T;
};

type Respuesta = { estado: 'ok'; usuario: { id: string; role: UserRole; name: string } }
    | { estado: 'rechazado' } | { estado: 'sinRespuesta' };

interface Login { handlePasswordSubmit: (e: { preventDefault: () => void }) => Promise<void> }

/** El hash que este dispositivo guardó de la contraseña VIEJA. */
const HASH_VIEJO = 'hash-de-la-contrasena-vieja';

/**
 * `identidad` es lo que contesta la vía NUEVA (el servidor sabe quién sos), y
 * `respuestaDelServidor` lo que contesta la vieja (comparar contra una tabla).
 * Durante la transición conviven, y lo que hay que fijar es EL ORDEN: la nueva
 * manda, y un rechazo suyo no cae a la vieja.
 */
const login = (respuestaDelServidor: Respuesta | (() => never), identidad: Respuesta = { estado: 'sinRespuesta' }) => {
    const visto = { entro: null as string | null, sacudidas: [] as string[] };
    const usuario = {
        id: 'u1', username: 'kate', name: 'Kate',
        role: UserRole.EMPLOYEE, passwordHash: HASH_VIEJO,
    } as unknown as AppUser;
    const c: Record<string, unknown> = {
        selectedUser: usuario,
        password: 'la-vieja',
        isLoading: false,
        setIsLoading: () => {},
        setPassword: () => {},
        triggerShake: (m: string) => visto.sacudidas.push(m),
        onLoginSuccess: (_rol: UserRole, nombre: string) => { visto.entro = nombre; },
        onCredentialVerified: () => {},
        // El respaldo del teléfono SÍ reconoce la contraseña vieja. Ese es el
        // punto: si el manejador cae acá cuando no debe, la persona entra.
        sha256Hex: async () => HASH_VIEJO,
        offlineMatch: async () => true,
        db: {
            entrarConIdentidad: async () => identidad,
            authenticateUser: async () => {
                if (typeof respuestaDelServidor === 'function') respuestaDelServidor();
                return respuestaDelServidor;
            },
        },
    };
    return { visto, fn: sacarDeLogin<Login>(['handlePasswordSubmit'], c) };
};

grupo('el servidor dice que NO: no se entra', () => {
    /**
     * El fallo: «esa contraseña no es» y «no hay conexión» llegaban como el
     * mismo `null`, y quien llamaba leía `null` como «probá con el respaldo del
     * teléfono» — y con el respaldo del teléfono entraba. Cambiarle la
     * contraseña a alguien no se la cambiaba: seguía entrando con la vieja.
     */
    const t = login({ estado: 'rechazado' });
    return t.fn.handlePasswordSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, null, 'NO entró, aunque el teléfono reconozca la vieja');
        esCierto(t.visto.sacudidas.length > 0, 'y se le dice que la contraseña está mala');
    });
});

grupo('sin respuesta del servidor: el respaldo del teléfono SÍ vale', () => {
    // Lo contrario, y por eso los dos casos tienen que estar: no saber no puede
    // dejar a la encargada afuera de la bodega a las siete de la mañana.
    const t = login({ estado: 'sinRespuesta' });
    return t.fn.handlePasswordSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, 'Kate', 'entra con el hash guardado en el dispositivo');
    });
});

grupo('el servidor dice que sí: entra con lo que él diga', () => {
    const t = login({ estado: 'ok', usuario: { id: 'u1', role: UserRole.OWNER, name: 'Kate Real' } });
    return t.fn.handlePasswordSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, 'Kate Real', 'entra con el nombre del servidor, no con el local');
    });
});

grupo('si la consulta revienta, el respaldo sigue siendo el respaldo', () => {
    // Una excepción tampoco es «el servidor dijo que no»: es no saber.
    const t = login(() => { throw new Error('red caída'); });
    return t.fn.handlePasswordSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, 'Kate', 'entra por el respaldo');
    });
});

grupo('la identidad de servidor manda sobre el camino viejo', () => {
    /**
     * Las dos vías conviven solo durante la transición. Si el servidor ya sabe
     * quién es esta persona, eso gana: es la única de las dos que le dice algo
     * al servidor sobre quién está escribiendo.
     */
    const t = login({ estado: 'ok', usuario: { id: 'u1', role: UserRole.EMPLOYEE, name: 'El viejo' } },
                    { estado: 'ok', usuario: { id: 'u1', role: UserRole.OWNER, name: 'El de identidad' } });
    return t.fn.handlePasswordSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, 'El de identidad', 'entra con lo que dijo la identidad');
    });
});

grupo('si la IDENTIDAD rechaza, NO se prueba por la otra puerta', () => {
    /**
     * Esto es lo mismo que se cerró en el PR #85, un piso más arriba. Si el
     * servidor comparó y dijo que no, volver a intentar por el camino viejo
     * —que compara contra una tabla y no sabe de permisos— sería dejar entrar a
     * quien el servidor acaba de rechazar.
     *
     * La vía vieja está puesta en `ok` a propósito: si el manejador cayera a
     * ella, la persona entraría. Que no entre es el punto.
     */
    const t = login({ estado: 'ok', usuario: { id: 'u1', role: UserRole.OWNER, name: 'No debería' } },
                    { estado: 'rechazado' });
    return t.fn.handlePasswordSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, null, 'NO entró');
        esCierto(t.visto.sacudidas.length > 0, 'y se le dice que la contraseña está mala');
    });
});

grupo('si la identidad NO CONTESTA, el camino viejo sigue sirviendo', () => {
    // Durante la transición esto es lo normal: el servidor todavía no tiene
    // creados los usuarios. Nadie se puede quedar afuera por eso.
    const t = login({ estado: 'ok', usuario: { id: 'u1', role: UserRole.EMPLOYEE, name: 'Kate' } },
                    { estado: 'sinRespuesta' });
    return t.fn.handlePasswordSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, 'Kate', 'entra por el camino viejo');
    });
});

/**
 * EL PRIMER INGRESO — el hueco más grande que tuvo esta app.
 *
 * Un acceso creado por el administrador quedaba "en espera" y aparecía en la
 * lista de la pantalla de entrada. Cualquiera que abriera la dirección de la app
 * podía elegirlo, ponerle la contraseña que quisiera y entrar. Con un acceso de
 * DUEÑO esperando —que era el caso en producción— eso le daba permiso de borrar
 * todo al primero que pasara: sin claves, sin saber nada, solo abriendo la
 * página.
 */
interface Alta { handleSetupSubmit: (e: { preventDefault: () => void }) => Promise<void> }

/**
 * El alta, desde el 2-oct, la hace el SERVIDOR (`dar_de_alta`). La pantalla ya
 * no compara el código: antes lo comparaba contra una columna que la nube
 * nunca manda, y a Camilo le salía «no tiene código de alta» en cualquier
 * teléfono. Acá se prueba que la pantalla le pase al servidor lo que se
 * escribió, que muestre lo que el servidor contesta, y que entre por la
 * identidad recién creada.
 */
const alta = (codigoEscrito: string, clave = 'nueva123',
              servidor: 'ok' | 'codigo_malo' | 'sin_red' = 'ok', entra: 'ok' | 'rechazado' = 'ok') => {
    const visto = { creado: null as string | null, sacudidas: [] as string[], alServidor: [] as unknown[], entroCon: null as string | null };
    const c: Record<string, unknown> = {
        selectedUser: { id: 'u9', name: 'Camilo', password: '', role: UserRole.OWNER } as unknown as AppUser,
        setupCodigo: codigoEscrito,
        setupPassword: clave,
        setupConfirm: clave,
        isLoading: false,
        setIsLoading: () => {},
        sha256Hex: async () => 'hash',
        onCredentialVerified: () => {},
        triggerShake: (m: string) => visto.sacudidas.push(m),
        onFirstSetup: (_id: string, usuario: string) => { visto.creado = usuario; },
        db: {
            darDeAlta: async (id: string, codigo: string, k: string) => {
                visto.alServidor.push([id, codigo, k]);
                if (servidor === 'codigo_malo') throw new Error('Código de alta incorrecto.');
                if (servidor === 'sin_red') throw new Error('');
                return { username: 'camilo' };
            },
            entrarConIdentidad: async (u: string) => {
                visto.entroCon = u;
                return entra === 'ok' ? { estado: 'ok', usuario: { id: 'u9', role: UserRole.OWNER, name: 'Camilo' } } : { estado: 'rechazado' };
            },
        },
    };
    return { visto, fn: sacarDeLogin<Alta>(['handleSetupSubmit'], c) };
};
const enviar = (t: ReturnType<typeof alta>) => t.fn.handleSetupSubmit({ preventDefault: () => {} });

grupo('el alta la decide el SERVIDOR, con lo que se escribió', async () => {
    const t = alta(' ab3kp9 ');
    await enviar(t);
    igual(t.visto.alServidor, [['u9', 'ab3kp9', 'nueva123']], 'le pasa al servidor el código (sin espacios) y la clave');
    igual(t.visto.entroCon, 'camilo', 'y entra por la identidad recién creada');
    igual(t.visto.creado, 'camilo', 'el acceso queda listo');
});

grupo('si el servidor dice que el código no es, NO entra y se dice por qué', async () => {
    const t = alta('XXXXXX', 'nueva123', 'codigo_malo');
    await enviar(t);
    igual(t.visto.creado, null, 'no entra');
    esCierto(t.visto.sacudidas.some(m => /incorrecto/i.test(m)), 'con el mensaje del servidor');
});

grupo('sin código escrito no se le pregunta al servidor', async () => {
    const t = alta('   ');
    await enviar(t);
    igual(t.visto.alServidor.length, 0, 'ni lo intenta');
    esCierto(t.visto.sacudidas.some(m => /código de alta/i.test(m)), 'y pide el código');
});

grupo('una contraseña de menos de 6 no pasa', async () => {
    const t = alta('AB3KP9', 'ab12');
    await enviar(t);
    igual(t.visto.alServidor.length, 0, 'no llega al servidor');
    esCierto(t.visto.sacudidas.some(m => /6 caracteres/i.test(m)), 'y se dice el mínimo');
});

grupo('sin red: no entra, y se dice que revise la conexión', async () => {
    const t = alta('AB3KP9', 'nueva123', 'sin_red');
    await enviar(t);
    igual(t.visto.creado, null, 'no se finge el alta');
    esCierto(t.visto.sacudidas.some(m => /conexión/i.test(m)), 'se nombra la causa');
});

grupo('si la identidad no deja entrar justo después, no se finge que entró', async () => {
    const t = alta('AB3KP9', 'nueva123', 'ok', 'rechazado');
    await enviar(t);
    igual(t.visto.creado, null, 'no entra');
    esCierto(t.visto.sacudidas.length > 0, 'y se avisa');
});

/**
 * EL CAMBIO OBLIGATORIO DE CONTRASEÑA.
 *
 * Las tres contraseñas que había eran de DOS caracteres. Mientras la llave
 * pública estuvo abierta eso casi no importaba —había puertas más grandes— pero
 * al cerrar todo lo demás pasan a ser lo único que separa el inventario de
 * internet, y los nombres de usuario son adivinables.
 *
 * No se cambian por detrás: alguien que llega en la mañana con la contraseña que
 * conoce y no entra es la encargada parada en la puerta de la bodega.
 */
interface Cambio { handleCambioSubmit: (e: { preventDefault: () => void }) => Promise<void> }

const cambio = (nueva: string, repetida: string, guardar: 'bien' | 'falla' = 'bien') => {
    const visto = { entro: null as string | null, sacudidas: [] as string[], guardadas: [] as string[] };
    const c: Record<string, unknown> = {
        selectedUser: { id: 'u1', name: 'Kate' } as unknown as AppUser,
        pendienteDeEntrar: { role: UserRole.EMPLOYEE, name: 'Kate' },
        isLoading: false,
        setIsLoading: () => {},
        setupPassword: nueva,
        setupConfirm: repetida,
        triggerShake: (m: string) => visto.sacudidas.push(m),
        onLoginSuccess: (_r: UserRole, n: string) => { visto.entro = n; },
        onCredentialVerified: () => {},
        sha256Hex: async () => 'hash',
        db: {
            cambiarClave: async (_id: string, clave: string) => {
                if (guardar === 'falla') throw new Error('sin conexión');
                visto.guardadas.push(clave);
            },
        },
    };
    return { visto, fn: sacarDeLogin<Cambio>(['handleCambioSubmit'], c) };
};

grupo('una contraseña nueva de verdad deja entrar', () => {
    const t = cambio('montecielo47', 'montecielo47');
    return t.fn.handleCambioSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.guardadas, ['montecielo47'], 'se guardó');
        igual(t.visto.entro, 'Kate', 'y entró');
    });
});

grupo('una contraseña corta NO pasa', () => {
    // Seis es el mínimo. Si esto dejara pasar dos caracteres, todo el cambio
    // sería un paso extra que no protege nada.
    const t = cambio('ab', 'ab');
    return t.fn.handleCambioSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, null, 'no entró');
        igual(t.visto.guardadas.length, 0, 'ni se guardó');
        esCierto(t.visto.sacudidas.some(m => /6 caracteres/i.test(m)), 'y se dice el mínimo');
    });
});

grupo('si no coinciden, no pasa', () => {
    const t = cambio('montecielo47', 'montecielo48');
    return t.fn.handleCambioSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, null, 'no entró');
        esCierto(t.visto.sacudidas.some(m => /no coinciden/i.test(m)), 'y se dice por qué');
    });
});

grupo('si no se pudo guardar, NO se entra igual', () => {
    /**
     * Dejar pasar «por esta vez» es cómo nadie cambia la contraseña nunca. Y no
     * se pierde nada: la de siempre sigue sirviendo y se vuelve a intentar.
     */
    const t = cambio('montecielo47', 'montecielo47', 'falla');
    return t.fn.handleCambioSubmit({ preventDefault: () => {} }).then(() => {
        igual(t.visto.entro, null, 'no entró');
        esCierto(t.visto.sacudidas.some(m => /conexión/i.test(m)), 'y se dice que hay que reintentar');
    });
});

await cerrar();
