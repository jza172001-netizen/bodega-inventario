/**
 * core/verificacion.ts — Lo que la app revisa antes de registrar un bloque
 * ========================================================================
 * Hay dos verificaciones y las dos hacen falta. El Gem revisa contra los
 * AUDIOS: ¿oí bien, dijeron «Juan» o «Julián»? Esta revisa contra la BODEGA:
 * ¿esto tiene sentido con lo que ya hay? El Gem no puede saber que la pulidora
 * ya la tiene Pedro; la app no puede saber qué se dijo en el audio.
 *
 * Y replica LAS PREGUNTAS DEL CHAT, una por una, porque el bloque tiene que
 * dar lo mismo que el chat paso a paso:
 *  · ¿Es un oficial? → ¿para quién de su cuadrilla? (o él, «sin especificar»).
 *  · ¿La persona no existe? → ¿se crea, y en la cuadrilla de quién?
 *  · ¿Obra? → se pregunta SIEMPRE; «sin obra» vale, salvo con material de consumo.
 * Pasos opcionales: a veces se dicen y a veces no. Lo que no se dijo se
 * pregunta acá, no se adivina.
 *
 * Esto NO decide nada ni toca nada: dice qué hay que mirar. Decide quien mira.
 */

import { InventoryType, Item, Movement, MovementType } from '../types.js';
import { getActiveLoans, isAsset } from '../utils/inventory.js';
import { tipoExigeObra } from './despacho.js';
import { medidaDicha, problemaDeFecha, problemaDeHora } from '../utils/lote.js';
import type { ItemLote, LineaLote, LoteParseado } from '../utils/lote.js';
import { medidaDe, sinMedida, valorDeMedida } from '../utils/medida.js';

export type TipoAlerta =
    | 'persona'          // no se sabe quién es (no existe o hay dos parecidos)
    | 'oficial'          // es oficial: ¿para quién de su cuadrilla?
    | 'obra'             // ¿en qué obra? (opcional, pero se pregunta)
    | 'obra_obligatoria' // material de consumo sin obra: así no se puede
    | 'elemento'         // no se sabe qué ítem es
    | 'ya_la_tiene'      // la herramienta ya la tiene otro y no alcanza la bodega
    | 'duplicado'        // lo mismo a la misma persona, dos veces
    | 'falta_stock'      // no hay lo que se pide: se cargaría la diferencia
    | 'categoria'        // el bloque dice una categoría y la bodega tiene otra
    | 'fecha';           // la FECHA de la entrega no es fecha, o es futura

export interface Alerta {
    tipo: TipoAlerta;
    texto: string;
    /**
     * `decidir`: hace falta una DECISIÓN (quién, qué obra, qué ítem) y sin ella
     * el renglón no puede registrarse.
     * `mirar`: no falta nada, pero algo no cuadra; hay que tocar «✓ Verificado»
     * después de mirarlo. Mover el elemento a otra persona lo vuelve a pedir.
     */
    /**
     * `aviso`: se muestra y no frena. Es el «no hay existencia: entra lo que
     * falta y sale», que es lo NORMAL en esta bodega y ya se consintió arriba
     * con «Lo que no haya, cargalo». Pedir un toque por cada uno eran treinta
     * toques en una mañana de sesenta cosas (medido con la prueba de volumen).
     */
    nivel: 'decidir' | 'mirar' | 'aviso';
    /**
     * Cuando la duda es SOLO de medida —«3 codos» y hay de 1/2", 2" y 4"—, las
     * opciones como botones. Primero se sabe el accesorio, después la pulgada.
     */
    medidas?: OpcionMedida[];
}

export interface OpcionMedida { itemId: string; etiqueta: string; medida: string }

/**
 * Las medidas entre las que se duda: los ítems que son la MISMA cosa que los
 * candidatos y solo cambian en la medida. Se buscan en toda la bodega, no solo
 * entre los cuatro candidatos del buscador, para que salgan todas.
 *
 * Si los candidatos son de dos cosas distintas (codos y semicodos), el botón
 * lleva el nombre completo; si son una sola, basta la medida.
 */
