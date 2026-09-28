/**
 * core/consultas.ts — Lo que el asistente puede preguntar
 * =======================================================
 * Las preguntas del punto 18 del prompt de Juli, contestadas sin React y sin
 * red: recibe la bodega leída y devuelve el texto y los datos. El endpoint
 * `api/consulta.ts` solo lee las tablas y llama acá.
 *
 * LA DISTINCIÓN QUE MANDA (punto 16): *actual*, *histórico* y *devuelto* son
 * tres preguntas distintas. «¿Qué tiene Abel?» es HOY. «¿Qué tenía?» es lo que
 * ya no tiene. «¿Qué devolvió?» son las devoluciones. Mezclarlas es acusar a
 * alguien de tener lo que entregó hace un mes.
 *
 * Y la regla de Juli: una asignación POSIBLE no se dice como «la tiene». Se
 * dice «posible asignación → verificar», siempre, en toda respuesta.
 */

import { Asignacion, Item, Movement, MovementType, Personnel, Project } from '../types';
import { getActiveLoans, pendienteDe, daysSince } from '../utils/inventory';
import { rankMatches } from '../utils/search';
import { itemsQueResponden, resolverPersona } from '../utils/lote';
import { ESTADOS, NO_ESPECIFICADO, estaAbierta } from './custodia';

export interface Bodega {
    items: Item[];
    movements: Movement[];
    personnel: Personnel[];
    projects: Project[];
    asignaciones: Asignacion[];
}

export const PREGUNTAS = [
    'que_tiene', 'que_tenia', 'que_devolvio', 'donde_esta', 'quien_tiene',
    'que_hay_en_obra', 'por_ubicar', 'que_esta_malo', 'que_paso',
] as const;
export type Pregunta = typeof PREGUNTAS[number];

export interface Consulta {
    pregunta: Pregunta;
    persona?: string;
    elemento?: string;
    obra?: string;
    /** Día en Colombia, AAAA-MM-DD. Sin decir: hoy. */
    fecha?: string;
}

export interface Respuesta {
    pregunta: Pregunta;
    /** En cristiano, corto: la residente está trabajando. */
    texto: string;
    datos: unknown;
    /** Lo que no se pudo resolver sin adivinar. */
    dudas?: string[];
}

// ── Utilidades ───────────────────────────────────────────────────────

/** Colombia no cambia de hora: siempre UTC−5. */
const BOGOTA_MS = -5 * 60 * 60 * 1000;
export const hoyEnBogota = (ahora: Date): string =>
    new Date(ahora.getTime() + BOGOTA_MS).toISOString().slice(0, 10);

const ventanaDelDia = (fecha: string): [number, number] => {
    const ini = Date.parse(`${fecha}T00:00:00-05:00`);
    return [ini, ini + 24 * 60 * 60 * 1000];
};

const dia = (d?: Date | string) => (d ? new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }) : NO_ESPECIFICADO);

const ctx = (b: Bodega) => {
    const item = new Map(b.items.map(i => [i.id, i]));
    const persona = new Map(b.personnel.map(p => [p.id, p]));
    const obra = new Map(b.projects.map(p => [p.id, p]));
    return {
        nombreItem: (id: string) => item.get(id)?.name ?? NO_ESPECIFICADO,
        nombrePersona: (id?: string) => (id ? persona.get(id)?.name : undefined) ?? NO_ESPECIFICADO,
        nombreObra: (id?: string) => (id ? obra.get(id)?.name : undefined) ?? NO_ESPECIFICADO,
    };
};

/** «Posible asignación: Jesús → verificar», nunca «lo tiene Jesús». */
const fraseAsignacion = (a: Asignacion, nombrePersona: (id?: string) => string): string => {
    const quien = a.posibleResponsable ?? (a.personnelId ? nombrePersona(a.personnelId) : undefined);
    const base = `${a.cantidad} × ${a.descripcion}`;
    if (a.estado === 'confirmada') return `${base} — confirmado${quien ? `: ${quien}` : ''}${a.ubicacion ? ` (${a.ubicacion})` : ''}`;
    if (a.estado === 'posible') return `${base} — posible asignación: ${quien ?? NO_ESPECIFICADO} → verificar`;
    return `${base} — falta por verificar${quien ? ` (relacionado: ${quien})` : ''}`;
};

