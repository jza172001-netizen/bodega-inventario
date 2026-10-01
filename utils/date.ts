// Utilidades de fecha para nombres de archivo.

/**
 * Devuelve la fecha en formato ISO (AAAA-MM-DD) usando la hora LOCAL del equipo.
 *
 * Se arma a mano con getFullYear/getMonth/getDate en vez de usar
 * toISOString(): ese método convierte a UTC y en Colombia (UTC-5) todo lo
 * hecho después de las 7 p.m. quedaría fechado al día siguiente.
 */
export const fechaLocalISO = (d: Date = new Date()): string => {
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
};

/**
 * Convierte una fecha elegida en el selector (AAAA-MM-DD) en un momento concreto.
 *
 * Si es HOY, usa la hora real: el movimiento acaba de pasar y esa es su hora.
 * Si es un día pasado, no hay forma de saber a qué hora fue, así que se usa el
 * mediodía — un punto neutro que no se corre de día por la zona horaria.
 *
 * El chatbot ponía mediodía SIEMPRE, también para hoy, y por eso el historial
 * mostraba "12:00 p. m." en todo lo despachado por ahí.
 */
export const momentoDeFecha = (iso?: string): Date =>
    !iso || iso === fechaLocalISO() ? new Date() : new Date(`${iso}T12:00:00`);

/**
 * El momento de un renglón del bloque que trae su propia hora (`@ obra · 07:30`).
 *
 * Sin hora se comporta igual que `momentoDeFecha`. Con hora, se respeta la que
 * se dictó: si a las 7:30 salió el cemento y el bloque se pega a las 11, el
 * movimiento queda a las 7:30, que es cuando pasó.
 *
 * `zona` solo la pasa el servidor: el navegador está en Colombia y su hora
 * local ya es la buena, pero Vercel corre en UTC y sin la zona la salida de las
 * 7:30 quedaría a las 2:30 de la madrugada.
 */
export const momentoConHora = (iso?: string, hora?: string, zona = ''): Date => {
    if (!hora) return momentoDeFecha(iso);
    return new Date(`${iso || fechaLocalISO()}T${hora}:00${zona}`);
};

/** Nombre del archivo del informe de bodega: "Reporte Bodega 2026-09-04.docx". */
export const nombreArchivoReporte = (extension: string, d: Date = new Date()): string =>
    `Reporte Bodega ${fechaLocalISO(d)}.${extension}`;
