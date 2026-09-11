import React from 'react';
import { Item } from '../types';
import { familiaDe, raizDeFamilia } from '../utils/genus';
import { generosDe, denominacionesDe, medidaDe, seMideEnPulgadas } from '../utils/medida';

/**
 * Género y medida, ofrecidos como lo que la bodega YA tiene.
 * ===========================================================
 * Juli lo dijo con su ejemplo: «clavos familia, hierro género, 2" denominación,
 * 20 cantidad». El género es de qué está hecha la cosa y la denominación es su
 * medida — y los dos viven escondidos dentro del nombre.
 *
 * ESTO EXISTÍA SOLO ADENTRO DEL CHAT. Los formularios de crear y editar no
 * importaban nada de `utils/medida`, así que un tubo creado por ahí quedaba sin
 * género y sin medida mientras el mismo tubo creado por el chat sí los tenía.
 * Dos puertas a lo mismo con resultados distintos: la enfermedad que este
 * archivo cura.
 *
 * Se saca a componente propio —y no se copia el bloque a los dos modales—
 * porque copiarlo dejaría TRES versiones. Y va en archivo aparte, no definido
 * adentro de otro componente: un componente definido adentro de otro se
 * remonta en cada render y pierde su estado local.
 *
 * No escribe el nombre: propone piezas y avisa al de arriba. Quien arma el
 * nombre sigue siendo `nombreCompuesto`, que es la forma que `familiaDe`,
 * `materialDe` y `medidaDe` ya saben descomponer.
 */

interface Props {
    /** El nombre que se está escribiendo. De acá sale la familia. */
    nombre: string;
    /** Todo el inventario, para saber qué géneros y medidas ya existen. */
    items: Item[];
    /** Solo se comparan ítems del mismo tipo: un tubo no hereda del EPP. */
    filtrarPorTipo?: (i: Item) => boolean;
    genero: string;
    denominacion: string;
    onGenero: (v: string) => void;
    onDenominacion: (v: string) => void;
}

const chip = (activo: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
        activo ? 'border-marca bg-marca text-tinta' : 'border-papel-borde bg-papel text-tinta-suave hover:border-marca'}`;

export const PasosDeNombre: React.FC<Props> = ({
    nombre, items, filtrarPorTipo, genero, denominacion, onGenero, onDenominacion,
}) => {
    const fam = familiaDe(nombre.trim());
    if (!fam) return null;

    const deLaFamilia = items.filter(i =>
        (!filtrarPorTipo || filtrarPorTipo(i)) &&
        raizDeFamilia(i.familia?.trim() || familiaDe(i.name)) === raizDeFamilia(fam));

    const generos = generosDe(deLaFamilia);
    // `fam` va como tercer dato para que las familias que se miden en pulgadas
    // —tubo, codo, unión— ofrezcan la escalera estándar aunque no haya ni un
    // ítem cargado. El primer codo es justo el que se escribe a mano, y es
    // donde se cuela la medida mal puesta.
    const denoms = denominacionesDe(deLaFamilia, genero || undefined, fam);

    // La medida que ya venga escrita adentro del nombre no se vuelve a pedir.
    const yaEnElNombre = medidaDe(nombre);

    if (generos.length === 0 && denoms.length === 0) return null;

    return (
        <div className="space-y-2 rounded-xl border border-papel-borde bg-papel-hondo p-3">
            <p className="text-[10px] font-black text-tinta-tenue uppercase tracking-wider">
                Familia: {fam}
            </p>

            {generos.length > 0 && (
                <div className="space-y-1">
                    <p className="text-[10px] font-bold text-tinta-tenue uppercase tracking-wider">Género (opcional)</p>
                    <div className="flex flex-wrap gap-1">
                        {generos.map(g => (
                            <button key={g} type="button" onClick={() => onGenero(genero === g ? '' : g)} className={chip(genero === g)}>
                                {g}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {denoms.length > 0 && (
                <div className="space-y-1">
                    <p className="text-[10px] font-bold text-tinta-tenue uppercase tracking-wider">
                        Medida (opcional){seMideEnPulgadas(fam) ? ' · en pulgadas' : ''}
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {denoms.map(d => (
                            <button key={d} type="button" onClick={() => onDenominacion(denominacion === d ? '' : d)} className={chip(denominacion === d)}>
                                {d}
                            </button>
                        ))}
                    </div>
                    {yaEnElNombre && !denominacion && (
                        <p className="text-[10px] text-tinta-tenue">
                            El nombre ya trae {yaEnElNombre}; solo hace falta elegir acá si querés cambiarla.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