export const opcionesDeMedida = (it: ItemLote, items: Item[]): OpcionMedida[] => {
    const llaves = new Set(it.candidatos.filter(c => medidaDe(c.name)).map(c => sinMedida(c.name)));
    if (llaves.size === 0) return [];
    const deEsas = items.filter(i => llaves.has(sinMedida(i.name)) && medidaDe(i.name));
    if (deEsas.length < 2) return [];
    const vecesMedida = new Map<string, number>();
    for (const i of deEsas) vecesMedida.set(medidaDe(i.name)!, (vecesMedida.get(medidaDe(i.name)!) ?? 0) + 1);
    return deEsas
        .map(i => {
            const medida = medidaDe(i.name)!;
            return { itemId: i.id, medida, etiqueta: llaves.size > 1 || vecesMedida.get(medida)! > 1 ? i.name : medida };
        })
        .sort((a, b) => valorDeMedida(a.medida) - valorDeMedida(b.medida) || a.etiqueta.localeCompare(b.etiqueta, 'es'));
};

export interface Contexto {
    items: Item[];
    movements: Movement[];
    personnel: Array<{ id: string; name: string; isTeamLeader?: boolean; teamLeaderId?: string }>;
    /** Ítems que el bloque va a CREAR, con el tipo que se les eligió. */
    nuevos: Map<string, InventoryType>;
    /** La obra que se eligió arriba para los renglones que no dicen ninguna. */
    obraGeneral?: string | null;
    /** Cuánto le falta a cada ítem para poder salir, según el plan del bloque. */
    faltantes: Map<string, number>;
    /** AAAA-MM-DD del bloque, para ver qué salió «hoy». */
    fecha: string;
    /** AAAA-MM-DD de hoy en Colombia: una FECHA después de esta es futura. Sin él, la del teléfono. */
    hoy?: string;
    nombreDe: (personnelId?: string) => string;
}

/** La obra que vale para un renglón: la suya, o la general de arriba. */
export const obraDe = (l: LineaLote, general?: string | null): string | null | undefined =>
    l.obraNueva ? `nueva:${l.obraNueva}` : l.obraId !== undefined ? l.obraId : general;

/**
 * La fecha que vale para un renglón: la `FECHA:` de su entrega, o la del bloque.
 * Una sola regla para registrar, para ver duplicados del día y para la huella.
 */
export const fechaDe = (l: LineaLote, general: string): string => l.encabezado?.fecha ?? general;