const buscarPersona = (b: Bodega, texto?: string): { persona?: Personnel; duda?: string } => {
    if (!texto?.trim()) return { duda: 'Falta decir de quién se pregunta.' };
    const r = resolverPersona(texto, b.personnel);
    if (!r.elegido) return { duda: `No encontré a «${texto}» en el personal.` };
    if (r.dudoso) return { duda: `«${texto}» puede ser ${r.candidatos.slice(0, 3).map(p => p.name).join(' o ')}. ¿Cuál?` };
    return { persona: r.elegido };
};

/** ¿La asignación menciona a esta persona, por ficha o por nombre en la lista? */
const mencionaA = (a: Asignacion, p: Personnel): boolean => {
    if (a.personnelId === p.id) return true;
    const primer = p.name.split(/\s+/)[0]?.toLowerCase();
    return !!primer && primer.length >= 3 && (a.posibleResponsable ?? '').toLowerCase().includes(primer);
};

// ── Las preguntas ────────────────────────────────────────────────────

const queTiene = (b: Bodega, c: Consulta): Respuesta => {
    const { persona, duda } = buscarPersona(b, c.persona);
    if (!persona) return { pregunta: c.pregunta, texto: duda!, datos: null, dudas: [duda!] };
    const { nombreItem, nombreObra } = ctx(b);
    const hoy = getActiveLoans(b.movements).filter(m => m.personnelId === persona.id).map(m => ({
        elemento: nombreItem(m.itemId), cantidad: m.quantity, obra: nombreObra(m.projectId),
        desde: m.timestamp, dias: daysSince(m.timestamp), prestamoId: m.id,
    }));
    const sinConfirmar = b.asignaciones.filter(a => estaAbierta(a) && mencionaA(a, persona));
    const renglones = hoy.map(h => `• ${h.cantidad} × ${h.elemento} — desde ${dia(h.desde)} (${h.dias} d), obra: ${h.obra}`);
    const dudosos = sinConfirmar.map(a => `• ${fraseAsignacion(a, ctx(b).nombrePersona)}`);
    const texto = [
        hoy.length ? `${persona.name} tiene hoy:\n${renglones.join('\n')}` : `${persona.name} no tiene nada prestado hoy.`,
        dudosos.length ? `Sin confirmar (NO se da por hecho que la tenga):\n${dudosos.join('\n')}` : '',
    ].filter(Boolean).join('\n\n');
    return { pregunta: c.pregunta, texto, datos: { persona: persona.name, hoy, sinConfirmar } };
};

/** Préstamos de la persona que ya no están afuera, con cómo se cerraron. */
const queTenia = (b: Bodega, c: Consulta): Respuesta => {
    const { persona, duda } = buscarPersona(b, c.persona);
    if (!persona) return { pregunta: c.pregunta, texto: duda!, datos: null, dudas: [duda!] };
    const { nombreItem, nombrePersona } = ctx(b);
    const cerrados = b.movements.filter(m =>
        m.personnelId === persona.id && m.isLoan && m.type === MovementType.CHECK_OUT
        && (m.isReturned || pendienteDe(m, b.movements) === 0));
    const datos = cerrados.map(m => {
        const siguiente = b.movements.find(x => x.vieneDe === m.id);
        return {
            elemento: nombreItem(m.itemId), cantidad: m.quantity, desde: m.timestamp,
            hasta: m.returnedAt,
            como: siguiente ? `pasó a ${nombrePersona(siguiente.personnelId)}` : 'volvió a bodega',
        };
    }).sort((x, y) => +new Date(y.desde) - +new Date(x.desde));
    const texto = datos.length
        ? `${persona.name} tuvo (ya no lo tiene):\n${datos.slice(0, 30).map(d => `• ${d.cantidad} × ${d.elemento} — ${dia(d.desde)} a ${dia(d.hasta)}, ${d.como}`).join('\n')}`
        : `${persona.name} no tiene préstamos cerrados registrados.`;
    return { pregunta: c.pregunta, texto, datos: { persona: persona.name, cerrados: datos } };
};

