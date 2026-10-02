import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local');

export const supabase = createClient(url, key);

/**
 * Un cliente que NO guarda sesión: para preguntar si una clave es correcta
 * (PIN, confirmación de dos personas) sin pisar la sesión de quien está usando
 * el teléfono.
 */
export const crearClienteAparte = () => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'bodega-verificar' },
});