/** El día en Colombia (UTC−5, sin cambio de hora): a las 8 p. m. sigue siendo hoy. */
const diaBogota = (d: Date | string) => new Date(+new Date(d) - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const dia = (d: Date | string) => new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

/** Las alertas de cada renglón y de cada elemento. */
export const verificarLote = (lote: LoteParseado, c: Contexto): {
    porLinea: Map<string, Alerta[]>;
    porItem: Map<string, Alerta[]>;
} => {
    const porLinea = new Map<string, Alerta[]>();
    const porItem = new Map<string, Alerta[]>();
    const anotar = (m: Map<string, Alerta[]>, id: string, a: Alerta) => m.set(id, [...(m.get(id) ?? []), a]);
    const activos = getActiveLoans(c.movements);
    const tipoDe = (itemLoteId: string, item?: Item) => item?.inventoryType ?? c.nuevos.get(itemLoteId);

    // Cuántas veces sale el mismo ítem a la misma persona dentro del bloque.
    const vecesEnBloque = new Map<string, number>();
    for (const l of lote.lineas) for (const it of l.items) {
        const quien = l.paraId ?? l.persona?.id;
        if (it.item && quien) vecesEnBloque.set(`${quien}|${it.item.id}`, (vecesEnBloque.get(`${quien}|${it.item.id}`) ?? 0) + 1);
    }

    for (const l of lote.lineas) {
        // ── Quién ──
        // Dudosa CON alguien elegido también se pregunta: el buscador escoge el
        // primero de dos igual de parecidos («Juan» y «Juan Pablo»), y
        // registrarlo sin preguntar es el error con cara de correcto.
        if (l.sinPersona) {
            // «Sin asignar trabajador»: decidido a propósito, no se pregunta.
        } else if ((!l.persona || l.dudosa) && !l.crear) {
            anotar(porLinea, l.id, {
                tipo: 'persona', nivel: 'decidir',
                texto: l.candidatosPersona.length > 1 && l.dudosa
                    ? `«${l.personaTexto}» puede ser ${l.candidatosPersona.slice(0, 3).map(p => p.name).join(' o ')}. ¿Quién es?`
                    : `«${l.personaTexto}» no está en el personal. ¿Es alguien que ya existe, o se crea${l.cuadrillaDe ? ` en la cuadrilla de ${l.cuadrillaDe.name}` : ''}?`,
            });
        } else if (l.persona?.isTeamLeader && !l.paraId) {
            const suyos = c.personnel.filter(p => p.teamLeaderId === l.persona!.id).length;
            anotar(porLinea, l.id, {
                tipo: 'oficial', nivel: 'decidir',
                texto: `${l.persona.name} es oficial${suyos ? ` (${suyos} en su cuadrilla)` : ''}. ¿Es para él o para alguien de su cuadrilla?`,
            });
        }

        // ── Fecha: mala o futura NO se registra, ni con la de hoy en su lugar ──
        const malaFecha = problemaDeFecha(l.encabezado, c.hoy ?? diaBogota(new Date()));
        if (malaFecha) anotar(porLinea, l.id, { tipo: 'fecha', nivel: 'decidir', texto: malaFecha });
        const malaHora = problemaDeHora(l.encabezado);
        if (malaHora) anotar(porLinea, l.id, { tipo: 'fecha', nivel: 'decidir', texto: malaHora });

        // ── Obra: se pregunta siempre, como el chat ──
        const obra = obraDe(l, c.obraGeneral);
        const llevaConsumo = l.items.some(it => tipoExigeObra(tipoDe(it.id, it.item)));
        if (obra === undefined) {
            const t = l.encabezado?.obraTexto;
            anotar(porLinea, l.id, {
                tipo: llevaConsumo ? 'obra_obligatoria' : 'obra', nivel: 'decidir',
                texto: t
                    ? `No reconocí la obra «${t}». ¿Cuál es, o se crea?`
                    : llevaConsumo ? 'Lleva material de consumo: hay que decir la obra.' : '¿En qué obra? (se puede seguir sin obra)',
            });
        } else if (obra === null && llevaConsumo) {
            anotar(porLinea, l.id, {
                tipo: 'obra_obligatoria', nivel: 'decidir',
                texto: 'Lleva material de consumo: no puede salir sin obra.',
            });
        }

        // ── Cada elemento ──
        const quien = l.sinPersona ? undefined : (l.paraId ?? l.persona?.id);
        for (const it of l.items) {
            // Dudoso con ítem elegido también: «1 pulidora» con una grande y una
            // pequeña quedaba registrada como la primera, sin preguntar.
            if ((!it.item || it.dudoso) && !c.nuevos.has(it.id)) {
                const medidas = opcionesDeMedida(it, c.items);
                const dicha = medidaDicha(it.nombre);
                anotar(porItem, it.id, {
                    tipo: 'elemento', nivel: 'decidir',
                    texto: medidas.length && dicha
                        ? `No hay «${dicha.base}» de ${dicha.medida}. ¿Cuál medida es, o se crea?`
                        : medidas.length
                            ? `«${it.nombre}»: ¿de qué medida?`
                            : it.candidatos.length ? `«${it.nombre}»: ¿cuál de los parecidos es?` : `«${it.nombre}» no está en el inventario. ¿Cuál es, o se crea?`,
                    ...(medidas.length ? { medidas } : {}),
                });
                continue;
            }
            const item = it.item;
            if (!item) continue;

            // La bodega manda: de su tipo sale préstamo o gasto. Si el bloque
            // trajo otra categoría, se dice —el asistente pudo equivocarse, o el
            // ítem está mal cargado— y no se frena.
            // Lo que importa es si VUELVE o se GASTA: unos guantes (EPP) dichos
            // como consumible, o un disco (Accesorio), salen igual. Solo se
            // avisa cuando el bloque y la bodega no coinciden en eso.
            if (it.categoria && ES_PRESTAMO.has(it.categoria) !== isAsset(item)) {
                anotar(porItem, it.id, {
                    tipo: 'categoria', nivel: 'mirar',
                    texto: `El bloque dice ${nombreDeCategoria(it.categoria)}; en la bodega ${item.name} es ${nombreDeCategoria(item.inventoryType)}: sale como ${isAsset(item) ? 'Préstamo' : 'Gasto'}.`,
                });
            }

            const falta = c.faltantes.get(item.id) ?? 0;
            const otros = activos.filter(m => m.itemId === item.id && m.personnelId && m.personnelId !== quien);
            if (isAsset(item) && falta > 0 && otros.length > 0) {
                anotar(porItem, it.id, {
                    tipo: 'ya_la_tiene', nivel: 'mirar',
                    texto: `${item.name} no está en bodega: la tiene ${otros.map(m => `${c.nombreDe(m.personnelId)} desde ${dia(m.timestamp)}`).join(', ')}. ¿Es otra unidad, o es un traslado?`,
                });
            } else if (falta > 0) {
                anotar(porItem, it.id, {
                    tipo: 'falta_stock', nivel: 'aviso',
                    texto: `No hay ${item.name} registrada suficiente: se cargarían ${falta} como «no estaba registrado».`,
                });
            }

            if (quien) {
                const enBloque = vecesEnBloque.get(`${quien}|${item.id}`) ?? 0;
                const hoy = c.movements.some(m => m.type === MovementType.CHECK_OUT && m.itemId === item.id
                    && m.personnelId === quien && diaBogota(m.timestamp) === fechaDe(l, c.fecha));
                if (enBloque > 1 || hoy) {
                    anotar(porItem, it.id, {
                        tipo: 'duplicado', nivel: 'mirar',
                        texto: enBloque > 1
                            ? `${item.name} sale ${enBloque} veces a ${c.nombreDe(quien)} en este bloque. ¿Son dos audios del mismo despacho?`
                            : `${item.name} ya le salió ${fechaDe(l, c.fecha) === (c.hoy ?? diaBogota(new Date())) ? 'hoy' : `el ${fechaDe(l, c.fecha).split('-').reverse().join('/')}`} a ${c.nombreDe(quien)}. ¿Es otra entrega o la misma?`,
                    });
                }
            }
        }
    }
    return { porLinea, porItem };
};

/**
 * ¿Este elemento se puede registrar ya? Su renglón no tiene decisiones
 * pendientes, él tampoco, y si algo no cuadraba, alguien lo miró.
 */
export const listoParaRegistrar = (
    l: LineaLote, itemLoteId: string,
    v: ReturnType<typeof verificarLote>, mirados: Set<string>,
): boolean => {
    const deLinea = v.porLinea.get(l.id) ?? [];
    const delItem = v.porItem.get(itemLoteId) ?? [];
    if ([...deLinea, ...delItem].some(a => a.nivel === 'decidir')) return false;
    return delItem.every(a => a.nivel !== 'mirar') || mirados.has(itemLoteId);
};

// ─── El paso final por trabajador: «¿este es el pedido correcto?» ─────────

/**
 * La huella de un renglón: todo lo que, si cambia, hace que lo confirmado deje
 * de valer. Quién, para quién, qué obra, qué ítems y cuántos.
 *
 * La confirmación se guarda junto con esta huella y vale solo mientras la
 * huella siga igual. Así no hay que acordarse de desconfirmar en cada función
 * que toca un renglón —mover un elemento, cambiar una cantidad, escoger otro
 * ítem—: si algo cambió, la huella ya no es la misma y hay que volver a mirar.
 */
export const huellaDeLinea = (
    l: LineaLote, obraGeneral: string | null | undefined, nuevos: Map<string, InventoryType>,
    /** La fecha del bloque y el nombre con que nacería cada ítem nuevo: también se confirman. */
    extra: { fecha?: string; nombreNuevo?: (it: ItemLote) => string } = {},
): string =>
    JSON.stringify([
        l.sinPersona ? 'sin-asignar' : l.persona?.id ?? '',
        // El trabajador nuevo cuenta SIEMPRE, también el de la cuadrilla de un
        // oficial: cambiarle el nombre después de confirmar lo desconfirma.
        l.crear ? `crear:${l.crear.nombre}:${l.crear.liderId ?? ''}` : '',
        l.paraId ?? '',
        obraDe(l, obraGeneral) ?? '?',
        fechaDe(l, extra.fecha ?? ''), l.encabezado?.hora ?? '',
        l.items.map(it => [it.id, it.item?.id ?? (nuevos.has(it.id)
            ? `nuevo:${nuevos.get(it.id)}:${extra.nombreNuevo ? extra.nombreNuevo(it) : it.nombre}` : ''), it.cantidad, it.dudoso]),
    ]);

/** Lo que muestra el resumen del trabajador, igual que el «Confirmar» del chat. */
export interface ResumenLinea {
    sale: Array<{ itemLoteId: string; nombre: string; cantidad: number; unidad: string; prestamo: boolean; nuevo: boolean; accesorios: string[]; avisos: string[]; tipo?: InventoryType }>;
    seQueda: Array<{ itemLoteId: string; nombre: string; porque: string }>;
}

const ES_PRESTAMO = new Set<InventoryType>([InventoryType.HAND_TOOL, InventoryType.ELECTRICAL_TOOL]);

/**
 * Los títulos del bloque nuevo, en el orden en que se muestran: la tarjeta del
 * trabajador agrupa con los MISMOS nombres que Juli pegó.
 */
export const CATEGORIAS: Array<[InventoryType, string]> = [
    [InventoryType.SINGLE_USE, 'Consumibles'],
    [InventoryType.HAND_TOOL, 'Herramientas manuales'],
    [InventoryType.ELECTRICAL_TOOL, 'Herramientas eléctricas'],
    [InventoryType.PPE, 'EPP'],
];

export const nombreDeCategoria = (tipo: InventoryType): string =>
    CATEGORIAS.find(([t]) => t === tipo)?.[1] ?? String(tipo);

/**
 * Qué sale y qué se queda de un renglón, dicho como lo dice el chat al final:
 * cantidad con su unidad, y Préstamo o Gasto. Lo que todavía hay que decidir
 * (cuál ítem, qué obra…) se nombra aparte: al confirmar, eso NO sale.
 *
 * `resuelto` es el de la pantalla: el ítem existe, o se decidió crearlo.
 */
export const resumenDeLinea = (
    l: LineaLote,
    v: ReturnType<typeof verificarLote>,
    nuevos: Map<string, InventoryType>,
    resuelto: (it: ItemLote) => boolean,
    /** Cómo nacería un ítem nuevo (nombre y unidad), para decirlo como va a quedar. */
    fichaDe?: (it: ItemLote) => { name: string; unit: string } | undefined,
): ResumenLinea => {
    const todos = new Set(l.items.map(it => it.id));
    const deLinea = (v.porLinea.get(l.id) ?? []).filter(a => a.nivel === 'decidir');
    const r: ResumenLinea = { sale: [], seQueda: [] };
    for (const it of l.items) {
        const listo = resuelto(it) && listoParaRegistrar(l, it.id, v, todos);
        if (!listo) {
            const porque = [...deLinea, ...(v.porItem.get(it.id) ?? []).filter(a => a.nivel === 'decidir')][0]?.texto
                ?? 'falta escoger qué ítem es';
            r.seQueda.push({ itemLoteId: it.id, nombre: it.nombre, porque });
            continue;
        }
        const tipo = it.item?.inventoryType ?? nuevos.get(it.id);
        const ficha = it.item ? undefined : fichaDe?.(it);
        r.sale.push({
            itemLoteId: it.id,
            nombre: it.item?.name ?? ficha?.name ?? it.nombre,
            cantidad: it.cantidad,
            unidad: it.item?.unit ?? ficha?.unit ?? 'unidades',
            prestamo: it.item ? isAsset(it.item) : !!tipo && ES_PRESTAMO.has(tipo),
            nuevo: !it.item,
            ...(tipo ? { tipo } : {}),
            accesorios: (it.item?.accessories ?? []).map(a => a.cantidad && a.cantidad > 1 ? `${a.cantidad} ${a.nombre}` : a.nombre),
            avisos: (v.porItem.get(it.id) ?? []).filter(a => a.nivel !== 'decidir').map(a => a.texto),
        });
    }
    return r;
};
