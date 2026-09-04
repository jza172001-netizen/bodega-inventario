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

/** Nombre del archivo del informe de bodega: "Reporte Bodega 2026-09-04.docx". */
export const nombreArchivoReporte = (extension: string, d: Date = new Date()): string =>
    `Reporte Bodega ${fechaLocalISO(d)}.${extension}`;
