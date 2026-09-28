/**
 * api/consulta.ts — Preguntarle a la bodega sin abrir la app
 * ==========================================================
 * El asistente traduce la pregunta de la residente a una de las preguntas que
 * esto sabe contestar (`core/consultas.ts`) y devuelve el texto listo para
 * leer. Solo LEE: nada acá escribe en la base.
 *
 *   POST /api/consulta
 *   x-bodega-token: <BODEGA_API_TOKEN>
 *   { "pregunta": "que_tiene", "persona": "Abel" }
 *
 * Preguntas: que_tiene · que_tenia · que_devolvio · donde_esta · quien_tiene ·
 * que_hay_en_obra · por_ubicar · que_esta_malo · que_paso. Ver api/README.md.
 */

import { createClient } from '@supabase/supabase-js';
import { consultar, Consulta, PREGUNTAS } from '../core/consultas';
import { Peticion, Respuesta, revisarPuerta, leerBodega, Cliente } from './_comun';

export default async function handler(req: Peticion, res: Respuesta): Promise<void> {
    const rechazo = revisarPuerta(req, 'POST');
    if (rechazo) { res.status(rechazo.codigo).json({ error: rechazo.error }); return; }

    const cuerpo = (req.body ?? {}) as Partial<Consulta>;
    if (!cuerpo.pregunta || !(PREGUNTAS as readonly string[]).includes(cuerpo.pregunta)) {
        res.status(400).json({ error: `Falta la pregunta, o no la conozco. Las que hay: ${PREGUNTAS.join(', ')}.` });
        return;
    }

    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }) as unknown as Cliente;
    const bodega = await leerBodega(sb);
    if (!bodega) { res.status(502).json({ error: 'No se pudo leer la bodega' }); return; }

    res.status(200).json(consultar(bodega, cuerpo as Consulta));
}
