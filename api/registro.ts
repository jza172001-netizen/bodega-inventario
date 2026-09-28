/**
 * api/registro.ts — Lo que el asistente registra, además de salidas
 * ================================================================
 * Devolución (total o parcial), traslado, hallazgo, daño y pedido. Las salidas
 * siguen entrando por `api/despacho.ts`, con el bloque de texto.
 *
 *   POST /api/registro
 *   x-bodega-token: <BODEGA_API_TOKEN>
 *   { "operacionId": "…", "operacion": "devolucion", "persona": "Abel",
 *     "elemento": "pulidora", "cantidad": 1, "estado": "bueno" }
 *
 * LA REGLA MADRE, la del despacho: el asistente no decide. Si la frase admite
 * dos lecturas, se contesta 422 con las opciones en `dudas` y NO SE ESCRIBE
 * NADA. Quien pregunta es la residente, no el modelo.
 *
 * `operacionId` es obligatorio: el mismo identificador con el mismo contenido
 * devuelve la respuesta de la primera vez; con otro contenido, 409.
 */

import { createClient } from '@supabase/supabase-js';
import { planearRegistro, Operacion, OPERACIONES } from '../core/registro';
import {
    Peticion, Respuesta, revisarPuerta, leerBodega, aplicarPlan, huellaDe, generadorDeIds,
    buscarComprobante, guardarComprobante, Cliente,
} from './_comun';

const ACCION: Record<Operacion['operacion'], string> = {
    devolucion: 'LOAN_RETURNED',
    traslado: 'LOAN_TRANSFERRED',
    hallazgo: 'ASIGNACION_RESUELTA',
    dano: 'REPAIR_OPENED',
    pedido: 'ORDER_NOTE_ADDED',
};

export default async function handler(req: Peticion, res: Respuesta): Promise<void> {
    const rechazo = revisarPuerta(req, 'POST');
    if (rechazo) { res.status(rechazo.codigo).json({ error: rechazo.error }); return; }

    const cuerpo = (req.body ?? {}) as Partial<Operacion> & { operacionId?: string };
    const operacionId = String(cuerpo.operacionId ?? '').trim();
    if (!operacionId) {
        res.status(400).json({ error: 'Falta operacionId. Mandá un identificador único por registro; repetirlo evita el doble registro.' });
        return;
    }
    if (!cuerpo.operacion || !(OPERACIONES as readonly string[]).includes(cuerpo.operacion)) {
        res.status(400).json({ error: `Falta la operación, o no la conozco. Las que hay: ${OPERACIONES.join(', ')}.` });
        return;
    }

    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }) as unknown as Cliente;

    const { operacionId: _id, ...contenido } = cuerpo;
    const huella = huellaDe(contenido);
    const comprobante = await buscarComprobante(sb, operacionId, huella);
    if (comprobante.choque) {
        res.status(409).json({ error: 'Ese operacionId ya se usó con otro contenido. Si es un registro nuevo, mandá otro identificador.' });
        return;
    }
    if (comprobante.previa) { res.status(200).json(comprobante.previa); return; }

    const bodega = await leerBodega(sb);
    if (!bodega) { res.status(502).json({ error: 'No se pudo leer la bodega' }); return; }

    const plan = planearRegistro(bodega, contenido as Operacion, {
        ahora: new Date(), nuevoId: generadorDeIds(operacionId), porQuien: 'Asistente',
    });
    // Una duda NO se guarda como comprobante: la respuesta correcta a la misma
    // pregunta puede cambiar cuando alguien aclare, y se reintenta con el mismo id.
    if ('error' in plan) { res.status(422).json({ error: plan.error, dudas: plan.dudas ?? [] }); return; }

    const aplicado = await aplicarPlan(sb, plan, {
        operacionId, accion: ACCION[contenido.operacion as Operacion['operacion']], actor: 'Asistente',
    });
    if (!aplicado.ok) {
        res.status(502).json({ error: `No se registró NADA: ${aplicado.error}` });
        return;
    }

    const respuesta = { resumen: plan.resumen, fichas: plan.fichas, avisos: aplicado.avisos };
    await guardarComprobante(sb, operacionId, huella, respuesta);
    res.status(200).json(respuesta);
}
