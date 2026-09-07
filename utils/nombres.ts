/**
 * El nombre de verdad de quien usa la app.
 *
 * La bodega arrancó con el dueño llamado "Julio" y "Administrador"; hoy es
 * "Juli". La corrección existía, pero escrita TRES veces en App.tsx —una para
 * la lista de accesos, otra para el nombre de la sesión, otra al entrar— y
 * ninguna cubría todos los caminos: lo que llegaba de la nube y lo que ya
 * estaba guardado en el teléfono se quedaban con el nombre viejo. Por eso a
 * Juli le seguía apareciendo "Julio" aunque en la base no exista ni uno.
 *
 * Acá está la única copia. Igual que `utils/genus.ts` es el único sitio de la
 * regla de parecido: si mañana alguien más se cambia el nombre, se agrega acá
 * y queda arreglado en toda la app de una vez.
 */
const VIEJOS: Record<string, string> = {
    julio: 'Juli',
    administrador: 'Juli',
    admin: 'Juli',
};

/** Devuelve el nombre corregido, o el mismo si no hay nada que corregir. */
export const nombreReal = (nombre: string | undefined | null): string => {
    const n = (nombre ?? '').trim();
    if (!n) return n;
    return VIEJOS[n.toLowerCase()] ?? n;
};

/** ¿Este nombre es uno de los viejos que hay que corregir? */
export const esNombreViejo = (nombre: string | undefined | null): boolean =>
    !!nombre && nombre.trim().toLowerCase() in VIEJOS;
