import React from 'react';

/**
 * El icono del botón «Registrar».
 *
 * Antes iba el camión de reparto, que tiene catorce trazos: a 16 píxeles no se
 * lee como un camión, se lee como una mancha. Juli lo dijo así — «este logo de
 * registrar se ve muy raro».
 *
 * Registrar un movimiento es anotar algo en una planilla, no despachar un
 * camión. Una hoja con un «+», con los mismos trazos gruesos del resto de la
 * barra, dice eso y se entiende del tamaño que sea.
 */
export const RegistrarIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 5.25H6.75A1.75 1.75 0 0 0 5 7v12a1.75 1.75 0 0 0 1.75 1.75h10.5A1.75 1.75 0 0 0 19 19V7a1.75 1.75 0 0 0-1.75-1.75H15" />
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M9.75 3.75h4.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 9 6v-1.5a.75.75 0 0 1 .75-.75Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 11.25v5.25M9.375 13.875h5.25" />
    </svg>
);