const queDevolvio = (b: Bodega, c: Consulta): Respuesta => {
    const { persona, duda } = buscarPersona(b, c.persona);
    if (!persona) return { pregunta: c.pregunta, texto: duda!, datos: null, dudas: [duda!] };
    const { nombreItem } = ctx(b);
    const suyos = new Map(b.movements.filter(m => m.isLoan && m.personnelId === persona.id).map(m => [m.id, m]));
    // Las de ahora: una entrada propia por devolución. Un traslado no es una
    // devolución a bodega y no se cuenta.
    const nuevas = b.movements.filter(m => m.devuelveA && suyos.has(m.devuelveA) && !m.esTraslado).map(m => ({
        elemento: nombreItem(m.itemId), cantidad: m.quantity, fecha: m.returnedAt ?? m.timestamp,
        estado: m.returnCondition ?? NO_ESPECIFICADO,
    }));
    // Las de antes del 28-sep: el préstamo marcado, sin entrada propia.
    const conEntrada = new Set(b.movements.filter(m => m.devuelveA).map(m => m.devuelveA));
    const viejas = [...suyos.values()].filter(m => m.isReturned && !conEntrada.has(m.id)
        && !b.movements.some(x => x.vieneDe === m.id)).map(m => ({
        elemento: nombreItem(m.itemId), cantidad: m.quantity, fecha: m.returnedAt,
        estado: m.returnCondition ?? NO_ESPECIFICADO,
    }));
    const todas = [...nuevas, ...viejas].sort((x, y) => +new Date(y.fecha ?? 0) - +new Date(x.fecha ?? 0));
    const texto = todas.length
        ? `${persona.name} devolvió:\n${todas.slice(0, 30).map(d => `• ${d.cantidad} × ${d.elemento} — ${dia(d.fecha)}, estado: ${d.estado}`).join('\n')}`
        : `${persona.name} no tiene devoluciones registradas.`;
    return { pregunta: c.pregunta, texto, datos: { persona: persona.name, devoluciones: todas } };
};

const dondeEsta = (b: Bodega, c: Consulta, soloQuien = false): Respuesta => {
    const texto0 = c.elemento?.trim();
    if (!texto0) return { pregunta: c.pregunta, texto: 'Falta decir qué elemento.', datos: null, dudas: ['Falta el elemento.'] };
    const { nombrePersona, nombreObra } = ctx(b);
    const encontrados = itemsQueResponden(texto0, b.items);
    const activos = getActiveLoans(b.movements);
    const porItem = encontrados.map(i => ({
        elemento: i.name,
        enBodega: i.quantity,
        reparacion: i.reparacion?.estado,
        prestadas: activos.filter(m => m.itemId === i.id).map(m => ({
            persona: nombrePersona(m.personnelId), obra: nombreObra(m.projectId),
            cantidad: m.quantity, desde: m.timestamp,
        })),
        sinConfirmar: b.asignaciones.filter(a => estaAbierta(a) && a.itemId === i.id),
    }));
    // Las asignaciones que todavía no tienen ítem se buscan por lo que dicen.
    const sueltas = b.asignaciones.filter(a => estaAbierta(a) && !a.itemId
        && rankMatches([a], texto0, x => [x.descripcion], 1)[0]?.score >= 500);

    if (porItem.length === 0 && sueltas.length === 0) {
        return { pregunta: c.pregunta, texto: `No encontré «${texto0}» en el inventario ni en lo pendiente por ubicar.`, datos: [] };
    }
    const lineas: string[] = [];
    for (const x of porItem) {
        const partes: string[] = [];
        if (!soloQuien) partes.push(`${x.enBodega} en bodega${x.reparacion ? ` (${x.reparacion})` : ''}`);
        for (const p of x.prestadas) partes.push(`${p.cantidad} con ${p.persona} desde ${dia(p.desde)}, obra: ${p.obra}`);
        for (const a of x.sinConfirmar) partes.push(fraseAsignacion(a, nombrePersona));
        if (soloQuien && partes.length === 0) continue;
        lineas.push(`• ${x.elemento}: ${partes.join('; ') || 'nadie la tiene'}`);
    }
    for (const a of sueltas) lineas.push(`• ${fraseAsignacion(a, nombrePersona)}`);
    const texto = lineas.length ? lineas.join('\n') : `Nadie tiene «${texto0}» prestada hoy.`;
    return { pregunta: c.pregunta, texto, datos: { items: porItem, sinItem: sueltas } };
};

