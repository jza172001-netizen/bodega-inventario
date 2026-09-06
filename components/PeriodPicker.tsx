
import React, { useState } from 'react';

export interface Periodo {
    from: Date;
    to: Date;
    label: string;
}

/** Desde hace N días hasta ahora, con el día de inicio completo. */
const desdeHace = (dias: number, label: string): Periodo => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - dias);
    from.setHours(0, 0, 0, 0);
    return { from, to, label };
};

export const TODO: Periodo = {
    from: new Date(2000, 0, 1),
    to: new Date(2999, 0, 1),
    label: 'Todo',
};

export const PERIODOS: { key: string; label: string; build: () => Periodo }[] = [
    { key: '7',   label: '7 días',  build: () => desdeHace(7,  'Últimos 7 días')  },
    { key: '15',  label: '15 días', build: () => desdeHace(15, 'Últimos 15 días') },
    { key: '21',  label: '21 días', build: () => desdeHace(21, 'Últimos 21 días') },
    { key: '30',  label: 'Mes',     build: () => desdeHace(30, 'Último mes')      },
    { key: 'all', label: 'Todo',    build: () => TODO                              },
];

export const periodoPorDefecto = (): Periodo => PERIODOS[0].build();

interface Props {
    value: Periodo;
    onChange: (p: Periodo) => void;
    /** Para dejar constancia de qué mira el bodeguero, como el resto de filtros. */
    onBehaviorLog?: (action: string, detail: string) => void;
}

/**
 * El selector de período que no existía.
 *
 * Los `7`, `14` y `30` estaban escritos a mano en once archivos, y la única
 * forma de mover la ventana era editar el código. El bodeguero necesita mirar
 * la semana, la quincena o el mes según lo que esté decidiendo — sobre todo
 * para comprar, donde una semana floja hace pedir de menos.
 *
 * Devuelve un rango `{from, to}`, que es lo que ya recibe `getConsumption`
 * en utils/inventory.ts; no hay que inventar formato.
 */
export const PeriodPicker: React.FC<Props> = ({ value, onChange, onBehaviorLog }) => {
    const [personalizado, setPersonalizado] = useState(false);
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');

    const aplicarPersonalizado = (d: string, h: string) => {
        if (!d && !h) return;
        const from = d ? new Date(`${d}T00:00:00`) : new Date(2000, 0, 1);
        const to   = h ? new Date(`${h}T23:59:59`) : new Date();
        onChange({ from, to, label: `${d || '…'} → ${h || 'hoy'}` });
    };

    return (
        <div className="space-y-1.5">
            {/* El rango de fechas va PRIMERO y siempre a la vista.
                Era lo que más se usaba y estaba escondido detrás de un botón que
                además no se veía: se pintaba con letra blanca sobre fondo blanco
                (`bg-papel text-papel`), así que en el celular se veía una pastilla
                vacía. Juli lo reportó como "el cronológico me aparece en blanco" —
                no estaba vacío, era invisible. */}
            <div className="flex items-center gap-1.5">
                <input type="date" value={desde} aria-label="Desde"
                    onChange={e => { setDesde(e.target.value); setPersonalizado(true); aplicarPersonalizado(e.target.value, hasta); }}
                    className="flex-1 min-w-0 text-xs border border-papel-borde rounded-lg px-2 py-1.5 bg-papel text-tinta" />
                <span className="text-[11px] text-tinta-tenue flex-shrink-0">→</span>
                <input type="date" value={hasta} aria-label="Hasta"
                    onChange={e => { setHasta(e.target.value); setPersonalizado(true); aplicarPersonalizado(desde, e.target.value); }}
                    className="flex-1 min-w-0 text-xs border border-papel-borde rounded-lg px-2 py-1.5 bg-papel text-tinta" />
                {personalizado && (
                    <button type="button" title="Quitar el rango de fechas"
                        onClick={() => { setPersonalizado(false); setDesde(''); setHasta(''); onChange(TODO); }}
                        className="flex-shrink-0 px-2 py-1.5 text-[11px] font-black text-tinta-tenue hover:text-alerta">
                        ✕
                    </button>
                )}
            </div>
            <div className="flex flex-wrap gap-1">
                {PERIODOS.map(p => {
                    const activo = !personalizado && value.label === p.build().label;
                    return (
                        <button key={p.key} type="button"
                            onClick={() => { setPersonalizado(false); onChange(p.build()); onBehaviorLog?.('FILTER', `Período: ${p.label}`); }}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-black transition-all ${
                                activo ? 'bg-marca text-tinta' : 'bg-papel text-tinta-suave border border-papel-borde hover:border-marca'
                            }`}>
                            {p.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
