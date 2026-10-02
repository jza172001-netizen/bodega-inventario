/**
 * api/latido.ts — Que Supabase no se pause solo
 * =============================================
 * El plan gratis de Supabase PAUSA el proyecto cuando pasa una semana sin
 * actividad. Pasó del 12 al 28 de septiembre de 2026: la app abría y no había
 * base. Vercel llama esto una vez al día (`vercel.json`, `crons`), y una lectura
 * mínima cuenta como actividad.
 *
 * Solo lee UNA fila y no devuelve datos: si alguien de afuera lo llama, no se
 * entera de nada. Si Vercel tiene `CRON_SECRET`, exige ese secreto (Vercel lo
 * manda solo en el encabezado `Authorization`).
 */
import { createClient } from '@supabase/supabase-js';
import { Peticion, Respuesta } from './_comun.js';

export default async function handler(req: Peticion, res: Respuesta): Promise<void> {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Solo GET' }); return; }
    const secreto = process.env.CRON_SECRET;
    if (secreto && String(req.headers['authorization'] ?? '') !== `Bearer ${secreto}`) {
        res.status(401).json({ error: 'No autorizado' });
        return;
    }
    const url = process.env.SUPABASE_URL;
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !clave) { res.status(500).json({ error: 'Falta configuración del servidor' }); return; }
    const sb = createClient(url, clave, { auth: { persistSession: false } });
    const { error } = await sb.from('items').select('id').limit(1);
    if (error) { res.status(502).json({ error: 'La base no contestó' }); return; }
    res.status(200).json({ ok: true });
}