const queHayEnObra = (b: Bodega, c: Consulta): Respuesta => {
    const t = c.obra?.trim();
    if (!t) return { pregunta: c.pregunta, texto: 'Falta decir qué obra.', datos: null, dudas: ['Falta la obra.'] };
    const r = rankMatches(b.projects, t, p => [p.name], 3);
    const obra = r[0]?.score >= 500 ? r[0].value : undefined;
    const { nombreItem, nombrePersona } = ctx(b);
    const porLugar = b.asignaciones.filter(a => estaAbierta(a)
        && ((obra && a.projectId === obra.id) || (a.ubicacion ?? '').toLowerCase().includes(t.toLowerCase())));
    if (!obra && porLugar.length === 0) {
        return { pregunta: c.pregunta, texto: `No encontré la obra «${t}».`, datos: null, dudas: [`No encontré la obra «${t}».`] };
    }
    const prestadas = obra ? getActiveLoans(b.movements).filter(m => m.projectId === obra.id) : [];
    const lineas = [
        ...prestadas.map(m => `• ${m.quantity} × ${nombreItem(m.itemId)} — ${nombrePersona(m.personnelId)}, desde ${dia(m.timestamp)}`),
        ...porLugar.map(a => `• ${fraseAsignacion(a, nombrePersona)}`),
    ];
    const nombre = obra?.name ?? t;
    return {
        pregunta: c.pregunta,
        texto: lineas.length ? `En ${nombre}:\n${lineas.join('\n')}` : `No hay nada registrado en ${nombre}.`,
        datos: { obra: nombre, prestadas, asignaciones: porLugar },
    };
};

const porUbicar = (b: Bodega, c: Consulta): Respuesta => {
    const { nombrePersona } = ctx(b);
    const abiertas = b.asignaciones.filter(a => estaAbierta(a) && a.estado !== 'confirmada');
    const unidades = abiertas.reduce((s, a) => s + a.cantidad, 0);
    const texto = abiertas.length
        ? `Falta por ubicar: ${unidades} unidad(es).\n${abiertas.map(a => `• ${fraseAsignacion(a, nombrePersona)}`).join('\n')}`
        : 'No hay nada pendiente por ubicar.';
    return { pregunta: c.pregunta, texto, datos: { unidades, asignaciones: abiertas } };
};

const queEstaMalo = (b: Bodega, c: Consulta): Respuesta => {
    const { nombrePersona } = ctx(b);
    const enReparacion = b.items.filter(i => i.reparacion).map(i => ({
        elemento: i.name, estado: i.reparacion!.estado, desde: i.reparacion!.desde, nota: i.reparacion!.nota,
    }));
    const afueraMalas = b.asignaciones.filter(a => estaAbierta(a) && a.condicion === 'mala');
    const lineas = [
        ...enReparacion.map(x => `• ${x.elemento} — ${x.estado === 'enviada' ? 'en el taller' : 'dañada, en bodega'} desde ${dia(x.desde)}${x.nota ? ` (${x.nota})` : ''}`),
        ...afueraMalas.map(a => `• ${fraseAsignacion(a, nombrePersona)} — en mal estado`),
    ];
    return {
        pregunta: c.pregunta,
        texto: lineas.length ? `En mal estado:\n${lineas.join('\n')}` : 'No hay nada registrado en mal estado.',
        datos: { enReparacion, afueraMalas },
    };
};

