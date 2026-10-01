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
import type { LineaLote, LoteParseado } from '../utils/lote.js';

export type TipoAlerta =
    | 'persona'          // no se sabe quién es (no existe o hay dos parecidos)
    | 'oficial'          // es oficial: ¿para quién de su cuadrilla?
    | 'obra'             // ¿en qué obra? (opcional, pero se pregunta)
    | 'obra_obligatoria' // material de consumo sin obra: así no se puede
    | 'elemento'         // no se sabe qué ítem es
    | 'ya_la_tiene'      // la herramienta ya la tiene otro y no alcanza la bodega
    | 'duplicado'        // lo mismo a la misma persona, dos veces
    | 'falta_stock';     // no hay lo que se pide: se cargaría la diferencia

export interface Alerta {
    tipo: TipoAlerta;
    texto: string;
    /**
     * `decidir`: hace falta una DECISIÓN (quién, qué obra, qué ítem) y sin ella
     * el renglón no puede registrarse.
     * `mirar`: no falta nada, pero algo no cuadra; hay que tocar «✓ Verificado»
     * después de mirarlo. Mover el elemento a otra persona lo vuelve a pedir.
     */
    nivel: 'decidir' | 'mirar';
}

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
    nombreDe: (personnelId?: string) => string;
}

/** La obra que vale para un renglón: la suya, o la general de arriba. */
export const obraDe = (l: LineaLote, general?: string | null): string | null | undefined =>
    l.obraNueva ? `nueva:${l.obraNueva}` : l.obraId !== undefined ? l.obraId : general;

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
        if (!l.persona && !l.crear) {
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
        const quien = l.paraId ?? l.persona?.id;
        for (const it of l.items) {
            if (!it.item && !c.nuevos.has(it.id)) {
                anotar(porItem, it.id, {
                    tipo: 'elemento', nivel: 'decidir',
                    texto: it.candidatos.length ? `«${it.nombre}»: ¿cuál de los parecidos es?` : `«${it.nombre}» no está en el inventario. ¿Cuál es, o se crea?`,
                });
                continue;
            }
            const item = it.item;
            if (!item) continue;

            const falta = c.faltantes.get(item.id) ?? 0;
            const otros = activos.filter(m => m.itemId === item.id && m.personnelId && m.personnelId !== quien);
            if (isAsset(item) && falta > 0 && otros.length > 0) {
                anotar(porItem, it.id, {
                    tipo: 'ya_la_tiene', nivel: 'mirar',
                    texto: `${item.name} no está en bodega: la tiene ${otros.map(m => `${c.nombreDe(m.personnelId)} desde ${dia(m.timestamp)}`).join(', ')}. ¿Es otra unidad, o es un traslado?`,
                });
            } else if (falta > 0) {
                anotar(porItem, it.id, {
                    tipo: 'falta_stock', nivel: 'mirar',
                    texto: `No hay ${item.name} registrada suficiente: se cargarían ${falta} como «no estaba registrado».`,
                });
            }

            if (quien) {
                const enBloque = vecesEnBloque.get(`${quien}|${item.id}`) ?? 0;
                const hoy = c.movements.some(m => m.type === MovementType.CHECK_OUT && m.itemId === item.id
                    && m.personnelId === quien && diaBogota(m.timestamp) === c.fecha);
                if (enBloque > 1 || hoy) {
                    anotar(porItem, it.id, {
                        tipo: 'duplicado', nivel: 'mirar',
                        texto: enBloque > 1
                            ? `${item.name} sale ${enBloque} veces a ${c.nombreDe(quien)} en este bloque. ¿Son dos audios del mismo despacho?`
                            : `${item.name} ya le salió hoy a ${c.nombreDe(quien)}. ¿Es otra entrega o la misma?`,
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