const quePaso = (b: Bodega, c: Consulta, ahora: Date): Respuesta => {
    const fecha = c.fecha ?? hoyEnBogota(ahora);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return { pregunta: c.pregunta, texto: 'La fecha va como AAAA-MM-DD.', datos: null, dudas: ['Fecha mal escrita.'] };
    }
    const [ini, fin] = ventanaDelDia(fecha);
    const enElDia = (d?: Date | string) => { const t = d ? +new Date(d) : NaN; return t >= ini && t < fin; };
    const { nombreItem, nombrePersona } = ctx(b);
    const del = b.movements.filter(m => enElDia(m.timestamp));
    const r = (m: Movement) => `• ${m.quantity} × ${nombreItem(m.itemId)}${m.personnelId ? ` — ${nombrePersona(m.personnelId)}` : ''}`;
    const salieron = del.filter(m => m.type === MovementType.CHECK_OUT && !m.esTraslado);
    const volvieron = del.filter(m => m.devuelveA && !m.esTraslado);
    // Las devoluciones del camino viejo no tienen fila propia: se ven por la
    // fecha en que se marcó el préstamo.
    const conEntrada = new Set(b.movements.filter(m => m.devuelveA).map(m => m.devuelveA));
    const volvieronViejas = b.movements.filter(m => m.isLoan && m.isReturned && enElDia(m.returnedAt) && !conEntrada.has(m.id)
        && !b.movements.some(x => x.vieneDe === m.id));
    const entraron = del.filter(m => (m.type === MovementType.CHECK_IN || m.type === MovementType.PURCHASE) && !m.devuelveA);
    const traslados = del.filter(m => m.esTraslado && m.type === MovementType.CHECK_OUT);
    const mermas = del.filter(m => m.type === MovementType.WASTE);

    const bloque = (titulo: string, ms: Movement[]) => (ms.length ? `${titulo} (${ms.length}):\n${ms.map(r).join('\n')}` : '');
    const texto = [
        bloque('Salió', salieron),
        bloque('Volvió', [...volvieron, ...volvieronViejas]),
        bloque('Entró', entraron),
        bloque('Traslados', traslados),
        bloque('Mermas', mermas),
    ].filter(Boolean).join('\n\n') || `El ${fecha} no hay movimientos registrados.`;
    return {
        pregunta: c.pregunta, texto,
        datos: { fecha, salieron, volvieron: [...volvieron, ...volvieronViejas], entraron, traslados, mermas },
    };
};

export const consultar = (b: Bodega, c: Consulta, ahora = new Date()): Respuesta => {
    switch (c.pregunta) {
        case 'que_tiene': return queTiene(b, c);
        case 'que_tenia': return queTenia(b, c);
        case 'que_devolvio': return queDevolvio(b, c);
        case 'donde_esta': return dondeEsta(b, c);
        case 'quien_tiene': return dondeEsta(b, c, true);
        case 'que_hay_en_obra': return queHayEnObra(b, c);
        case 'por_ubicar': return porUbicar(b, c);
        case 'que_esta_malo': return queEstaMalo(b, c);
        case 'que_paso': return quePaso(b, c, ahora);
        default: {
            const p: string = (c as { pregunta: string }).pregunta;
            return { pregunta: c.pregunta, texto: `No sé contestar «${p}». Preguntas: ${PREGUNTAS.join(', ')}.`, datos: null, dudas: ['Pregunta desconocida.'] };
        }
    }
};

// Por si alguien necesita la etiqueta del estado en la respuesta del endpoint.
export { ESTADOS };
